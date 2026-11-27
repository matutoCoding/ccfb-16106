/// <reference lib="webworker" />
import * as opentype from 'opentype.js';
import type { GlyphInfo } from '../types';
import type { MsdfRequest, MsdfResponse, MsdfSuccess } from '../lib/fontMessages';

interface Seg {
  x1: number; y1: number; x2: number; y2: number;
  mask: 1 | 2 | 3 | 4 | 5 | 6 | 7;
}

interface Contour { points: Array<{ x: number; y: number }>; segs: Seg[] }

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }

function distToSegment(px: number, py: number, s: Seg): number {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  const l2 = dx * dx + dy * dy || 1e-6;
  const t = clamp(((px - s.x1) * dx + (py - s.y1) * dy) / l2, 0, 1);
  const x = s.x1 + t * dx;
  const y = s.y1 + t * dy;
  return Math.hypot(px - x, py - y);
}

function pointInContours(x: number, y: number, contours: Contour[]): boolean {
  let inside = false;
  for (const c of contours) {
    const pts = c.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y;
      const xj = pts[j].x, yj = pts[j].y;
      const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / ((yj - yi) || 1e-9) + xi);
      if (intersect) inside = !inside;
    }
  }
  return inside;
}

function flattenCubic(p0: any, p1: any, p2: any, p3: any, out: Array<{ x: number; y: number }>, depth = 0) {
  if (depth >= 5) { out.push({ x: p3.x, y: p3.y }); return; }
  // 控制点到弦的距离足够小时可停止；固定细分保证尖角端点不被平均。
  const d = Math.abs((p3.x - p0.x) * (p0.y - p1.y) - (p0.x - p1.x) * (p3.y - p0.y))
    + Math.abs((p3.x - p0.x) * (p0.y - p2.y) - (p0.x - p2.x) * (p3.y - p0.y));
  if (d < 0.25) { out.push({ x: p3.x, y: p3.y }); return; }
  const p01 = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
  const p12 = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  const p23 = { x: (p2.x + p3.x) / 2, y: (p2.y + p3.y) / 2 };
  const p012 = { x: (p01.x + p12.x) / 2, y: (p01.y + p12.y) / 2 };
  const p123 = { x: (p12.x + p23.x) / 2, y: (p12.y + p23.y) / 2 };
  const p0123 = { x: (p012.x + p123.x) / 2, y: (p012.y + p123.y) / 2 };
  flattenCubic(p0, p01, p012, p0123, out, depth + 1);
  flattenCubic(p0123, p123, p23, p3, out, depth + 1);
}

function buildContours(glyph: any, originX: number, baselineY: number, scale: number): Contour[] {
  const commands: any[] = glyph?.path?.commands || [];
  const contours: Contour[] = [];
  let current: Contour | null = null;
  let start: { x: number; y: number } | null = null;
  let last: { x: number; y: number } | null = null;
  const tx = (x: number) => originX + x * scale;
  const ty = (y: number) => baselineY - y * scale;
  const pt = (x: number, y: number) => ({ x: tx(x), y: ty(y) });
  const masks = [3, 6, 5] as const;
  let edgeIndex = 0;
  const addLine = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (!current) return;
    current.points.push(b);
    current.segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, mask: masks[edgeIndex++ % masks.length] });
  };

  for (const cmd of commands) {
    if (cmd.type === 'M') {
      current = { points: [], segs: [] };
      contours.push(current);
      start = pt(cmd.x, cmd.y);
      last = start;
      current.points.push(start);
    } else if (cmd.type === 'L' && last) {
      const p = pt(cmd.x, cmd.y);
      addLine(last, p); last = p;
    } else if (cmd.type === 'Q' && last) {
      // OpenType 二次贝塞尔细分为线段；端点保持精确。
      const p1 = pt(cmd.x1, cmd.y1);
      const p2 = pt(cmd.x, cmd.y);
      let prev = last;
      for (let i = 1; i <= 10; i++) {
        const t = i / 10;
        const mt = 1 - t;
        const p = {
          x: mt * mt * last.x + 2 * mt * t * p1.x + t * t * p2.x,
          y: mt * mt * last.y + 2 * mt * t * p1.y + t * t * p2.y
        };
        addLine(prev, p); prev = p;
      }
      last = p2;
    } else if (cmd.type === 'C' && last) {
      const p1 = pt(cmd.x1, cmd.y1);
      const p2 = pt(cmd.x2, cmd.y2);
      const p3 = pt(cmd.x, cmd.y);
      const pts = [last];
      flattenCubic(last, p1, p2, p3, pts);
      for (let i = 1; i < pts.length; i++) addLine(pts[i - 1], pts[i]);
      last = p3;
    } else if (cmd.type === 'Z' && last && start) {
      addLine(last, start);
      last = start;
    }
  }
  return contours.filter((c) => c.segs.length);
}

