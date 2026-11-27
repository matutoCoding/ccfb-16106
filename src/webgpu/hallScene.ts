import type { AppData, Board, Vec3 } from '../types';
import { boardOrigin3, wallFrame } from '../lib/world';
import { buildBox, colorToRgba, mergeSolids, type SolidMesh, type TextVertexGroup } from '../webgpu/geometry';

export function transformGroupToBoard(
  group: TextVertexGroup,
  board: Board,
  data: Pick<AppData, 'walls' | 'route'>,
  zExtraMm: number,
  colorOverride?: [number, number, number, number]
): TextVertexGroup {
  const wall = data.walls.find((w) => w.id === board.wallId);
  if (!wall) return group;
  const center = data.route.filter((r) => r.hallId === wall.hallId).reduce((a, p, _, arr) => ({ x: a.x + p.x / arr.length, y: a.y + p.y / arr.length }), { x: 0, y: 0 });
  const frame = wallFrame(wall, center);
  const origin = boardOrigin3(board, frame);
  const vertices = new Float32Array(group.vertices);
  for (let i = 0; i < vertices.length; i += 9) {
    const lx = vertices[i];
    const lyTop = vertices[i + 1];
    const lz = vertices[i + 2] || 0;
    const z = lz + zExtraMm;
    vertices[i] = origin.x + frame.tangent3.x * lx + frame.normal3.x * z;
    vertices[i + 1] = origin.y + board.heightMm - lyTop;
    vertices[i + 2] = origin.z + frame.tangent3.z * lx + frame.normal3.z * z;
    if (colorOverride) {
      vertices[i + 5] = colorOverride[0];
      vertices[i + 6] = colorOverride[1];
      vertices[i + 7] = colorOverride[2];
      vertices[i + 8] = colorOverride[3];
    }
  }
  return { ...group, vertices };
}

export function buildBoardExtrusionGroups(group: TextVertexGroup, board: Board, data: Pick<AppData, 'walls' | 'route'>): TextVertexGroup[] {
  if (board.substrate !== 'acrylic') return [transformGroupToBoard(group, board, data, 10)];
  const depth = Math.max(8, board.acrylicThicknessMm || 18);
  const out: TextVertexGroup[] = [];
  const side = colorToRgba(shade(board.textColor, -0.42), 0.96);
  const steps = 5;
  for (let i = 0; i < steps; i++) {
    out.push(transformGroupToBoard(group, board, data, 10 + (i / steps) * depth, side));
  }
  out.push(transformGroupToBoard(group, board, data, 10 + depth, colorToRgba(board.textColor, 1)));
  return out;
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(Math.max(0, Math.min(255, r + 255 * amount)));
  g = Math.round(Math.max(0, Math.min(255, g + 255 * amount)));
  b = Math.round(Math.max(0, Math.min(255, b + 255 * amount)));
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

export function buildHallSolids(data: AppData, hallId: string, selected: Board): SolidMesh {
  const meshes: SolidMesh[] = [];
  const hall = data.halls.find((h) => h.id === hallId);
  if (hall) {
    const ws = data.walls.filter((w) => w.hallId === hallId);
    const minX = Math.min(...ws.flatMap((w) => [w.start.x, w.end.x]));
    const minY = Math.min(...ws.flatMap((w) => [w.start.y, w.end.y]));
    meshes.push(buildBox([minX + hall.widthMm / 2, -90, minY + hall.depthMm / 2], [hall.widthMm, 180, hall.depthMm], colorToRgba(hall.floorColor, 1)));
  }
  for (const wall of data.walls.filter((w) => w.hallId === hallId)) {
    const mx = (wall.start.x + wall.end.x) / 2;
    const mz = (wall.start.y + wall.end.y) / 2;
    const tx = wall.end.x - wall.start.x;
    const tz = wall.end.y - wall.start.y;
    const len = Math.hypot(tx, tz);
    if (Math.abs(tx) >= Math.abs(tz)) meshes.push(buildBox([mx, wall.heightMm / 2, mz], [len, wall.heightMm, wall.thicknessMm], colorToRgba(wall.color, 1)));
    else meshes.push(buildBox([mx, wall.heightMm / 2, mz], [wall.thicknessMm, wall.heightMm, len], colorToRgba(wall.color, 1)));
  }
  for (const c of data.cases.filter((c) => c.hallId === hallId)) {
    meshes.push(buildBox([c.x, c.heightMm / 2, c.y], [c.widthMm, c.heightMm, c.depthMm], c.kind === 'pedestal' ? [0.54, 0.42, 0.25, 1] : [0.2, 0.48, 0.55, 0.55]));
    if (c.kind === 'case') meshes.push(buildBox([c.x, c.heightMm + 24, c.y], [c.widthMm * 0.96, 48, c.depthMm * 0.92], [0.72, 0.9, 1, 0.28]));
  }

  const wall = data.walls.find((w) => w.id === selected.wallId);
  if (wall) {
    const centerPoints = data.route.filter((r) => r.hallId === wall.hallId);
    const center2 = centerPoints.reduce((a, p, _, arr) => ({ x: a.x + p.x / Math.max(1, arr.length), y: a.y + p.y / Math.max(1, arr.length) }), { x: wall.start.x + 1000, y: wall.start.y + 1000 });
    const f = wallFrame(wall, center2);
    const o = boardOrigin3(selected, f);
    const center: Vec3 = { x: o.x + f.tangent3.x * selected.widthMm / 2, y: o.y + selected.heightMm / 2, z: o.z + f.tangent3.z * selected.widthMm / 2 };
    const t = selected.substrate === 'acrylic' ? 24 : 14;
    const acrylic = selected.substrate === 'acrylic';
    if (Math.abs(f.tangent3.x) >= Math.abs(f.tangent3.z)) {
      meshes.push(buildBox([center.x, center.y, center.z], [selected.widthMm, selected.heightMm, t], colorToRgba(selected.finishColor, acrylic ? 0.42 : 1)));
    } else {
      meshes.push(buildBox([center.x, center.y, center.z], [t, selected.heightMm, selected.widthMm], colorToRgba(selected.finishColor, acrylic ? 0.42 : 1)));
    }
  }
  return mergeSolids(meshes);
}
