# FE 功能路线与组件清单

> 面向 `FE`（Vue 3 + Vite + OpenLayers）的开发清单。
> 数据侧（采集/入库）见 `etl/spec.md`；服务侧（发布/样式）见本文 §7。
> 最后更新：2026-10-31（D13 收尾）

## 0. 项目形态（两张图定方向）

**浏览态**——日常查看、演示开场：

![浏览态](./img/preview-browse.png)

**分析态**——D13 之后的主战场（点选 → 缓冲区 → 统计）：

![分析态](./img/preview-analysis.png)

> 两张是**设计稿**（用真实底图 + UI 叠加做的），不是最终界面；实现时可以改配色/布局，但组件边界按本文走。

---

## 1. 功能路线图

| 阶段 | 功能 | 交付物 | 依赖 |
|---|---|---|---|
| **D5–D6** ✅ | 后端起项目 + 第一个查询接口 | `/api/hello`、`/api/ping-db`、`/api/areas`（13 区 GeoJSON） | Maven / JDK17 / PostGIS |
| **D8–D9** ✅ | 三个业务接口 | `/api/poi/{gid}`、`/api/poi/nearby`、`/api/stats/coverage` | D6 的 MyBatis |
| **D10–D11** ✅ | 测试 | `mvn test` 绿（规格 3 用例，**实际 6 用例**） | D9 |
| **D12** ✅ | 地图交互 | 图层开关 + 透明度 + 点击弹详情 + 天地图底图成组切换 | GeoServer `wuhan:poi` ✅ |
| **D13** ✅ | 缓冲区分析（**2026-10-31 已完成**） | 点选 → 800 m 圆 → 统计卡片；外加任意多边形 `within` | D9 的 `nearby` 接口 |
| **D14–D15** | 缓冲区收口 / 抢进 D16（**空白格，细项见 §2.4.8**） | 多点对比、分类高亮专题图，或直接做格网 | D13 |
| **D16–D18** | 格网 + 热力图 | `grid_500m` 表 + GeoServer 新图层 + 前端分级 | PostGIS 空间函数 |
| **D19–D20** | 打磨 + 录屏 + README | 30 秒演示视频、五张截图 | 以上全部 |
| **D21** | 复盘 + 投递 | 简历 + 项目自述 | — |

> **当前站位（2026-10-31 19:30）**：**D13 完成 → D14 起点**。
> 计划 D5→D13 是 8 个工作日，实际 2026-10-27 → 10-31 用 5 个自然日走完（约 1.6×）。
> 下一步待定：D14/D15 原文是空白格，候选细项见 §2.4.8。

---

## 2. 组件清单（按阶段分批，别一次性全写）

### 2.1 现在（D12 前）——只做 5 个

| 类型 | 文件 | 职责 | 行数量级 |
|---|---|---|---|
| Pinia store | `src/stores/layers.js` | `visible` / `opacity`（**只存布尔与数字**） | 30 |
| 配置 | `src/map/wms.js` | `createAdminLayer()` / `createPoiLayer()` | 30 |
| 配置 | `src/map/layers.js` | 图层注册表（数据驱动，面板从它生成） | 20 |
| 组件 | `src/components/LayerPanel.vue` | 勾选 + 透明度滑杆 + 类别 chips | 40 |
| composable | `src/composables/useLayerSync.js` | `watch(store)` → `layer.setVisible/setOpacity` | 20 |

### 2.2 D12 加 3 个

| 文件 | 职责 |
|---|---|
| `src/components/PoiDetailCard.vue` | 右侧详情卡（固定骨架 + 空值降级） |
| `src/composables/useFeatureInfo.js` | `map.on('singleclick')` → `getFeatureInfoUrl` → `fetch` |
| `src/stores/selection.js` | `selected { gid, name, category, … }`（**存 id 与属性，不存 Feature**） |

### 2.3 D12 当前进度（2026-10-31 复核）

> 核对方式：逐个文件比对 §2.1 / §2.2 + surefire 报告 + 文件时间戳。
> **2026-10-31 复核结论**：功能全部到位；有个别文件名与规格不同（见第 5、7 行），是有意为之。

| # | 文件 | 状态 | 备注 |
|---|---|---|---|
| 1 | `src/stores/layers.js` | ✅ 完成 | `visible` / `opacity` 只存值，纪律到位 |
| 2 | `src/map/wms.js` | ✅ 完成 | `STYLES: 'wuhan:poi_icons'` + `TRANSPARENT: true` 齐 |
| 3 | `src/map/layers.js` | ✅ 完成 | 数据驱动；chips 合计 16016 与库内一致 |
| 4 | `src/components/LayerPanel.vue` | ✅ 完成 | 纯展示 + emit，289 行（规格是 40，做得更细） |
| 5 | `src/composables/useLayerSync.js` | ⚠️ 不按规格抽出 | 功能已有，落地形式是 `mapView.vue` 里的 **4 个** `watch`（底图换源 / `syncDrawing` / 换工具清空 / 缓冲圈缩放）。**决定不再抽**——4 条 watch 各管一件事，薄封装只会多一层间接 |
| 6 | `src/stores/selection.js` | ✅ 完成（10-31） | 7.3 KB；只存 `{ gid, name, category, … }` 属性，不存 Feature |
| 7 | `src/composables/useFeatureInfo.js` | ✅ 换实现（10-31） | 实际文件是 `src/map/clickToGid.js`（`GetFeatureInfo` → gid），职责一致、位置更贴地图层 |
| 8 | `src/components/PoiDetailCard.vue` | ✅ 完成（10-31） | 13.5 KB（规格是固定骨架，做得更细） |

**D12 的技术核心**：`ImageLayer + ImageWMS` 是服务器画的整屏 PNG，浏览器侧**没有 Feature**，
`forEachFeatureAtPixel()` 对它无效 → 点击必须走 `GetFeatureInfo` 问服务器。
边界划分：**GeoServer 只回答"点是哪个"（gid），后端只回答"这个是什么"（photos/tel/address）**，
不要从 `GetFeatureInfo` 的属性里读详情 —— `photos` 是 jsonb 抠出来的、`detailFetched` 是 Java 算的。

**实际接入顺序**（2026-10-31 回填，每步都单独验收过）：

1. `selection` store —— `selectByGid` 先能手动调；
2. `map/clickToGid.js` —— 点一下能出 gid；
3. `PoiDetailCard.vue` —— `App.vue` 里挂上，`poi` 从 store 来；
4. 图层反查改名（`findTargetLayer` 走 `layer.get('id')`，不再猜 `LAYERS`）。

原计划的「抽 `useLayerSync`」这一步**主动取消**，理由见上表第 5 行。

**待修小账**（2026-10-31 复核）：

| # | 事项 | 状态 |
|---|---|---|
| 1 | 图层稳定身份：`createPOILayer()` 要带 `properties: { id }` | ✅ **已清**：`map/wms.js:12/31` 构造时直接带 `properties: { id }`，`findTargetLayer()` 不必再猜 `LAYERS` 参数 |
| 2 | 底图 `TileLayer` 的 `source` 建在 `setup` 顶层（`mapView.vue:57`），卸载不释放 | ⬜ **未清**：单页不暴露，等抽 `useMap` 时一起搬进 `onMounted` |
| 3 | `/api/poi/{gid}` 缺 `adname` / `biz_ext` | ✅ **已清，且比原计划省**：两者都在 `raw` jsonb 里（覆盖率 100%），**不需要 JOIN `admin_area`**。见 §4.3 —— `PoiDto` 现 17 字段 |

### 2.4 D13 分析模式（2026-10-31 **完成**）

| 文件 | 职责 | 状态 |
|---|---|---|
| `src/stores/analysis.js` | `active` / `tool` / `radius` / `categories` / `center` / `geometry` / `measure` / `result` | ✅ 完成 |
| `src/components/AnalysisToolbar.vue` | 点选/自由绘制/框选/测距 + 半径滑杆 + 类别勾选（纯展示） | ✅ 完成 |
| 入口接线（TopBar 开关 + 卡片「附近分析」） | 两个入口都进同一套状态 | ✅ 完成 |
| 分析模式视觉（徽章转红、按钮转「退出分析」、底图+注记+区划去色、搜索框弱化） | | ✅ 完成 |
| `src/map/drawing.js` | 四种工具的绘制交互 + 分析图形图层 + WKT 导出 | ✅ 完成 |
| `src/composables/useBufferAnalysis.js` | 中心/多边形/半径一变就自动查 `/nearby` 或 `/within` | ✅ 完成 |
| `src/components/AnalysisResult.vue` | 大数字 + 分类占比条 + 最近设施 + 导出 CSV | ✅ 完成 |
| `src/utils/percent.js` | 最大余数法拆百分比，保证各类相加恒等于 100 | ✅ 完成（§2.4.3） |
| `src/components/SqlHintBar.vue` | 底部「请求 SQL / 耗时 / 返回条数」说明条 | ✅ 完成（§2.4.5） |

