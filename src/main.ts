import './styles.css';
import { h, toast } from './ui/dom';
import { store } from './lib/store';
import { fontManager } from './lib/fontManager';
import { renderProjectsPage } from './pages/projectsPage';
import { renderFloorPage } from './pages/floorPage';
import { renderEditorPage } from './pages/editorPage';
import { renderPreviewPage } from './pages/previewPage';
import { renderReportPage } from './pages/reportPage';
import { renderExportPage } from './pages/exportPage';
import { verifyBoardPrecision } from './lib/precision';
import { exportFullPackage } from './lib/exporter';
import { collectUsedCharacters } from './lib/textLayout';
import type { RouteName } from './types';

const NAV: Array<{ id: RouteName; label: string; icon: string; title: string; sub: string }> = [
  { id: 'projects', label: '展览项目', icon: '▣', title: '展览项目与字体', sub: '项目标准、TTF/OTF 导入、IndexedDB 持久化与性能验收' },
  { id: 'floor', label: '展厅平面', icon: '▦', title: '展厅平面与动线', sub: '按毫米绘制墙面、展柜、独立展台、挂墙位置、标高和观众视点' },
  { id: 'editor', label: '图文排版', icon: 'T', title: '图文排版 / MSDF', sub: '横竖混排、避头尾、标点挤压、缺字回退与距离场预览' },
  { id: 'preview', label: '上墙预览', icon: '◈', title: '三维上墙预览', sub: 'WebGPU 展厅、四种工艺、成人/轮椅眼高、斜视与射灯眩光' },
  { id: 'report', label: '可读性检查', icon: '✓', title: '可读性报告', sub: '200 块板逐行计算字高、对比度、视距、视角和眩光遮挡' },
  { id: 'export', label: '出图', icon: '⬇', title: '1:1 出图与交付', sub: '刻字矢量轮廓、中英对照文本、图片编号清单和 ZIP 打包' }
];

let cleanup: (() => void) | null = null;

function bootstrap() {
  const app = document.querySelector<HTMLDivElement>('#app')!;
  const content = h('main', { class: 'content', 'data-testid': 'page-content' });
  const titleEl = h('h2', {}, '展览项目');
  const subEl = h('div', { class: 'sub' }, '正在初始化…');
  const statusEl = h('span', { class: 'muted', style: 'font-size:12px' }, 'IndexedDB 启动中');

  const navButtons = new Map<RouteName, HTMLButtonElement>();
  const nav = h('nav', { class: 'nav' }, ...NAV.map((item) => {
    const btn = h('button', {
      'data-route': item.id,
      onClick: () => store.navigate(item.id)
    }, h('span', { class: 'ico' }, item.icon), h('span', { class: 'label' }, item.label));
    navButtons.set(item.id, btn);
    return btn;
  }));

  const shell = h('div', { class: 'app-shell' },
    h('aside', { class: 'sidebar' },
      h('div', { class: 'brand' }, h('div', { class: 'brand-mark' }, '展'), h('div', {}, h('h1', {}, '展陈图文上墙系统'), h('p', {}, 'TypeScript · WebGPU · MSDF'))),
      nav,
      h('div', { class: 'side-card' }, h('div', {}, h('span', { class: 'status-dot' }), h('strong', {}, '本地优先')), h('div', { style: 'margin-top:6px' }, '字体二进制、200 块板方案和报告均存入 IndexedDB。')),
      h('div', { class: 'side-card', id: 'side-status' }, store.status)
    ),
    h('div', { class: 'main' },
      h('header', { class: 'topbar' },
        h('div', {}, titleEl, subEl),
        h('div', { class: 'top-actions' }, statusEl, h('button', { class: 'btn small', onClick: () => { void runAcceptance(); } }, '运行验收 API'))
      ),
      content
    )
  );
  app.replaceChildren(shell);

  function renderRoute() {
    cleanup?.();
    cleanup = null;
    const route = store.route;
    const item = NAV.find((n) => n.id === route) || NAV[0];
    titleEl.textContent = item.title;
    subEl.textContent = item.sub;
    navButtons.forEach((btn, id) => btn.classList.toggle('active', id === route));
    let page: HTMLElement;
    if (!store.data) {
      page = h('div', { class: 'panel panel-pad' }, '正在生成 200 块展板并打开 IndexedDB…');
    } else {
      switch (route) {
        case 'floor': page = renderFloorPage(renderRoute); break;
        case 'editor': page = renderEditorPage(renderRoute); break;
        case 'preview': page = renderPreviewPage(renderRoute); break;
        case 'report': page = renderReportPage(renderRoute); break;
        case 'export': page = renderExportPage(renderRoute); break;
        default: page = renderProjectsPage(renderRoute);
      }
    }
    content.replaceChildren(page);
    cleanup = (page as any)._cleanup || null;
  }

  window.addEventListener('hashchange', () => {
    store.route = store.routeFromHash();
    renderRoute();
  });

  store.subscribe(() => {
    statusEl.textContent = store.status;
    const side = document.getElementById('side-status');
    if (side) side.textContent = store.status;
  });

  renderRoute();
  store.init().then(() => {
    renderRoute();
    exposeApi();
    toast('已生成并载入 200 块展板方案', 'good');
  }).catch((err) => {
    console.error(err);
    content.replaceChildren(h('div', { class: 'panel panel-pad' }, h('h2', {}, '初始化失败'), h('pre', { class: 'code-block' }, String(err?.stack || err))));
  });
}

function exposeApi() {
  const api = {
    store,
    fontManager,
    get data() { return store.data; },
    get report() { return store.report; },
    boardCount: () => store.data?.boards.length || 0,
    recompute: (fontId?: string) => {
      const t0 = performance.now();
      const report = store.recomputeReport(fontId);
      return { elapsedMs: performance.now() - t0, report };
    },
    collectUsedCharacters: () => collectUsedCharacters(store.data.boards),
    buildAllAtlas: () => fontManager.ensureAtlas(collectUsedCharacters(store.data.boards), store.data.project.defaultFontId, 64),
    verifyPrecision: (boardId = 'board-001') => verifyBoardPrecision(store.data.boards.find((b) => b.id === boardId) || store.data.boards[0]),
    async runAcceptance() { return runAcceptance(); },
    exportPackage: () => exportFullPackage(store.data),
    version: '1.0.0'
  };
  (window as any).__SIGNAGE__ = api;
}

async function runAcceptance() {
  if (!store.data) return;
  const metrics = store.recomputeReport();
  const precision = await verifyBoardPrecision(store.data.boards.find((b) => b.id === (store.selectedBoard?.id || 'board-001')) || store.data.boards[0]);
  const result = {
    boardCount: metrics.boardCount,
    metricElapsedMs: metrics.elapsedMs,
    under3s: metrics.elapsedMs < 3000,
    precisionMaxErrorMm: precision.maxErrorMm,
    precisionUnder0_1mm: precision.pass,
    pass: metrics.boardCount === 200 && metrics.elapsedMs < 3000 && precision.pass
  };
  console.info('[acceptance]', result);
  toast(`验收：200板 ${metrics.elapsedMs.toFixed(0)}ms；偏差 ${precision.maxErrorMm.toFixed(4)}mm`, result.pass ? 'good' : 'bad');
  return result;
}

bootstrap();
