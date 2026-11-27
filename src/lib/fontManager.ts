import * as opentype from 'opentype.js';
import type { FontAsset, ID } from '../types';
import { saveFont } from './db';
import type { GlyphMetricsResolver } from './textLayout';
import type { MsdfRequest, MsdfResponse } from './fontMessages';

interface RuntimeFont {
  asset: FontAsset;
  font?: opentype.Font;
  atlasPixels?: Uint8Array;
  atlas?: import('../types').AtlasMetrics;
  atlasPromise?: Promise<import('../types').AtlasMetrics>;
}

type Listener = () => void;

class FontManager implements GlyphMetricsResolver {
  fonts = new Map<ID, RuntimeFont>();
  defaultFontId = 'font-noto-sans-sc';
  fallbackFontId = 'font-noto-sans-sc';
  private worker: Worker | null = null;
  private jobId = 0;
  private jobs = new Map<number, { resolve: (m: any) => void; reject: (e: Error) => void }>();
  private listeners = new Set<Listener>();

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() { this.listeners.forEach((fn) => fn()); }

  registerAssets(assets: FontAsset[]) {
    for (const asset of assets) this.addAsset(asset, false);
  }

  addAsset(asset: FontAsset, persist = true): RuntimeFont {
    let font: opentype.Font | undefined;
    if (asset.bytes && asset.bytes.byteLength) {
      try { font = opentype.parse(asset.bytes.slice(0)); }
      catch (e) { console.warn('字体解析失败', asset.name, e); }
      try {
        if (typeof FontFace !== 'undefined') {
          const face = new FontFace(asset.family || asset.name, asset.bytes.slice(0) as ArrayBuffer);
          document.fonts.add(face);
          void face.load().then(() => this.emit()).catch(() => undefined);
        }
      } catch { /* 某些 TTC/可变字体可解析但不能直接注册为 FontFace，Canvas 仍有系统回退 */ }
    }
    const rt: RuntimeFont = { asset, font };
    this.fonts.set(asset.id, rt);
    if (persist) void saveFont(asset);
    this.emit();
    return rt;
  }