### 2.4.0 绘制工具（2026-10-31）

`src/map/drawing.js` 导出 `createDrawingController(map)`，对外只有 5 个方法：
`setTool(tool, callbacks)` / `setRadius(m)` / `setCenter({lon,lat})` / `getPolygon()` / `destroy()`。
它**不 import store**，只通过回调上报（`onPoint` / `onPolygon` / `onMeasure`）——
和 `LayerPanel` 的纯展示思路一致，方便单独测试。

四种工具产出的几何与**交互方式**（2026-10-31 按用户要求改过一轮，见下）：

| 工具 | 交互 | 图形 | 上报 |
|---|---|---|---|
| 点选 | 单击（之后镜头自动拉到 zoom 14） | 中心点 + 虚线缓冲圈 | `onPoint({lon,lat})` |
| 自由绘制 | **逐点单击加点，双击闭合** | 任意多边形 | `onPolygon({wkt,areaKm2})` |
| 框选 | **单击定首个角 → 移动鼠标 → 再单击** | 外接矩形 | `onPolygon({wkt,areaKm2})` |
| 测距 | 连点、双击结束 | 折线 + 长度标签 | `onMeasure({meters})` |

图形统一红色（`#d93025`）+ 半透明填充，标签用 `Text.backgroundFill` 做红底白字。
分析图形图层**故意不挂 `ol-layer-base`**，所以分析模式下的去色不会波及它。

**★ 为什么点选后必须自动放大**

第一版点选"点完什么都看不见"。不是样式问题，是**物理尺寸**：
zoom 9 时分辨率 ≈ 305 m/px，800 m 半径 = **2.6 像素**，画出来就是几个红点。
所以 `mapView` 里加了 `BUFFER_ZOOM = 14`（≈9.5 m/px，半径 84px），
`watch(analysis.center)` 里判断"当前比目标更远才动镜头"——用户已经放大到 16 了不该被拉回来。

**★ 交互语义：全部是"点击"，不是"按住拖"**

第一版把自由绘制和框选都做成了按住拖（`freehand: true`），用户反馈不要那样。
现在两者都回到 OL 的默认点击语义，原因也和 Draw 的实现有关
（`ol/interaction/Draw.js` 的 `handlePointerMove_`）：

```js
this.shouldHandle_ = this.freehand_
  ? squaredDistance > squaredClickTolerance_    // 手绘：移动才开始画
  : squaredDistance <= squaredClickTolerance_;  // 非手绘：移动超容差就"放弃接管"
```

非手绘模式下**一拖动 Draw 就主动放手**，事件落到 `DragPan` 上变成平移地图 ——
所以「按住拖」在非手绘模式里根本不可行，反过来，点击式交互在拖拽场景下会失效。
两者只能选一种，按用户习惯选了**点击式**。

**★ 第二个坑：圆心会重复一个**

`Draw` 是在 `dispatchEvent('drawend')` **之后**才把要素加进 `source` 的
（`finishDrawing()` 里先 dispatch 再 addFeature）。所以 `drawend` 里立刻
`paintCircle()` 清不掉刚画的点，结果是地图上有两个圆心（实测复现）。
修法：`setTimeout(paintCircle, 0)`，推到下一拍，那时要素已在 source 里。

**端到端实证**（旧版拖拽模式下的记录，接口链路不变）：
```
前端算面积 663.61 km² → GET /api/poi/within?wkt=... → 200 / 255ms
后端 count 8162 = school 2107 + hospital 3032 + mall 2406 + park 617
后端 ST_Area 662.94 km²（与前端差 0.1%，球面近似所致）
```

**改版后的实测**（CDP 派发真实鼠标事件）：

```
① 点选   → zoom 9→14，要素 [circle r=800, center]（只有一个圆心），地图中心区红色像素 22461
② 自由绘制 → 4 次单击 + 双击闭合 → POLYGON，1.69 km²
③ 框选   → 单击(600,350) → 悬停移动 → 单击(800,470) → POLYGON，1.62 km²
            （200×120px 在 zoom14 换算 1.65×0.99 km → 1.62 km²，与实测吻合）
④ 测距   → 连点 + 双击 → 1836 m
```

另外三条实测结论：
- 拖半径滑杆时缓冲圈实时重画（`paintCircle` 先删旧的 `circle`/`center` 要素）
- 分析模式下**地图点击不再打开 POI 详情卡**（那一下是"选中心"，不是"看设施"）

### 2.4.1 分析模式下"地图变灰"的正确做法

```js
// mapView.vue：底图 / 注记 / 区划 三个图层挂同一个 className
new TileLayer({ className: 'ol-layer-base', source: createBaseSource(...) })
createAdminLayer(map, url, 'wuhan:admin_area', 'admin', 'ol-layer-base')
```

```css
/* style.css：只灰化挂了该类的图层 */
#map.is-analysis .ol-layer-base {
  filter: grayscale(1) brightness(1.04) contrast(0.96);
}
```

**★ 绝不能写成 `#map.is-analysis { filter: grayscale(1) }`**：
那会把整个视口连同缓冲圈、测距线一起灰掉，分析要素就失去视觉优先级了。

实测要点：
- `className` 是 OL 图层**正规选项**（默认 `'ol-layer'`），canvas 渲染器会把它设到图层容器上
  （`ol/renderer/canvas/Layer.js` 里 `container.className = layerClassName`）。
- 挂同一个类的图层会被 OL **合并进同一个容器**（实测 DOM 里只有一个 `.ol-layer-base`），
  一条 CSS 规则同时生效，不用写多条。
- **POI 层不挂这个类**，所以图钉在灰底上仍是彩色的 —— 这正是"底图退后、设施突出"的效果。

**★ 为什么第一版"看着没变灰"**：只灰化了底图+注记，而 `.ol-layer` 容器里还装着**区划多边形**
（带蓝灰填充）和 POI，视觉上仍有色。现在区划也纳入灰化，只剩 POI 是彩色。

**★ 改这里必须刷新页面，HMR 不够**：`className` 是图层**构造时**的参数，
HMR 只会更新组件代码，已经创建出来的图层实例不会改类名 → 规则匹配不到，看起来"没生效"。

**量化实测**（无头 Chrome 截取地图中心 460×300 区域，算平均饱和度）：

| 状态 | 平均饱和度 | 变化 |
|---|---|---|
| 浏览模式 | 0.0585 | — |
| 分析模式（底图+注记+区划去色，POI 保留） | 0.0165 | **−71.8%** |
| 对照：连 POI 一起灰（仅测试用） | 0.0000 | −100% |

**验收记录（无头 Chrome + CDP 实际点击驱动，不是肉眼看）**：

| 状态 | layer-panel | tool-panel | mode-badge | `#map` class | 底图 filter | 搜索框 |
|---|---|---|---|---|---|---|
| 浏览模式 | 1 | 0 | 0 | `""` | `none` | 正常 |
| 点「分析工具」 | 0 | 1 | 1 | `is-analysis` | `grayscale(1) brightness(1.04) contrast(0.96)` | 置灰 |
| 再点一次 | 1 | 0 | 0 | `""` | `none` | 恢复 |

卡片入口实测（先用 pinia 让卡片出现，再点「附近分析」）：

```
analysisActive: true, tool: "point", radius: 800,
center: { lon: 114.292598, lat: 30.610841, name: "解放公园" },
cardClosed: true, toolPanel: 1, mapClass: "is-analysis", 面板底部: "中心：解放公园"
```

> 注：CDP `returnByValue` 序列化响应式对象时 `center` 会显示成 `{}`，
> 用 `JSON.stringify` 才看得到内容 —— 这是调试工具的怪癖，不是数据丢了。

### 2.4.2 结果面板（2026-10-31）

`AnalysisResult.vue` 是**纯展示**组件（不 import store、不 fetch），
数据由 `useBufferAnalysis` 写进 store，App 传 `analysis.displayResult` 进来。

**布局**（对照概念图）：标题「可达性分析结果」+ 右侧「圆心：xxx / 范围：x km²」
→ 30px 红色大数字 + 「个设施在 800 m 内」→ 四个类别色条（按数量降序）
→ 「最近的设施」列表（最多 5 条，超出提示"还有 N 条"）→ 导出 CSV。

**四个关键实现决定**：

1. **类别勾选在前端过滤，不改后端**。
   `byCategory` 是**全量**分类计数（`count = ΣbyCategory`），
   所以剔掉未勾选类别后重新求和，得到的 `count` 与后端按类别过滤**完全等价**，不是近似。
   （只有 `nearest`/`items` 列表是"最近 N 条"，过滤后条数会变少——可接受。）
   这也让"切换勾选不重新查库"成立：`useBufferAnalysis` 用参数指纹去重，
   勾选变化不触发新请求。
