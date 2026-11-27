import { h, toast } from '../ui/dom';
import { store } from '../lib/store';
import { fontManager } from '../lib/fontManager';
import { layoutBoard, baselineAlignmentError } from '../lib/textLayout';
import { computeBoardGlare } from '../lib/glare';
import { createBoardViewport, type BoardViewportHandle } from '../ui/BoardViewport';
import { CATEGORY_LABELS, MATERIAL_LABELS } from '../lib/seed';
import { uid } from '../lib/utils';
import type { BoardBlock } from '../types';

let query = '';
let statusFilter = 'all';
let selectedBlockId: string | null = null;
let viewport: BoardViewportHandle | null = null;
let viewOptions = { showBlocks: false, showMissing: true, overlayPaths: false, glare: null as any };

export function renderEditorPage(refresh: () => void): HTMLElement {
  const board = store.selectedBoard || store.data.boards[0];
  store.selectedBoardId = board.id;
  if (!board.blocks.some((b) => b.id === selectedBlockId)) selectedBlockId = board.blocks[0]?.id || null;
  const block = board.blocks.find((b) => b.id === selectedBlockId);
  const layout = layoutBoard(board, fontManager);
  const metric = store.report?.metrics.find((m) => m.boardId === board.id);
  const glare = computeBoardGlare(board, store.data, layout.glyphs);
  viewOptions.glare = glare;

  const q = query.trim().toLowerCase();
  const boards = store.data.boards.filter((b) => {
    const m = store.report?.metrics.find((x) => x.boardId === b.id);
    if (statusFilter !== 'all' && m?.status !== statusFilter) return false;
    return !q || b.code.toLowerCase().includes(q) || b.title.toLowerCase().includes(q);
  });

  const listPanel = h('div', { class: 'panel scroll' },
    h('div', { class: 'panel-head' }, h('h3', {}, `展板列表（${boards.length}）`)),
    h('div', { class: 'panel-body' },
      h('input', {
        class: 'input', placeholder: '搜索编号 / 标题，如 EP-、前言、青铜', value: query,
        onInput: (e: Event) => { query = (e.target as HTMLInputElement).value; updateList(); }
      }),
      h('div', { class: 'switch-tabs', style: 'margin:10px 0' },
        filterBtn('all', '全部'), filterBtn('fail', '不合格'), filterBtn('warning', '注意'), filterBtn('pass', '合格')
      ),
      h('div', { class: 'board-list', id: 'board-list' }, ...boards.map((b) => boardListItem(b, refresh)))
    )
  );

  function updateList() {
    const filtered = store.data.boards.filter((b) => {
      const m = store.report?.metrics.find((x) => x.boardId === b.id);
      if (statusFilter !== 'all' && m?.status !== statusFilter) return false;
      const qq = query.trim().toLowerCase();
      return !qq || b.code.toLowerCase().includes(qq) || b.title.toLowerCase().includes(qq);
    });
    const list = document.getElementById('board-list');
    if (list) list.replaceChildren(...filtered.map((b) => boardListItem(b, refresh)));
  }

  function filterBtn(value: string, label: string) {
    return h('button', { class: statusFilter === value ? 'active' : '', onClick: () => { statusFilter = value; refresh(); } }, label);
  }

  const stageHost = h('div', { style: 'height:100%;min-height:560px;position:relative' });
  viewport = createBoardViewport(board, viewOptions);
  stageHost.append(viewport.el);
  const chars = new Set(layout.glyphs.map((g) => g.char));
  void fontManager.ensureAtlas(chars, board.blocks.find((b) => b.fontId)?.fontId || store.data.project.defaultFontId, 64).then(() => viewport?.update(board, viewOptions)).catch(() => undefined);

  const centerPanel = h('div', { class: 'panel', style: 'display:grid;grid-template-rows:auto 1fr auto;min-height:0' },
    h('div', { class: 'panel-head' },
      h('div', {}, h('h3', {}, `${board.code} · ${board.title}`), h('div', { class: 'muted', style: 'font-size:12px;margin-top:2px' }, `${board.widthMm}×${board.heightMm} mm · ${MATERIAL_LABELS[board.substrate]} · ${CATEGORY_LABELS[board.category]}`)),
      h('div', { style: 'display:flex;gap:8px;align-items:center' },
        metric ? h('span', { class: `pill pill-${metric.status}` }, metric.status === 'pass' ? '可读性合格' : metric.status === 'warning' ? '需要注意' : '不合格') : null,
        h('button', { class: 'btn small', onClick: () => { store.navigate('preview', board.id); } }, '上墙预览'),
        h('button', { class: 'btn small primary', onClick: () => { store.navigate('export', board.id); } }, '1:1 出图')
      )
    ),
    stageHost,
    h('div', { class: 'panel-body', style: 'border-top:1px solid var(--line);display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;max-height:170px;overflow:auto' },
      h('div', {}, h('strong', { style: 'font-size:12px' }, `缺字回退 ${layout.missing.length} 项`),
        layout.missing.length ? layout.missing.slice(0, 8).map((m) => h('div', { class: 'issue' }, `“${m.char}” 原字体缺字 → ${m.fallbackFontId}`)) : h('p', { class: 'muted', style: 'font-size:12px' }, '当前用字均有字形。')
      ),
      h('div', {}, h('strong', { style: 'font-size:12px' }, '排版规则'),
        h('p', { class: 'muted', style: 'font-size:12px;line-height:1.6;margin:6px 0' }, `避头尾/标点挤压已启用；基线最大偏差 ${baselineAlignmentError(layout).toFixed(3)} mm。`),
        layout.warnings.slice(0, 3).map((w) => h('div', { class: 'issue', style: 'color:var(--warn)' }, w))
      ),
      h('div', {}, h('strong', { style: 'font-size:12px' }, '预览叠加'),
        toggle('区块框', viewOptions.showBlocks, (v) => { viewOptions.showBlocks = v; viewport?.update(board, viewOptions); }),
        toggle('缺字红标', viewOptions.showMissing, (v) => { viewOptions.showMissing = v; viewport?.update(board, viewOptions); }),
        toggle('1:1 矢量轮廓', viewOptions.overlayPaths, (v) => { viewOptions.overlayPaths = v; viewport?.update(board, viewOptions); })
      )
    )
  );

  const rightPanel = h('div', { class: 'panel scroll right-panel' },
    h('div', { class: 'panel-head' }, h('h3', {}, '排版属性')),
    h('div', { class: 'panel-body' },
      h('div', { class: 'board-list', style: 'margin-bottom:14px' }, ...board.blocks.map((b) => h('button', {
        class: `board-list-item ${selectedBlockId === b.id ? 'active' : ''}`,
        onClick: () => { selectedBlockId = b.id; refresh(); }
      }, h('span', { style: 'font-weight:800;font-size:12px' }, `${b.role} · ${b.fontSizeMm}mm`), h('span', { class: 'meta' }, (b.textZh || b.textEn || '').slice(0, 18))))),
      block ? blockFields(board.id, block, refresh) : h('p', { class: 'muted' }, '请选择文本块'),
      h('button', {
        class: 'btn', style: 'width:100%;justify-content:center;margin-top:10px',
        onClick: () => {
          const nb: BoardBlock = { id: uid('blk'), role: 'body', textZh: '新增说明文字，双击属性可修改。', textEn: 'New editable label.', direction: 'horizontal', xMm: 40, yMm: 40, widthMm: Math.min(500, board.widthMm - 80), heightMm: 80, fontSizeMm: 12, lineHeight: 1.5, letterSpacingMm: 0, color: board.textColor };
          board.blocks.push(nb); selectedBlockId = nb.id; store.scheduleSave(); refresh();
        }
      }, '+ 新增文本块')
    )
  );

  const root = h('div', { class: 'split' }, listPanel, centerPanel, rightPanel);
  (root as any)._cleanup = () => viewport?.destroy();
  return root;
}

