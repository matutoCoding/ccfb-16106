import type { Board } from '../types';
import { layoutBoard } from '../lib/textLayout';
import { fontManager } from '../lib/fontManager';
import type { GlareRegion } from '../lib/glare';

export interface BoardRenderOptions {
  showBlocks?: boolean;
  showMissing?: boolean;
  glare?: GlareRegion | null;
  overlayPaths?: boolean;
}

export function renderBoard2D(canvas: HTMLCanvasElement, board: Board, options: BoardRenderOptions = {}) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cssW = canvas.clientWidth || 800;
  const cssH = canvas.clientHeight || 520;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.fillStyle = '#e9e4d8';
  ctx.fillRect(0, 0, cssW, cssH);

  const margin = 28;
  const scale = Math.min((cssW - margin * 2) / board.widthMm, (cssH - margin * 2) / board.heightMm);
  const drawW = board.widthMm * scale;
  const drawH = board.heightMm * scale;
  const ox = (cssW - drawW) / 2;
  const oy = (cssH - drawH) / 2;
  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(scale, scale);

  ctx.shadowColor = 'rgba(0,0,0,.28)';
  ctx.shadowBlur = 18 / scale;
  ctx.shadowOffsetY = 8 / scale;
  ctx.fillStyle = board.finishColor;
  roundRect(ctx, 0, 0, board.widthMm, board.heightMm, board.substrate === 'acrylic' ? 10 : 2);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.lineWidth = 0.6 / scale;
  ctx.strokeStyle = 'rgba(0,0,0,.35)';
  ctx.stroke();
  roundRect(ctx, 0, 0, board.widthMm, board.heightMm, board.substrate === 'acrylic' ? 10 : 2);
  ctx.clip();

  if (board.substrate === 'acrylic') {
    const grad = ctx.createLinearGradient(0, 0, board.widthMm, board.heightMm);
    grad.addColorStop(0, 'rgba(255,255,255,.42)');
    grad.addColorStop(0.28, 'rgba(255,255,255,.06)');
    grad.addColorStop(0.55, 'rgba(120,200,230,.10)');
    grad.addColorStop(1, 'rgba(255,255,255,.24)');
    ctx.fillStyle = grad;
    roundRect(ctx, 0, 0, board.widthMm, board.heightMm, 10);
    ctx.fill();
  }

  if (options.showBlocks) {
    for (const b of board.blocks) {
      ctx.fillStyle = 'rgba(59,130,246,.08)';
      ctx.strokeStyle = 'rgba(37,99,235,.55)';
      ctx.lineWidth = 0.4 / scale;
      ctx.fillRect(b.xMm, b.yMm, b.widthMm, b.heightMm);
      ctx.strokeRect(b.xMm, b.yMm, b.widthMm, b.heightMm);
    }
  }

  const layout = layoutBoard(board, fontManager);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  for (const g of layout.glyphs) {
    if (g.char === ' ') continue;
    const block = board.blocks.find((b) => b.id === g.blockId);
    const weight = block?.bold ? 800 : 400;
    ctx.font = `${weight} ${g.sizeMm}px ${fontManager.getFamily(g.fontId)}`;
    ctx.fillStyle = g.missing ? '#dc2626' : block?.color || board.textColor;
    ctx.save();
    if (g.vertical) {
      ctx.translate(g.xMm, g.yMm);
      if (g.rotationRad) ctx.rotate(Math.PI / 2);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(g.char, 0, 0);
    } else {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(g.char, g.xMm, g.yMm);
    }
    ctx.restore();

    if (g.missing && options.showMissing !== false) {
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 0.8 / scale;
      const x = g.vertical ? g.xMm - g.sizeMm * 0.52 : g.xMm - 1;
      const y = g.yMm - g.sizeMm * 0.82;
      ctx.strokeRect(x, y, g.sizeMm * 1.04, g.sizeMm * 0.9);
    }
  }

  if (options.overlayPaths) {
    ctx.strokeStyle = 'rgba(236,72,153,.9)';
    ctx.lineWidth = 0.35 / scale;
    for (const g of layout.glyphs) {
      if (g.char === ' ' || g.rotationRad) continue;
      const d = new Path2D(fontManager.getSvgPath(g.char, g.xMm, g.yMm, g.sizeMm, g.fontId));
      ctx.stroke(d);
    }
  }

  if (options.glare) {
    const gr = options.glare;
    const grad = ctx.createRadialGradient(gr.xMm, gr.yFromTopMm, 0, gr.xMm, gr.yFromTopMm, Math.max(gr.radiusXMm, gr.radiusYMm));
    grad.addColorStop(0, `rgba(255,255,235,${0.72 * gr.intensity})`);
    grad.addColorStop(0.42, `rgba(255,236,150,${0.34 * gr.intensity})`);
    grad.addColorStop(1, 'rgba(255,236,150,0)');
    ctx.save();
    ctx.translate(gr.xMm, gr.yFromTopMm);
    ctx.scale(1, gr.radiusYMm / gr.radiusXMm);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(0, 0, gr.radiusXMm, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(245,158,11,.95)';
    ctx.setLineDash([8 / scale, 5 / scale]);
    ctx.lineWidth = 1.2 / scale;
    ctx.beginPath();
    ctx.ellipse(gr.xMm, gr.yFromTopMm, gr.radiusXMm, gr.radiusYMm, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();
  return { scale, ox, oy };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