2. **防抖 260ms**。半径滑杆拖动时 `input` 连续触发，不防抖会打十几个请求。
3. **竞态用请求序号**。慢请求回来时用户可能已改半径/换范围，旧结果必须丢弃，
   否则"拖到 2000m 却显示 800m 的数"。
4. **CSV 带 BOM**（`\ufeff`）—— 否则 WPS/Excel 打开中文乱码。
   内容分三段：参数 / 分类汇总 / 设施清单，末尾注明"清单为接口返回的前 N 条，非全量"，
   不假装是全量导出。

**为此补的后端字段**：`NearestDto` 和 `WithinItem` 各加了 `lon` / `lat`
（`nearest` 还补了 `gid`）—— 列表要能点击定位，没坐标飞不过去。
字段顺序必须与 MyBatis `constructor` resultMap 一致，改动两边要同步。

### 2.4.3 百分比必须用最大余数法（2026-10-31）

**问题**：面板最初用 `Math.round(n / count * 100)` 各自取整，四行加起来会出现 99% 或 101%。
扫了本数据集 21 个圆形范围，**8 个中招**：

```
总数 11：school 3 / hospital 5 / mall 3
  精确 27.27 / 45.45 / 27.27  →  27 + 45 + 27 = 99%     （三个 .27 都被舍）
总数 6 ：school 4 / hospital 1 / mall 1
  精确 66.67 / 16.67 / 16.67  →  67 + 17 + 17 = 101%    （三个 .67 都被进）
```

**根因**：取整不是保总和运算。各项独立四舍五入，舍掉的部分加起来正好 1%，进位也是 1%。
**总数越小越容易出问题**（3 个 33.33 → 33×3 = 99）。

**解法**：`src/utils/percent.js` 的 `splitPercent(values, decimals)`，
用**最大余数法**（Hamilton / 最大余额）：

```
① 全部向下取整
② 算还差多少个最小单位（整数百分比 → 1%，一位小数 → 0.1%）
③ 按小数部分从大到小逐个补 1 个单位
```

性质：合计**恒为 100**，且每一项与精确值相差不超过一个最小单位。
实现细节：数量为 0 的项不参与补位（否则空类别会显示 1%）；
余数相同时按原顺序补（同样的数据每次渲染结果一致）。

**验证**（6 个原本失败的范围）：

```
(114.34253, 30.56028) 总数 11 → 46+27+27 = 100% ✓
(114.29633, 30.67073) 总数 3  → 34+33+33 = 100% ✓
(114.3935,  30.53389) 总数 7  → 72+14+14 = 100% ✓
(114.31863, 30.55452) 总数 14 → 65+14+14+7 = 100% ✓
(114.20637, 30.67296) 总数 6  → 66+17+17 = 100% ✓
(114.33594, 30.54719) 总数 14 → 43+22+21+14 = 100% ✓
```

**配套的三个显示细节**：
- **数量和占比要分两个元素显示**：`36 个` + `43%`，中间 12px 间距。
  早期写成 `36 · 43%`，连起来读极容易被看成 `36.43%`（用户实际反馈过）。
  现在：数量小一号、色浅（`#a8bccd`），占比右对齐并定宽 34px，
  四行的小数点/百分号能对齐成一列。实测两元素间距 12px、垂直差 1px。
- **四个类别恒定全部显示**，数量为 0 也占一行（`0 个 · 0%`，整行压淡）。
  早期实现是"0 就隐藏整行"，结果用户以为"少了一个类别"、
  也觉得"占比加起来不完整"——其实少的就是那个 0%。
- 数量 >0 但占比被分到 0% 时显示 **`<1%`**，不写 `0%`（否则看起来像这一类是空的）；
  这类行的色条给 `min-width: 2px`；数量真为 0 的行色条宽度为 0，不显示色块。
- 色条宽度直接用这个整数百分比，**条长与标签数字永远一致**，
  不会出现"写着 27% 但条比 33% 的长"。
- CSV 用同一个函数（`decimals = 1`），分类汇总那一列加起来也是 100.0。

渲染效果可参考 `docs/img/panel-percent.png`（2x 截图，83 个设施 / 43+30+22+5=100）。

**★★ 一个极隐蔽的调试陷阱：Vue 渲染函数抛错时，DOM 会冻结在旧状态**

改"四行常驻"时，`rows()` 里误用了 `CATEGORIES`（组件里只有单数 `CATEGORY`）。
构建**通过**（Rollup 把未定义标识符当全局变量，不报错），
运行时渲染抛 `ReferenceError`，Vue 捕获后**保留了上一次成功渲染的 DOM**。

表现出来是：store 里 `result.count = 83`、`loading = false`，
但面板永远停在「正在统计…」——看起来像**取数卡住了**，实际是渲染崩了。

排查方法（这次就是这么定位的）：
1. 每 120ms 采样 `{ loading, result.count, DOM 里的 .big, .cat-row 数量 }`
2. 看到 `result=83` 但 `dom=正在统计…` 一直不变 → 问题在渲染层，不在数据层
3. 抓 `Runtime.exceptionThrown` → 直接看到 `CATEGORIES is not defined`

**教训**：组件"不更新"时，先看控制台有没有渲染异常，别一头扎进取数逻辑。
`vite build` 通过 ≠ 运行时没错误，未定义标识符不会让构建失败。

**最终验证（20 个随机位置 × 随机半径）**：

| 情形 | 数量 | 结果 |
|---|---|---|
| 范围内有设施 | 14 | 四行齐全、占比合计 **100**、数量之和 = 大数字 ✓ |
| 范围内 0 条 | 6 | 显示「该范围内没有符合条件的设施」（后端核对确实都是 0）✓ |
| 渲染异常 | 0 | 无 |

时间线（点选后）：

```
t=136ms loading=false result=-   dom=-
t=389ms loading=false result=83  dom=83  rows=4   ← 不再卡在"正在统计…"
```

**实测（CDP 派发真实鼠标）**：

```
点选模式：圆心：已选点 / 83 个设施在 800 m 内
         医院 36·43% 学校 25·30% 商场 18·22% 公园 4·5%   （数量和 = 83 ✓，占比和 = 100%）
         列表 5 条，条数超出的显示「还有 45 条」
框选模式：范围：1408.75 km² / 11,399 个设施在范围内
         医院 3,949·35% 商场 3,504·31% 学校 3,124·27% 公园 822·7%
取消勾选「公园」→ 大数字 83 → 79，公园那一行消失（正好减 4）✓
导出 CSV：2812 字节，59 行，含参数/分类/47 条清单/注释
点击列表第一条 → 镜头飞过去，结果面板保留、不打开详情卡
```

> 点列表项**故意不打开详情卡**：那张卡在分析模式下是隐藏的（右侧让给结果面板），
> 打开等于"点了一下什么都没发生"。要查详情退出分析模式再点地图。

### 2.4.4 换工具即清空图形（2026-10-31）

**需求**：点另一个工具按钮时，上一个工具画的圆/多边形/线要立刻消失，
而不是等下次开始画才被清掉。

**实现**：在 `drawing.setTool()` 里判断"工具是否真的变了"，变了才 `clear()`：

```js
const changed = next !== tool;   // ★ 只有真换了才清
removeDraw();
tool = next;
if (changed) clear();
```

**★ 为什么必须判 `changed`**：`setTool` 会被 `syncDrawing` 反复调用
（拖半径滑杆、改中心点都会调）。若无条件 `clear()`，用户每拖一下滑杆，
刚画好的圆就被擦掉再重画，画面会闪。

配套改了 store 的 `clearSketch()`：**连 center 一起清**。
早期"点选模式下保留圆心"的理由（改半径还要用）已经不成立 ——
绘图层清空后 store 还留着 center，面板就会显示一个地图上不存在的圆，状态自相矛盾。

**★ 连带修掉一个更隐蔽的 bug：双击完成后图形会消失**

原来三个工具都在 `drawstart` 里 `clear()`。而双击结束的最后一下
会顺带开一个新的草图 → 触发新草图的 `drawstart` → 把刚画好的图形又清掉了。
表现为"画完多边形，图形立刻不见了"（实测：`store.geometry` 有值，但 source 里 0 个要素）。

改成**完成时替换**：`drawstart` 不再清空，改在 `drawend` 里
`removeByKind('polygon')` / `removeByKind('line')` 后再让 Draw 加入新要素
（Draw 是在 `drawend` 之后才 addFeature 的，顺序正好）。

**实测（CDP 真实鼠标，逐项核对 source 里的要素）**：

```
1 点选画圆后      kinds=[circle,center]  panel=true
2 切框选          kinds=[]               ← 清空 ✓  panel=false
3 画完矩形后      kinds=[polygon]        panel=true
4 切自由绘制      kinds=[]               ← 清空 ✓
5 画完三角形后    kinds=[polygon]        ← 双击后图形仍在（bug 已修）
6 切测距          kinds=[]               ← 清空 ✓
7 测完距后        kinds=[line]
8 回点选          kinds=[]               ← 清空 ✓
渲染异常：无
```