function boardListItem(b: any, refresh: () => void) {
  const m = store.report?.metrics.find((x) => x.boardId === b.id);
  return h('button', { class: `board-list-item ${store.selectedBoardId === b.id ? 'active' : ''}`, 'data-testid': 'board-list-item', onClick: () => { store.selectBoard(b.id); refresh(); } },
    h('span', { style: 'display:flex;gap:8px;align-items:center' }, h('i', { class: `mini-status ${m?.status || 'pass'}` }), h('strong', { style: 'font-size:12px' }, b.code), h('span', { class: 'muted', style: 'font-size:11px' }, CATEGORY_LABELS[b.category])),
    h('span', { style: 'font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, b.title),
    h('span', { class: 'meta' }, h('span', {}, `${b.widthMm}×${b.heightMm}`), h('span', {}, m ? `${m.viewingAngleArcmin.toFixed(0)}′` : ''))
  );
}

function blockFields(boardId: string, b: BoardBlock, refresh: () => void) {
  const commit = (patch: Partial<BoardBlock>) => { store.updateBlock(boardId, b.id, patch); refresh(); };
  return h('div', {},
    h('label', { class: 'field' }, '中文', h('textarea', { class: 'input', rows: '3', onChange: (e: Event) => commit({ textZh: (e.target as HTMLTextAreaElement).value }) }, b.textZh)),
    h('label', { class: 'field' }, 'English', h('textarea', { class: 'input', rows: '2', onChange: (e: Event) => commit({ textEn: (e.target as HTMLTextAreaElement).value }) }, b.textEn)),
    h('label', { class: 'field' }, '拼音', h('input', { class: 'input', value: b.pinyin || '', onChange: (e: Event) => commit({ pinyin: (e.target as HTMLInputElement).value }) })),
    h('div', { class: 'form-row' },
      num('字号 mm', b.fontSizeMm, (v) => commit({ fontSizeMm: v })),
      num('字距 mm', b.letterSpacingMm, (v) => commit({ letterSpacingMm: v })),
      num('X mm', b.xMm, (v) => commit({ xMm: v })),
      num('Y mm', b.yMm, (v) => commit({ yMm: v })),
      num('宽 mm', b.widthMm, (v) => commit({ widthMm: v })),
      num('高 mm', b.heightMm, (v) => commit({ heightMm: v }))
    ),
    h('div', { class: 'form-row' },
      h('label', { class: 'field' }, '排向', h('select', { class: 'input', onChange: (e: Event) => commit({ direction: (e.target as HTMLSelectElement).value as any }) },
        h('option', { value: 'horizontal', selected: b.direction === 'horizontal' ? 'selected' : false }, '横排'),
        h('option', { value: 'vertical', selected: b.direction === 'vertical' ? 'selected' : false }, '竖排')
      )),
      h('label', { class: 'field' }, '对齐', h('select', { class: 'input', onChange: (e: Event) => commit({ align: (e.target as HTMLSelectElement).value as any }) },
        ['start', 'center', 'end'].map((a) => h('option', { value: a, selected: b.align === a ? 'selected' : false }, { start: '起', center: '中', end: '末' }[a]!))
      ))
    ),
    h('div', { class: 'form-row' },
      h('label', { class: 'field' }, '颜色', h('input', { class: 'input', type: 'color', value: b.color, onChange: (e: Event) => commit({ color: (e.target as HTMLInputElement).value }) })),
      h('label', { class: 'field' }, '粗体', h('input', { type: 'checkbox', class: 'checkbox', checked: b.bold ? 'checked' : false, onChange: (e: Event) => commit({ bold: (e.target as HTMLInputElement).checked }) }))
    )
  );
}

function num(label: string, value: number, onCommit: (v: number) => void) {
  return h('label', { class: 'field' }, label, h('input', { class: 'input', type: 'number', step: '0.1', value: String(value), onChange: (e: Event) => onCommit(Number((e.target as HTMLInputElement).value)) }));
}

function toggle(label: string, checked: boolean, onChange: (v: boolean) => void) {
  const id = `tg-${uid()}`;
  return h('label', { class: 'checkbox', for: id }, h('input', { id, type: 'checkbox', checked: checked ? 'checked' : false, onChange: (e: Event) => onChange((e.target as HTMLInputElement).checked) }), label);
}
