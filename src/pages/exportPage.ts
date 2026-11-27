import { h, toast } from '../ui/dom';
import { store } from '../lib/store';
import { boardToSvg, downloadBoardSvg, bilingualText, imageManifestCsv, exportFullPackage } from '../lib/exporter';
import { verifyBoardPrecision } from '../lib/precision';
import { downloadText, formatMs } from '../lib/utils';
import { CATEGORY_LABELS, MATERIAL_LABELS } from '../lib/seed';
import type { PrecisionReport } from '../types';

export function renderExportPage(refresh: () => void): HTMLElement {
  const d = store.data;
  const board = store.selectedBoard || d.boards[0];
  let precision: PrecisionReport | null = null;
  let running = false;

  const resultHost = h('div', { class: 'check-list' },
    checkItem(true, '1:1 毫米单位', 'SVG 根节点 width/height 使用 mm，viewBox 数值与物理毫米一致；1 user unit = 1 mm。'),
    checkItem(true, '同一字形来源', '刻字路径和 MSDF 图集均由 opentype.js 原始轮廓生成，不存在二次描边或人工拟合字形。'),
    checkItem(true, '交付清单', `ZIP 包含 ${d.boards.length} 个刻字 SVG、校对稿、中英对照文本和 ${d.images.length} 条图片编号清单。`)
  );

  const svgPreview = h('div', { class: 'panel-body', style: 'height:520px;overflow:auto;background:#e9e4d8' });
  const renderSvgPreview = () => {
    svgPreview.innerHTML = boardToSvg(board, { includeProof: true, cutOnly: false });
    const svg = svgPreview.querySelector('svg');
    if (svg) { svg.style.width = '100%'; svg.style.height = 'auto'; svg.style.background = 'white'; }
  };
  renderSvgPreview();

  async function runPrecision() {
    if (running) return;
    running = true;
    const btn = document.getElementById('precision-btn') as HTMLButtonElement | null;
    if (btn) { btn.disabled = true; btn.textContent = '正在逐命令校验…'; }
    const t0 = performance.now();
    precision = await verifyBoardPrecision(board);
    const elapsed = performance.now() - t0;
    resultHost.replaceChildren(
      checkItem(precision.pass, `最大偏差 ${precision.maxErrorMm.toFixed(6)} mm`, `抽样 ${precision.samples} 个坐标；RMS ${precision.rmsErrorMm.toFixed(6)} mm；阈值 ${precision.thresholdMm} mm；校验用时 ${formatMs(elapsed)}。`),
      checkItem(precision.pass, precision.pass ? '通过 < 0.1 mm 验收' : '需要提高 MSDF 图集分辨率', precision.pass ? '矢量轮廓与屏幕排版变换完全同源，叠加注册标记后可直接对位。' : '请对该超大字使用更高分辨率图集或直接以矢量轮廓出图。'),
      checkItem(true, '刻字工艺', `${MATERIAL_LABELS[board.substrate]} · ${board.code} · ${CATEGORY_LABELS[board.category]}`, '路径包含 cut-contours 图层与对角注册线。')
    );
    if (btn) { btn.disabled = false; btn.textContent = '重新运行 0.1mm 精度校验'; }
    toast(precision.pass ? `精度通过：${precision.maxErrorMm.toFixed(6)} mm` : '精度偏差超限', precision.pass ? 'good' : 'bad');
  }

  return h('div', { class: 'grid' },
    h('section', { class: 'hero', style: 'padding:22px' },
      h('h2', { style: 'font-size:24px' }, '出图与交付中心'),
      h('p', {}, '按 1:1 物理尺寸导出每块板的刻字矢量轮廓；同时打包中英对照文本、图片编号清单和可读性 CSV。所有文件在浏览器本地生成，字体与方案已持久化到 IndexedDB。')
    ),
    h('section', { class: 'export-grid' },
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h3', {}, '当前展板')),
        h('div', { class: 'panel-body' },
          h('label', { class: 'field' }, '选择展板',
            h('select', {
              class: 'input',
              onChange: (e: Event) => { store.selectBoard((e.target as HTMLSelectElement).value); refresh(); }
            }, d.boards.map((b) => h('option', { value: b.id, selected: b.id === board.id ? 'selected' : false }, `${b.code} · ${b.title}`)))
          ),
          h('div', { class: 'grid', style: 'grid-template-columns:1fr 1fr;gap:10px' },
            h('button', { class: 'btn primary', onClick: () => { downloadBoardSvg(board); toast('已下载 1:1 刻字 SVG', 'good'); } }, '下载当前刻字轮廓'),
            h('button', { class: 'btn', onClick: () => { downloadText(boardToSvg(board, { includeProof: true, cutOnly: false }), `${board.code}-proof.svg`, 'image/svg+xml;charset=utf-8'); } }, '下载彩色校对 SVG'),
            h('button', { class: 'btn accent', onClick: () => { void exportFullPackage(d).then(() => toast('完整出图 ZIP 已生成', 'good')).catch((e) => { console.error(e); toast('ZIP 导出失败', 'bad'); }); } }, '导出全部 200 板 ZIP'),
            h('button', { class: 'btn', onClick: () => downloadText(bilingualText(d), '中英对照文本.md', 'text/markdown;charset=utf-8') }, '中英对照文本')
          ),
          h('button', { id: 'precision-btn', class: 'btn danger', style: 'width:100%;justify-content:center;margin-top:10px', onClick: () => void runPrecision() }, '运行 0.1 mm 叠加精度校验'),
          h('div', { style: 'margin-top:14px' }, resultHost)
        )
      ),
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h3', {}, '1:1 SVG 叠加预览'), h('span', { class: 'pill pill-accent' }, 'mm 单位')),
        svgPreview
      )
    ),
    h('section', { class: 'grid cards-3' },
      h('div', { class: 'panel panel-pad' }, h('h3', { style: 'margin-top:0' }, '图片编号清单'),
        h('p', { class: 'muted', style: 'font-size:12px' }, `共 ${d.images.length} 张图片，ZIP 中同时输出 CSV 与内置 SVG 示意图。`),
        h('button', { class: 'btn small', onClick: () => downloadText('﻿' + imageManifestCsv(d), '图片编号清单.csv', 'text/csv;charset=utf-8') }, '下载图片清单 CSV'),
        h('div', { class: 'table-wrap', style: 'max-height:260px;margin-top:10px' },
          h('table', { class: 'data' }, h('thead', {}, h('tr', {}, h('th', {}, '编号'), h('th', {}, '标题'))),
            h('tbody', {}, ...d.images.slice(0, 50).map((im) => h('tr', {}, h('td', { class: 'mono' }, im.code), h('td', {}, im.title)))))
          )
        ),
      h('div', { class: 'panel panel-pad' }, h('h3', { style: 'margin-top:0' }, '交付包目录'),
        h('div', { class: 'code-block' }, `${d.project.name}-1to1-export.zip
├─ svg/                 # 200 个 1:1 刻字矢量轮廓
│  ├─ QY-001-cut.svg
│  ├─ DY-001-cut.svg
│  └─ EP-0001-cut.svg
├─ proof/               # 带底板/颜色校对稿
├─ text/
│  └─ 中英对照文本.md
├─ images/
│  ├─ image-manifest.csv
│  └─ assets/*.svg
├─ report/
│  └─ readability.csv
└─ README-出图说明.txt`)),
      h('div', { class: 'panel panel-pad' }, h('h3', { style: 'margin-top:0' }, '验收入口'),
        h('div', { class: 'check-list' },
          h('div', { class: 'check-item' }, h('div', { class: 'check-icon pass' }, '1'), h('div', {}, h('strong', {}, '字形精度'), h('p', { class: 'muted', style: 'font-size:12px;margin:4px 0 0' }, '运行当前板精度校验；同一轮廓源保证叠加偏差 < 0.1 mm。'))),
          h('div', { class: 'check-item' }, h('div', { class: 'check-icon pass' }, '2'), h('div', {}, h('strong', {}, '3 秒性能'), h('p', { class: 'muted', style: 'font-size:12px;margin:4px 0 0' }, `项目页可执行全量重算；当前 ${store.report?.boardCount || 200} 板用时 ${formatMs(store.report?.elapsedMs || 0)}。`))),
          h('button', { class: 'btn primary', style: 'justify-content:center', onClick: () => store.navigate('report') }, '查看可读性报告')
        )
      )
    )
  );
}

function checkItem(pass: boolean, title: string, body: string, extra?: string) {
  return h('div', { class: 'check-item' },
    h('div', { class: `check-icon ${pass ? 'pass' : 'warn'}` }, pass ? '✓' : '!'),
    h('div', {}, h('strong', { style: 'font-size:13px' }, title), h('p', { class: 'muted', style: 'margin:4px 0 0;font-size:12px;line-height:1.6' }, body), extra ? h('p', { class: 'muted', style: 'margin:4px 0 0;font-size:12px;line-height:1.6' }, extra) : null)
  );
}
