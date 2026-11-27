import type { Vec2, Vec3 } from '../types';

export const MM_PER_INCH = 25.4;
export const MM_PER_PX_96DPI = MM_PER_INCH / 96;

export function uid(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 9);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function dist2(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function dot2(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function sub2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale2(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number; distance: number } {
  const ab = sub2(b, a);
  const lenSq = ab.x * ab.x + ab.y * ab.y;
  if (lenSq === 0) return { point: { ...a }, t: 0, distance: dist2(p, a) };
  const t = clamp(dot2(sub2(p, a), ab) / lenSq, 0, 1);
  const point = add2(a, scale2(ab, t));
  return { point, t, distance: dist2(p, point) };
}

export function angleBetweenEyeAndNormal(viewDir: Vec3, normal: Vec3): number {
  const v = normalize3(viewDir);
  const n = normalize3(normal);
  const cos = clamp(Math.abs(v.x * n.x + v.y * n.y + v.z * n.z), 0, 1);
  return Math.acos(cos) * 180 / Math.PI;
}

export function normalize3(v: Vec3): Vec3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return { x: v.x / l, y: v.y / l, z: v.z / l };
}

export function formatMm(v: number): string {
  if (Math.abs(v) >= 1000) return `${(v / 1000).toFixed(2)} m`;
  return `${v.toFixed(1)} mm`;
}

export function formatMs(v: number): string {
  return v < 100 ? `${v.toFixed(1)} ms` : `${(v / 1000).toFixed(2)} s`;
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadText(text: string, filename: string, type = 'text/plain;charset=utf-8'): void {
  downloadBlob(new Blob([text], { type }), filename);
}

export function csvCell(value: unknown): string {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Array<Array<unknown>>): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let h = hex.replace('#', '').trim();
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h || '000000', 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const chan = [r, g, b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
}

export function contrastRatio(fg: string, bg: string): number {
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function measure<T>(fn: () => T): { value: T; elapsedMs: number } {
  const start = performance.now();
  const value = fn();
  return { value, elapsedMs: performance.now() - start };
}

export async function measureAsync<T>(fn: () => Promise<T>): Promise<{ value: T; elapsedMs: number }> {
  const start = performance.now();
  const value = await fn();
  return { value, elapsedMs: performance.now() - start };
}
