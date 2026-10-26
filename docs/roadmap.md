# FE 功能路线与组件清单

> 面向 `FE`（Vue 3 + Vite + OpenLayers）的开发清单。
> 数据侧（采集/入库）见 `etl/spec.md`；服务侧（发布/样式）见本文 §7。
> 最后更新：2026-10-25

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
| **D5–D6** | 后端起项目 + 第一个查询接口 | `/api/hello`、`/api/areas`（13 区 GeoJSON） | Maven / JDK17 / PostGIS |
| **D8–D9** | 三个业务接口 | `/api/poi/{gid}`、`/api/poi/nearby`、`/api/stats` | D6 的 MyBatis |
| **D10–D11** | 测试 | `mvn test` 绿（3 用例） | D9 |
| **D12** | 地图交互 | 图层开关 + 透明度 + 点击弹详情 | GeoServer `wuhan:poi` ✅ |
| **D13–D15** | 缓冲区分析 | 点选 → 800 m 圆 → 统计卡片 | D9 的 `nearby` 接口 |
| **D16–D18** | 格网 + 热力图 | `grid_500m` 表 + GeoServer 新图层 + 前端分级 | PostGIS 空间函数 |
| **D19–D20** | 打磨 + 录屏 + README | 30 秒演示视频、五张截图 | 以上全部 |
| **D21** | 复盘 + 投递 | 简历 + 项目自述 | — |

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

### 2.3 D13 之后

| 文件 | 职责 |
|---|---|
| `src/components/AnalysisToolbar.vue` | 点选/框选/缓冲区/测距 + 半径 + 类别勾选 |
| `src/components/AnalysisResult.vue` | 覆盖数、分类占比、最近设施列表 |
| `src/composables/useBufferAnalysis.js` | 调 `/api/poi/nearby` + 前端画圆 |
| `src/stores/analysis.js` | `activeTool`、`radius`、`center`、`result` |

### 2.4 可以一直不做的（先不做）

| 组件 | 替代方案 |
|---|---|
| `SearchBox.vue` | 用 WFS 的 `CQL_FILTER` 或直接调后端 |
| `Toast.vue` / `LoadingOverlay.vue` | 先用 `console` / OL 自带的 fade |
| `BaseMapSwitch.vue` | 先写死影像底图，D19 再补 |

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

---

## 5. 后端接口契约（D8 实现前先对齐）

> 原则：**键永远存在，缺值给 `null`**；不透传高德原始 JSON。

### 5.0 已实现（D5）

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

### 5.1 D8 待实现

```jsonc
// GET /api/poi/{gid}
{
  "gid": 10231,
  "amap_id": "B0FF…",
  "name": "武汉大学",
  "category": "school",            // school | hospital | mall | park
  "typecode": "141201",
  "address": "武昌区珞珈山街道八一路299号",
  "adname": "武昌区",
  "tel": null,
  "lon": 114.3622,
  "lat": 30.5386,
  "photos": [],
  "biz_ext": null,
  "detail_fetched": false          // false=没查过详情；true=查过（可能为空）
}
```

```jsonc
// GET /api/poi/nearby?lon=114.36&lat=30.54&radius=800
{
  "count": 187,
  "center": { "lon": 114.36, "lat": 30.54 },
  "radius_m": 800,
  "by_category": { "school": 62, "hospital": 71, "mall": 41, "park": 13 },
  "nearest": [
    { "name": "武汉大学医院", "category": "hospital", "distance_m": 210 }
  ]
}
```

```jsonc
// GET /api/stats/coverage?district=武昌区
{
  "district": "武昌区",
  "total": 1782,
  "area_km2": 305.6,
  "per_km2": 5.83,
  "by_category": { "school": 517, "hospital": 313, "mall": 421, "park": 121 }
}
```

**错误约定**：HTTP 400 参数缺失、404 资源不存在、500 内部错误；body 统一 `{ "code": 400, "message": "…" }`。

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
| **D12 完成** | ① 页面上能看到 POI（放大出图钉）② 关闭勾选立即消失 ③ 透明度滑杆生效 ④ Network 里 `STYLES=wuhan:poi_icons` 且 200 ⑤ 拖动不卡成幻灯片 |
| **D13 完成** | 点地图 → 画出 800 m 圆 → 右侧数字与 `ST_DWithin` 查询结果一致 |
| **D18 完成** | 500 m 格网分级渲染（覆盖率热力）+ 图例可读 |
| **D20 完成** | 30 秒录屏；README 含架构图、启动步骤、5 张截图、踩坑记录 |

---

## 9. 性能备忘

| 场景 | 现状 | 升级触发条件 |
|---|---|---|
| 每次拖动重绘一张整屏 WMS | `ImageWMS`，约 80–150 KB/次 | 明显卡 → 换 `TileWMS` + GWC 缓存 |
| 全市 16k 点在低缩放渲染 | 样式已用 `MinScaleDenominator` 收成 3 px 小点 | 仍慢 → GeoServer 侧聚合 / MVT |
| 高缩放查看细节 | 图钉 36 px + 标签 | 标签重叠 → `VendorOption conflictResolution`（已开） |