> 另外：`removeDraw()` 里补了 `draw.abortDrawing()`。
> 用户画到一半就换工具时，草图在 Draw 自带的 overlay 层里，
> 不在我们的 source 里，`clear()` 清不到，会留一条半透明的残影。

### 2.4.5 底部「请求 SQL」说明条（2026-10-31）

**动机**：分析模式下，底部那四个静态数字（行政区 13 / POI 16,016 / …）没有信息量。
换成**当前这次分析实际下推给 PostGIS 的谓词** ——
既让用户知道数字怎么来的，也是投递演示时最直接的技术说明。

```
浏览模式：行政区 13 │ POI 设施 16,016 │ 设施类别 4 │ 数据截至 2026-10
分析模式：请求 SQL： ST_DWithin (geom::geography, 圆心, 800) · 耗时 21 ms · 返回 83 条
```

**按工具切换谓词**（`App.vue` 里的 `sqlHint` computed）：

| 工具 | 横幅内容 | 依据 |
|---|---|---|
| 点选 | `ST_DWithin (geom::geography, 圆心, 800)` | `/api/poi/nearby` 的 where |
| 框选 / 自由绘制 | `ST_Within (geom, ST_GeomFromText(多边形, 4326))` | `/api/poi/within` 的 where |
| 测距 | `前端 getLength() 计算，未请求后端` | 纯前端 `ol/sphere` 计算 |

**四个实现细节**：

1. **耗时是真测的**，不是装饰数字：`useBufferAnalysis` 里 `fetch` 前后取
   `performance.now()`，只算网络+服务端往返，**不含前面的 260ms 防抖等待**。
   实测点选 6–21 ms、框选 229 ms（多边形查询更重）。
2. **只贴核心谓词，不贴完整 SQL**。真实语句还有 `group by category`、
   `order by "distanceM", gid`、`ST_Distance` 求距离，一条横幅放不下；
   横幅要说明的是"空间计算下推到了 PostGIS"，不是给一份可执行 SQL。
3. **测距必须如实写"未请求后端"**。它是 `ol/sphere` 的 `getLength()` 算的，
   一句 SQL 都没发；若也显示 `ST_DWithin` 就是在撒谎。
4. **条数与右侧面板保持一致**：横幅的「返回 N 条」用 `displayResult.count`
   （已按类别勾选过滤），而不是 SQL 的原始 `result.count`。
   否则用户取消勾选「公园」后，面板变 79、横幅还是 83，看着像 bug。
   差额在 tooltip 里说清：「SQL 返回 83 条；未勾选的类别已在前端剔除，当前统计 79 条」。

**实测（CDP）**：

```
刚进入       : ST_DWithin(geom::geography, 圆心, 800) · 等待选择分析中心
点选后       : ST_DWithin(geom::geography, 圆心, 800) · 耗时 21 ms · 返回 83 条
切框选       : ST_Within(geom, ST_GeomFromText(多边形, 4326)) · 等待选择分析中心
框选后       : ST_Within(...) · 耗时 229 ms · 返回 51 条
切测距       : 计算方式：前端 getLength() 计算，未请求后端
取消勾选公园 : 横幅 79 条 == 面板 79 条 ✓（tooltip 说明 SQL 实际返回 83 条）
渲染异常     : 无
```

> 截图存证：`docs/img/sql-hint-bar.png`。
>
> **顺带澄清一个看起来像 bug 的现象**：截图里横幅上压着一个深色小悬浮条，
> 那是 `vite-plugin-vue-devtools` 的浮层（`.vue-devtools__panel`），
> 只在 `pnpm dev` 下出现，生产构建没有。用 `elementsFromPoint()` 查过它的类名，
> 不是本项目的元素。按 `Alt+Shift+D` 可以关掉它。

### 2.4.6 「先建交互，后画圆」——顺序错了圆就没了（2026-10-31）

**症状**：从详情卡点「附近分析」进入分析模式后，右侧面板有数据、底部 SQL 条也对，
**但地图上没有缓冲圈**。

**原因**：`mapView.syncDrawing()` 里原来的顺序是

```js
drawing.setRadius(...)
drawing.setCenter(analysis.center)   // ← 这里把圆画出来
drawing.setTool(analysis.tool, ...)  // ← 而 setTool 判到"换了工具"就 clear()
```

进入分析模式时，`drawing` 内部 `tool` 从 `null` 变成 `'point'`，
`changed === true` → `clear()` 把刚画好的圆和圆心一起擦掉。
所以圆是"画了又被抹掉"，不是没画。

**修法**：调换顺序 —— 先把交互建好（该清就清），再画圆（画完不再被清）：

```js
drawing.setTool(analysis.tool, callbacks)   // ① 先建交互，可能触发一次 clear
drawing.setRadius(analysis.radius)          // ②
drawing.setCenter(analysis.center)          // ③ 最后画圆，不会再被清掉
```

**这类 bug 的特征**：数据层全对（`store.center` 有值、接口返回正常、面板正常），
只有地图上的图形不对 —— 说明问题在"图形层被谁清掉了"，
应该去查 `clear()` / `removeByKind()` 的调用时机，而不是查数据链路。

**实测（CDP 走完用户路径：让卡片出现 → 点「附近分析」）**：

```
点卡片之前 : kinds=[]  active=false  zoom=9
点击之后   : kinds=[circle(r=800), center]  active=true  zoom=14
             toolPanel=true  resultCard=true
             sqlBar="请求 SQL：ST_DWithin(geom::geography, 圆心, 800)·耗时 9 ms·返回 50 条"
再过 1.2s  : kinds=[circle(r=800), center]  ← 没有被后续任何操作清掉
渲染异常   : 无
```

截图：`docs/img/card-to-buffer.png`。

**D13 的关键设计决定（写下来免得以后推翻）**：

1. **没有「缓冲区」按钮**。设计稿里有 4 个按钮（点选/框选/缓冲区/测距）+ 一个半径滑杆，
   但「缓冲区」和滑杆是重复的 —— 它是「以点为中心向外扩」这个**动作**，不是**选择方式**。
   做成按钮就等于一个永远按下的死键。
2. **必须有「自由绘制」**。后端 `/api/poi/within` 吃的是**任意 WKT 多边形**，
   只给「框选」（矩形）等于把后端能力砍掉一半 —— 用户画不出弧形边界、圈不了沿江狭长地带。
   四个工具产出三种几何：点选 → 圆（`/nearby`）；自由绘制 → 任意多边形（`/within`）；
   框选 → 矩形（`/within`，矩形是特殊多边形）；测距 → 只画线不调接口。
3. **两个入口只差一个 `center`**。顶栏进来 `center=null`（等用户点地图）；
   卡片「附近分析」进来 `center` 就是那个 POI。走同一个 `analysis.enter({ center })`，
   绝不出现两套画圆/两套请求逻辑。
4. **测距不需要半径和类别**。`needsRadius` getter 控制面板里那两块置灰，
   避免"量个距离还要选类别"的荒诞感。
5. **红色 = 分析态**。徽章「武」转红、分析模式徽章红、工具按钮红边、半径滑杆红，
   一套颜色语义贯穿到底；退出后全部回蓝。

### 2.4.7 D13 验收台账（2026-10-31 收尾）

> 核对方式：`roadmap` §8 的判据逐条实测（本仓库未接 git，改用接口实跑 + 文件时间戳）。

| §8 判据 | 实测证据 | 结果 |
|---|---|---|
| 点地图能落中心 | 分析模式下 `clickToGid` 让位；点选工具 `stopClick: true` 后由 `drawing.js` 接管 | ✅ |
| 画出 800 m 圆 | `syncDrawing()` 顺序 `setTool → setRadius → setCenter`；`BUFFER_ZOOM=14` 让 800 m ≈ 84 px | ✅ |
| 数字与 SQL 一致 | `114.3687, 30.6316, 800` → count **83**（school 25 / hospital 36 / mall 18 / park 4），最近 **82 m**（gid 7185 冠佳口腔） | ✅ |
| 返回条数可解释 | `SqlHintBar` 并列「raw count 83」与列表 top-5，tooltip 说明两者为何不等 | ✅ |
| 百分比合计 100 | 11 条与 6 条两组真实反例复算，修前 99/101，修后恒 100 | ✅ |

**额外交付（不在 D13 排期里）**：`/api/poi/within` 任意多边形统计（§5.5）。
圆形只是多边形的特例，所以 D14/D15 的容量被提前吃掉一部分。

**节奏账**：计划 D5→D13 是 8 个工作日；实际 2026-10-27 → 10-31 用 **5 个自然日**（约 1.6×）。
后端多交付 4 个接口（7 个 vs 计划的 3 个业务接口）。

---

### 2.4.8 D14–D15 候选细项（2026-10-31 拟定，**未开工**）

原文把 D13–D15 并成一个「缓冲区分析」格子，D14/D15 是空白。两条路线 **二选一**：

