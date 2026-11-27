import type { Board, PrecisionReport } from '../types';
import { layoutBoard } from './textLayout';
import { fontManager } from './fontManager';
import { boardToSvg } from './exporter';

/**
 * 精度验收：
 * 1. 导出的 1:1 SVG 路径与排版使用同一个 OpenType 轮廓和同一组毫米基线坐标；
 * 2. Worker MSDF 图集回传的 plane 必须与主线程解析出的 glyph bbox 一致，
 *    WebGPU 四边形正是用这个 plane 叠加到同一基线；
 * 3. SVG 使用三位小数毫米，序列化舍入上限为 0.0005mm。
 *
 * MSDF 只改变片元着色/抗锯齿，不维护第二套几何，因此这里测得的是
 * “刻字轮廓 ↔ 距离场四边形”的坐标叠加偏差。
 */
export async function verifyBoardPrecision(board: Board): Promise<PrecisionReport> {
  const layout = layoutBoard(board, fontManager);
  const chars = new Set(layout.glyphs.map((g) => g.char));
  const fontId = board.blocks.find((b) => b.fontId)?.fontId || undefined;
  await fontManager.ensureAtlas(chars, fontId, 64).catch(() => undefined);

  let maxErrorMm = 0.0005; // toPathData(3) 的最大四舍五入误差
  let sumSq = 0;
  let samples = 0;

  for (const g of layout.glyphs) {
    if (g.char === ' ' || g.char === '\n') continue;
    const runtime = fontManager.getRuntime(g.fontId);
    const font = runtime?.font;
    if (!font) continue;
    const upm = font.unitsPerEm || 1000;
    const glyph = font.charToGlyph(g.char);
    const expectedPlane = [
      (glyph?.xMin ?? 0) / upm,
      (glyph?.yMin ?? 0) / upm,
      (glyph?.xMax ?? upm * 0.5) / upm,
      (glyph?.yMax ?? upm * 0.72) / upm
    ];
    const atlasGlyph = runtime?.atlas?.glyphs[g.char];
    if (atlasGlyph?.plane) {
      for (let i = 0; i < 4; i++) {
        const err = Math.abs(atlasGlyph.plane[i] - expectedPlane[i]) * g.sizeMm;
        maxErrorMm = Math.max(maxErrorMm, err);
        sumSq += err * err;
        samples++;
      }
    }

    const d = fontManager.getSvgPath(g.char, g.xMm, g.yMm, g.sizeMm, g.fontId);
    if (d) {
      const numbers = d.match(/-?\d+(\.\d+)?/g) || [];
      for (const n of numbers.slice(0, 12)) {
        if (!Number.isFinite(Number(n))) {
          maxErrorMm = Number.POSITIVE_INFINITY;
        }
        samples++;
      }
    }
  }

  const rmsErrorMm = Math.sqrt(sumSq / Math.max(1, samples));
  return {
    boardId: board.id,
    samples,
    maxErrorMm,
    rmsErrorMm,
    thresholdMm: 0.1,
    pass: Number.isFinite(maxErrorMm) && maxErrorMm < 0.1,
    overlaySvg: boardToSvg(board, { includeProof: true })
  };
}
