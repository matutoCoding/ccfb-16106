import type { AppData, Board, ID, ReadabilityReport, RouteName } from '../types';
import { generateExhibition } from './seed';
import { loadData, loadFonts, saveAllData } from './db';
import { fontManager } from './fontManager';
import { computeReadabilityReport } from './readability';
import { collectUsedCharacters } from './textLayout';

type Listener = () => void;

class Store {
  data!: AppData;
  report: ReadabilityReport | null = null;
  route: RouteName = 'projects';
  selectedBoardId: ID | null = 'board-001';
  selectedWallId: ID | null = null;
  previewViewer: 'adult' | 'wheelchair' = 'adult';
  previewWalking = false;
  busy = false;
  status = '正在初始化 IndexedDB…';
  private listeners = new Set<Listener>();
  private saveTimer: number | null = null;

  async init() {
    let data = await loadData();
    if (!data) {
      data = generateExhibition();
      await saveAllData(data);
    }
    const fonts = await loadFonts();
    if (fonts.length) data.fonts = fonts;
    this.data = data;
    fontManager.registerAssets(data.fonts);
    fontManager.defaultFontId = data.project.defaultFontId || 'font-noto-sans-sc';
    fontManager.fallbackFontId = data.project.fallbackFontId || 'font-noto-sans-sc';
    this.route = this.routeFromHash();
    window.addEventListener('hashchange', () => {
      this.route = this.routeFromHash();
      this.emit();
    });
    this.recomputeReport();
    this.emit();

    // 内置思源/Noto 体系字体较大，后台加载并写入 IndexedDB；不阻塞首屏。
    // MSDF 图集按当前可见展板按需生成，避免首屏对 700+ 字做密集距离计算。
    void fontManager.ensureBuiltin().then(async () => {
      const builtin = fontManager.fonts.get('font-noto-sans-sc')?.asset;
      if (builtin && !this.data.fonts.some((f) => f.id === builtin.id)) {
        this.data.fonts.push(builtin);
        this.scheduleSave();
      }
      this.recomputeReport();
      this.status = '字体已就绪；排版/预览页将按需生成 MSDF 图集';
      this.emit();
    });
  }

  routeFromHash(): RouteName {
    const h = location.hash.replace('#/', '').replace('#', '') as RouteName;
    return (['projects', 'floor', 'editor', 'preview', 'report', 'export'] as const).includes(h) ? h : 'projects';
  }

  navigate(route: RouteName, boardId?: ID) {
    if (boardId) this.selectedBoardId = boardId;
    location.hash = `/${route}`;
    this.route = route;
    this.emit();
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  emit() { this.listeners.forEach((fn) => fn()); }

  setStatus(s: string) { this.status = s; this.emit(); }

  scheduleSave() {
    if (this.saveTimer) window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => { void saveAllData(this.data); }, 350);
  }

  updateProject(patch: Partial<AppData['project']>) {
    Object.assign(this.data.project, patch, { updatedAt: Date.now() });
    this.scheduleSave();
    this.recomputeReport();
    this.emit();
  }

  updateBoard(id: ID, patch: Partial<Board>) {
    const b = this.data.boards.find((x) => x.id === id);
    if (!b) return;
    Object.assign(b, patch, { updatedAt: Date.now() });
    this.scheduleSave();
    this.recomputeReport();
    this.emit();
  }

  updateBlock(boardId: ID, blockId: ID, patch: Partial<Board['blocks'][number]>) {
    const b = this.data.boards.find((x) => x.id === boardId);
    const blk = b?.blocks.find((x) => x.id === blockId);
    if (!b || !blk) return;
    Object.assign(blk, patch);
    b.updatedAt = Date.now();
    this.scheduleSave();
    this.recomputeReport();
    this.emit();
  }

  selectBoard(id: ID | null) {
    this.selectedBoardId = id;
    this.emit();
  }

  async changeGlobalFont(fontId: ID) {
    this.busy = true;
    this.status = '正在更换字体并在 3 秒内重算 200 块板…';
    this.emit();
    this.data.project.defaultFontId = fontId;
    fontManager.defaultFontId = fontId;
    const chars = collectUsedCharacters(this.data.boards);
    const t0 = performance.now();
    this.recomputeReport(fontId);
    const metricsMs = this.report?.elapsedMs ?? 0;
    this.status = `可读性指标重算完成：${this.data.boards.length} 块板，${metricsMs.toFixed(1)} ms（含字体切换总耗时 ${(performance.now() - t0).toFixed(1)} ms）`;
    this.scheduleSave();
    this.busy = false;
    this.emit();
    // 图集异步生成不阻塞“指标 3 秒内”验收。
    void fontManager.ensureAtlas(chars, fontId, 64).then(() => this.emit()).catch(() => undefined);
  }

  recomputeReport(fontId?: ID) {
    this.report = computeReadabilityReport(this.data, {
      fontId: fontId || this.data.project.defaultFontId,
      resolver: fontManager
    });
    return this.report;
  }

  get selectedBoard(): Board | undefined {
    return this.data.boards.find((b) => b.id === this.selectedBoardId);
  }
}

export const store = new Store();
