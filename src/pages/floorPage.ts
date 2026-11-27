import { h, s, toast } from '../ui/dom';
import { store } from '../lib/store';
import type { Board, RoutePoint } from '../types';
import { wallFrame } from '../lib/world';
import { CATEGORY_LABELS, MATERIAL_LABELS } from '../lib/seed';
import { uid } from '../lib/utils';

export function renderFloorPage(refresh: () => void): HTMLElement {
  const d = store.data;
  const selectedBoard = store.selectedBoard;
  const metric = (id: string) => store.report?.metrics.find((m) => m.boardId === id);

  const svg = s('svg', { class: 'floor-svg', viewBox: '-1800 -1600 126000 20500', preserveAspectRatio: 'xMidYMid meet' });

  // 展厅地面
  for (const hall of d.halls) {
    const ws = d.walls.filter((w) => w.hallId === hall.id);
    const minX = Math.min(...ws.flatMap((w) => [w.start.x, w.end.x]));
    const minY = Math.min(...ws.flatMap((w) => [w.start.y, w.end.y]));
    svg.append(
      s('rect', { x: minX, y: minY, width: hall.widthMm, height: hall.depthMm, rx: 120, fill: hall.floorColor, stroke: '#b9ad98', 'stroke-width': 30 }),
      s('text', { x: minX + 450, y: minY + 900, 'font-size': 620, fill: 'rgba(65,52,36,.35)', 'font-weight': 900, text: hall.name })
    );
  }

  // 动线
  for (const hall of d.halls) {
    for (const viewer of ['adult', 'wheelchair'] as const) {
      const pts = d.route.filter((r) => r.hallId === hall.id && r.viewer === viewer);
      if (pts.length > 1) {
        svg.append(s('polyline', {
          class: 'floor-route',
          points: pts.map((p) => `${p.x},${p.y}`).join(' '),
          stroke: viewer === 'wheelchair' ? '#7c3aed' : '#2563eb'
        }));
      }
    }
  }

  // 展柜/展台
  for (const c of d.cases) {
    svg.append(s('rect', {
      class: c.kind === 'pedestal' ? 'pedestal' : 'case-rect',
      x: c.x - c.widthMm / 2, y: c.y - c.depthMm / 2, width: c.widthMm, height: c.depthMm, rx: 80
    }));
    svg.append(s('text', { x: c.x, y: c.y + 120, 'text-anchor': 'middle', 'font-size': 300, fill: '#31535c', text: c.name }));
  }

  // 墙面
  for (const w of d.walls) {
    const selected = store.selectedWallId === w.id;
    svg.append(s('line', {
      class: `floor-wall ${selected ? 'selected' : ''}`,
      x1: w.start.x, y1: w.start.y, x2: w.end.x, y2: w.end.y,
      onClick: () => { store.selectedWallId = w.id; refresh(); }
    }));
    const len = Math.hypot(w.end.x - w.start.x, w.end.y - w.start.y);
    const mx = (w.start.x + w.end.x) / 2;
    const my = (w.start.y + w.end.y) / 2;
    svg.append(s('text', { x: mx, y: my - 260, 'text-anchor': 'middle', 'font-size': 330, fill: '#4b4033', text: `${w.name} ${(len / 1000).toFixed(1)}m` }));
  }

  // 灯
  for (const l of d.lights) {
    svg.append(s('circle', { class: 'light-mark', cx: l.position.x, cy: l.position.z, r: 180 }));
  }

  // 展板挂点
  for (const b of d.boards) {
    const wall = d.walls.find((w) => w.id === b.wallId);
    if (!wall) continue;
    const f = wallFrame(wall);
    const along = b.anchor === 'center' ? b.alongMm - b.widthMm / 2 : b.alongMm;
    const angle = Math.atan2(f.tangent2.y, f.tangent2.x) * 180 / Math.PI;
    const status = metric(b.id)?.status || 'pass';
    const g = s('g', { transform: `translate(${wall.start.x} ${wall.start.y}) rotate(${angle})`, onClick: (e: MouseEvent) => { e.stopPropagation(); store.selectBoard(b.id); refresh(); } });
    g.append(s('rect', {
      class: `floor-board ${status} ${store.selectedBoardId === b.id ? 'selected' : ''}`,
      x: along, y: -55, width: Math.max(120, b.widthMm), height: 110,
      stroke: store.selectedBoardId === b.id ? '#111827' : '#5c3c16', 'stroke-width': store.selectedBoardId === b.id ? 22 : 8
    }));
    if (b.widthMm > 900) g.append(s('text', { x: along + b.widthMm / 2, y: 35, 'text-anchor': 'middle', 'font-size': 260, fill: 'white', 'font-weight': 800, text: b.code }));
    svg.append(g);
  }

  // 视点
  for (const p of d.route) {
    svg.append(s('circle', {
      class: 'route-dot', cx: p.x, cy: p.y, r: p.viewer === 'adult' ? 150 : 210,
      fill: p.viewer === 'adult' ? '#2563eb' : '#7c3aed',
      onClick: () => toast(`${p.name}：眼高 ${p.viewer === 'adult' ? d.project.standard.adultEyeHeightMm : d.project.standard.wheelchairEyeHeightMm} mm`)
    }));
  }

  const legend = h('div', { class: 'panel panel-pad', style: 'margin-bottom:16px;display:flex;gap:16px;flex-wrap:wrap;align-items:center' },
    legendItem('#16a34a', '合格板'), legendItem('#f59e0b', '视角/对比注意'), legendItem('#dc2626', '不合格'),
    legendItem('#2563eb', '成人动线'), legendItem('#7c3aed', '轮椅动线'), legendItem('#facc15', '射灯'),
    h('span', { class: 'muted', style: 'font-size:12px' }, '平面单位 mm；点击墙板或色块可选中并录入挂墙参数。')
  );

  const side = selectedBoard ? boardEditor(selectedBoard, refresh) : wallEditor(refresh);
  return h('div', { class: 'grid' },
    h('div', { class: 'split two' },
      h('div', { class: 'panel scroll' }, h('div', { class: 'panel-head' }, h('h3', {}, '展厅平面与观众动线')), h('div', { class: 'panel-body', style: 'height:calc(100% - 52px)' }, legend, svg)),
      h('div', { class: 'panel scroll right-panel' }, side)
    )
  );
}

