import type { Board } from '../types';
import { fontManager } from '../lib/fontManager';
import { WebGpuStage } from '../webgpu/WebGpuStage';
import { vpOrtho } from '../webgpu/mat4';
import { buildBoardTextGroups, buildBox } from '../webgpu/geometry';
import { renderBoard2D, type BoardRenderOptions } from './canvasBoard';
import { colorToRgba } from '../webgpu/geometry';

export interface BoardViewportHandle {
  el: HTMLDivElement;
  update: (board: Board, options?: BoardRenderOptions) => void;
  destroy: () => void;
}

export function createBoardViewport(board: Board, options: BoardRenderOptions = {}): BoardViewportHandle {
  const el = document.createElement('div');
  el.className = 'board-viewport';
  el.style.display = 'block';
  el.style.width = '100%';
  el.style.height = '100%';
  el.style.minHeight = '420px';
  el.innerHTML = `
    <canvas class="gpu-canvas" hidden></canvas>
    <canvas class="fallback-canvas"></canvas>
    <div class="viewport-tools">
      <button class="btn small" data-zoom="in" title="拉近">＋</button>
      <button class="btn small" data-zoom="out" title="拉远">－</button>
      <button class="btn small" data-zoom="fit" title="适应全板">适应</button>
    </div>
    <div class="render-badge">初始化渲染器…</div>
  `;
  const gpuCanvas = el.querySelector<HTMLCanvasElement>('.gpu-canvas')!;
  const fallback = el.querySelector<HTMLCanvasElement>('.fallback-canvas')!;
  const badge = el.querySelector<HTMLDivElement>('.render-badge')!;
  let current = board;
  let opts = options;
  let stage: WebGpuStage | null = null;
  let destroyed = false;
  let zoom = 1;
  let panX = 0;
  let panY = 0;
  let unsubFont: (() => void) | null = null;
  let resizeObs: ResizeObserver | null = null;

  function drawFallback() {
    renderBoard2D(fallback, current, opts);
  }

  function drawGpu() {
    if (!stage || destroyed) return;
    const groups = buildBoardTextGroups(current, (id) => {
      const rt = fontManager.getRuntime(id);
      return rt ? { atlas: rt.atlas, pixels: rt.atlasPixels } : undefined;
    }, fontManager);
    if (!groups.length) {
      gpuCanvas.hidden = true;
      fallback.style.visibility = 'visible';
      badge.textContent = 'Canvas 兼容渲染 · 等待 MSDF 图集';
      drawFallback();
      return;
    }
    gpuCanvas.hidden = false;
    const [cw, ch] = stage.resize(gpuCanvas);
    const vp = vpOrtho(current.widthMm, current.heightMm, cw, ch, zoom, panX, panY);
    const substrate = buildBox([current.widthMm / 2, current.heightMm / 2, -6], [current.widthMm, current.heightMm, 12], colorToRgba(current.finishColor, 1));
    stage.render({ canvas: gpuCanvas, vp, textGroups: groups, solid: substrate, params: [groups[0]?.atlas.rangePx || 7, groups[0]?.atlas.cellPx || 64, cw, ch] });
    fallback.style.visibility = 'hidden';
    badge.textContent = `WebGPU MSDF · ${groups.reduce((n, g) => n + g.glyphCount, 0)} 字形`;
  }

  function redraw() {
    drawFallback();
    drawGpu();
  }

  el.querySelectorAll<HTMLButtonElement>('[data-zoom]').forEach((btn) => btn.addEventListener('click', () => {
    const kind = btn.dataset.zoom;
    if (kind === 'in') zoom = Math.min(24, zoom * 1.55);
    if (kind === 'out') zoom = Math.max(0.2, zoom / 1.55);
    if (kind === 'fit') { zoom = 1; panX = 0; panY = 0; }
    redraw();
  }));
  el.addEventListener('wheel', (e) => {
    e.preventDefault();
    zoom = Math.max(0.2, Math.min(24, zoom * Math.exp(-e.deltaY * 0.0012)));
    redraw();
  }, { passive: false });

  resizeObs = new ResizeObserver(() => redraw());
  resizeObs.observe(el);
  unsubFont = fontManager.subscribe(() => redraw());
  drawFallback();

  WebGpuStage.create(gpuCanvas).then((s) => {
    if (destroyed) return;
    stage = s;
    badge.textContent = 'WebGPU 已连接';
    redraw();
  }).catch((e) => {
    badge.textContent = 'Canvas 2D 模式（当前环境无 WebGPU）';
    gpuCanvas.remove();
    console.info('WebGPU unavailable, using Canvas fallback:', e?.message || e);
  });

  return {
    el,
    update(b, o) { current = b; opts = { ...opts, ...o }; redraw(); },
    destroy() { destroyed = true; unsubFont?.(); resizeObs?.disconnect(); }
  };
}
