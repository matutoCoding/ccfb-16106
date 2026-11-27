import { h, statusPill, toast } from '../ui/dom';
import { store } from '../lib/store';
import { CATEGORY_LABELS, MATERIAL_LABELS } from '../lib/seed';
import { downloadText, formatMs, toCsv } from '../lib/utils';
import type { BoardMetric } from '../types';

let filter = 'all';
let query = '';

export function renderReportPage(refresh: () => void): HTMLElement {
  const report = store.report || store.recomputeReport();
  const visibleRows = () => {
    let list = report.metrics;
    if (filter !== 'all') list = list.filter((m) => m.status === filter);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((m) => m.code.toLowerCase().includes(q) || m.title.toLowerCase().includes(q) || m.wallName.toLowerCase().includes(q));
    }
    return list;
  };
  const tbody = h('tbody', { id: 'report-tbody' }, ...visibleRows().map((m) => reportRow(m, refresh)));
  const updateRows = () => tbody.replaceChildren(...visibleRows().map((m) => reportRow(m, refresh)));

  const csv = () => toCsv([
    ['展板编号', '标题', '类别', '墙面', '工艺', '最小字高mm', '核心字高mm', '最小笔画mm', '对比度', '视距mm', '视角arcmin', '成人', '轮椅', '斜视角', '眩光覆盖', '状态', '问题'],
    ...report.metrics.map((m) => [m.code, m.title, CATEGORY_LABELS[m.category], m.wallName, MATERIAL_LABELS[m.material], m.minTextHeightMm.toFixed(2), m.criticalTextHeightMm.toFixed(2), m.minStrokeMm.toFixed(2), m.contrast.toFixed(2), m.viewingDistanceMm.toFixed(0), m.viewingAngleArcmin.toFixed(1), m.adultAngleArcmin.toFixed(1), m.wheelchairAngleArcmin.toFixed(1), m.obliqueDeg.toFixed(1), (m.glareCoverage * 100).toFixed(1) + '%', m.status, m.issues.join('；')])
  ]);

  return h('div', { class: 'grid' },
    h('section', { class: 'grid cards-4' },
      card('展板行数', String(report.boardCount), '每块板一行', ''),
      card('合格', String(report.pass), '达到当前标准', 'good'),
      card('注意/不合格', `${report.warning} / ${report.fail}`, '点击行可跳排版页', report.fail ? 'bad' : 'warn'),
      card('全量重算', formatMs(report.elapsedMs), `目标 < 3000ms · ${new Date(report.generatedAt).toLocaleTimeString()}`, 'good')
    ),
    h('section', { class: 'panel' },
      h('div', { class: 'panel-head' },
        h('h3', {}, '可读性报告：字高 · 对比度 · 视距/视角 · 眩光遮挡'),
        h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
          h('button', {
            class: 'btn', onClick: () => {
              const r = store.recomputeReport(); refresh();
              toast(`已重算 ${r.boardCount} 块板，用时 ${formatMs(r.elapsedMs)}`, r.elapsedMs < 3000 ? 'good' : 'bad');
            }
          }, '↻ 重新计算'),
          h('button', { class: 'btn primary', onClick: () => downloadText(csv(), `可读性报告-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8') }, '导出 CSV')
        )
      ),
      h('div', { class: 'panel-body' },
        h('div', { style: 'display:flex;gap:10px;margin-bottom:12px;flex-wrap:wrap' },
          h('input', { class: 'input', style: 'max-width:320px', placeholder: '筛选编号、标题、墙面…', value: query, onInput: (e: Event) => { query = (e.target as HTMLInputElement).value; updateRows(); } }),
          ...['all', 'fail', 'warning', 'pass'].map((key) => h('button', { class: `btn small ${filter === key ? 'primary' : ''}`, onClick: () => { filter = key; refresh(); } }, { all: '全部', fail: '不合格', warning: '注意', pass: '合格' }[key]))
        ),
        h('div', { class: 'table-wrap', style: 'max-height:calc(100vh - 285px)' },
          h('table', { class: 'data', 'data-testid': 'report-table' },
            h('thead', {}, h('tr', {},
              h('th', {}, '编号'), h('th', {}, '板面/墙面'), h('th', {}, '工艺'), h('th', {}, '字高'), h('th', {}, '对比度'), h('th', {}, '视距/视角'), h('th', {}, '成人/轮椅'), h('th', {}, '斜视'), h('th', {}, '眩光'), h('th', {}, '状态/问题'), h('th', {}, '操作')
            )),
            tbody
          )
        )
      )
    )
  );
}

function reportRow(m: BoardMetric, refresh: () => void) {
  return h('tr', { 'data-testid': 'report-row', 'data-board': m.boardId },
    h('td', {}, h('strong', { class: 'mono' }, m.code)),
    h('td', {}, h('div', { style: 'font-weight:750' }, m.title), h('div', { class: 'muted', style: 'font-size:12px' }, `${CATEGORY_LABELS[m.category]} · ${m.wallName}`)),
    h('td', {}, MATERIAL_LABELS[m.material]),
    h('td', {}, h('div', {}, `${m.criticalTextHeightMm.toFixed(1)} mm`), h('div', { class: 'muted', style: 'font-size:11px' }, `最小 ${m.minTextHeightMm.toFixed(1)} / 笔画 ${m.minStrokeMm.toFixed(2)}`)),
    h('td', { style: m.contrast < 4.5 ? 'color:var(--bad);font-weight:900' : '' }, `${m.contrast.toFixed(2)}:1`),
    h('td', {}, h('div', {}, `${m.viewingDistanceMm.toFixed(0)} mm`), h('div', { style: m.viewingAngleArcmin < 18 ? 'color:var(--bad);font-weight:900' : 'color:var(--good)' }, `${m.viewingAngleArcmin.toFixed(1)}′`)),
    h('td', { class: 'muted mono', style: 'font-size:12px' }, `${m.adultAngleArcmin.toFixed(1)}′ / ${m.wheelchairAngleArcmin.toFixed(1)}′`),
    h('td', {}, `${m.obliqueDeg.toFixed(0)}°`),
    h('td', { style: m.glareCoverage > 0.08 ? 'color:var(--bad);font-weight:900' : '' }, `${(m.glareCoverage * 100).toFixed(1)}%`),
    h('td', { style: 'min-width:240px' }, statusPill(m.status), ...m.issues.slice(0, 2).map((i) => h('div', { class: 'issue' }, i))),
    h('td', {}, h('button', { class: 'link', onClick: () => { store.navigate('editor', m.boardId); refresh(); } }, '跳排版 →'))
  );
}

function card(k: string, v: string, d: string, tone: string) {
  return h('div', { class: `metric-card ${tone}` }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
}