function encodeChannel(d: number, inside: boolean, range: number): number {
  const signed = inside ? d : -d;
  return Math.round(clamp(0.5 + signed / range, 0, 1) * 255);
}

function buildAtlas(req: MsdfRequest): MsdfSuccess {
  const font = (opentype as any).parse(req.bytes);
  const upm = font.unitsPerEm || 1000;
  const asc = font.ascender ?? upm * 0.88;
  const desc = font.descender ?? -upm * 0.12;
  const cell = req.cellPx || 64;
  const range = 7;
  const pad = range + 2;
  const chars = [...new Set(req.chars)].filter(Boolean);
  const cols = Math.max(1, Math.floor(4096 / cell));
  const rows = Math.max(1, Math.ceil(chars.length / cols));
  const widthPx = cols * cell;
  const heightPx = rows * cell;
  const pixels = new Uint8Array(widthPx * heightPx * 4);
  const glyphs: Record<string, GlyphInfo> = {};
  const scale = (cell - pad * 2) / Math.max(1, asc - desc);
  const baselineInCell = pad + asc * scale;

  chars.forEach((ch, index) => {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const ox = col * cell;
    const oy = row * cell;
    const glyphIndex = font.charToGlyphIndex?.(ch) ?? 0;
    const glyph = font.charToGlyph?.(ch) || font.glyphs?.get?.(glyphIndex);
    const contours = glyphIndex ? buildContours(glyph, ox + pad, oy + baselineInCell, scale) : [];
    const xMin = glyph?.xMin ?? 0, xMax = glyph?.xMax ?? upm * 0.5;
    const yMin = glyph?.yMin ?? desc * 0.2, yMax = glyph?.yMax ?? asc * 0.72;
    const advanceEm = (glyph?.advanceWidth ?? upm * (ch.charCodeAt(0) > 255 ? 1 : 0.56)) / upm;

    for (let py = 0; py < cell; py++) {
      for (let px = 0; px < cell; px++) {
        const ax = ox + px + 0.5;
        const ay = oy + py + 0.5;
        let dr = Infinity, dg = Infinity, db = Infinity;
        for (const c of contours) {
          for (const s of c.segs) {
            const d = distToSegment(ax, ay, s);
            if (s.mask & 1 && d < dr) dr = d;
            if (s.mask & 2 && d < dg) dg = d;
            if (s.mask & 4 && d < db) db = d;
          }
        }
        if (!Number.isFinite(dr)) dr = range * 4;
        if (!Number.isFinite(dg)) dg = range * 4;
        if (!Number.isFinite(db)) db = range * 4;
        const inside = contours.length ? pointInContours(ax, ay, contours) : false;
        const pi = ((oy + py) * widthPx + ox + px) * 4;
        pixels[pi] = encodeChannel(dr, inside, range);
        pixels[pi + 1] = encodeChannel(dg, inside, range);
        pixels[pi + 2] = encodeChannel(db, inside, range);
        pixels[pi + 3] = 255;
      }
    }

    glyphs[ch] = {
      char: ch, unicode: ch.codePointAt(0) || 0, glyphIndex,
      fontId: req.fontId, missing: glyphIndex === 0, advanceEm,
      uv: [(ox + 0.5) / widthPx, (oy + 0.5) / heightPx, (ox + cell - 0.5) / widthPx, (oy + cell - 0.5) / heightPx],
      plane: [xMin / upm, yMin / upm, xMax / upm, yMax / upm]
    };
  });

  return {
    type: 'done', jobId: req.jobId, fontId: req.fontId, pixels: pixels.buffer,
    metrics: { fontId: req.fontId, cellPx: cell, paddingPx: pad, rangePx: range, widthPx, heightPx, glyphs, textureVersion: Date.now() }
  };
}

self.onmessage = (event: MessageEvent<MsdfRequest>) => {
  const req = event.data;
  try {
    const res = buildAtlas(req);
    const ctx = self as unknown as DedicatedWorkerGlobalScope;
    ctx.postMessage(res, { transfer: [res.pixels] });
  } catch (error) {
    const res: MsdfResponse = { type: 'error', jobId: req.jobId, fontId: req.fontId, message: (error as Error).message || String(error) };
    (self as unknown as DedicatedWorkerGlobalScope).postMessage(res);
  }
};