function legendItem(color: string, label: string) {
  return h('span', { style: 'display:inline-flex;align-items:center;gap:6px;font-size:12px' }, h('i', { style: `width:12px;height:12px;border-radius:3px;background:${color};display:inline-block` }), label);
}

function boardEditor(b: Board, refresh: () => void) {
  const m = store.report?.metrics.find((x) => x.boardId === b.id);
  return h('div', {},
    h('div', { class: 'panel-head' }, h('h3', {}, `${b.code} 挂墙参数`), h('button', { class: 'btn primary small', onClick: () => store.navigate('editor', b.id) }, '去排版 →')),
    h('div', { class: 'panel-body' },
      h('div', { style: 'margin-bottom:12px' }, h('strong', {}, b.title), h('div', { class: 'muted', style: 'font-size:12px;margin-top:3px' }, `${CATEGORY_LABELS[b.category]} · ${MATERIAL_LABELS[b.substrate]}`)),
      h('div', { class: 'form-row' },
        selectField('挂墙墙面', b.wallId, store.data.walls.map((w) => ({ value: w.id, label: w.name })), (v) => store.updateBoard(b.id, { wallId: v })),
        selectField('定位方式', b.anchor, [{ value: 'left', label: '沿墙左缘' }, { value: 'center', label: '中心定位' }], (v) => store.updateBoard(b.id, { anchor: v as Board['anchor'] }))
      ),
      h('div', { class: 'form-row' },
        numberField('沿墙位置 mm', b.alongMm, (v) => store.updateBoard(b.id, { alongMm: v })),
        numberField('底标高 mm', b.elevationMm, (v) => store.updateBoard(b.id, { elevationMm: v })),
        numberField('板宽 mm', b.widthMm, (v) => store.updateBoard(b.id, { widthMm: v })),
        numberField('板高 mm', b.heightMm, (v) => store.updateBoard(b.id, { heightMm: v }))
      ),
      selectField('上墙工艺', b.substrate, [
        { value: 'vinyl', label: '刻字贴' }, { value: 'uv', label: 'UV 打印' }, { value: 'silk', label: '丝印' }, { value: 'acrylic', label: '亚克力立体字' }
      ], (v) => store.updateBoard(b.id, { substrate: v as Board['substrate'] })),
      b.substrate === 'acrylic' ? numberField('亚克力/立体字厚度 mm', b.acrylicThicknessMm, (v) => store.updateBoard(b.id, { acrylicThicknessMm: v })) : null,
      h('div', { class: 'panel', style: 'background:var(--panel-2);margin-top:12px' }, h('div', { class: 'panel-body' },
        h('div', { class: 'row-line' }, h('strong', { style: 'font-size:13px' }, '最近视点指标'), m ? statusPill(m.status) : null),
        metricLine('视距', m ? `${m.viewingDistanceMm.toFixed(0)} mm` : '—'),
        metricLine('成人/轮椅视角', m ? `${m.adultAngleArcmin.toFixed(1)}′ / ${m.wheelchairAngleArcmin.toFixed(1)}′` : '—'),
        metricLine('斜视角', m ? `${m.obliqueDeg.toFixed(1)}°` : '—'),
        metricLine('眩光覆盖', m ? `${(m.glareCoverage * 100).toFixed(1)}%` : '—')
      )),
      h('button', { class: 'btn', style: 'width:100%;justify-content:center;margin-top:12px', onClick: refresh }, '刷新平面')
    )
  );
}

