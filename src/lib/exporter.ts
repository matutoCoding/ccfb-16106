import { strToU8, zipSync } from 'fflate';
import type { AppData, Board } from '../types';
import { layoutBoard } from './textLayout';
import { fontManager } from './fontManager';
import { downloadBlob, downloadText, toCsv } from './utils';
import { CATEGORY_LABELS, MATERIAL_LABELS } from './seed';

function escapeXml(s: string): string {
  return String(s).replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]!));
}

function glyphPathD(board: Board): string {
  const layout = layoutBoard(board, fontManager);
  return layout.glyphs.map((g) => {
    if (g.char === ' ') return '';
    if (g.rotationRad) {
      const d = fontManager.getSvgPath(g.char, 0, 0, g.sizeMm, g.fontId);
      return `<g transform="translate(${g.xMm.toFixed(4)} ${g.yMm.toFixed(4)}) rotate(90)">
        <path data-char="${escapeXml(g.char)}" d="${d}" fill="${board.textColor}"/>
      </g>`;
    }
    const d = fontManager.getSvgPath(g.char, g.xMm, g.yMm, g.sizeMm, g.fontId);
    if (!d) {
      return `<text data-char="${escapeXml(g.char)}" x="${g.xMm}" y="${g.yMm}" font-size="${g.sizeMm}" fill="${board.textColor}" font-family="sans-serif">${escapeXml(g.char)}</text>`;
    }
    return `<path data-char="${escapeXml(g.char)}" data-font="${escapeXml(g.fontId)}" d="${d}" fill="${board.textColor}"/>`;
  }).join('\n');
}

export function boardToSvg(board: Board, options: { cutOnly?: boolean; includeProof?: boolean } = {}): string {
  const cutOnly = options.cutOnly ?? true;
  const proof = options.includeProof ?? !cutOnly;
  const layout = layoutBoard(board, fontManager);
  const missingMarks = layout.missing.map((m) => `<!-- missing ${escapeXml(m.char)} block=${m.blockId} fallback=${escapeXml(m.fallbackFontId || '')} -->`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${board.widthMm}mm" height="${board.heightMm}mm" viewBox="0 0 ${board.widthMm} ${board.heightMm}" data-board="${escapeXml(board.code)}" data-scale="1mm-per-user-unit">
  <title>${escapeXml(board.code)} ${escapeXml(board.title)} · 1:1 ${MATERIAL_LABELS[board.substrate]}</title>
  <desc>Physical size ${board.widthMm}mm x ${board.heightMm}mm. All text paths are in millimeter user units; overlay with WebGPU MSDF at identity transform for acceptance.</desc>
  ${proof ? `<rect id="substrate-proof" x="0" y="0" width="${board.widthMm}" height="${board.heightMm}" rx="${board.substrate === 'acrylic' ? 8 : 0}" fill="${board.finishColor}" stroke="#111" stroke-width="0.25"/>` : ''}
  <g id="cut-contours" data-material="${board.substrate}" fill="${board.textColor}" stroke="none">
    ${glyphPathD(board)}
  </g>
  <g id="registration" stroke="#ff00aa" stroke-width="0.2" fill="none" opacity="0.8">
    <path d="M0 12V0H12 M${board.widthMm - 12} 0H${board.widthMm}V12 M${board.widthMm} ${board.heightMm - 12}V${board.heightMm}H${board.widthMm - 12} M12 ${board.heightMm}H0V${board.heightMm - 12}"/>
  </g>
  ${missingMarks}
</svg>`;
}

export function downloadBoardSvg(board: Board) {
  downloadText(boardToSvg(board, { cutOnly: true }), `${board.code}-1to1-cut-contours.svg`, 'image/svg+xml;charset=utf-8');
}

export function bilingualText(data: AppData): string {
  const lines: string[] = [
    `# ${data.project.name}`,
    '',
    `客户：${data.project.client}　场馆：${data.project.venue}`,
    `展板总数：${data.boards.length}`,
    '',
    '| 编号 | 类别 | 中文 | English | 拼音/备注 | 图片编号 |',
    '|---|---|---|---|---|---|'
  ];
  for (const b of data.boards) {
    const en = b.blocks.map((x) => x.textEn).filter(Boolean).join(' / ');
    const py = b.blocks.map((x) => x.pinyin).filter(Boolean).join(' / ');
    lines.push(`| ${b.code} | ${CATEGORY_LABELS[b.category]} | ${b.title} | ${en.replace(/\|/g, '/')} | ${py.replace(/\|/g, '/')} | ${b.imageIds.join('; ')} |`);
  }
  lines.push('', '## 逐板全文', '');
  for (const b of data.boards) {
    lines.push(`### ${b.code} ${b.title}`);
    for (const blk of b.blocks) {
      if (blk.textZh) lines.push(`- ZH [${blk.role}/${blk.fontSizeMm}mm]：${blk.textZh}`);
      if (blk.textEn) lines.push(`- EN [${blk.role}/${(blk.fontSizeMm * 0.72).toFixed(1)}mm]：${blk.textEn}`);
      if (blk.pinyin) lines.push(`- PY：${blk.pinyin}`);
    }
    lines.push(`- Images: ${b.imageIds.join(', ') || 'none'}`, '');
  }
  return lines.join('\n');
}