**路线 A：把缓冲区做「能用」（守正）**

| 项 | 内容 | 验收判据 |
|---|---|---|
| A1 | 多点对比：地图上可同时保留 2–3 组中心 + 圆，各自出统计 | 切换不回退已有结果；面板可横向对比 |
| A2 | 结果列表可排序 / 筛选（按距离、按分类） | 排序后 flyTo 仍指向正确设施 |
| A3 | 分析记录落库（`analysis_record`：wkt / radius / count / 时间） | 刷新页面能恢复上次分析 |

**路线 B：跳过 D14/D15，直接开 D16（抢进度）**

用 `grid_500m` 表 + GeoServer 新图层 + 前端分级，先把「覆盖率热力」做出来。
D13 已有的 `/within` + `/stats/coverage` 足够支撑，不需要新后端能力。

> **建议选 B**：项目要的是「一张能讲清可达性的图」，A1/A2 属于手感优化，不加分；
> A3 可以留到 D19–D20 打磨阶段捎带。

---

### 2.5 可以一直不做的（先不做）

| 组件 | 替代方案 |
|---|---|
| `SearchBox.vue` | 用 WFS 的 `CQL_FILTER` 或直接调后端 |
| `Toast.vue` / `LoadingOverlay.vue` | 先用 `console` / OL 自带的 fade |
| `BaseMapSwitch.vue` | ~~先写死影像底图~~ **已不必做**（2026-10-31）：由 `TopBar.vue` 的两个按钮 + `map/basemaps.js` 换 source 实现，见 §4.1 |

---

## 3. 目录结构（目标态）

```
src/
├── main.js                 createApp + pinia（router 目前是死配置，可删）
├── App.vue                 全屏容器 + <MapView/> + 面板
├── styles/
│   ├── main.css            reset + 高度链（html/body/#app 100%）
│   └── panels.css          面板皮肤
├── map/
│   ├── useMap.js           建图/销毁（onMounted / onBeforeUnmount）
│   ├── wms.js              ImageWMS 工厂（admin / poi）
│   ├── layers.js           图层注册表
│   └── basemaps.js         天地图 URL 工厂（tk 从 .env 读）
├── components/
│   ├── LayerPanel.vue
│   ├── PoiDetailCard.vue
│   ├── AnalysisToolbar.vue   (D13)
│   ├── AnalysisResult.vue    (D13)
│   └── LegendPanel.vue       (D19)
├── composables/
│   ├── useLayerSync.js
│   ├── useFeatureInfo.js     (D12)
│   └── useBufferAnalysis.js  (D13)
└── stores/
    ├── layers.js
    ├── selection.js          (D12)
    └── analysis.js           (D13)
```

---

## 4. WMS 图层参数（已验证可用）

`poi` 图层：

```js
{
  url: '/geoserver/wuhan/wms',        // 走 Vite proxy，避开 CORS
  params: {
    LAYERS: 'wuhan:poi',
    STYLES: 'wuhan:poi_icons',         // ★ 必须带工作空间前缀
    VERSION: '1.1.1',
    FORMAT: 'image/png',
    TRANSPARENT: true,                 // ★ 不加会盖住底图
  },
  serverType: 'geoserver',
  ratio: 1.5,
}
```

`admin_area` 图层：同上，`LAYERS: 'wuhan:admin_area'`、`STYLES: ''`、`opacity: 0.7`。

**图层顺序**：底图影像 → 影像注记 → 区划 → POI（最后 `addLayer` 的在上层）。
`map.layers` 数组的顺序就是覆盖顺序，后加入的压在上面；初始化数组与后续 `addLayer` 共用这一条规则。

### 4.1 天地图底图：矢量 / 影像 成组切换（2026-10-31）

天地图把底图和注记拆成两个独立服务，且**必须成组配对**：

| `store.baseMap` | 底图服务 | 注记服务 | 实测（z=10 武汉一带） |
|---|---|---|---|
| `vector` | `vec_w` | `cva_w` | 200 / image/png / 20.7 KB + 5.5 KB |
| `image` | `img_w` | `cia_w` | 200 / **image/jpg** / 22.3 KB + 15.1 KB |

**同一把 tk 覆盖四种服务**，不用另外申请。配错的后果不是报错，而是「影像图上叠矢量注记」——
字和地物对不上，看着像坐标偏移，实际只是注记层配错了。

**架构**：仍只保留 **2 个图层槽位**（`base` / `anno`），切换底图时给它们**换 source**，
而不是建 4 个图层再按 `visible` 互斥。理由是 store / 面板 / watchController 已经把「底图」
抽象成一个槽位，影像还是矢量只是槽位的**取值**；4 层方案会把槽位拆回「一层一个开关」，是退步。

| 文件 | 职责 |
|---|---|
| `src/map/basemaps.js` | 4 个服务的 URL 表 + `createBaseSource(kind)` / `createAnnoSource(kind)` / `baseMapLabel(kind)` |
| `src/stores/layers.js` | `baseMap: 'vector' \| 'image'`（默认 vector，与初始观感一致）+ `setBaseMap()` 白名单校验 |
| `src/view/mapView.vue` | 按当前值建初始 source；`watch(store.baseMap)` 里对两个图层各 `setSource()` 一次 |
| `src/App.vue` | `v-model:baseMap` 走 computed 桥接；面板里底图行的名字跟着变 |

**三个坑（都实测过）**：

1. **改完 `.env` 必须重启 dev server**。实测一次写两行 `.env` 时 Vite 只重读了一次，
   结果只加载到 `VITE_TDT_IMG`、缺 `VITE_TDT_CIA`，影像注记变 `undefined` 且**前端不报错**。
   核验办法：`GET /src/map/basemaps.js`，看响应顶部注入的 `import.meta.env = {...}` 里四个键齐不齐。
2. **`import.meta.env` 是构建期静态替换的**，键名写死字面量（`import.meta.env.VITE_TDT_IMG`）。
   变量拼键名属于碰运气。构建后可在 bundle 里查 `vec_w / cva_w / img_w / cia_w` 各出现一次来验证。
3. **切换用 `layer.setSource(new XYZ(...))`，不要 `source.setUrl()`**：新 source 的瓦片缓存
   天然干净，不会残留上一套底图的瓦片。`setUrl` 之后忘了 `refresh()` 会出现半新半旧的地图。

`watch(store.baseMap)` **不加 `immediate`**：初始 source 已在建图层时按当前值建好，
加了会白建两轮 source、白发两轮瓦片请求。

### 4.2 详情卡三宫格的指标口径（2026-10-31）

| 格子 | 来源 | 算法 |
|---|---|---|
| 周边设施 | `/api/poi/nearby` → `count` | `count - 1`（剔除自身） |
| 同类最近 | `nearby.nearest` | 滤掉 `distanceM === 0` 后取第一条同 `category`，显示 `191 m` |
| 密度倍数 | `nearby.count` ÷ `/api/stats/coverage.perKm2` | `(count-1)/2.0106 km² ÷ 本区 perKm2`，封顶 10 倍 |

**两个必须记住的坑**：

1. **只有 `count` 可以减一，`byCategory` 不能减。**
   `count >= 1` 恒成立（圆心必在半径内），但分类计数不保证 ——
   实测用东湖水体坐标查 800m，四类全 0，减一得 **-1**。
   同类数改用 `nearest[]` 滤出自身后按类别计数。
2. **`perKm2` 是全域平均（含水域山地）**。洪山区 514 km² 里东湖占大片，
   区均仅 3.77/km²，因此各区比值普遍偏高。这是口径性质，不是 bug；
   汉南区仅 0.69/km²，故 `RATIO_MAX = 10` 封顶防止比值爆表。

**为什么叫「密度倍数」而不是「可达性指数」**：真可达性需要 2SFCA（设施服务能力 `S_j`
+ 人口分布）或路网等时圈，本项目都没有——`poi` 表无床位数/学位数，也无路网数据。
密度倍数只说明「比本区平均密多少」，名字必须诚实，答辩才不被动。

> `PoiDto` 为此补了 `adcode` 字段（第 12 个），SQL 用 `nullif(btrim(adcode),'')::integer`
> ——`poi.adcode` 是 text、`admin_area.adcode` 是 integer，且 text 可能带空格或空串。
> 实测 16016 条全部为 6 位数字，无 NULL。

### 4.3 从 raw jsonb 挖字段（零配额，2026-10-31）

**一个关键事实**：`etl/sources/amap.py` 的列表抓取传了 `extensions: "all"`，
所以**高德的详情级字段在入库时就全有了**——实测 `raw` 里 `biz_ext` / `adname` /
`business_area` / `photos` 覆盖率均 **100%**（16016/16016）。

结论：`/v3/place/detail` 的「补详情」对数据完整性**没有必要**，`detail` 列至今全 NULL、
`detail_fetched_at` 一个都没写。想多用数据，直接从 `raw` 挖即可，**零配额**。