  async ensureBuiltin(): Promise<void> {
    const existing = this.fonts.get(this.defaultFontId);
    if (existing?.font) return;
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}fonts/NotoSansSC-VF.ttf`);
      if (!res.ok) throw new Error(`内置字体加载失败 ${res.status}`);
      const bytes = await res.arrayBuffer();
      const asset: FontAsset = {
        id: this.defaultFontId,
        name: 'Noto Sans SC / 思源黑体体系',
        family: 'Noto Sans SC',
        kind: 'sans',
        format: 'TTF',
        bytes,
        size: bytes.byteLength,
        builtin: true,
        createdAt: Date.now()
      };
      this.addAsset(asset, true);
    } catch (e) {
      console.warn(e);
    }
  }

  async importFile(file: File): Promise<FontAsset> {
    const bytes = await file.arrayBuffer();
    const header = new Uint8Array(bytes.slice(0, 4));
    const tag = String.fromCharCode(...header);
    const format = tag === 'OTTO' ? 'OTF' : tag === 'wOFF' ? 'WOFF' : 'TTF';
    const parsed = opentype.parse(bytes.slice(0));
    const id = `font-${file.name.replace(/\.[^.]+$/, '').replace(/[^\w一-鿿-]+/g, '-').slice(0, 48)}-${bytes.byteLength.toString(36).slice(-4)}`;
    const asset: FontAsset = {
      id,
      name: file.name.replace(/\.[^.]+$/, ''),
      family: parsed.names?.fontFamily?.en || file.name,
      kind: /song|serif|宋|明朝/i.test(file.name) ? 'serif' : 'sans',
      format: format as FontAsset['format'],
      bytes,
      size: bytes.byteLength,
      createdAt: Date.now()
    };
    this.addAsset(asset, true);
    return asset;
  }

  setDefaultFont(id: ID) {
    this.defaultFontId = id;
    this.emit();
  }

  getRuntime(id?: ID): RuntimeFont | undefined {
    return this.fonts.get(id || this.defaultFontId) || this.fonts.get(this.defaultFontId);
  }

  hasGlyph(char: string, fontId?: ID): boolean {
    if (char === ' ' || char === '\n') return true;
    const rt = this.getRuntime(fontId);
    if (!rt?.font) return true; // 无二进制时使用系统字体度量，不误报。
    return rt.font.charToGlyphIndex(char) !== 0;
  }

  resolveFont = (char: string, fontId?: ID) => {
    const requestedId = fontId || this.defaultFontId;
    if (this.hasGlyph(char, requestedId)) return { fontId: requestedId, missing: false, fallback: false };
    let fallbackId = this.fallbackFontId;
    // 虚拟系统度量字体没有可用于 MSDF/轮廓的二进制；实际回退到内置 Noto/思源。
    if (!this.getRuntime(fallbackId)?.font && this.getRuntime('font-noto-sans-sc')?.font) {
      fallbackId = 'font-noto-sans-sc';
    }
    if (fallbackId !== requestedId && this.hasGlyph(char, fallbackId)) {
      return { fontId: fallbackId, missing: true, fallback: true };
    }
    return { fontId: requestedId, missing: true, fallback: false };
  };

  advanceMm = (char: string, fontSizeMm: number, fontId?: ID): number => {
    const resolved = this.resolveFont(char, fontId);
    const rt = this.getRuntime(resolved.fontId);
    const glyph = rt?.font?.charToGlyph?.(char);
    if (glyph?.advanceWidth && rt.font?.unitsPerEm) {
      return glyph.advanceWidth / rt.font.unitsPerEm * fontSizeMm;
    }
    if (char === ' ') return fontSizeMm * 0.32;
    if (/[㐀-鿿＀-￯]/.test(char)) return fontSizeMm;
    return fontSizeMm * 0.56;
  };

  private getWorker(): Worker {
    if (this.worker) return this.worker;
    this.worker = new Worker(new URL('../workers/msdf.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<MsdfResponse>) => {
      const data = event.data;
      const job = this.jobs.get(data.jobId);
      if (!job) return;
      this.jobs.delete(data.jobId);
      if (data.type === 'done') {
        const rt = this.getRuntime(data.fontId);
        if (rt) {
          rt.atlas = data.metrics;
          rt.atlasPixels = new Uint8Array(data.pixels);
        }
        job.resolve(data.metrics);
        this.emit();
      } else job.reject(new Error(data.message));
    };
    this.worker.onerror = (e) => {
      console.error('MSDF worker error', e);
      this.jobs.forEach((j) => j.reject(new Error(e.message)));
      this.jobs.clear();
    };
    return this.worker;
  }

  async ensureAtlas(chars: Iterable<string>, fontId?: ID, cellPx = 64): Promise<import('../types').AtlasMetrics | null> {
    const id = fontId || this.defaultFontId;
    const rt = this.getRuntime(id);
    if (!rt?.asset.bytes?.byteLength) return null;
    const wanted = [...new Set([...chars].filter((c) => c && c !== '\n'))];
    if (rt.atlas) {
      const missing = wanted.filter((c) => !rt.atlas!.glyphs[c]);
      if (!missing.length) return rt.atlas;
    }
    if (rt.atlasPromise) return rt.atlasPromise;
    const bytes = rt.asset.bytes.slice(0);
    const jobId = ++this.jobId;
    const promise = new Promise<import('../types').AtlasMetrics>((resolve, reject) => {
      this.jobs.set(jobId, { resolve, reject });
      const req: MsdfRequest = { type: 'build', jobId, fontId: id, fontName: rt.asset.name, bytes, chars: wanted, cellPx };
      this.getWorker().postMessage(req, [bytes]);
    });
    rt.atlasPromise = promise;
    try { return await promise; }
    finally { rt.atlasPromise = undefined; }
  }

  getAtlas(fontId?: ID) { return this.getRuntime(fontId)?.atlas; }
  getAtlasPixels(fontId?: ID) { return this.getRuntime(fontId)?.atlasPixels; }
  getOpenTypeFont(fontId?: ID) { return this.getRuntime(fontId)?.font; }
  getFamily(fontId?: ID): string {
    const rt = this.getRuntime(fontId);
    return rt?.asset.family ? `"${rt.asset.family}", "Noto Sans SC", "Microsoft YaHei", sans-serif` : '"Noto Sans SC", "Microsoft YaHei", sans-serif';
  }

  getSvgPath(char: string, xMm: number, baselineYMm: number, sizeMm: number, fontId?: ID): string {
    const resolved = this.resolveFont(char, fontId);
    const font = this.getRuntime(resolved.fontId)?.font;
    if (!font) return '';
    // 可变 TrueType 字体的 JS hinting 偶发产生 NaN 控制点；刻字路径直接使用原始轮廓。
    const path = font.getPath(char, xMm, baselineYMm, sizeMm, { hinting: false } as any);
    return path.toPathData(4).replace(/\bNaN\b/g, '0');
  }
}

export const fontManager = new FontManager();
