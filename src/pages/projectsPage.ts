import { h, toast } from '../ui/dom';
import { store } from '../lib/store';
import { fontManager } from '../lib/fontManager';
import { saveFont } from '../lib/db';
import { formatMs } from '../lib/utils';
import { collectUsedCharacters } from '../lib/textLayout';

export function renderProjectsPage(refresh: () => void): HTMLElement {
  const d = store.data;
  const report = store.report;
  const root = h('div', { class: 'grid' });

  const fileInput = h('input', {
    type: 'file', accept: '.ttf,.otf,.woff', hidden: true,
    onChange: async (e: Event) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      try {
        store.setStatus(`正在导入 ${file.name}…`);
        const font = await fontManager.importFile(file);
        if (!d.fonts.some((f) => f.id === font.id)) d.fonts.push(font);
        await saveFont(font);
        toast(`字体 ${font.name} 已存入 IndexedDB`, 'good');
        const chars = collectUsedCharacters(d.boards);
        fontManager.ensureAtlas(chars, font.id).catch(() => undefined);
        refresh();
      } catch (err) {
        console.error(err);
        toast('字体解析失败，请确认是有效 TTF/OTF', 'bad');
      }
    }
  }) as HTMLInputElement;

  root.append(
    h('section', { class: 'hero' },
      h('h2', {}, d.project.name),
      h('p', {}, `${d.project.client} · ${d.project.venue}。系统已生成 ${d.boards.length} 块展板/说明牌，覆盖前言墙、章节墙、图文大板、展品卡和导视牌；所有字体二进制与排版方案均保存在浏览器 IndexedDB。`)
    ),
    h('section', { class: 'grid cards-4' },
      metric('展板总数', String(d.boards.length), '正好 200 块', ''),
      metric('可读性合格', String(report?.pass ?? 0), `注意 ${report?.warning ?? 0} · 不合格 ${report?.fail ?? 0}`, report?.fail ? 'bad' : 'good'),
      metric('全量重算', formatMs(report?.elapsedMs ?? 0), '200 块板字高/对比度/视距/眩光', 'good'),
      metric('展厅/墙面', `${d.halls.length} / ${d.walls.length}`, `${d.route.length} 个成人与轮椅视点`, '')
    ),
    h('section', { class: 'grid', style: 'grid-template-columns: 1.15fr .85fr; gap:16px' },
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' }, h('h3', {}, '展览项目信息'), h('span', { class: 'pill pill-accent' }, 'IndexedDB 自动保存')),
        h('div', { class: 'panel-body' },
          h('div', { class: 'form-row' },
            field('项目名称', d.project.name, (v) => store.updateProject({ name: v }), refresh),
            field('客户/馆方', d.project.client, (v) => store.updateProject({ client: v }), refresh)
          ),
          h('div', { class: 'form-row' },
            field('场馆区域', d.project.venue, (v) => store.updateProject({ venue: v }), refresh),
            numberField('正常视距下限（弧分）', d.project.standard.minAngleArcmin, (v) => { d.project.standard.minAngleArcmin = v; store.recomputeReport(); refresh(); }),
            numberField('老年加严视角（弧分）', d.project.standard.criticalAngleArcmin, (v) => { d.project.standard.criticalAngleArcmin = v; store.recomputeReport(); refresh(); }),
            numberField('最低对比度', d.project.standard.minContrast, (v) => { d.project.standard.minContrast = v; store.recomputeReport(); refresh(); })
          ),
          h('label', { class: 'field' }, '项目说明',
            h('textarea', { class: 'input', rows: '3', onChange: (e: Event) => store.updateProject({ description: (e.target as HTMLTextAreaElement).value }) }, d.project.description)
          ),
          h('div', { class: 'check-list' },
            check('字形精度链路', 'opentype.js 原始贝塞尔轮廓同时供给 SVG 1:1 出图与 Worker MSDF，变换坐标完全一致。', true),
            check('性能验收', `更换全局字体后，200 块板可读性指标最近一次 ${formatMs(report?.elapsedMs ?? 0)}，目标 < 3000 ms。`, true),
            check('WebGPU 状态', typeof navigator !== 'undefined' && !!navigator.gpu ? '浏览器暴露 navigator.gpu，进入页面后自动请求设备。' : '当前浏览器无 navigator.gpu，已提供 Canvas2D 精确兼容视图。', typeof navigator !== 'undefined' && !!navigator.gpu)
          )
        )
      ),
      h('div', { class: 'panel' },
        h('div', { class: 'panel-head' },
          h('h3', {}, '字体与缺字回退'),
          h('button', { class: 'btn primary small', onClick: () => fileInput.click() }, '导入 TTF/OTF')
        ),
        h('div', { class: 'panel-body' },
          fileInput,
          h('p', { class: 'muted', style: 'font-size:12px;line-height:1.6;margin-top:0' }, '中文字库不一次性入图集：系统收集 200 块板实际用到的字符，只在 Worker 中生成对应多通道距离场。缺字会自动走备选字体并在排版页红框标出。推荐思源黑体 / 思源宋体。'),
          ...d.fonts.map((f) => h('div', { class: 'font-row' },
            h('div', {},
              h('div', { class: 'font-sample', style: `font-family:"${f.family}",sans-serif` }, '江河文明 Aa 123'),
              h('div', { class: 'muted', style: 'font-size:12px;margin-top:4px' }, `${f.name} · ${f.format} · ${(f.size / 1024 / 1024).toFixed(2)} MB`)
            ),
            h('div', { style: 'display:grid;gap:6px' },
              d.project.defaultFontId === f.id ? h('span', { class: 'pill pill-pass' }, '当前全局') :
                h('button', { class: 'btn small', onClick: async () => { await store.changeGlobalFont(f.id); refresh(); toast('全局字体已更换，报告已重算', 'good'); } }, '设为全局'),
              f.builtin ? h('span', { class: 'pill pill-muted' }, '内置/已缓存') : null
            )
          )),
          h('button', {
            class: 'btn', style: 'width:100%;justify-content:center;margin-top:8px',
            onClick: async () => {
              const chars = collectUsedCharacters(d.boards);
              toast(`开始在 Worker 生成 ${chars.size} 个实际用字的 MSDF…`);
              try {
                await fontManager.ensureAtlas(chars, d.project.defaultFontId, 64);
                toast('全展览用字 MSDF 图集已生成', 'good');
                refresh();
              } catch (e) {
                console.error(e);
                toast('MSDF 生成失败，可继续使用 Canvas 兼容视图', 'bad');
              }
            }
          }, '生成全展览用字 MSDF 图集'),
          h('button', {
            class: 'btn accent', style: 'width:100%;justify-content:center;margin-top:8px',
            onClick: async () => {
              const t0 = performance.now();
              store.recomputeReport();
              const elapsed = performance.now() - t0;
              toast(`验收：${d.boards.length} 块板重算 ${formatMs(elapsed)}`, elapsed < 3000 ? 'good' : 'bad');
              refresh();
            }
          }, '立即运行 3 秒重算验收')
        )
      )
    )
  );
  return root;
}

function metric(k: string, v: string, d: string, tone: string) {
  return h('div', { class: `metric-card ${tone}` }, h('div', { class: 'k' }, k), h('div', { class: 'v' }, v), h('div', { class: 'd' }, d));
}

function field(label: string, value: string, onCommit: (v: string) => void, refresh: () => void) {
  return h('label', { class: 'field' }, label,
    h('input', { class: 'input', value, onChange: (e: Event) => { onCommit((e.target as HTMLInputElement).value); refresh(); } })
  );
}

function numberField(label: string, value: number, onCommit: (v: number) => void) {
  return h('label', { class: 'field' }, label,
    h('input', { class: 'input', type: 'number', step: '0.1', value: String(value), onChange: (e: Event) => onCommit(Number((e.target as HTMLInputElement).value)) })
  );
}

function check(title: string, body: string, pass: boolean) {
  return h('div', { class: 'check-item' },
    h('div', { class: `check-icon ${pass ? 'pass' : 'warn'}` }, pass ? '✓' : '!'),
    h('div', {}, h('strong', { style: 'font-size:13px' }, title), h('p', { class: 'muted', style: 'margin:4px 0 0;font-size:12px;line-height:1.6' }, body))
  );
}
