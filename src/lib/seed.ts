import type { AppData, Board, BoardBlock, DisplayCase, Hall, ImageAsset, Luminaire, RoutePoint, Wall } from '../types';
import { uid } from './utils';

const NOW = new Date('2026-11-27T10:00:00+08:00').getTime();

const HALL_DEFS = [
  { name: '序厅', w: 18000, d: 14000 },
  { name: '第一展厅 · 山河初开', w: 24000, d: 15000 },
  { name: '第二展厅 · 礼乐青铜', w: 24000, d: 15000 },
  { name: '第三展厅 · 工匠烟火', w: 21000, d: 14000 },
  { name: '尾厅 · 传承再生', w: 18000, d: 12000 }
];

const DYNASTIES = ['新石器时代', '夏', '商', '西周', '春秋', '战国', '秦', '汉', '唐', '宋', '元', '明', '清'];
const MATERIALS = ['陶', '青铜', '玉', '石', '漆木', '瓷', '金银', '丝麻', '甲骨', '竹木简'];
const OBJECTS = ['鼎', '簋', '爵', '斝', '戈', '镜', '带钩', '琮', '璧', '璜', '罐', '盆', '枕', '俑', '织机构件', '农具', '度量衡器', '书刀', '印章', '饰件'];
const THEMES = ['礼制秩序', '宴饮场景', '征战与疆域', '农耕时令', '手工业分工', '车马出行', '文字起源', '城市生活', '信仰与祭祀', '贸易交流', '服饰纹样', '乐舞百戏'];
const EN_DYNASTY: Record<string, string> = {
  新石器时代: 'Neolithic', 夏: 'Xia', 商: 'Shang', 西周: 'Western Zhou', 春秋: 'Spring and Autumn',
  战国: 'Warring States', 秦: 'Qin', 汉: 'Han', 唐: 'Tang', 宋: 'Song', 元: 'Yuan', 明: 'Ming', 清: 'Qing'
};

function makeImageSvg(code: string, title: string, seed: number): string {
  const hue1 = (seed * 47) % 360;
  const hue2 = (hue1 + 38) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue1},28%,82%)"/><stop offset="1" stop-color="hsl(${hue2},32%,58%)"/>
  </linearGradient><pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
    <path d="M60 0H0V60" fill="none" stroke="rgba(255,255,255,.22)" stroke-width="2"/>
  </pattern></defs>
  <rect width="1200" height="900" fill="url(#g)"/><rect width="1200" height="900" fill="url(#grid)"/>
  <circle cx="600" cy="410" r="210" fill="rgba(255,255,255,.22)" stroke="rgba(38,34,28,.35)" stroke-width="10"/>
  <path d="M420 430c70-150 290-150 360 0-42 92-318 92-360 0Z" fill="rgba(54,43,31,.28)"/>
  <text x="70" y="92" font-family="sans-serif" font-size="48" fill="#2b261e" font-weight="700">${code}</text>
  <text x="70" y="820" font-family="sans-serif" font-size="42" fill="#2b261e">${title}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function block(partial: Partial<BoardBlock> & Pick<BoardBlock, 'role' | 'textZh' | 'xMm' | 'yMm' | 'widthMm' | 'heightMm' | 'fontSizeMm'>): BoardBlock {
  return {
    id: uid('blk'),
    textEn: '',
    direction: 'horizontal',
    lineHeight: 1.45,
    letterSpacingMm: 0,
    color: '#202124',
    align: 'start',
    ...partial
  };
}

