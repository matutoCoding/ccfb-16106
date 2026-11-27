import { h } from '../ui/dom';
import { store } from '../lib/store';
import { fontManager } from '../lib/fontManager';
import { WebGpuStage } from '../webgpu/WebGpuStage';
import { perspective, lookAt, multiply } from '../webgpu/mat4';
import { buildBoardTextGroups } from '../webgpu/geometry';
import { buildHallSolids, buildBoardExtrusionGroups } from '../webgpu/hallScene';
import { boardCenter3, localPointToWorld, wallFrame } from '../lib/world';
import { computeBoardGlare } from '../lib/glare';
import { layoutBoard } from '../lib/textLayout';
import { renderBoard2D } from '../ui/canvasBoard';
import { MATERIAL_LABELS } from '../lib/seed';
import type { Vec3 } from '../types';

let raf = 0;
let stage: WebGpuStage | null = null;
let destroyed = false;
let unsubFont: (() => void) | null = null;

export function renderPreviewPage(refresh: () => void): HTMLElement {
  destroyed = false;
  const d = store.data;
  const board = store.selectedBoard || d.boards[0];
  store.selectedBoardId = board.id;
  const wall = d.walls.find((w) => w.id === board.wallId)!;
  const metric = store.report?.metrics.find((m) => m.boardId === board.id);
  const layout = layoutBoard(board, fontManager);
  const glare = computeBoardGlare(board, d, layout.glyphs);
  const idx = d.boards.findIndex((b) => b.id === board.id);

  const gpuCanvas = h('canvas', { 'aria-label': 'WebGPU 三维上墙预览' }) as HTMLCanvasElement;
  const fallbackCanvas = h('canvas', { class: 'fallback-hall' }) as HTMLCanvasElement;
  fallbackCanvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;';
  const glareEl = h('div', { class: 'glare-overlay', hidden: true }) as HTMLDivElement;
  const badge = h('div', { class: 'render-badge' }, '正在请求 WebGPU 设备…');
  const host = h('div', { class: 'preview-stage' }, gpuCanvas, fallbackCanvas, glareEl, badge);

  let walkStart = performance.now();
  let walking = false;

  function getCamera(): { eye: Vec3; target: Vec3; vp: Float32Array; frame: ReturnType<typeof wallFrame> } {
    const route = d.route.filter((r) => r.hallId === wall.hallId && r.viewer === store.previewViewer);
    const sideCenter = route.reduce((a, p, _, arr) => ({ x: a.x + p.x / Math.max(1, arr.length), y: a.y + p.y / Math.max(1, arr.length) }), { x: wall.start.x + 1000, y: wall.start.y + 1000 });
    const frame = wallFrame(wall, sideCenter);
    const target = boardCenter3(board, frame);
    let p = route[0];
    if (route.length) {
      if (walking) {
        const t = ((performance.now() - walkStart) % 18000) / 18000;
        p = route[Math.min(route.length - 1, Math.floor(t * route.length))];
      } else {
        p = route.reduce((best, cur) => Math.hypot(cur.x - target.x, cur.y - target.z) < Math.hypot(best.x - target.x, best.y - target.z) ? cur : best, route[0]);
      }
    }
    const eyeHeight = store.previewViewer === 'adult' ? d.project.standard.adultEyeHeightMm : d.project.standard.wheelchairEyeHeightMm;
    const eye: Vec3 = p ? { x: p.x, y: eyeHeight, z: p.y } : { x: target.x, y: eyeHeight, z: target.z + 1200 };
    const aspect = Math.max(0.1, gpuCanvas.clientWidth / Math.max(1, gpuCanvas.clientHeight));
    const vp = multiply(perspective(58, aspect, 50, 120000), lookAt([eye.x, eye.y, eye.z], [target.x, target.y, target.z]));
    return { eye, target, vp, frame };
  }

  function positionGlare(vp: Float32Array, frame: ReturnType<typeof wallFrame>) {
    if (!glare || !stage) { glareEl.hidden = true; return; }
    const center = localPointToWorld(board, frame, glare.xMm, glare.yFromTopMm, 70 + board.acrylicThicknessMm);
    const right = { x: center.x + frame.tangent3.x * glare.radiusXMm, y: center.y, z: center.z + frame.tangent3.z * glare.radiusXMm };
    const up = { x: center.x, y: center.y + glare.radiusYMm, z: center.z };
    const c = project(center, vp, gpuCanvas.clientWidth, gpuCanvas.clientHeight);
    const r = project(right, vp, gpuCanvas.clientWidth, gpuCanvas.clientHeight);
    const u = project(up, vp, gpuCanvas.clientWidth, gpuCanvas.clientHeight);
    if (!c || !r || !u || c.z < 0 || c.z > 1.2) { glareEl.hidden = true; return; }
    const rx = Math.hypot(r.x - c.x, r.y - c.y);
    const ry = Math.hypot(u.x - c.x, u.y - c.y);
    glareEl.hidden = false;
    glareEl.style.left = `${c.x}px`;
    glareEl.style.top = `${c.y}px`;
    glareEl.style.width = `${Math.max(28, rx * 2)}px`;
    glareEl.style.height = `${Math.max(18, ry * 2)}px`;
  }

  function drawFallback() {
    renderBoard2D(fallbackCanvas, board, { glare, showMissing: true });
  }

  function draw() {
    if (destroyed) return;
    drawFallback();
    if (!stage) return;
    const { vp, frame } = getCamera();
    const localGroups = buildBoardTextGroups(board, (id) => {
      const rt = fontManager.getRuntime(id);
      return rt ? { atlas: rt.atlas, pixels: rt.atlasPixels } : undefined;
    }, fontManager);
    const textGroups = localGroups.flatMap((g) => buildBoardExtrusionGroups(g, board, d));
    const solid = buildHallSolids(d, wall.hallId, board);
    stage.render({ canvas: gpuCanvas, vp, textGroups, solid, clear: [0.115, 0.135, 0.16, 1] });
    positionGlare(vp, frame);
    badge.textContent = `WebGPU 三维预览 · ${store.previewViewer === 'adult' ? '成人 1600mm' : '轮椅 1200mm'}眼高 · ${MATERIAL_LABELS[board.substrate]}`;
  }

  const resizeObs = new ResizeObserver(() => draw());
  resizeObs.observe(host);
  unsubFont = fontManager.subscribe(() => draw());
  const previewChars = new Set(layout.glyphs.map((g) => g.char));
  void fontManager.ensureAtlas(previewChars, board.blocks.find((b) => b.fontId)?.fontId || store.data.project.defaultFontId, 64)
    .then(() => draw())
    .catch((e) => console.warn('预览 MSDF 生成失败', e));

  WebGpuStage.create(gpuCanvas).then((s) => {
    if (destroyed) return;
    stage = s;
    gpuCanvas.style.position = 'absolute';
    gpuCanvas.style.inset = '0';
    gpuCanvas.style.width = '100%';
    gpuCanvas.style.height = '100%';
    fallbackCanvas.style.opacity = '0';
    draw();
  }).catch((e) => {
    gpuCanvas.remove();
    glareEl.remove();
    badge.textContent = '当前浏览器无 WebGPU，显示 Canvas 板面/眩光兼容预览';
    drawFallback();
    console.info(e);
  });

  function loop() {
    if (!destroyed && walking) { draw(); raf = requestAnimationFrame(loop); }
  }

  const hud = h('div', { class: 'preview-hud' },
    h('h3', {}, `${board.code} ${board.title}`),
    h('div', { class: 'muted', style: 'font-size:12px;margin-bottom:8px' }, `${wall.name} · ${MATERIAL_LABELS[board.substrate]}${board.substrate === 'acrylic' ? ` · 立体厚度 ${board.acrylicThicknessMm}mm` : ''}`),
    h('div', { class: 'switch-tabs', style: 'margin-bottom:10px' },
      h('button', { class: store.previewViewer === 'adult' ? 'active' : '', onClick: () => { store.previewViewer = 'adult'; refresh(); } }, '成人 1600'),
      h('button', { class: store.previewViewer === 'wheelchair' ? 'active' : '', onClick: () => { store.previewViewer = 'wheelchair'; refresh(); } }, '轮椅 1200')
    ),
    metricLine('视距', metric ? `${metric.viewingDistanceMm.toFixed(0)} mm` : '—'),
    metricLine('字视角', metric ? `${metric.viewingAngleArcmin.toFixed(1)} 弧分` : '—'),
    metricLine('成人 / 轮椅', metric ? `${metric.adultAngleArcmin.toFixed(1)}′ / ${metric.wheelchairAngleArcmin.toFixed(1)}′` : '—'),
    metricLine('斜视角', metric ? `${metric.obliqueDeg.toFixed(1)}°` : '—'),
    metricLine('对比度', metric ? `${metric.contrast.toFixed(2)}:1` : '—'),
    metricLine('眩光遮挡', metric ? `${(metric.glareCoverage * 100).toFixed(1)}%` : '—'),
    h('div', { style: 'margin:10px 0;display:grid;gap:6px' },
      metric?.issues.slice(0, 3).map((i) => h('div', { class: 'issue' }, i))
    ),
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      h('button', { class: 'btn small primary', onClick: () => store.navigate('editor', board.id) }, '跳排版修改'),
      h('button', { class: 'btn small', onClick: () => store.navigate('report') }, '可读性报告')
    )
  );

  const controls = h('div', { class: 'preview-controls' },
    h('button', { class: 'btn', onClick: () => { const prev = d.boards[(idx - 1 + d.boards.length) % d.boards.length]; store.selectBoard(prev.id); refresh(); } }, '← 上一块'),
    h('button', { class: 'btn primary', onClick: () => { walking = !walking; if (walking) { walkStart = performance.now(); raf = requestAnimationFrame(loop); } else cancelAnimationFrame(raf); refresh(); } }, walking ? '■ 停止沿动线' : '▶ 沿动线走一遍'),
    h('button', { class: 'btn', onClick: () => { const next = d.boards[(idx + 1) % d.boards.length]; store.selectBoard(next.id); refresh(); } }, '下一块 →')
  );

  const root = h('div', { class: 'grid' },
    h('div', { style: 'display:flex;gap:12px;align-items:center;justify-content:space-between' },
      h('div', {}, h('h2', { style: 'margin:0;font-size:20px' }, '三维上墙预览'), h('div', { class: 'muted', style: 'font-size:12px;margin-top:3px' }, '毫米世界坐标、墙面法线、眼高、视距、斜视和射灯镜面反射实时计算')),
      h('div', { style: 'display:flex;gap:8px' }, h('span', { class: 'pill pill-accent' }, `第 ${idx + 1} / ${d.boards.length} 块`))
    ),
    host, hud, controls
  );
  host.append(hud, controls);
  (root as any)._cleanup = () => { destroyed = true; cancelAnimationFrame(raf); unsubFont?.(); resizeObs.disconnect(); };
  return root;
}

function metricLine(k: string, v: string) {
  return h('div', { class: 'metric-line' }, h('span', {}, k), h('strong', {}, v));
}

function project(p: Vec3, vp: Float32Array, w: number, h: number): { x: number; y: number; z: number } | null {
  const cx = vp[0] * p.x + vp[4] * p.y + vp[8] * p.z + vp[12];
  const cy = vp[1] * p.x + vp[5] * p.y + vp[9] * p.z + vp[13];
  const cw = vp[3] * p.x + vp[7] * p.y + vp[11] * p.z + vp[15];
  if (Math.abs(cw) < 1e-6) return null;
  const nx = cx / cw, ny = cy / cw, nz = (vp[2] * p.x + vp[6] * p.y + vp[10] * p.z + vp[14]) / cw;
  return { x: (nx * 0.5 + 0.5) * w, y: (1 - (ny * 0.5 + 0.5)) * h, z: nz };
}