export function imageManifestCsv(data: AppData): string {
  return toCsv([
    ['图片编号', '所属展板编号', '中文标题', '格式', '宽度px', '高度px', 'DPI', '文件名'],
    ...data.images.map((im) => {
      const board = data.boards.find((b) => b.id === im.boardId);
      return [im.code, board?.code || '', im.title, im.format, im.widthPx, im.heightPx, im.dpi || 300, `${im.code}.svg`];
    })
  ]);
}

export function readabilityCsv(_data: AppData): string {
  const metrics: any[] = (window as any).__SIGNAGE__?.report?.metrics || [];
  // 延迟读取 store 会形成循环，因此这里由全局验收 API 提供最新报告。
  return toCsv([
    ['展板编号', '标题', '类别', '墙面', '工艺', '最小字高mm', '核心字高mm', '对比度', '视距mm', '视角arcmin', '成人arcmin', '轮椅arcmin', '斜视角°', '眩光覆盖', '状态', '问题'],
    ...metrics.map((m: any) => [
      m.code, m.title, CATEGORY_LABELS[m.category], m.wallName, MATERIAL_LABELS[m.material],
      m.minTextHeightMm.toFixed(2), m.criticalTextHeightMm.toFixed(2), m.contrast.toFixed(2),
      m.viewingDistanceMm.toFixed(0), m.viewingAngleArcmin.toFixed(1), m.adultAngleArcmin.toFixed(1),
      m.wheelchairAngleArcmin.toFixed(1), m.obliqueDeg.toFixed(1), (m.glareCoverage * 100).toFixed(1) + '%',
      m.status, m.issues.join('；')
    ])
  ]);
}

export async function exportFullPackage(data: AppData): Promise<void> {
  const files: Record<string, Uint8Array> = {};
  for (const b of data.boards) {
    files[`svg/${b.code}-cut.svg`] = strToU8(boardToSvg(b, { cutOnly: true }));
    files[`proof/${b.code}-proof.svg`] = strToU8(boardToSvg(b, { includeProof: true, cutOnly: false }));
  }
  files['text/中英对照文本.md'] = strToU8(bilingualText(data));
  files['images/image-manifest.csv'] = strToU8('﻿' + imageManifestCsv(data).replace(/^﻿/, ''));
  files['report/readability.csv'] = strToU8(readabilityCsv(data));
  files['README-出图说明.txt'] = strToU8([
    '展陈图文排版与上墙可读性预览系统 — 1:1 出图包',
    '',
    '1. svg/ 中每个文件宽高均为物理毫米，1 user unit = 1 mm。',
    '2. cut-contours 图层为文字贝塞尔/直线轮廓，可直接进入刻字或刀路软件。',
    '3. proof/ 为带底板颜色的校对稿。',
    '4. text/中英对照文本.md 包含逐板中文、English、拼音。',
    '5. images/image-manifest.csv 为图片编号清单；内置示意图位于 images/assets/。',
    '6. report/readability.csv 为字高、对比度、视距、视角和眩光报告。',
    '',
    `生成展板数：${data.boards.length}`
  ].join('\n'));

  for (const im of data.images.slice(0, 200)) {
    if (im.dataUrl?.startsWith('data:image/svg+xml')) {
      const raw = decodeURIComponent(im.dataUrl.split(',')[1] || '');
      files[`images/assets/${im.code}.svg`] = strToU8(raw);
    }
  }
  const zipped = zipSync(files, { level: 6 });
  downloadBlob(new Blob([zipped as BlobPart], { type: 'application/zip' }), `${data.project.name}-1to1-export.zip`);
}
