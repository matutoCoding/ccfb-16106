import type { AppData, Board, BoardMetric, ID, LaidGlyph, RoutePoint, Vec3 } from '../types';
import { boardCenter3, localPointToWorld, specularPointOnPlane, wallFrame, worldToBoardLocal } from './world';

export interface GlareRegion {
  boardId: ID;
  lightId: ID;
  routePointId: ID;
  viewer: RoutePoint['viewer'];
  xMm: number;
  yFromTopMm: number;
  radiusXMm: number;
  radiusYMm: number;
  intensity: number;
  coverage: number;
  blockIds: ID[];
}

function glyphCenter(g: LaidGlyph): { x: number; y: number } {
  if (g.vertical) return { x: g.xMm, y: g.yMm + g.sizeMm * 0.5 };
  return { x: g.xMm + g.advanceMm * 0.5, y: g.yMm - g.sizeMm * 0.36 };
}

function coverageForRegion(board: Board, glyphs: LaidGlyph[], cx: number, cy: number, rx: number, ry: number) {
  let covered = 0;
  const blocks = new Set<ID>();
  for (const g of glyphs) {
    const p = glyphCenter(g);
    const v = ((p.x - cx) / rx) ** 2 + ((p.y - cy) / ry) ** 2;
    if (v <= 1) {
      covered++;
      blocks.add(g.blockId);
    }
  }
  const denom = Math.max(1, glyphs.filter((g) => g.char !== ' ').length);
  return { coverage: Math.min(1, covered / denom), blockIds: [...blocks] };
}

export function computeBoardGlare(board: Board, data: Pick<AppData, 'walls' | 'route' | 'lights'>, glyphs: LaidGlyph[] = []): GlareRegion | null {
  const wall = data.walls.find((w) => w.id === board.wallId);
  if (!wall) return null;
  const hallRoutes = data.route.filter((r) => r.hallId === wall.hallId);
  const center = hallRoutes.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  if (hallRoutes.length) { center.x /= hallRoutes.length; center.y /= hallRoutes.length; }
  const frame = wallFrame(wall, center);
  const planePoint = localPointToWorld(board, frame, board.widthMm / 2, board.heightMm / 2);
  const normal = frame.normal3;
  const lights = data.lights.filter((l) => l.hallId === wall.hallId);
  const target = boardCenter3(board, frame);
  // 眩光和视角使用同一个最近阅读站位；不在整条动线上做无限最坏搜索。
  const viewpoints: RoutePoint[] = (['adult', 'wheelchair'] as const).map((viewer) => {
    const same = hallRoutes.filter((r) => r.viewer === viewer);
    if (!same.length) return null;
    return same.reduce((best, p) => Math.hypot(p.x - target.x, p.y - target.z) < Math.hypot(best.x - target.x, best.y - target.z) ? p : best, same[0]);
  }).filter(Boolean) as RoutePoint[];
  if (!viewpoints.length) {
    viewpoints.push({ id: 'default', hallId: wall.hallId, name: '默认', x: wall.start.x, y: wall.start.y + 1200, heading: 0, viewer: 'adult' });
  }

  const materialGloss = board.substrate === 'acrylic' ? 1 : board.substrate === 'uv' ? 0.16 : board.substrate === 'vinyl' ? 0.08 : 0.035;
  let worst: GlareRegion | null = null;

  for (const vp of viewpoints) {
    const eyeY = vp.viewer === 'adult' ? 1600 : 1200;
    const eye: Vec3 = { x: vp.x, y: eyeY, z: vp.y };
    for (const light of lights) {
      const q = specularPointOnPlane(eye, light.position, planePoint, normal);
      if (!q) continue;
      const local = worldToBoardLocal(board, frame, q);
      if (local.xMm < -500 || local.xMm > board.widthMm + 500 || local.yFromTopMm < -500 || local.yFromTopMm > board.heightMm + 500) continue;

      const lightPlaneDist = Math.abs((light.position.x - planePoint.x) * normal.x + (light.position.y - planePoint.y) * normal.y + (light.position.z - planePoint.z) * normal.z) || 1;
      const beamRadius = lightPlaneDist * Math.tan((light.beamAngleDeg * Math.PI / 180) / 2);
      const viewDx = eye.x - q.x, viewDy = eye.y - q.y, viewDz = eye.z - q.z;
      const viewDist = Math.hypot(viewDx, viewDy, viewDz) || 1;
      const cosOblique = Math.abs((viewDx / viewDist) * normal.x + (viewDy / viewDist) * normal.y + (viewDz / viewDist) * normal.z);
      const distanceFactor = Math.min(1.15, 2200 / viewDist);
      const intensity = Math.min(0.82, materialGloss * (0.3 + light.intensity * 0.22) * distanceFactor * (0.55 + cosOblique * 0.45));
      const rx = Math.max(55, Math.min(520, beamRadius * 0.07 + 90)) / Math.max(0.55, cosOblique);
      const ry = Math.max(36, Math.min(300, rx * (0.34 + cosOblique * 0.2)));
      const { coverage, blockIds } = coverageForRegion(board, glyphs, local.xMm, local.yFromTopMm, rx, ry);
      const candidate: GlareRegion = {
        boardId: board.id, lightId: light.id, routePointId: vp.id, viewer: vp.viewer,
        xMm: local.xMm, yFromTopMm: local.yFromTopMm, radiusXMm: rx, radiusYMm: ry,
        intensity, coverage: coverage * intensity, blockIds
      };
      if (!worst || candidate.coverage > worst.coverage) worst = candidate;
    }
  }
  return worst;
}

export function glareToMetric(g: GlareRegion | null): Pick<BoardMetric, 'glareCoverage' | 'glareBlockIds'> {
  return { glareCoverage: g?.coverage || 0, glareBlockIds: g?.blockIds || [] };
}
