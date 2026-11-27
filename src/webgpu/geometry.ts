import type { AtlasMetrics, Board, ID, LaidGlyph } from '../types';
import { layoutBoard, type GlyphMetricsResolver } from '../lib/textLayout';
import { hexToRgb } from '../lib/utils';

export interface TextVertexGroup {
  fontId: ID;
  atlas: AtlasMetrics;
  pixels: Uint8Array;
  vertices: Float32Array;
  glyphCount: number;
}

export interface SolidMesh {
  vertices: Float32Array; // xyz + rgba
  indices: Uint16Array | Uint32Array;
}

function addQuad(out: number[], p: { x: number; y: number; z?: number }, corners: Array<{ x: number; y: number; u: number; v: number }>, color: [number, number, number, number]) {
  const z = p.z || 0;
  const order = [0, 1, 2, 0, 2, 3];
  for (const i of order) {
    const c = corners[i];
    out.push(c.x, c.y, z, c.u, c.v, color[0], color[1], color[2], color[3]);
  }
}

function rotate2(x: number, y: number, rad: number): { x: number; y: number } {
  const c = Math.cos(rad), s = Math.sin(rad);
  return { x: x * c - y * s, y: x * s + y * c };
}

export function buildBoardTextGroups(
  board: Board,
  atlasProvider: (fontId?: ID) => { atlas?: AtlasMetrics; pixels?: Uint8Array } | undefined,
  resolver?: GlyphMetricsResolver
): TextVertexGroup[] {
  const layout = layoutBoard(board, resolver);
  const byFont = new Map<ID, LaidGlyph[]>();
  for (const g of layout.glyphs) {
    if (g.char === ' ' || g.char === '\n') continue;
    const arr = byFont.get(g.fontId) || [];
    arr.push(g);
    byFont.set(g.fontId, arr);
  }
  const groups: TextVertexGroup[] = [];
  const rgb = hexToRgb(board.textColor);
  const color: [number, number, number, number] = [rgb.r / 255, rgb.g / 255, rgb.b / 255, 1];

  for (const [fontId, glyphs] of byFont) {
    const runtime = atlasProvider(fontId);
    if (!runtime?.atlas || !runtime.pixels) continue;
    const atlas = runtime.atlas;
    const out: number[] = [];
    let used = 0;
    for (const g of glyphs) {
      const info = atlas.glyphs[g.char];
      if (!info || info.missing) continue;
      const [x0e, y0e, x1e, y1e] = info.plane;
      let penX = g.xMm;
      const baseline = g.yMm;
      if (g.vertical) {
        penX = g.xMm - g.sizeMm * 0.5;
      }
      let xL = penX + x0e * g.sizeMm;
      let xR = penX + x1e * g.sizeMm;
      let yT = baseline - y1e * g.sizeMm;
      let yB = baseline - y0e * g.sizeMm;
      let corners = [
        { x: xL, y: yT, u: info.uv[0], v: info.uv[1] },
        { x: xR, y: yT, u: info.uv[2], v: info.uv[1] },
        { x: xR, y: yB, u: info.uv[2], v: info.uv[3] },
        { x: xL, y: yB, u: info.uv[0], v: info.uv[3] }
      ];
      if (g.rotationRad) {
        const ox = g.xMm;
        const oy = g.yMm;
        corners = corners.map((c) => {
          const r = rotate2(c.x - ox, c.y - oy, Math.PI / 2);
          return { ...c, x: ox + r.x, y: oy + r.y };
        });
      }
      addQuad(out, { x: 0, y: 0, z: 1 }, corners, color);
      used++;
    }
    if (used) groups.push({ fontId, atlas, pixels: runtime.pixels, vertices: new Float32Array(out), glyphCount: used });
  }
  return groups;
}

export function colorToRgba(hex: string, alpha = 1): [number, number, number, number] {
  const c = hexToRgb(hex);
  return [c.r / 255, c.g / 255, c.b / 255, alpha];
}

/** 构造一个立方体；坐标为中心、尺寸毫米。 */
export function buildBox(center: [number, number, number], size: [number, number, number], color: [number, number, number, number]): SolidMesh {
  const [cx, cy, cz] = center;
  const [sx, sy, sz] = size.map((v) => v / 2);
  const x0 = cx - sx, x1 = cx + sx, y0 = cy - sy, y1 = cy + sy, z0 = cz - sz, z1 = cz + sz;
  const faces: Array<Array<[number, number, number]>> = [
    [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]],
    [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]],
    [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]],
    [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]],
    [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]],
    [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]
  ];
  const verts: number[] = [];
  const indices: number[] = [];
  faces.forEach((face, fi) => {
    const base = fi * 4;
    face.forEach((p) => verts.push(p[0], p[1], p[2], ...color));
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return { vertices: new Float32Array(verts), indices: new Uint16Array(indices) };
}

export function mergeSolids(meshes: SolidMesh[]): SolidMesh {
  const vertices: number[] = [];
  const indices: number[] = [];
  let offset = 0;
  for (const m of meshes) {
    for (let i = 0; i < m.vertices.length; i++) vertices.push(m.vertices[i]);
    for (const idx of m.indices) indices.push(idx + offset);
    offset += m.vertices.length / 7;
  }
  return { vertices: new Float32Array(vertices), indices: new Uint32Array(indices) };
}
