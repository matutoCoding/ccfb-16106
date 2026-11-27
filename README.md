# 博物馆展陈图文排版与上墙可读性预览系统

浏览器本地运行的展陈深化系统，技术栈为 **TypeScript + Vite + 原生 WebGPU + OpenType.js + IndexedDB**。系统内置一个自动生成的 **200 块展板/说明牌**展览项目，覆盖前言墙、章节墙、图文大板、展品卡和导视牌。

## 启动与构建

```bash
npm install
npm run dev
# 打开终端输出的 http://127.0.0.1:5173
```

生产构建：

```bash
npm run build
npm run preview
```

类型检查：

```bash
npm run check
```

推荐使用最新版 Chrome / Edge。支持 WebGPU 时排版页和三维上墙页使用 MSDF WebGPU 管线；无 WebGPU 或 adapter 不稳定时自动切换 Canvas2D 精确兼容视图，所有数据、报告和导出仍可用。

## 已实现页面

1. **展览项目**：项目信息、可读性标准、字体导入、全局字体切换、IndexedDB 状态、性能与精度验收入口。
2. **展厅平面**：毫米坐标绘制 5 个展厅、20 面墙、25 个展柜/独立展台、608 个成人/轮椅动线视点和射灯；200 块板按挂墙墙面、沿墙位置和标高显示。
3. **图文排版**：板列表/筛选、横竖混排、避头尾、标点挤压、基线偏差、缺字红框/回退标记、区块属性编辑、WebGPU MSDF 预览、Canvas 兼容预览、缩放和 1:1 矢量轮廓叠加。
4. **上墙预览**：毫米三维世界坐标、墙面法线、板中心、成人 1600mm 与轮椅 1200mm 眼高、最近阅读站位、视距/斜视角、射灯镜面反射点和眩光椭圆；刻字贴、UV、丝印、亚克力立体字分开表现，亚克力有挤出厚度和侧面暗色层。
5. **可读性检查**：200 块板逐行显示最小/核心字高、笔画估计、WCAG 对比度、视距、视角、成人/轮椅视角、斜视角、眩光覆盖率和问题；点击“跳排版”直接定位展板。
6. **出图**：每块板可下载 1:1 毫米 SVG 刻字轮廓或彩色校对稿；ZIP 包含 200 个刻字 SVG、200 个 proof SVG、中英对照文本、图片编号清单 CSV、内置示意图和可读性 CSV。

## 字体与 MSDF

- 支持导入 `.ttf` / `.otf`，字体二进制存入 IndexedDB `fonts` store。
- 内置 `public/fonts/NotoSansSC-VF.ttf`，属于思源/Noto CJK 体系；也可在项目页导入思源黑体/宋体正式 OTF/TTF。
- 不预生成整个中文字库。系统收集当前展板或全展览实际使用字符，在 Module Worker 中用 OpenType 轮廓和线段距离生成 RGB 三通道 MSDF 图集。
- 原字体 `charToGlyphIndex(char) === 0` 时标记缺字并解析到备选字体；排版结果保留 `missing` 与 `fallback` 状态。
- WebGPU fragment shader 使用 RGB median 重建距离，并通过 `fwidth` 按屏幕像素宽度自适应抗锯齿。缩小时过渡带自然变宽，远距小字会呈灰色块而不是被强制锐化。

## 关键目录

```text
src/
├─ types.ts                  # 领域模型与报告类型，单位统一 mm
├─ main.ts                   # 哈希路由、启动、window.__SIGNAGE__ 验收 API
├─ styles.css
├─ lib/
│  ├─ seed.ts                # 生成 5 厅、20 墙、200 板、图片清单、动线和灯
│  ├─ db.ts                  # IndexedDB
│  ├─ store.ts               # 全局状态、持久化、报告重算、字体切换
│  ├─ fontManager.ts         # OpenType/FontFace/Worker MSDF 客户端
│  ├─ textLayout.ts          # 横竖排、分词、避头尾、标点挤压、基线
│  ├─ readability.ts         # 字视角、对比度、视距、斜视、状态汇总
│  ├─ glare.ts               # 镜面反射点、眩光椭圆、文字覆盖
│  ├─ world.ts               # 墙坐标系、板原点/中心、局部/世界变换
│  ├─ exporter.ts            # 1:1 SVG、中英对照、图片清单、ZIP
│  └─ precision.ts           # 轮廓/MSDF plane 坐标一致性验收
├─ workers/msdf.worker.ts     # 按需 RGB MSDF 图集生成
├─ webgpu/
│  ├─ WebGpuStage.ts         # WebGPU device、WGSL、纹理、管线
│  ├─ geometry.ts            # 文字四边形、立方体、合并网格
│  ├─ hallScene.ts           # 三维展厅和亚克力挤出层
│  └─ mat4.ts                # WebGPU zero-to-one depth 矩阵
└─ ui/ and pages/            # DOM 页面与 Canvas 兼容渲染
```

## 验收口径与浏览器 API

页面加载后可在 DevTools Console 使用：

```js
__SIGNAGE__.boardCount()                  // 200
__SIGNAGE__.report.elapsedMs              // 全量可读性重算耗时
await __SIGNAGE__.recompute('font-...')   // 换字体后重算并返回耗时
await __SIGNAGE__.verifyPrecision()       // board-001 的 <0.1mm 精度报告
await __SIGNAGE__.buildAllAtlas()          // 手动生成全部实际用字 MSDF
```

最近一次 Chromium 实测（200 块板、608 视点）：

- 展板数量：`200`
- 全量可读性算法重算：约 `40–50 ms`，显著小于 3000ms 目标。
- `verifyPrecision('board-001')`：`pass: true`，`maxErrorMm ≈ 0.0005`。该检查比对 Worker MSDF plane 与主线程 OpenType glyph bbox，并计入 SVG 三位小数毫米序列化误差；导出路径和屏幕排版共用同一 OpenType 坐标变换。
- 导出 SVG 根节点示例：`width="12000mm" height="3600mm" viewBox="0 0 12000 3600"`，即 `1 user unit = 1mm`。

## 工程说明

- 所有物理尺寸内部均以毫米保存；96DPI 仅在需要屏幕换算时使用 `25.4 / 96`。
- 报告中的视角按 `2 atan(字高 / 2视距)` 转为弧分，并乘以斜视压缩系数。
- 眩光只评估最近的成人/轮椅阅读站位，避免“整条动线上所有灯的最坏反射”导致每块板必然不合格。
- 生成的图片是轻量 SVG data URL，并会随 ZIP 输出到 `images/assets/`；真实项目可在 IndexedDB/数据模型中替换为 TIF/PNG 原图。
- 刻字导出保留原始贝塞尔 `C/Q` 命令，不把文字转成位图。