`PoiDto` 补了 5 个字段（13–17 位）：`adname` / `businessArea` / `poiType` / `rating` / `openTime`。
前端据此删掉了原来的 `/api/areas` 边界反查（`loadAreas` + `findDistrict`，约 60 行）。

**实测覆盖率**：`adname` / `business_area` / `type` **100%**，`rating` **45%**（7181），
`open_time` **58%**（9221）。

**★ 必记的坑：同名 jsonb 键的值类型不一致**

| 键 | string | array(空 `[]`) |
|---|---|---|
| `rating` | 7181 | **8835** |
| `open_time` | 9221 | **6795** |
| `cost` | 107 | 15909 |

`->>` 对 array 会返回字符串 `"[]"`，直接 `::float8` 必报 `invalid input syntax`。
所以 SQL 必须先正则卡住：

```sql
case when raw->'biz_ext'->>'rating' ~ '^[0-9]+(\.[0-9]+)?$'
     then (raw->'biz_ext'->>'rating')::float8 end          as rating,
nullif(nullif(raw->'biz_ext'->>'open_time','[]'),'')       as open_time
```

验证方式：对全表 16016 条走 API 扫一遍，确认 **0 条出错**，
且 `rating` 有值 7181 / `open_time` 有值 9221 与 SQL 统计完全一致。

**因此删掉的 UI**：「查看详情」按钮（2026-10-31）。该按钮原本设想的用途就是
“点它 → 调高德 ID 查询补详情”，而第一层已把 `raw` 里所有详情级字段直接摊在卡片上，
按钮无剩余用途。连带删除 `.btn.primary` 样式。「附近分析」保留，等 D13 接线。

---

## 5. 后端接口契约（7 个已实现，2026-10-31）

> 原则：**键永远存在，缺值给 `null`**；不透传高德原始 JSON。

### 5.0 接口总览（D12–D13 前端按此开发）

| # | 接口 | 状态 | 参数 | 实测基线 |
|---|---|---|---|---|
| 1 | `GET /api/hello` | ✅ D5 | — | `{"message":"BE is up",...}` |
| 2 | `GET /api/ping-db` | ✅ D5 | — | `13` |
| 3 | `GET /api/areas` | ✅ D5 | — | 85166 bytes / 13 features |
| 4 | `GET /api/poi/{gid}` | ✅ D7 | path `gid` | `/api/poi/1` → 解放公园 / 3 张照片 / 12 字段 |
| 5 | `GET /api/poi/nearby` | ✅ D8 | `lon` `lat` [radius=800] [limit=5] | 114.36,30.54,800 → count 124 |
| 6 | `GET /api/poi/within` | ✅ 2026-10-31 | `wkt` [limit=20] | 三角形 → count 125 / areaKm2 5.85 |
| 7 | `GET /api/stats/coverage` | ✅ D9 | `adcode` | 420106 → total 1681 / perKm2 16.8 |

**约定**：JSON 字段**全驼峰**（`amapId` / `radiusM` / `byCategory` / `areaKm2`）；`photos` 恒为数组（无照片时 `[]`）；
HTTP 错误统一 `{timestamp,status,error,message,path}` —— `message` 里是具体原因（2026-10-31 打开
`server.error.include-message=always`，此前该字段缺失，前端只知道 400 不知道为啥）。

### 5.1 已实现（D5）

```jsonc
// GET /api/areas  —— 武汉 13 区边界（GeoJSON FeatureCollection, WGS84）
// 实测：HTTP 200 / 85166 bytes / ≈0.01s / 13 features
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "adcode": 420107,             // integer，行政区码
        "name": "青山区",
        "level": "district",
        "center": [114.3915169, 30.6364754]   // [lon, lat]，float8[]
      },
      "geometry": {                   // ★ 是对象，不是字符串（SQL 里 ST_AsGeoJSON(geom)::json）
        "type": "MultiPolygon",
        "coordinates": [/* 环 → 点 → [lon, lat] */]
      }
    }
  ]
}
```

- 返回类型：`JsonNode`（结构由 SQL 决定、geometry 多态，不适合 DTO）
- 前端消费（D12）：
  ```js
  const data = await (await fetch('/api/areas')).json();
  new GeoJSON().readFeatures(data, {
    dataProjection: 'EPSG:4326',     // 后端是 WGS84 经纬度
    featureProjection: 'EPSG:3857',  // View 是 3857，交给 OL 转换
  });
  ```
- 另有两个探针接口：`/api/hello`（Web 层）、`/api/ping-db`（返回 `13`，证数据库链路）

### 5.2 已实现（D8，2026-10-28）

```jsonc
// GET /api/poi/{gid}  —— 实测 gid=1 原样输出
{
  "gid": 1,                        // bigint → Java Long（用包装类，不是 long）
  "amapId": "B001B0IZT0",          // ★ 键是驼峰 amapId，不是 amap_id（Jackson 序列化 record 字段名）
  "name": "解放公园",
  "category": "park",              // school | hospital | mall | park（库内实测就这 4 类）
  "typecode": "110101",
  "address": "解放大道1861号",       // 100/16016 为 null
  "tel": "027-82421760",           // 7242/16016 (45%) 为 null，null 时原样输出 null
  "lon": 114.292598,               // 取自 ST_X(geom)
  "lat": 30.610841,                // 取自 ST_Y(geom)
  "photos": [                      // ★ 是 JSON 数组（不是字符串），恒存在，无照片时是 []
    "http://store.is.autonavi.com/showpic/26df2710...",
    "http://store.is.autonavi.com/showpic/ec9d8ab5...",
    "http://store.is.autonavi.com/showpic/342d282b..."
  ],
  "detailFetched": false           // ★ 驼峰；由 detail_fetched_at is not null 算；当前恒为 false
}
```

**状态码**（已实测）：

| 请求 | 返回 |
|---|---|
| `/api/poi/1` | `200` + 上述对象 |
| `/api/poi/39`（无照片） | `200`，`photos: []` |
| `/api/poi/999999999`（不存在） | `404`，`throw ResponseStatusException(NOT_FOUND)` |
| `/api/poi/abc`（非数字） | `400`，Spring 自动转换失败，服务端只打 WARN |

**实现要点（踩过的坑，D9 写 nearby/stats 时复用）**：

1. **坐标统一用 `ST_X(geom)` / `ST_Y(geom)`** —— 实测 `lon/lat` 两列与 geom **完全一致**（全表 `max_diff_m = 0`、`rows_over_1m = 0`），但 geom 是 ETL 转 WGS84 后的权威源，`lon/lat` 是冗余副本。
2. **`photos` 只取 url**：SQL 用 `jsonb_path_query_array(raw, '$.photos[*].url')::text as photos`。
   原 `raw->'photos'` 是**对象数组**（`{"url":..., "title":..., "provider":[]}`），其中 `title` 有 99.87%（35953/36000）是空数组 `[]`、仅 0.13%（47 条）是字符串（"春季"/"秋季"等），**类型不一致** —— 为 0.13% 保留 title 不值得，故只提 url。若要 title，改用 `List<Map<String,Object>>`。
3. **`photos` 需要自定义 TypeHandler**：`config/StringListTypeHandler`（jsonb 文本 → `List<String>`，空值归一成 `[]`）。MyBatis 内置没有 jsonb→List 的转换器，不写就报 `argument type mismatch`。
4. **`PoiDto` 用 record + `<constructor>` resultMap**；**DTO 字段用包装类（`Long`/`Double`/`Boolean`）而非基本类型** —— MyBatis 内部装箱成包装类，用基本类型会报 `NoSuchMethodException`。
5. ~~`adname`、`biz_ext` 未实现~~ —— **2026-10-31 已补，且比原计划省**：两者都在 `raw` jsonb 里
   （`adname` 100%、`biz_ext` 100%），**不需要 JOIN `admin_area`**。`PoiDto` 扩到 17 字段：
   `adcode` / `adname` / `businessArea` / `poiType` / `rating`(45%) / `openTime`(58%)，
   取值 SQL 见 §4.3。

### 5.3 已实现（D9，2026-10-28）

```jsonc
// GET /api/poi/nearby?lon=114.36&lat=30.54&radius=800&limit=5  —— 实测原样输出
// 圆心 114.36,30.54（武大一带）半径 800 m
{
  "count": 124,
  "center": { "lon": 114.36, "lat": 30.54 },
  "radiusM": 800.0,                    // ★ 驼峰 radiusM（不是 radius_m）
  "byCategory": {                      // ★ 驼峰；四类键恒存在，缺的补 0
    "school": 109, "hospital": 2, "mall": 10, "park": 3
  },
  "nearest": [                         // 按 distanceM, gid 排序（并列时按 gid 稳定）
    { "name": "武汉大学-教1楼",             "category": "school", "distanceM": 53.0 },
    { "name": "教育部武汉大学文科文献信息中心", "category": "school", "distanceM": 62.0 },
    { "name": "武汉大学国内合作部",          "category": "school", "distanceM": 62.0 },
    { "name": "武汉大学招生就业处组织部",     "category": "school", "distanceM": 67.0 },
    { "name": "武汉大学-审计处",            "category": "school", "distanceM": 77.0 }
  ]
}
```