function cardBlocks(i: number, zh: string, en: string, dynasty: string, material: string): BoardBlock[] {
  return [
    block({ role: 'eyebrow', textZh: `${String(i).padStart(3, '0')} · ${dynasty}`, textEn: `${EN_DYNASTY[dynasty] || dynasty}`, xMm: 24, yMm: 24, widthMm: 372, heightMm: 16, fontSizeMm: 5.2, color: '#8a5a24', bold: true }),
    block({ role: 'title', textZh: zh, textEn: en, xMm: 24, yMm: 48, widthMm: 372, heightMm: 42, fontSizeMm: 15, lineHeight: 1.18, bold: true, color: '#1f2933' }),
    block({ role: 'body', textZh: `${material}。器物轮廓与纹饰反映出当时成熟的工艺协作，也嵌入礼仪、交换与日常生活。展签文字按 5 mm 最小正文字高校验。`, textEn: `${material}. The form and ornament reveal specialized craft cooperation and connect the object to ritual, exchange and everyday life.`, xMm: 24, yMm: 98, widthMm: 372, heightMm: 104, fontSizeMm: 5, lineHeight: 1.42, color: '#3c4043' }),
    block({ role: 'english', textZh: '', textEn: `${EN_DYNASTY[dynasty] || dynasty} · Collection record M-${String(i).padStart(4, '0')}`, xMm: 24, yMm: 218, widthMm: 372, heightMm: 14, fontSizeMm: 3.4, color: '#5f6368' }),
    block({ role: 'pinyin', textZh: '', pinyin: `${zh.split('').slice(0, 8).join(' ')}`, xMm: 24, yMm: 240, widthMm: 372, heightMm: 10, fontSizeMm: 2.8, color: '#7a6a55' })
  ];
}

