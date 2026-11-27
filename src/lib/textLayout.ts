import type { Board, BoardBlock, ID, LaidGlyph, LayoutResult } from '../types';

export interface GlyphMetricsResolver {
  hasGlyph?: (char: string, fontId?: ID) => boolean;
  resolveFont?: (char: string, fontId?: ID) => { fontId: ID; missing: boolean; fallback: boolean };
  advanceMm?: (char: string, fontSizeMm: number, fontId?: ID, bold?: boolean) => number;
}

const NO_LINE_START = new Set('，。、；：？！）】》」』”’…·,.!?;:)]}');
const NO_LINE_END = new Set('（【《「『“‘([{');
const COMPRESS_CLOSE = new Set('，。、；：？！）】》」』”’.,!?;:)]}');
const COMPRESS_OPEN = new Set('（【《「『“‘([{');
const CJK_RE = /[㐀-鿿　-〿＀-￯]/;
const LATIN_WORD_RE = /[A-Za-z0-9'"’\-./]+/y;

export function isCjk(ch: string): boolean {
  return CJK_RE.test(ch);
}

export function defaultAdvanceMm(ch: string, sizeMm: number): number {
  if (ch === ' ') return sizeMm * 0.32;
  if (COMPRESS_CLOSE.has(ch) || COMPRESS_OPEN.has(ch)) return sizeMm * 0.55;
  if (isCjk(ch)) return sizeMm;
  return sizeMm * 0.56;
}

function advance(ch: string, size: number, block: BoardBlock, resolver?: GlyphMetricsResolver): number {
  const raw = resolver?.advanceMm?.(ch, size, block.fontId, block.bold) ?? defaultAdvanceMm(ch, size);
  if (ch === ' ' || ch === '\n') return raw;
  // 标点挤压：边缘/相邻标点最多压缩 35%，但不改变字号与轮廓精度。
  if (COMPRESS_CLOSE.has(ch)) return raw * 0.72;
  if (COMPRESS_OPEN.has(ch)) return raw * 0.72;
  return raw + block.letterSpacingMm;
}

interface Token { text: string; canBreakBefore: boolean }

function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\n') { tokens.push({ text: '\n', canBreakBefore: true }); i++; continue; }
    LATIN_WORD_RE.lastIndex = i;
    const m = LATIN_WORD_RE.exec(text);
    if (m && m[0] && !CJK_RE.test(m[0])) {
      tokens.push({ text: m[0], canBreakBefore: true });
      i += m[0].length;
      continue;
    }
    tokens.push({ text: ch, canBreakBefore: !NO_LINE_START.has(ch) });
    i++;
  }
  return tokens;
}

function wrapHorizontal(text: string, widthMm: number, size: number, block: BoardBlock, resolver?: GlyphMetricsResolver): string[] {
  const paragraphs = text.split('\n');
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    let line = '';
    let lineW = 0;
    const push = () => { lines.push(line); line = ''; lineW = 0; };
    for (const token of tokenize(paragraph)) {
      if (token.text === '\n') { push(); continue; }
      let tokenW = 0;
      for (const ch of token.text) tokenW += advance(ch, size, block, resolver);
      if (line && lineW + tokenW > widthMm) {
        const firstCh = token.text[0];
        if (firstCh && NO_LINE_START.has(firstCh)) {
          // 避头尾：禁止标点落到行首，允许标点挤压并略微溢出，而不是破坏规则。
          line += token.text;
          lineW += tokenW * 0.82;
          push();
          continue;
        }
        // 禁止开括号留在行尾：把它一起带到下一行。
        const lastCh = line[line.length - 1];
        if (lastCh && NO_LINE_END.has(lastCh)) {
          const moved = line.slice(-1);
          line = line.slice(0, -1);
          push();
          line = moved + token.text;
          lineW = [...line].reduce((sum, c) => sum + advance(c, size, block, resolver), 0);
          continue;
        }
        push();
      }
      // 超长英文/拼音词硬切，避免冲出展板。
      if (!line && tokenW > widthMm && token.text.length > 1) {
        let part = '';
        let partW = 0;
        for (const ch of token.text) {
          const w = advance(ch, size, block, resolver);
          if (part && partW + w > widthMm) { lines.push(part); part = ''; partW = 0; }
          part += ch; partW += w;
        }
        line = part; lineW = partW;
        continue;
      }
      line += token.text;
      lineW += tokenW;
    }
    if (line || lines.length === 0) push();
  }
  return lines;
}

function resolveChar(ch: string, block: BoardBlock, resolver?: GlyphMetricsResolver) {
  if (resolver?.resolveFont) return resolver.resolveFont(ch, block.fontId);
  const has = resolver?.hasGlyph?.(ch, block.fontId) ?? true;
  return { fontId: block.fontId || 'font-noto-sans-sc', missing: !has, fallback: !has };
}