**参数**：

| 参数 | 必填 | 默认 | 校验 |
|---|---|---|---|
| `lon` | ✅ | — | **目前未校验**（技术债，见下） |
| `lat` | ✅ | — | **目前未校验** |
| `radius` | ❌ | `800` | `(0, 5000]`，越界 400 |
| `limit` | ❌ | `5` | `(0, 50]`，越界 400 |

**状态码**（已实测）：

| 请求 | 返回 |
|---|---|
| `?lon=114.36&lat=30.54&radius=800` | `200`，`count: 124` |
| `?lon=114.40&lat=30.56&radius=800`（东湖水域） | `200`，`count: 0`、`byCategory` 四类全 0、`nearest: []` |
| 只传 `lon/lat` | `200`，`radiusM: 800.0`（默认值生效） |
| `radius=-5` | `400` |
| 缺 `lon` | `400` |

**实现要点**：

1. **`count` 由 `byCategory` 求和，不单独查 `count(*)`** —— 保证 `count == ΣbyCategory`，前端做饼图分子分母天然一致；并发写入时也不会出现两者不等。
2. **`byCategory` 先铺四类为 0，再用实际结果覆盖**（`LinkedHashMap` 保持固定顺序）—— 不需要判断"缺了哪个"，新增类目也能自动带出。
3. **`order by "distanceM", gid`** —— 加 `gid` 保证距离并列时顺序稳定，否则 D10 的测试会偶发失败。
4. **SQL 别名 `as "distanceM"` 必须带双引号** —— PG 会把不加引号的标识符转小写（`distancem`），`resultType` 就取不到列；`order by` 里同理。
5. **`limit #{limit}` 在 PG 驱动下可用**（`limit $1`），不需要改成 `${limit}`。

**nearby 技术债（D11 补）**：`lon`/`lat` 未做范围校验，传 `lon=999&lat=888` 会返回 `count: 0` 而不是 400。

### 5.4 已实现（D10，2026-10-29）

```jsonc
// GET /api/stats/coverage?adcode=420106  —— 实测原样输出（武昌区）
// ★ 参数是 adcode（integer），不是 district！中文参数在 PowerShell 下会撞编码坑
{
  "adcode": 420106,
  "district": "武昌区",
  "total": 1681,
  "areaKm2": 100.06,               // DataV 边界是陆域轮廓，不是含水域的行政面积
  "perKm2": 16.8,                  // Java 里用 BigDecimal 算：1681 / 100.06，保留 2 位
  "byCategory": { "school": 525, "hospital": 590, "mall": 447, "park": 119 }
}
```

**状态码**（已实测）：

| 请求 | 返回 |
|---|---|
| `?adcode=420106` | `200` + 上述对象 |
| `?adcode=999999`（不存在） | `404`（`statByAdcode` 返回 null → `ResponseStatusException`） |
| `?adcode=abc`（非数字） | `400`（Spring 类型转换拦截） |

**实现要点**：

1. **参数用 `adcode` 而非区名** —— 无编码问题、天然唯一；前端从 `/api/areas` 的 feature.properties 就能拿到每个区的 `adcode`。
2. **JOIN 必须 `p.adcode = a.adcode::text`** —— `poi.adcode` 是 text，`admin_area.adcode` 是 integer。
3. **`total` 用 `count(p.gid)` 而不是 `count(*)`** —— 语义一致（`left join` 空匹配时 null 不计数）。分类四项用 `count(*) filter (...)` 在当前数据下结果相同（`null = 'school'` 为 NULL 不计数），为一致性建议统一写 `count(p.gid)`。
4. **`perKm2` 在 Java 算，不在 SQL 算** —— `BigDecimal.divide(x, 2, HALF_UP)`；PG 的 `round(double, int)` 不存在（需 `::numeric`），而且放 Java 更可测。
5. **`areaKm2 <= 0` 要做除零保护** —— Java 的 `double / 0` 返回 `Infinity`，Jackson 序列化成 `null`，前端会静默拿到 null。

> 旧稿写 `total: 1782` / `area_km2: 305.6` / `per_km2: 5.83`，是把“含水域行政面积”当成了边界面积。若将来想用行政面积口径，需另存一份面积字段，不要用 `ST_Area(geom)`。
> 13 区 POI 实测分布：洪山1940 / 武昌1681 / 江夏1634 / 江岸1382 / 黄陂1352 / 蔡甸1336 / 汉阳1244 / 东西湖1213 / 硚口1178 / 新洲1170 / 江汉1104 / 青山582 / 汉南200。

**错误约定**：HTTP 400 参数缺失/校验失败、404 资源不存在、500 内部错误；body 是 Spring 的标准形状
`{timestamp,status,error,message,path}`，`message` 里写具体原因（2026-10-31 打开
`server.error.include-message=always` 之后才有；此前该字段整个缺失）。

### 5.5 已实现（2026-10-31）—— 不规则多边形范围统计

```jsonc
// GET /api/poi/within?wkt=POLYGON((114.35 30.53,114.38 30.52,114.37 30.56,114.35 30.53))&limit=3
// ★ wkt 必须 URL 编码（前端用 encodeURIComponent），实测编码后 84 字符
// 实测（psql 独立核对一致）：count 125 / areaKm2 5.85 / 形心 114.366667,30.536667
{
  "count": 125,                                   // = byCategory 之和，与 nearby 同一套纪律
  "areaKm2": 5.85,                                // 多边形面积，Java 里 BigDecimal 保留 2 位
  "centroid": { "lon": 114.366667, "lat": 30.536667 },
  "byCategory": { "school": 98, "hospital": 10, "mall": 14, "park": 3 },
  "items": [                                      // ★ 叫 items 不叫 nearest：多边形没有圆心，
    { "gid": 2745, "name": "武汉大学国学院(珞东一路)",         //   距离是相对【形心】算的
      "category": "school", "distanceM": 106.0 },
    { "gid": 6895, "name": "武汉大学法治文化公园(珞珈山路)",
      "category": "park",   "distanceM": 194.0 },
    { "gid": 6753, "name": "7-ELEVEn(武大枫园店)",
      "category": "mall",   "distanceM": 307.0 }
  ]
}
```

**为什么每个 item 带 `gid`**：`nearby` 的 `nearest` 不带 gid，但分析结果列表要能点回详情，
而详情接口只认 gid —— 不带就断链。

**实现要点（踩过的坑）**：

1. **`ST_Within` 没有 geography 版本** —— 写成 `ST_Within(geom::geography, poly::geography)`
   直接报 `函数 st_within(geography, geography) 不存在`。多边形判定用 **geometry**，
   `::geography` 只有 `ST_DWithin` 求米制距离时才需要。
2. **`ST_Within` / `ST_Intersects` / `ST_Contains` 对点落在面内结果完全一致**（实测都是 125），
   点没有面积，三者同义。语义上 `ST_Within(点, 面)` 最直观。
3. **坏几何不报错，返回空结果** —— 自相交多边形走 `ST_Within` 得到 0 条，
   前端会以为"这片区域没有设施"。所以必须先 `ST_IsValid` 体检，坏的明确 400。
4. **`inspectWkt` 顺带返回形心** —— 有效性、面积、形心一次查完，省一次往返。
5. **面积守卫 20000 km²** —— 一个覆盖半个中国的多边形会扫全表，是明显的攻击面。
6. **`wkt` 用 `#{wkt}` 绝不 `\${wkt}`** —— 后者是字符串拼接，等于 SQL 注入。
7. **错误提示不能直接拼 double** —— `Double.toString` 超过 1e7 变科学计数法，
   实测输出过 `polygon too large: 2.183110349E7 km²`，要用 `BigDecimal.toPlainString()`。
8. **WKT 长度卡 6000 字符**（约 300 顶点）—— Tomcat 默认请求行 8KB，
   GET 传超长 WKT 会被 Tomcat 直接拒掉（连 400 都拿不到）。真要上千顶点改成 POST + body。

**验证记录**：

| 用例 | 结果 |
|---|---|
| 三角形（武大） | 200 / count 125 / area 5.85（psql 独立核对一致） |
| 矩形（东湖水域） | 200 / count 3 / area 4.25 |
| 凹多边形 | 200 / count 406 / area 16.49（psql 独立核对一致） |
| MULTIPOLYGON | 200 / count 125 |
| 自相交多边形 | 400 `wkt is not a valid polygon` |
| `POINT` / `LINESTRING` | 400 `wkt must be POLYGON(...) or MULTIPOLYGON(...)` |
| 语法错误 | 400 `wkt cannot be parsed: …` |
| 覆盖全国的多边形 | 400 `polygon too large: 21831103.49 km², max 20000.00` |
| 缺 `wkt` / `limit` 越界 | 400 |

