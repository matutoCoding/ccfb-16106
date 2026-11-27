import type { AppData, Board, BoardMetric, ReadabilityReport, Severity } from '../types';
import { contrastRatio } from './utils';
import { layoutBoard, type GlyphMetricsResolver } from './textLayout';
import { computeBoardGlare } from './glare';
import { boardCenter3, wallFrame } from './world';
import { dist3 } from './utils';

export interface ComputeReportOptions {
  fontId?: string;
  resolver?: GlyphMetricsResolver;
  /** 字体 x-height/字面率变化会轻微改变实际视角；默认按思源黑体字面率。 */
  fontFaceRatio?: number;
  includeLayouts?: boolean;
}

function angularArcmin(heightMm: number, distanceMm: number): number {
  if (distanceMm <= 0) return 180 * 60;
  return 2 * Math.atan(heightMm / (2 * distanceMm)) * 180 / Math.PI * 60;
}

function nearestView(data: AppData, board: Board, eyeHeightMm: number, viewer: 'adult' | 'wheelchair') {
  const wall = data.walls.find((w) => w.id === board.wallId);
  if (!wall) return null;
  const hallRoutes = data.route.filter((r) => r.hallId === wall.hallId && r.viewer === viewer);
  const sideCenter = hallRoutes.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  if (hallRoutes.length) { sideCenter.x /= hallRoutes.length; sideCenter.y /= hallRoutes.length; }
  const frame = wallFrame(wall, sideCenter);
  const target = boardCenter3(board, frame);
  let best: { distance: number; oblique: number; point: (typeof hallRoutes)[number] | null } | null = null;
  const points = hallRoutes.length ? hallRoutes : data.route.filter((r) => r.hallId === wall.hallId);
  for (const p of points) {
    const eye = { x: p.x, y: eyeHeightMm, z: p.y };
    const d = dist3(eye, target);
    const view = { x: target.x - eye.x, y: target.y - eye.y, z: target.z - eye.z };
    const vl = Math.hypot(view.x, view.y, view.z) || 1;
    const n = frame.normal3;
    const cos = Math.abs((view.x / vl) * n.x + (view.y / vl) * n.y + (view.z / vl) * n.z);
    const oblique = Math.acos(Math.min(1, cos)) * 180 / Math.PI;
    if (!best || d < best.distance) best = { distance: d, oblique, point: p };
  }
  if (!best) {
    const eye = { x: wall.start.x + 800, y: eyeHeightMm, z: wall.start.y + 800 };
    const d = dist3(eye, target);
    best = { distance: d, oblique: 0, point: null };
  }
  return best;
}

function worstStatus(current: Severity, next: Severity): Severity {
  const rank = { pass: 0, warning: 1, fail: 2 } as const;
  return rank[next] > rank[current] ? next : current;
}