function layoutHorizontal(block: BoardBlock, resolver: GlyphMetricsResolver | undefined, glyphs: LaidGlyph[], missing: LayoutResult['missing'], lines: LayoutResult['lines']): void {
  const text = block.textZh || block.pinyin || block.textEn;
  if (!text) return;
  const size = block.fontSizeMm;
  const lineGap = size * block.lineHeight;
  const baselineOffset = size * 0.82;
  const wrapped = wrapHorizontal(text, block.widthMm, size, block, resolver);
  wrapped.forEach((lineText, li) => {
    let x = block.xMm;
    const baseline = block.yMm + baselineOffset + li * lineGap;
    let lineWidth = 0;
    for (const ch of lineText) lineWidth += advance(ch, size, block, resolver);
    if (block.align === 'center') x += Math.max(0, (block.widthMm - lineWidth) / 2);
    if (block.align === 'end') x += Math.max(0, block.widthMm - lineWidth);
    lines.push({ blockId: block.id, text: lineText, xMm: x, yMm: baseline - baselineOffset, widthMm: lineWidth, heightMm: lineGap });
    for (const ch of lineText) {
      const w = advance(ch, size, block, resolver);
      const rf = resolveChar(ch, block, resolver);
      if (rf.missing) missing.push({ char: ch, blockId: block.id, fontId: block.fontId || 'default', fallbackFontId: rf.fontId });
      glyphs.push({ char: ch, blockId: block.id, fontId: rf.fontId, xMm: x, yMm: baseline, sizeMm: size, advanceMm: w, vertical: false, missing: rf.missing, fallback: rf.fallback });
      x += w;
    }
  });
}

function layoutVertical(block: BoardBlock, resolver: GlyphMetricsResolver | undefined, glyphs: LaidGlyph[], missing: LayoutResult['missing'], lines: LayoutResult['lines']): void {
  const text = block.textZh || block.textEn || block.pinyin || '';
  if (!text) return;
  const size = block.fontSizeMm;
  const colAdvance = size * 1.12;
  const maxChars = Math.max(1, Math.floor(block.heightMm / (size * 1.08)));
  const chars = [...text].filter((c) => c !== '\n');
  const columns: string[] = [];
  for (let i = 0; i < chars.length; i += maxChars) columns.push(chars.slice(i, i + maxChars).join(''));
  // 竖排从右向左成列。
  columns.forEach((colText, ci) => {
    const x = block.xMm + block.widthMm - size * 0.5 - ci * colAdvance;
    let y = block.yMm + size * 0.82;
    lines.push({ blockId: block.id, text: colText, xMm: x - size / 2, yMm: block.yMm, widthMm: size, heightMm: colText.length * size * 1.08 });
    for (const ch of colText) {
      const rf = resolveChar(ch, block, resolver);
      if (rf.missing) missing.push({ char: ch, blockId: block.id, fontId: block.fontId || 'default', fallbackFontId: rf.fontId });
      const rotated = !isCjk(ch) && ch !== ' ';
      glyphs.push({
        char: ch, blockId: block.id, fontId: rf.fontId, xMm: x, yMm: y,
        sizeMm: size, advanceMm: size * 1.08, vertical: true, rotationRad: rotated ? Math.PI / 2 : 0,
        missing: rf.missing, fallback: rf.fallback
      });
      y += size * 1.08;
    }
  });
}

export function layoutBoard(board: Board, resolver?: GlyphMetricsResolver): LayoutResult {
  const glyphs: LaidGlyph[] = [];
  const missing: LayoutResult['missing'] = [];
  const lines: LayoutResult['lines'] = [];
  const warnings: string[] = [];
  for (const block of board.blocks) {
    if (block.direction === 'vertical') layoutVertical(block, resolver, glyphs, missing, lines);
    else layoutHorizontal(block, resolver, glyphs, missing, lines);
    const blockGlyphs = glyphs.filter((g) => g.blockId === block.id);
    const maxY = block.direction === 'vertical'
      ? Math.max(block.yMm, ...blockGlyphs.map((g) => g.yMm + g.sizeMm))
      : Math.max(block.yMm, ...blockGlyphs.map((g) => g.yMm + g.sizeMm * 0.35));
    if (maxY > block.yMm + block.heightMm + 2) {
      warnings.push(`区块 ${block.role} 文字高度超出 ${(maxY - block.yMm - block.heightMm).toFixed(1)} mm`);
    }
  }
  const uniqMissing = new Map<string, LayoutResult['missing'][number]>();
  missing.forEach((m) => uniqMissing.set(`${m.blockId}:${m.char}`, m));
  return { boardId: board.id, widthMm: board.widthMm, heightMm: board.heightMm, glyphs, missing: [...uniqMissing.values()], lines, warnings };
}

export function collectUsedCharacters(boards: Board[]): Set<string> {
  const chars = new Set<string>();
  for (const b of boards) {
    chars.add(b.code); chars.add(b.title);
    for (const block of b.blocks) {
      for (const s of [block.textZh, block.textEn, block.pinyin || '']) {
        for (const ch of s || '') chars.add(ch);
      }
    }
  }
  return chars;
}

/** 基线对齐检查：同一视觉行组内，中文/英文/拼音基线差应小于 0.2 mm。 */
export function baselineAlignmentError(layout: LayoutResult): number {
  const byBlock = new Map<ID, number[]>();
  for (const g of layout.glyphs) {
    if (g.vertical) continue;
    const arr = byBlock.get(g.blockId) || [];
    arr.push(g.yMm);
    byBlock.set(g.blockId, arr);
  }
  let maxDelta = 0;
  for (const ys of byBlock.values()) {
    if (ys.length > 1) maxDelta = Math.max(maxDelta, Math.max(...ys) - Math.min(...ys));
  }
  return maxDelta;
}