export function generateExhibition(): AppData {
  const projectId = 'proj_jianghe_2026';
  const project = {
    id: projectId,
    name: '江河文明：青铜时代的礼仪与生活',
    client: '江州市博物馆',
    venue: '新馆二层 A/B 展厅',
    description: '两百块展板与说明牌的深化排版、上墙预览、可读性检查和 1:1 刻字出图工程。',
    createdAt: NOW,
    updatedAt: NOW,
    standard: {
      minAngleArcmin: 18,
      criticalAngleArcmin: 22,
      minContrast: 4.5,
      enhancedContrast: 7,
      maxGlareCoverage: 0.08,
      adultEyeHeightMm: 1600,
      wheelchairEyeHeightMm: 1200
    },
    defaultFontId: 'font-noto-sans-sc',
    fallbackFontId: 'font-system-fallback'
  };

  const halls: Hall[] = [];
  const walls: Wall[] = [];
  const cases: DisplayCase[] = [];
  const route: RoutePoint[] = [];
  const lights: Luminaire[] = [];

  let ox = 0;
  HALL_DEFS.forEach((def, hi) => {
    const id = `hall-${hi + 1}`;
    halls.push({ id, projectId, name: def.name, widthMm: def.w, depthMm: def.d, heightMm: 4200, floorColor: '#d8d1c4' });
    const x0 = ox;
    const y0 = 0;
    const wh = 3600;
    const wallDefs = [
      { name: '北墙', start: { x: x0, y: y0 }, end: { x: x0 + def.w, y: y0 } },
      { name: '东墙', start: { x: x0 + def.w, y: y0 }, end: { x: x0 + def.w, y: y0 + def.d } },
      { name: '南墙', start: { x: x0 + def.w, y: y0 + def.d }, end: { x: x0, y: y0 + def.d } },
      { name: '西墙', start: { x: x0, y: y0 + def.d }, end: { x: x0, y: y0 } }
    ];
    wallDefs.forEach((w, wi) => walls.push({ id: `wall-${hi + 1}-${wi + 1}`, hallId: id, name: `${def.name}-${w.name}`, start: w.start, end: w.end, heightMm: wh, thicknessMm: 240, color: '#eee7da' }));

    for (let c = 0; c < 5; c++) {
      cases.push({
        id: `case-${hi + 1}-${c + 1}`, hallId: id, name: `${def.name}展柜 ${c + 1}`,
        x: x0 + 2500 + (c % 3) * 6200, y: 3500 + Math.floor(c / 3) * 5200,
        widthMm: 2200, depthMm: 900, heightMm: 950, kind: c === 4 ? 'pedestal' : 'case'
      });
    }

    // 每面墙前约 700mm 布置连续站位；成人与轮椅平面位置相同，只改变眼高。
    wallDefs.forEach((wDef, wi) => {
      const wallId = `wall-${hi + 1}-${wi + 1}`;
      const dx = wDef.end.x - wDef.start.x;
      const dy = wDef.end.y - wDef.start.y;
      const len = Math.hypot(dx, dy) || 1;
      const tx = dx / len, ty = dy / len;
      let nx = -ty, ny = tx;
      const centerX = x0 + def.w / 2, centerY = def.d / 2;
      if ((centerX - wDef.start.x) * nx + (centerY - wDef.start.y) * ny < 0) { nx = -nx; ny = -ny; }
      const step = 1100;
      for (let along = 750, r = 0; along <= len - 750; along += step, r++) {
        const px = wDef.start.x + tx * along + nx * 450;
        const py = wDef.start.y + ty * along + ny * 450;
        route.push({
          id: `route-${hi + 1}-a-${wi + 1}-${r + 1}`, hallId: id, name: `成人视点 ${def.name}-${wi + 1}-${r + 1}`,
          x: px, y: py, heading: Math.atan2(-ny, -nx), viewer: 'adult'
        });
        route.push({
          id: `route-${hi + 1}-w-${wi + 1}-${r + 1}`, hallId: id, name: `轮椅视点 ${def.name}-${wi + 1}-${r + 1}`,
          x: px, y: py, heading: Math.atan2(-ny, -nx), viewer: 'wheelchair'
        });
      }
    });

    for (let l = 0; l < 6; l++) {
      const lx = x0 + 2500 + l * (def.w - 5000) / 5;
      lights.push({
        id: `light-${hi + 1}-${l + 1}`, hallId: id, name: `轨道射灯 ${hi + 1}-${l + 1}`,
        position: { x: lx, y: 3850, z: 2600 + (l % 2) * (def.d - 5200) },
        target: { x: lx, y: 1700, z: l % 2 ? def.d - 200 : 200 },
        beamAngleDeg: 34, intensity: 1.25
      });
    }
    ox += def.w + 4000;
  });

  const boards: Board[] = [];
  const images: ImageAsset[] = [];
  const palette = [
    { substrate: 'uv' as const, bg: '#f4efe6', fg: '#202124', accent: '#9a6a2f' },
    { substrate: 'vinyl' as const, bg: '#263238', fg: '#f8f5ee', accent: '#d7b56d' },
    { substrate: 'silk' as const, bg: '#efe3cf', fg: '#2b2620', accent: '#8c3b2e' },
    { substrate: 'acrylic' as const, bg: '#e8f0f2', fg: '#102a33', accent: '#2b7a8c' }
  ];

  function addBoard(b: Omit<Board, 'projectId' | 'updatedAt'>): void {
    boards.push({ ...b, projectId, updatedAt: NOW });
  }

  // 1 块 2 米级前言墙
  addBoard({
    id: 'board-001', seq: 1, code: 'QY-001', category: 'preface', title: '前言',
    wallId: 'wall-1-1', alongMm: 9000, elevationMm: 0, widthMm: 12000, heightMm: 3600, anchor: 'center',
    substrate: 'acrylic', finishColor: '#f6f1e7', textColor: '#2b2620', accentColor: '#9a6a2f', acrylicThicknessMm: 30,
    imageIds: [], tags: ['前言墙', '亚克力立体字'],
    blocks: [
      block({ id: 'b001-kicker', role: 'eyebrow', textZh: '江州市博物馆 · 新展开幕', textEn: 'JIANGZHOU MUSEUM · NEW EXHIBITION', xMm: 700, yMm: 420, widthMm: 9000, heightMm: 70, fontSizeMm: 46, color: '#9a6a2f', bold: true }),
      block({ id: 'b001-title', role: 'title', textZh: '江河文明', textEn: 'Civilizations Along the Rivers', xMm: 680, yMm: 620, widthMm: 7600, heightMm: 520, fontSizeMm: 300, lineHeight: 1.02, letterSpacingMm: 18, bold: true, color: '#1f2933' }),
      block({ id: 'b001-body', role: 'body', textZh: '从第一粒栽培稻、第一炉青铜火，到街市中的灯火与织造，江河把不同人群连接成共同的历史。请沿动线缓慢行走，让器物、文字与工艺彼此印证。', textEn: 'From the first cultivated rice and bronze casting to the lights and looms of the market city, rivers connected communities into a shared history.', xMm: 720, yMm: 1450, widthMm: 6500, heightMm: 720, fontSizeMm: 42, lineHeight: 1.7, color: '#3c4043' }),
      block({ id: 'b001-vertical', role: 'subtitle', textZh: '禮樂相生', textEn: '', direction: 'vertical', xMm: 10100, yMm: 520, widthMm: 260, heightMm: 2500, fontSizeMm: 190, lineHeight: 1.12, color: '#8c3b2e', bold: true })
    ]
  });

  // 4 个单元/章节墙
  for (let s = 0; s < 4; s++) {
    const n = s + 2;
    addBoard({
      id: `board-${String(n).padStart(3, '0')}`, seq: n, code: `DY-${s + 1}`, category: 'section', title: HALL_DEFS[s + 1].name,
      wallId: `wall-${s + 2}-1`, alongMm: HALL_DEFS[s + 1].w / 2, elevationMm: 650, widthMm: 5200, heightMm: 2200, anchor: 'center',
      substrate: s % 2 ? 'vinyl' : 'silk', finishColor: palette[s].bg, textColor: palette[s].fg, accentColor: palette[s].accent, acrylicThicknessMm: 0,
      imageIds: [], tags: ['章节墙'],
      blocks: [
        block({ id: `sec-${s}-no`, role: 'eyebrow', textZh: `第${'一二三四'[s]}单元`, textEn: `UNIT 0${s + 1}`, xMm: 360, yMm: 260, widthMm: 1800, heightMm: 80, fontSizeMm: 58, color: palette[s].accent, bold: true }),
        block({ id: `sec-${s}-title`, role: 'title', textZh: HALL_DEFS[s + 1].name.split(' · ')[1], textEn: ['Mountains and Rivers', 'Ritual Bronze', 'Craft and Daily Life', 'Renewal and Heritage'][s], xMm: 350, yMm: 430, widthMm: 4500, heightMm: 620, fontSizeMm: 210, lineHeight: 1.05, bold: true, color: palette[s].fg }),
        block({ id: `sec-${s}-body`, role: 'body', textZh: '单元说明以中等视距校对标题视角，并检查斜看时的反光与对比度。', textEn: 'Section intro calibrated for medium viewing distance, oblique glare and contrast.', xMm: 360, yMm: 1260, widthMm: 4300, heightMm: 420, fontSizeMm: 34, lineHeight: 1.55, color: palette[s].fg })
      ]
    });
  }

  // 7 块导视牌
  for (let w = 0; w < 7; w++) {
    const seq = 6 + w;
    addBoard({
      id: `board-${String(seq).padStart(3, '0')}`, seq, code: `DS-${String(w + 1).padStart(2, '0')}`, category: 'wayfinding',
      title: ['出口 →', '无障碍通道', '服务台', '卫生间', '互动体验区', '上下展厅', '文创商店'][w],
      wallId: `wall-${(w % 5) + 1}-${(w % 4) + 1}`, alongMm: 1200 + (w % 3) * 2600, elevationMm: 900,
      widthMm: 1400, heightMm: 420, anchor: 'left', substrate: w % 2 ? 'acrylic' : 'uv',
      finishColor: '#12355b', textColor: '#ffffff', accentColor: '#f2c14e', acrylicThicknessMm: 18,
      imageIds: [], tags: ['导视'],
      blocks: [
        block({ id: `way-${w}-zh`, role: 'title', textZh: ['出口', '无障碍通道', '服务台', '卫生间', '互动体验区', '上下展厅', '文创商店'][w], xMm: 70, yMm: 70, widthMm: 1260, heightMm: 170, fontSizeMm: 92, bold: true, color: '#ffffff' }),
        block({ id: `way-${w}-en`, role: 'english', textZh: '', textEn: ['EXIT', 'ACCESSIBLE ROUTE', 'INFORMATION', 'RESTROOM', 'INTERACTIVE ZONE', 'GALLERIES', 'MUSEUM SHOP'][w], xMm: 74, yMm: 270, widthMm: 1200, heightMm: 60, fontSizeMm: 34, color: '#f2c14e', bold: true })
      ]
    });
  }

  // 其余 188 块：大展板与展品卡，总数正好 200。
  const remaining = 200 - boards.length;
  for (let i = 0; i < remaining; i++) {
    const seq = boards.length + 1;
    const isPanel = i % 15 === 0;
    const isVertical = i % 23 === 0;
    const hallIndex = (i % 4) + 1;
    const wallIndex = (i % 4) + 1;
    const wallId = `wall-${hallIndex + 1}-${wallIndex}`;
    const p = palette[i % palette.length];
    const dynasty = DYNASTIES[i % DYNASTIES.length];
    const material = MATERIALS[i % MATERIALS.length];
    const object = OBJECTS[(i * 7) % OBJECTS.length];
    const theme = THEMES[(i * 5) % THEMES.length];
    const zhTitle = isPanel ? `${theme}：${material}与${object}` : `${dynasty}${material}${object}`;
    const enTitle = isPanel ? `${theme}: ${material} and ${object}` : `${EN_DYNASTY[dynasty]} ${material} ${object}`;
    const code = isPanel ? `ZP-${String(i + 1).padStart(3, '0')}` : `EP-${String(i + 1).padStart(4, '0')}`;
    const imageId = `IMG-${String(seq).padStart(4, '0')}`;
    images.push({
      id: imageId, projectId, code: imageId, title: zhTitle, boardId: `board-${String(seq).padStart(3, '0')}`,
      widthPx: 1200, heightPx: 900, format: 'SVG', dpi: 300, dataUrl: makeImageSvg(imageId, zhTitle, i + 3)
    });

    if (isPanel) {
      const widthMm = 1600;
      const heightMm = 2200;
      addBoard({
        id: `board-${String(seq).padStart(3, '0')}`, seq, code, category: 'panel', title: zhTitle,
        wallId, alongMm: 1800 + Math.floor(i / 15) * 2100 % 16000, elevationMm: 420, widthMm, heightMm, anchor: 'center',
        substrate: i % 2 ? 'uv' : 'silk', finishColor: p.bg, textColor: '#252525', accentColor: p.accent, acrylicThicknessMm: 0,
        imageIds: [imageId], tags: [theme, dynasty],
        blocks: [
          block({ id: `p-${i}-eyebrow`, role: 'eyebrow', textZh: `${theme} / ${dynasty}`, textEn: theme.toUpperCase(), xMm: 90, yMm: 80, widthMm: 1420, heightMm: 34, fontSizeMm: 22, color: p.accent, bold: true }),
          block({ id: `p-${i}-title`, role: 'title', textZh: zhTitle, textEn: enTitle, xMm: 86, yMm: 145, widthMm: 1430, heightMm: 250, fontSizeMm: 72, lineHeight: 1.12, bold: true, color: '#1f2933' }),
          block({ id: `p-${i}-body`, role: 'body', textZh: `本单元围绕“${theme}”展开。${material}${object}上的细节可与同时期纹饰、工艺和文献相互对照。排版使用标点挤压与避头尾，保证中英文混排时行首行尾稳定。观众视点按成人 1600 mm、轮椅 1200 mm 分别计算。`, textEn: `This panel explores ${theme}. Details on the ${material} ${object} can be compared with contemporaneous ornament, technique and texts. Kinsoku and punctuation compression are enabled for mixed Chinese and English lines.`, xMm: 92, yMm: 520, widthMm: 1416, heightMm: 760, fontSizeMm: 24, lineHeight: 1.62, color: '#3c4043' }),
          block({ id: `p-${i}-en`, role: 'english', textZh: '', textEn: enTitle, xMm: 92, yMm: 1340, widthMm: 1416, heightMm: 150, fontSizeMm: 17, lineHeight: 1.35, color: '#5f6368' }),
          block({ id: `p-${i}-caption`, role: 'caption', textZh: `图 ${imageId}：${zhTitle}（示意图像，出图清单保留图片编号）`, xMm: 92, yMm: 1980, widthMm: 1416, heightMm: 50, fontSizeMm: 14, color: '#6b5e4b' })
        ]
      });
    } else {
      const widthMm = isVertical ? 300 : 460;
      const heightMm = isVertical ? 420 : 300;
      addBoard({
        id: `board-${String(seq).padStart(3, '0')}`, seq, code, category: 'exhibit-card', title: zhTitle,
        wallId, alongMm: 900 + (i % 18) * 1180, elevationMm: 980 + (i % 2) * 140, widthMm, heightMm, anchor: 'left',
        substrate: i % 11 === 0 ? 'acrylic' : 'vinyl', finishColor: i % 7 === 0 ? '#263238' : '#fbf8f1',
        textColor: i % 7 === 0 ? '#f7f2e8' : '#202124', accentColor: p.accent, acrylicThicknessMm: i % 11 === 0 ? 12 : 0,
        imageIds: i % 3 === 0 ? [imageId] : [], tags: [dynasty, material],
        blocks: isVertical ? [
          block({ id: `c-${i}-vnum`, role: 'number', textZh: String(i + 1).padStart(3, '0'), xMm: 34, yMm: 28, widthMm: 220, heightMm: 34, fontSizeMm: 20, color: p.accent, bold: true }),
          block({ id: `c-${i}-vtitle`, role: 'title', textZh: zhTitle.slice(0, 10), direction: 'vertical', xMm: 112, yMm: 82, widthMm: 52, heightMm: 285, fontSizeMm: 27, lineHeight: 1.08, bold: true, color: i % 7 === 0 ? '#fff' : '#1f2933' }),
          block({ id: `c-${i}-vbody`, role: 'body', textZh: `${dynasty}。${material}`, direction: 'vertical', xMm: 48, yMm: 86, widthMm: 42, heightMm: 260, fontSizeMm: 15, lineHeight: 1.25, color: i % 7 === 0 ? '#e5e7eb' : '#4b5563' })
        ] : cardBlocks(i + 1, zhTitle, enTitle, dynasty, material)
      });
    }
  }

  return {
    project, halls, walls, cases, route, lights, boards, images,
    fonts: [{
      id: 'font-system-fallback', name: '系统备选黑体（度量回退）', family: 'system-fallback', kind: 'sans',
      format: 'unknown', bytes: new ArrayBuffer(0), size: 0, fallbackOnly: true, createdAt: NOW
    }]
  };
}

export const MATERIAL_LABELS: Record<string, string> = {
  vinyl: '刻字贴',
  uv: 'UV 打印',
  silk: '丝印',
  acrylic: '亚克力立体字'
};

export const CATEGORY_LABELS: Record<string, string> = {
  preface: '前言墙',
  section: '章节墙',
  panel: '图文大板',
  'exhibit-card': '展品卡',
  wayfinding: '导视牌'
};
