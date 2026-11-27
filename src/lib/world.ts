import type { Board, Vec2, Vec3, Wall } from '../types';
import { closestPointOnSegment } from './utils';

export interface WallFrame {
  wall: Wall;
  lengthMm: number;
  tangent2: Vec2;
  normal2: Vec2;
  tangent3: Vec3;
  normal3: Vec3;
}

export function wallLength(wall: Wall): number {
  return Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y);
}

export function wallFrame(wall: Wall, viewerSide?: Vec2): WallFrame {
  const lengthMm = wallLength(wall) || 1;
  const tx = (wall.end.x - wall.start.x) / lengthMm;
  const ty = (wall.end.y - wall.start.y) / lengthMm;
  let nx = -ty;
  let ny = tx;
  if (viewerSide) {
    const dot = (viewerSide.x - wall.start.x) * nx + (viewerSide.y - wall.start.y) * ny;
    if (dot < 0) { nx = -nx; ny = -ny; }
  }
  return {
    wall, lengthMm,
    tangent2: { x: tx, y: ty },
    normal2: { x: nx, y: ny },
    tangent3: { x: tx, y: 0, z: ty },
    normal3: { x: nx, y: 0, z: ny }
  };
}

export function boardAlongStart(board: Board, frame: WallFrame): number {
  return board.anchor === 'center' ? board.alongMm - board.widthMm / 2 : board.alongMm;
}

export function boardOrigin3(board: Board, frame: WallFrame): Vec3 {
  const along = boardAlongStart(board, frame);
  return {
    x: frame.wall.start.x + frame.tangent2.x * along,
    y: board.elevationMm,
    z: frame.wall.start.y + frame.tangent2.y * along
  };
}

export function boardCenter3(board: Board, frame: WallFrame): Vec3 {
  const o = boardOrigin3(board, frame);
  return {
    x: o.x + frame.tangent3.x * board.widthMm / 2,
    y: o.y + board.heightMm / 2,
    z: o.z + frame.tangent3.z * board.widthMm / 2
  };
}

export function planBoardCenter(board: Board, wall: Wall): Vec2 {
  const f = wallFrame(wall);
  const c = boardCenter3(board, f);
  return { x: c.x, y: c.z };
}

export function nearestPointOnWall(p: Vec2, wall: Wall) {
  return closestPointOnSegment(p, wall.start, wall.end);
}

export function localPointToWorld(board: Board, frame: WallFrame, xFromLeftMm: number, yFromTopMm: number, zOffsetMm = 0): Vec3 {
  const o = boardOrigin3(board, frame);
  return {
    x: o.x + frame.tangent3.x * xFromLeftMm + frame.normal3.x * zOffsetMm,
    y: o.y + board.heightMm - yFromTopMm,
    z: o.z + frame.tangent3.z * xFromLeftMm + frame.normal3.z * zOffsetMm
  };
}

export function worldToBoardLocal(board: Board, frame: WallFrame, p: Vec3): { xMm: number; yFromTopMm: number } {
  const o = boardOrigin3(board, frame);
  const dx = p.x - o.x;
  const dz = p.z - o.z;
  const xMm = dx * frame.tangent3.x + dz * frame.tangent3.z;
  const yWorld = p.y - o.y;
  return { xMm, yFromTopMm: board.heightMm - yWorld };
}

export function specularPointOnPlane(eye: Vec3, light: Vec3, planePoint: Vec3, normal: Vec3): Vec3 | null {
  const d = Math.hypot(normal.x, normal.y, normal.z) || 1;
  const n = { x: normal.x / d, y: normal.y / d, z: normal.z / d };
  const planeDist = (light.x - planePoint.x) * n.x + (light.y - planePoint.y) * n.y + (light.z - planePoint.z) * n.z;
  const mirrored: Vec3 = { x: light.x - 2 * planeDist * n.x, y: light.y - 2 * planeDist * n.y, z: light.z - 2 * planeDist * n.z };
  const v = { x: mirrored.x - eye.x, y: mirrored.y - eye.y, z: mirrored.z - eye.z };
  const denom = v.x * n.x + v.y * n.y + v.z * n.z;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((planePoint.x - eye.x) * n.x + (planePoint.y - eye.y) * n.y + (planePoint.z - eye.z) * n.z) / denom;
  if (t < -0.2 || t > 1.4) return null;
  return { x: eye.x + v.x * t, y: eye.y + v.y * t, z: eye.z + v.z * t };
}