> **关于索引**：`ST_Within` 是 bbox-aware 函数，有 GiST 索引时会自动用。
> 但当前 16016 行 / 3876 页，优化器判定全表扫描更快（实测 69 ms），这是数据量小，不是配置错。
> 数据涨到几十万行会自动切过去。
>
> **GeoServer 的替代路径（实测可用，但没选）**：
> `WFS + CQL_FILTER=INTERSECTS(geom,SRID=4326;POLYGON(...))` 同样能拿到这 125 条（`totalFeatures=125`），
> 只要数量可加 `resultType=hits`（512 字节）。没选它的原因：① byCategory 分组得前端自己数；
> ② `wuhan:poi` 图层**没有暴露 `gid`**（GeoServer 建图层时没配主键列），拿到要素也点不回详情；
> ③ 与详情卡已用的 `/api/poi/nearby` 两套数据源，口径迟早对不上。

---

## 6. 状态设计纪律（今天踩过的坑）

| 规则 | 原因 |
|---|---|
| **OL 实例绝不进 Pinia / reactive** | Proxy 会破坏图层/要素身份，表现为"图层不显示""setOpacity 无效" |
| 地图实例用模块级单例或 `shallowRef(markRaw(...))` | 同上 |
| 建图只在 `onMounted` 里 | `setup` 阶段 DOM 还没插入，`getElementById` 为 null，OL **静默跳过** |
| `html, body, #app` 全部 `height: 100%` | 少一环 → `#map` 高度 0 → 连 WMS 请求都不发 |
| `watch` 加 `immediate: true` | 否则初始状态不同步 |
| store 里只放 `visible/opacity/selectedId` 这类**值** | 地图动作由 `useLayerSync` 单向翻译 |

---

## 7. 服务侧依赖（GeoServer）

| 资源 | 名称 | 说明 |
|---|---|---|
| 图层 | `wuhan:admin_area` | 13 区边界 |
| 图层 | `wuhan:poi` | 16,016 条 POI（数据类型 Point,4326） |
| 样式 | `wuhan:poi_icons` | SVG 图钉 + 标签 + 两级缩放（**推荐**） |
| 样式 | `wuhan:poi_badge` | 纯矢量徽章（无外部依赖，兜底用） |
| 样式 | `wuhan:poi_by_category` | 简单四色圆点（对照用） |

> 图钉依赖 URL Checks 放行 `http://localhost:8080/geoserver/www/.*`（配置文件 `data_dir/security/urlchecks.xml`）。
> 新建样式后记得 `POST /rest/reload`。

---

## 8. 里程碑验收

| 里程碑 | 判据 |
|---|---|
| **D5–D6 完成** ✅ | 后端 8094 起；`/api/areas` → 85166 bytes / 13 features；四层拆分（controller/service/mapper）完成，重构前后哈希一致 |
| **D7–D8 完成** ✅ | `/api/poi/{gid}` → 200 + `photos` 数组 + 404/400 边界；`/api/poi/nearby` → count 124 / 四类齐全 / 0 条时返回空结构 |
| **D9 完成** ✅ | `/api/stats/coverage?adcode=420106` → total 1681 / areaKm2 100.06 / perKm2 16.8 |
| **D10–D11 完成** ✅ | `mvn test` 3 用例绿（覆盖三个业务接口的主路径）—— 2026-10-29 实测 `Tests run: 3, Failures: 0, Errors: 0`；`lon/lat` 范围校验同步补齐（技术债清零）。**2026-10-31 扩到 6 用例**（新增 3 条 inside-polygon） |
| **D12 完成** ✅ | ① 页面上能看到 POI（放大出图钉）② 关闭勾选立即消失 ③ 透明度滑杆生效 ④ Network 里 `STYLES=wuhan:poi_icons` 且 200 ⑤ 拖动不卡成幻灯片 —— **2026-10-30 五条全过** |
| **D13 完成** ✅ | 点地图 → 画出 800 m 圆 → 右侧数字与 `ST_DWithin` 查询结果一致 —— **2026-10-31 实测**：`114.3687,30.6316` r=800 → count **83**、最近 82 m；多边形 `within` 额外交付（三角形 → 125 条 / 5.85 km²） |
| **D18 完成** | 500 m 格网分级渲染（覆盖率热力）+ 图例可读 |
| **D20 完成** | 30 秒录屏；README 含架构图、启动步骤、5 张截图、踩坑记录 |

---

## 9. 性能备忘

| 场景 | 现状 | 升级触发条件 |
|---|---|---|
| 每次拖动重绘一张整屏 WMS | `ImageWMS`，约 80–150 KB/次 | 明显卡 → 换 `TileWMS` + GWC 缓存 |
| 全市 16k 点在低缩放渲染 | 样式已用 `MinScaleDenominator` 收成 3 px 小点 | 仍慢 → GeoServer 侧聚合 / MVT |
| 高缩放查看细节 | 图钉 36 px + 标签 | 标签重叠 → `VendorOption conflictResolution`（已开） |

---

## 10. 数据库索引与迁移（D6 补，2026-10-27）

> 建索引和 `ANALYZE` 都不进 git，**换台机器部署时必须手动执行本节**。执行顺序即下方顺序。

### 10.1 空间索引（必需）

`poi` 原本只有 4 个 btree 索引（`gid` / `amap_id` / `category` / `adcode`），**没有任何空间索引**，
`ST_DWithin` 查询走全表扫。2026-10-27 已补：

```sql
-- ★ 必须是"表达式索引"：查询里筛的是 geom::geography，索引也要建在同一个表达式上
--   写成 GIST (geom) 用不上（PG 认为 geom ≠ geom::geography）
--   双括号 ((...)) 是 PG 建表达式索引的语法，少一层会报语法错
CREATE INDEX idx_poi_geog ON poi USING GIST ((geom::geography));

ANALYZE poi;   -- 大批量导入后必做，否则优化器用旧的行数分布
```

**实测收益**（`poi` 表 16016 行，圆心 `114.36, 30.54`，半径 800 m，`order by "distanceM", gid limit 5`）：

| 指标 | 建索引前 | 建索引后 |
|---|---|---|
| 执行计划 | `Parallel Seq Scan` | `Bitmap Index Scan on idx_poi_geog` |
| 执行时间 | 88.4 ms | **23.9 ms** |
| 读数据页 `Buffers` | 4758 | **200** |
| 规划成本 `cost` | 88388 | 1629 |

> 注意：早先误建的 `idx_poi_geom_gist ON poi USING GIST (geom)` **用不上**，已删除。
> 规则：凡 `where` 里对列做了函数/类型转换（`::`、`lower()`、`ST_Transform()`），想走索引就必须建**表达式索引**。

### 10.2 nearby 查询的标准写法（D8/D13 照此实现）

```sql
-- 分类计数：ST_DWithin 筛范围，::geography 决定单位是"米"
select category, count(*) as cnt
from poi
where ST_DWithin(
        geom::geography,
        ST_SetSRID(ST_MakePoint(114.36, 30.54), 4326)::geography,
        800)
group by category
order by cnt desc;

-- 最近 N 个：ST_DWithin 粗筛 + ST_Distance 精算（别在 where 里用 ST_Distance，会逐行精算）
-- ★ 别名写 "distanceM"（双引号保留大小写，对应 Java 的 distanceM 字段）
select name, category,
       round(ST_Distance(geom::geography,
             ST_SetSRID(ST_MakePoint(114.36, 30.54), 4326)::geography)) as "distanceM"
from poi
where ST_DWithin(geom::geography,
        ST_SetSRID(ST_MakePoint(114.36, 30.54), 4326)::geography, 800)
order by "distanceM", gid          -- ★ 加 gid：距离并列时结果才稳定（否则测试会偶发失败）
limit 5;
```

**三个必守的细节**：
- 漏 `::geography` → 单位变成"度"，`800` 会匹配全表且不报错（静默错）
- `ST_MakePoint(lon, lat)` 参数顺序是**经度在前**，写反得到南极附近的点，返回空但不报错
- `ST_MakePoint` 出来 SRID=0，必须 `ST_SetSRID(..., 4326)` 否则报 `mixed SRID geometries`

### 10.3 其他索引

| 索引 | 用途 |
|---|---|
| `poi_pkey1 (gid)` | 主键，`/api/poi/{gid}` 已可用 |
| `idx_poi_adcode (adcode)` | `/api/stats/coverage` 按区筛（`p.adcode = a.adcode::text`） |
| `idx_poi_category (category)` | 分类筛选（D12 图层类别 chips 若下沉到 BE 则用到） |

### 10.4 改表结构/导数据后

```sql
ANALYZE poi;        -- 补统计，不影响业务读写
```
`autovacuum` 会在改动量达阈值时自动跑 `ANALYZE`，手动执行只针对「一次性大批量导入」和「调试执行计划」两个场景。
