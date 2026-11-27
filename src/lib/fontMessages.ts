import type { AtlasMetrics, FontAsset, ID } from '../types';

export interface MsdfRequest {
  type: 'build';
  jobId: number;
  fontId: ID;
  fontName: string;
  bytes: ArrayBuffer;
  chars: string[];
  cellPx?: number;
}

export interface MsdfSuccess {
  type: 'done';
  jobId: number;
  fontId: ID;
  pixels: ArrayBuffer;
  metrics: AtlasMetrics;
}

export interface MsdfFailure {
  type: 'error';
  jobId: number;
  fontId: ID;
  message: string;
}

export type MsdfResponse = MsdfSuccess | MsdfFailure;

export interface LoadedFont {
  asset: FontAsset;
  opentype?: any;
  metrics?: AtlasMetrics;
  textureVersion: number;
}
