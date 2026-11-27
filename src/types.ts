// 所有持久化与渲染领域对象。物理尺寸内部统一使用毫米(mm)，坐标原点在墙面/板面左下角。

export type ID = string;
export type MaterialKind = 'vinyl' | 'uv' | 'silk' | 'acrylic';
export type TextDirection = 'horizontal' | 'vertical';
export type ViewerKind = 'adult' | 'wheelchair';
export type Severity = 'pass' | 'warning' | 'fail';

export interface Project {
  id: ID;
  name: string;
  client: string;
  venue: string;
  description: string;
  createdAt: number;
  updatedAt: number;
  standard: ReadabilityStandard;
  defaultFontId?: ID;
  fallbackFontId?: ID;
}

export interface ReadabilityStandard {
  /** 核心展示文字建议最小视角，弧分。20′ 约为普通视力清晰阅读下限附近。 */
  minAngleArcmin: number;
  /** 老年/细说明文字的加严值。 */
  criticalAngleArcmin: number;
  minContrast: number;
  enhancedContrast: number;
  maxGlareCoverage: number;
  adultEyeHeightMm: number;
  wheelchairEyeHeightMm: number;
}

export interface Vec2 { x: number; y: number }
export interface Vec3 { x: number; y: number; z: number }

export interface Hall {
  id: ID;
  projectId: ID;
  name: string;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  floorColor: string;
}

export interface Wall {
  id: ID;
  hallId: ID;
  name: string;
  /** 平面坐标，mm；y 对应建筑平面的进深方向。 */
  start: Vec2;
  end: Vec2;
  heightMm: number;
  thicknessMm: number;
  color: string;
}

export interface DisplayCase {
  id: ID;
  hallId: ID;
  name: string;
  x: number;
  y: number;
  widthMm: number;
  depthMm: number;
  heightMm: number;
  kind: 'case' | 'pedestal';
}

export interface RoutePoint {
  id: ID;
  hallId: ID;
  name: string;
  x: number;
  y: number;
  /** 观众面朝方向，弧度；0 指向平面 +x。 */
  heading: number;
  viewer: ViewerKind;
}

export interface Luminaire {
  id: ID;
  hallId: ID;
  name: string;
  position: Vec3;
  target: Vec3;
  beamAngleDeg: number;
  intensity: number;
}

export interface BoardBlock {
  id: ID;
  role: 'eyebrow' | 'title' | 'subtitle' | 'body' | 'english' | 'pinyin' | 'caption' | 'number';
  textZh: string;
  textEn: string;
  pinyin?: string;
  direction: TextDirection;
  xMm: number;
  yMm: number;
  widthMm: number;
  heightMm: number;
  fontSizeMm: number;
  lineHeight: number;
  letterSpacingMm: number;
  color: string;
  fontId?: ID;
  bold?: boolean;
  align?: 'start' | 'center' | 'end';
}

export interface Board {
  id: ID;
  projectId: ID;
  code: string;
  seq: number;
  category: 'preface' | 'section' | 'panel' | 'exhibit-card' | 'wayfinding';
  title: string;
  wallId: ID;
  /** 沿墙方向中心/左缘位置，由 anchor 决定。 */
  alongMm: number;
  /** 板左下角完成面标高。 */
  elevationMm: number;
  widthMm: number;
  heightMm: number;
  anchor: 'left' | 'center';
  substrate: MaterialKind;
  finishColor: string;
  textColor: string;
  accentColor: string;
  acrylicThicknessMm: number;
  blocks: BoardBlock[];
  imageIds: ID[];
  tags: string[];
  updatedAt: number;
}

export interface ImageAsset {
  id: ID;
  projectId: ID;
  code: string;
  title: string;
  boardId?: ID;
  widthPx: number;
  heightPx: number;
  /** 内置生成的占位图也是 data URL；真实项目可替换为 blob。 */
  dataUrl?: string;
  format: 'SVG' | 'PNG' | 'JPG' | 'TIF';
  dpi?: number;
}

export interface FontAsset {
  id: ID;
  name: string;
  family: string;
  kind: 'sans' | 'serif' | 'other';
  format: 'TTF' | 'OTF' | 'WOFF' | 'unknown';
  bytes: ArrayBuffer;
  size: number;
  builtin?: boolean;
  fallbackOnly?: boolean;
  createdAt: number;
}

export interface GlyphInfo {
  char: string;
  unicode: number;
  glyphIndex: number;
  fontId: ID;
  fallbackFontId?: ID;
  missing: boolean;
  advanceEm: number;
  uv: [number, number, number, number];
  plane: [number, number, number, number];
}

export interface AtlasMetrics {
  fontId: ID;
  cellPx: number;
  paddingPx: number;
  rangePx: number;
  widthPx: number;
  heightPx: number;
  glyphs: Record<string, GlyphInfo>;
  textureVersion: number;
}

export interface LaidGlyph {
  char: string;
  blockId: ID;
  fontId: ID;
  /** 横排/竖排均为基线落笔点；竖排 x 为字框中心。 */
  xMm: number;
  yMm: number;
  sizeMm: number;
  advanceMm: number;
  vertical: boolean;
  rotationRad?: number;
  missing: boolean;
  fallback: boolean;
}

export interface LayoutResult {
  boardId?: ID;
  widthMm: number;
  heightMm: number;
  glyphs: LaidGlyph[];
  missing: Array<{ char: string; blockId: ID; fontId: ID; fallbackFontId?: ID }>;
  lines: Array<{ blockId: ID; text: string; xMm: number; yMm: number; widthMm: number; heightMm: number }>;
  warnings: string[];
}

export interface BoardMetric {
  boardId: ID;
  code: string;
  title: string;
  category: Board['category'];
  wallId: ID;
  wallName: string;
  material: MaterialKind;
  minTextHeightMm: number;
  criticalTextHeightMm: number;
  contrast: number;
  viewingDistanceMm: number;
  viewingAngleArcmin: number;
  adultAngleArcmin: number;
  wheelchairAngleArcmin: number;
  obliqueDeg: number;
  glareCoverage: number;
  glareBlockIds: ID[];
  status: Severity;
  issues: string[];
  /** 预计刻字/UV 最小笔画，mm。 */
  minStrokeMm: number;
  updatedAt: number;
}

export interface ReadabilityReport {
  projectId: ID;
  generatedAt: number;
  elapsedMs: number;
  boardCount: number;
  pass: number;
  warning: number;
  fail: number;
  metrics: BoardMetric[];
  fontId?: ID;
}

export interface PrecisionReport {
  boardId: ID;
  samples: number;
  maxErrorMm: number;
  rmsErrorMm: number;
  thresholdMm: number;
  pass: boolean;
  overlaySvg: string;
}

export interface AppData {
  project: Project;
  halls: Hall[];
  walls: Wall[];
  cases: DisplayCase[];
  route: RoutePoint[];
  lights: Luminaire[];
  boards: Board[];
  images: ImageAsset[];
  fonts: FontAsset[];
}

export type RouteName = 'projects' | 'floor' | 'editor' | 'preview' | 'report' | 'export';
