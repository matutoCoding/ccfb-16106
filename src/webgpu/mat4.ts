export type Mat4 = Float32Array;

export function identity(): Mat4 {
  const m = new Float32Array(16);
  m[0] = m[5] = m[10] = m[15] = 1;
  return m;
}

export function multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c++) {
    for (let r = 0; r < 4; r++) {
      out[c * 4 + r] =
        a[0 * 4 + r] * b[c * 4 + 0] +
        a[1 * 4 + r] * b[c * 4 + 1] +
        a[2 * 4 + r] * b[c * 4 + 2] +
        a[3 * 4 + r] * b[c * 4 + 3];
    }
  }
  return out;
}

export function ortho(left: number, right: number, bottom: number, top: number, near = -10000, far = 10000): Mat4 {
  // WebGPU 深度为 [0,1]。这里允许负 near/far，方便 2D 板面前后少量挤出。
  const m = identity();
  m[0] = 2 / (right - left);
  m[5] = 2 / (top - bottom);
  m[10] = 1 / (near - far);
  m[12] = -(right + left) / (right - left);
  m[13] = -(top + bottom) / (top - bottom);
  m[14] = near / (near - far);
  return m;
}

export function perspective(fovyDeg: number, aspect: number, near = 10, far = 100000): Mat4 {
  // WebGPU zero-to-one depth。
  const f = 1 / Math.tan((fovyDeg * Math.PI / 180) / 2);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = far * nf;
  m[11] = -1;
  m[14] = far * near * nf;
  return m;
}

export function lookAt(eye: [number, number, number], center: [number, number, number], up: [number, number, number] = [0, 1, 0]): Mat4 {
  let zx = eye[0] - center[0], zy = eye[1] - center[1], zz = eye[2] - center[2];
  let zl = Math.hypot(zx, zy, zz) || 1;
  zx /= zl; zy /= zl; zz /= zl;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  let xl = Math.hypot(xx, xy, xz) || 1;
  xx /= xl; xy /= xl; xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  const m = identity();
  m[0] = xx; m[1] = yx; m[2] = zx; m[3] = 0;
  m[4] = xy; m[5] = yy; m[6] = zy; m[7] = 0;
  m[8] = xz; m[9] = yz; m[10] = zz; m[11] = 0;
  m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
  m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
  m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
  m[15] = 1;
  return m;
}

export function vpOrtho(widthMm: number, heightMm: number, canvasWidth: number, canvasHeight: number, zoom = 1, panX = 0, panY = 0): Mat4 {
  const aspect = canvasWidth / Math.max(1, canvasHeight);
  const margin = 80;
  let viewW = widthMm + margin * 2;
  let viewH = heightMm + margin * 2;
  if (viewW / viewH > aspect) viewH = viewW / aspect;
  else viewW = viewH * aspect;
  viewW /= zoom; viewH /= zoom;
  const cx = widthMm / 2 + panX;
  const cy = heightMm / 2 + panY;
  // 画布坐标 y 向下；正交 bottom 大、top 小，使顶点 y 直接使用顶部原点毫米坐标。
  return multiply(ortho(cx - viewW / 2, cx + viewW / 2, cy + viewH / 2, cy - viewH / 2, -5000, 5000), identity());
}