export function computeBoardMetric(data: AppData, board: Board, options: ComputeReportOptions = {}): BoardMetric {
  const started = performance.now();
  const wall = data.walls.find((w) => w.id === board.wallId);
  const wallName = wall?.name || '未挂墙';
  const layout = layoutBoard(board, options.resolver);
  const faceRatio = options.fontFaceRatio ?? 0.88;

  const allSizes = board.blocks.map((b) => b.fontSizeMm);
  const cjkBlocks = board.blocks.filter((b) => /[㐀-鿿]/.test(b.textZh || ''));
  const criticalSizes = cjkBlocks.map((b) => b.fontSizeMm);
  const minTextHeightMm = Math.min(...allSizes, 9999);
  const criticalTextHeightMm = Math.min(...criticalSizes.length ? criticalSizes : allSizes, 9999);
  const actualCriticalHeight = criticalTextHeightMm * faceRatio;

  const adult = nearestView(data, board, data.project.standard.adultEyeHeightMm, 'adult');
  const wheelchair = nearestView(data, board, data.project.standard.wheelchairEyeHeightMm, 'wheelchair');
  const aAngleBase = adult ? angularArcmin(actualCriticalHeight, adult.distance) : 0;
  const wAngleBase = wheelchair ? angularArcmin(actualCriticalHeight, wheelchair.distance) : 0;
  const aObliqueFactor = adult ? 0.68 + 0.32 * Math.cos(adult.oblique * Math.PI / 180) : 1;
  const wObliqueFactor = wheelchair ? 0.68 + 0.32 * Math.cos(wheelchair.oblique * Math.PI / 180) : 1;
  const adultAngleArcmin = aAngleBase * aObliqueFactor;
  const wheelchairAngleArcmin = wAngleBase * wObliqueFactor;
  const governing = adultAngleArcmin <= wheelchairAngleArcmin
    ? { angle: adultAngleArcmin, view: adult, who: '成人' as const }
    : { angle: wheelchairAngleArcmin, view: wheelchair, who: '轮椅' as const };

  const contrast = contrastRatio(board.textColor, board.finishColor);
  const glare = computeBoardGlare(board, data, layout.glyphs);
  const glareCoverage = glare?.coverage || 0;
  const glareBlockIds = glare?.blockIds || [];

  const issues: string[] = [];
  let status: Severity = 'pass';
  const std = data.project.standard;

  if (governing.angle < std.minAngleArcmin) {
    status = 'fail';
    issues.push(`${governing.who}视点字视角 ${governing.angle.toFixed(1)}′ 低于下限 ${std.minAngleArcmin}′`);
  } else if (governing.angle < std.criticalAngleArcmin) {
    status = worstStatus(status, 'warning');
    issues.push(`${governing.who}视点字视角 ${governing.angle.toFixed(1)}′ 未达老年加严值 ${std.criticalAngleArcmin}′`);
  }
  if (contrast < std.minContrast) {
    status = 'fail';
    issues.push(`对比度 ${contrast.toFixed(2)}:1 低于 ${std.minContrast}:1`);
  } else if (contrast < std.enhancedContrast) {
    status = worstStatus(status, 'warning');
    issues.push(`对比度 ${contrast.toFixed(2)}:1 建议提升至 ${std.enhancedContrast}:1`);
  }
  if (glareCoverage > std.maxGlareCoverage) {
    status = 'fail';
    issues.push(`射灯眩光遮挡 ${(glareCoverage * 100).toFixed(1)}% 文字，超过 ${(std.maxGlareCoverage * 100).toFixed(0)}%`);
  } else if (glareCoverage > std.maxGlareCoverage * 0.5) {
    status = worstStatus(status, 'warning');
    issues.push(`眩光遮挡 ${(glareCoverage * 100).toFixed(1)}%，建议调整灯位或哑光膜`);
  }
  if (governing.view && governing.view.oblique > 55) {
    status = worstStatus(status, 'warning');
    issues.push(`斜视 ${governing.view.oblique.toFixed(0)}°，笔画压缩明显`);
  }
  if (board.substrate === 'vinyl' && criticalTextHeightMm < 8) {
    status = worstStatus(status, 'warning');
    issues.push('刻字贴字高/笔画过小，建议改 UV 或丝印');
  }
  if (!issues.length) issues.push('视距、对比度和眩光均满足当前标准');

  return {
    boardId: board.id,
    code: board.code,
    title: board.title,
    category: board.category,
    wallId: board.wallId,
    wallName,
    material: board.substrate,
    minTextHeightMm,
    criticalTextHeightMm,
    contrast,
    viewingDistanceMm: governing.view?.distance || 0,
    viewingAngleArcmin: governing.angle,
    adultAngleArcmin,
    wheelchairAngleArcmin,
    obliqueDeg: governing.view?.oblique || 0,
    glareCoverage,
    glareBlockIds,
    status,
    issues,
    minStrokeMm: criticalTextHeightMm * (board.blocks.some((b) => b.bold) ? 0.095 : 0.072),
    updatedAt: performance.now() - started
  };
}

export function computeReadabilityReport(data: AppData, options: ComputeReportOptions = {}): ReadabilityReport {
  const start = performance.now();
  const metrics = data.boards.map((b) => computeBoardMetric(data, b, options));
  const elapsedMs = performance.now() - start;
  return {
    projectId: data.project.id,
    generatedAt: Date.now(),
    elapsedMs,
    boardCount: metrics.length,
    pass: metrics.filter((m) => m.status === 'pass').length,
    warning: metrics.filter((m) => m.status === 'warning').length,
    fail: metrics.filter((m) => m.status === 'fail').length,
    metrics,
    fontId: options.fontId || data.project.defaultFontId
  };
}