function wallEditor(refresh: () => void) {
  const wall = store.data.walls.find((w) => w.id === store.selectedWallId) || store.data.walls[0];
  const addRoute = () => {
    const p: RoutePoint = { id: uid('route'), hallId: wall.hallId, name: `新增视点 ${store.data.route.length + 1}`, x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 + 1000, heading: 0, viewer: 'adult' };
    store.data.route.push(p);
    store.scheduleSave(); refresh(); toast('已添加动线视点，可在数据中调整坐标', 'good');
  };
  return h('div', {},
    h('div', { class: 'panel-head' }, h('h3', {}, wall.name)),
    h('div', { class: 'panel-body' },
      h('p', { class: 'muted' }, `墙长 ${(Math.hypot(wall.end.x - wall.start.x, wall.end.y - wall.start.y) / 1000).toFixed(2)} m，墙高 ${wall.heightMm} mm。`),
      h('div', { class: 'form-row' },
        numberField('成人眼高 mm', store.data.project.standard.adultEyeHeightMm, (v) => { store.data.project.standard.adultEyeHeightMm = v; store.recomputeReport(); }),
        numberField('轮椅眼高 mm', store.data.project.standard.wheelchairEyeHeightMm, (v) => { store.data.project.standard.wheelchairEyeHeightMm = v; store.recomputeReport(); })
      ),
      h('button', { class: 'btn primary', style: 'width:100%;justify-content:center', onClick: addRoute }, '在墙前添加观众视点'),
      h('p', { class: 'muted', style: 'font-size:12px;margin-top:12px' }, '动线点同时保存成人与轮椅站位；可读性报告按最近站位、眼高和墙面法线计算视距与斜视角。')
    )
  );
}

function metricLine(k: string, v: string) {
  return h('div', { class: 'metric-line', style: 'display:flex;justify-content:space-between;font-size:12px;padding:5px 0;border-bottom:1px dashed var(--line)' }, h('span', { class: 'muted' }, k), h('strong', {}, v));
}

function selectField(label: string, value: string, options: Array<{ value: string; label: string }>, onCommit: (v: string) => void) {
  return h('label', { class: 'field' }, label,
    h('select', { class: 'input', value, onChange: (e: Event) => onCommit((e.target as HTMLSelectElement).value) },
      options.map((o) => h('option', { value: o.value, selected: o.value === value ? 'selected' : false }, o.label))
    )
  );
}

function numberField(label: string, value: number, onCommit: (v: number) => void) {
  return h('label', { class: 'field' }, label, h('input', { class: 'input', type: 'number', value: String(Math.round(value * 100) / 100), onChange: (e: Event) => onCommit(Number((e.target as HTMLInputElement).value)) }));
}

function statusPill(status: string) {
  const labels: Record<string, string> = { pass: '合格', warning: '注意', fail: '不合格' };
  return h('span', { class: `pill pill-${status}` }, labels[status]);
}
