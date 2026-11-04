<template>
  <!-- ★ class 绑定到地图根节点：分析模式下底图/注记/区划整层去色，
       而 POI 层不挂 .ol-layer-base，所以图钉仍然是彩色 -->
  <div id="map" :class="{ 'is-analysis': analysis.active }"></div>
</template>

<script setup>
// ── 1. import ────────────────────────────────

import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import 'ol/ol.css';

import { fromLonLat } from 'ol/proj'; //坐标转换

import { onMounted, onBeforeUnmount } from 'vue';
import { createAdminLayer, createPOILayer, createHeatLayer } from '@/map/wms';
import { createBaseSource, createAnnoSource } from '@/map/basemaps';
import { HEAT_LAYER, heatStyleName } from '@/map/heatmap';

import {
  watchController,
  registerWatcher,
  stopAll,
} from '@/watchControl/watchController';
import { useLayerStore } from '@/stores/layers.js';
import { useAnalysisStore } from '@/stores/analysis.js';

import { pickPoi } from '@/map/clickToGid';
import { pickGridFeature, MIN_GRID_ZOOM } from '@/map/gridInfo';
import { createHoverController } from '@/map/hover';
import { useSelectionStore } from '@/stores/selection.js';
import { useGridStore } from '@/stores/grid.js';
import { unByKey } from 'ol/Observable.js';
import { defaults } from 'ol/control/defaults.js';
import { createDrawingController } from '@/map/drawing';

// 向父组件暴露地图实例（场景就绪 / 销毁时各发一次）
const emit = defineEmits(['ready']);

// ── 2. 配置区 ────────────────────────────────
//    把会变的值集中放前面，这是你旧代码没做的（以后改起来方便）
const CONFIG = {
  WMS_URL: '/geoserver/wuhan/wms', // 注意是相对路径！
  CENTER: [114.3, 30.55], // 经纬度
  ZOOM: 9,
};

// ── 3. 底图（天地图：矢量 / 影像 成组切换）──────
//    URL 不再写在这，统一交给 map/basemaps.js 管（vec↔cva、img↔cia 成对出现）。
//    这里只按「当前 store.baseMap」建一份初始 source；切换时由下面的 watch 换源。
const layerStore = useLayerStore();
const analysis = useAnalysisStore();
const gridStore = useGridStore();
const selectionStore = useSelectionStore();

// ★ className 是 OL 图层的正规选项（默认 'ol-layer'）。
//   给底图/注记/区划挂同一个类，CSS 就能只对它们做 grayscale，
//   而 POI 层（以及将来画的缓冲圈）保持彩色 —— 这是"地图变灰但分析要素突出"的关键。
//   若直接给 #map 加 filter，连红色缓冲圈也会一起变灰。
const BASE_LAYER_CLASS = 'ol-layer-base';

const baseLayer = new TileLayer({
  className: BASE_LAYER_CLASS,
  properties: { id: 'base' },
  source: createBaseSource(layerStore.baseMap),
});

const annoLayer = new TileLayer({
  className: BASE_LAYER_CLASS,
  properties: { id: 'anno' },
  source: createAnnoSource(layerStore.baseMap),
});

// 底图切换的监听不写在这里，统一登记在下方「6. 统一 watcher 注册」区，
// 这样 onBeforeUnmount 的 stopAll() 能一次清干净。

// ── 4. 地图 ──────────────────────────────────
const view = new View({
  center: fromLonLat(CONFIG.CENTER), //[114.30, 30.55]
  zoom: CONFIG.ZOOM, //9
});

// ── 5. 挂到 DOM ──────────────────────────────
let map = null; //别放进ref OL实例不进响应式
let clickKey = null;
let drawing = null; // 绘制控制器（分析模式才有内容）
let heatLayer = null; // 热力图层（类别切换时要 updateParams）
let hover = null; // 悬停高亮控制器（探针 + 高亮层）

/**
 * 把 store 里的「工具 / 半径 / 中心」同步到绘制控制器。
 *
 * ★ 集中在一个函数里而不是拆成三个 watch 各干各的：
 *   工具切换要重建 Draw 交互，半径变化要重画圆，
 *   中心变化也要重画圆 —— 三者互相影响，分散写必然出现重复绘制。
 */
function syncDrawing() {
  if (!drawing) return;

  // ★ 叠加开关要**最先**同步：它决定 setTool 换工具时清不清场。
  //   若放在 setTool 之后，切工具那一下还会按老状态清空一次。
  drawing.setOverlay(analysis.overlay);

  if (!analysis.active) {
    drawing.setTool(null);
    drawing.clear();
    return;
  }

  // ★ 顺序不能换：setTool 里"换工具"会 clear() 一次
  //   （上一轮画的圆/多边形要作废）。若先 setCenter 再 setTool，
  //   刚画好的缓冲圈会被这次 clear 擦掉 —— 实测「卡片点附近分析后看不见圆」就是这个。
  //   所以：先建交互（该清就清），后画圆（画完不再被清）。
  drawing.setTool(analysis.tool, {
    // 点选：落一个中心点，交给 store
    onPoint: ({ lon, lat }) => analysis.setCenter({ lon, lat }),
    // 测距：只在地图上留一条线和长度标签
    onMeasure: ({ meters }) => analysis.setMeasure(meters),
    // 叠加：每次点击追加一个「圆面」（2026-11-04 起叠加只叠圆）。
    // 字母/颜色由 store 分配，分配完 store 会触发 overlayShapes watcher，
    // 再由 applyShapeMeta 回写到地图。
    onShape: (shape) => {
      const ok = analysis.addShape(shape);
      if (!ok) {
        // 已经 6 个了（或被去重挡下）：store 没收，地图上也不该留这个面。
        // ★ 推到下一拍：Draw 是在 dispatchEvent('drawend') **之后**才把要素加进
        //   source 的，此刻 removeFeature 还删不到它（和 paintCircle 那个坑同源）。
        setTimeout(() => drawing?.applyShapeMeta(analysis.shapes), 0);
      }
    },
    // 拖半径滑杆时 drawing 实时重建圆的几何，这里只负责把新半径/面积写回 store
    onShapeRadius: ({ id, radius, areaKm2 }) => analysis.updateShapeRadius(id, radius, areaKm2),
  });

  drawing.setRadius(analysis.radius);
  drawing.setCenter(analysis.center);
}

onMounted(() => {
  map = new Map({
    target: 'map',
    // ★ 数组顺序 = 覆盖顺序（后面的压前面的）：底图 → 注记 → 区划 → POI
    layers: [baseLayer, annoLayer],
    view,
    // 底部中间留给统计条，OL 默认控件会压在上面
    // 旋转按钮挪到右边、版权信息挪到左下，避免和我们的三个面板抢位置
    controls: defaults({ rotate: false, attribution: false }),
  });

  const adminLayer = createAdminLayer(
    map,
    CONFIG.WMS_URL,
    'wuhan:admin_area',
    'admin',
    BASE_LAYER_CLASS, // ★ 区划也跟着变灰：它是"地图的一部分"，不灰就永远看着彩色
  );
  // ★ 热力层必须建在 POI 之前：
  //   同 zIndex 时 OL 按「加入顺序」决定压盖，后加的在上面。
  //   热力图是"面"、POI 是"点"，点必须浮在面之上，否则图钉被半透明色块压暗。
  heatLayer = createHeatLayer(
    map,
    CONFIG.WMS_URL,
    HEAT_LAYER,
    'heat',
    heatStyleName(layerStore.heatCategory),
    BASE_LAYER_CLASS, // ★ 跟底图一起变灰：分析模式下不该和红色缓冲圈抢视觉
  );
  const poiLayer = createPOILayer(map, CONFIG.WMS_URL, 'wuhan:poi', 'poi');

  watchController([
    { id: 'base', layer: baseLayer },
    { id: 'anno', layer: annoLayer },
    { id: 'admin', layer: adminLayer },
    { id: 'heat', layer: heatLayer },
    { id: 'poi', layer: poiLayer },
  ]);

  // 绘制控制器：分析图形单独一层，压在最上面（zIndex 100）
  drawing = createDrawingController(map);

  // 悬停高亮：热力图格子描边 / POI 光圈 + 名称。
  // 它是 ImageLayer（位图）唯一能"有反馈"的办法 —— 探针问服务器要几何，再自己画。
  // ★ 模式用 resolve 回调现读 store，不走 watcher：
  //   少一次状态跳转，就不会出现"watcher 没触发 → 悬停全哑"这种难查的问题。
  hover = createHoverController(map, {
    resolve() {
      if (analysis.active) return null; // 分析模式下鼠标是在选中心 / 量距离
      if (layerStore.visible.heat) return 'grid';
      if (layerStore.visible.poi) return 'poi';
      return null;
    },
    // 悬停标签要跟热力图当前类别一致（全部 / 学校 / 医院 / 商场 / 公园）
    category: () => layerStore.heatCategory,
  });

  //点击图像，将点击到的poi属性存入仓库
  const selection = selectionStore;

  clickKey = map.on('singleclick', async (evt) => {
    // ★ 分析模式下不查任何详情：
    //   这一下点击是"选分析中心"或"落测距点"，不是"看设施/看格子"
    if (analysis.active) return;

    // ★ 热力图优先：它开着的时候用户点的是"面"（格子），不是"点"（设施）。
    //   两者在 store 里互斥，所以不会冲突；写成热力优先是为了表达意图。
    //   pickGrid 内部会再判一次图层可见性（看不见格子就别弹卡片）。
    if (layerStore.visible.heat) {
      selection.clear(); // 别让 POI 卡和格子卡同时存在

      // ★ 低缩放下不给点：一格才 1–2 像素，而且还点不准。
      //   实测 zoom 9 时 GetFeatureInfo 返回的候选格子可能根本不在点击位置
      //   （101px 窗口有 30 km 宽，服务端按 FEATURE_COUNT 截断）。
      //   与其返回错数据，不如提示放大。
      const zoom = map.getView().getZoom() ?? 0;
      if (zoom < MIN_GRID_ZOOM) {
        gridStore.setHint(
          `请放大到街区级再点格子（当前 z${zoom.toFixed(1)}，需 ≥ z${MIN_GRID_ZOOM}）`,
        );
        return;
      }

      gridStore.setLoading(true);
      try {
        // ★ 用 pickGridFeature 而不是 pickGrid：选中态要画边框，
        //   需要 geometry；只拿 properties 画不出来。
        const hit = await pickGridFeature(map, evt);
        if (hit) {
          gridStore.setInfo(hit.properties);
          hover?.setSelected(hit, 'grid'); // 选中：常驻主色边框
        } else {
          // 点在格网范围外（市界之外）—— 回到引导态，别把卡片留成一片白
          gridStore.setHint('这一下点在格网范围外，请点击彩色格子');
          hover?.clearSelected();
        }
      } catch (e) {
        // 把 GeoServer 的真实报错留在控制台（例如 QUERY_LAYERS 不匹配），
        // 界面上只给一句人话，不把 XML 异常甩给用户。
        console.warn('[gridInfo] 查格失败：', e);
        gridStore.setError('格子查询失败（详情见控制台）');
      }
      return;
    }

    // POI 分支：同样要拿整条要素，选中态才能画光圈
    const hit = await pickPoi(map, evt);
    const gid = hit?.id ? Number(String(hit.id).split('.').pop()) : null;

    if (gid === null || !Number.isInteger(gid)) {
      selection.clear();
      hover?.clearSelected();
    } else {
      selection.setPoi(gid);
      hover?.setSelected(hit, 'poi');
    }
  });

  // 地图就绪后通知父组件（比例尺组件需要 map 实例）
  // ★ 传出去的必须是原始实例，父组件那边用 shallowRef 接，别进 reactive
  emit('ready', map);
});

// ── 6. 统一 watcher 注册 ─────────────────────
//     ★ 全项目的 watch 都在 watchControl/watchController.js 里注册，
//       这里只写「值 → 地图动作」，不直接调 vue 的 watch()。
//       好处：onBeforeUnmount 里 stopAll() 能一次清干净，
//       要临时停某一个也用 stopById(标签)，不用满文件找。

/**
 * 悬停/选中的"清场"信号。
 *
 * ★ 模式本身不需要同步 —— hover 内部每次 pointermove 会现读 resolve()。
 *   这里只做一件事：状态突变时立刻擦掉残留的高亮与选中框
 *   （比如正悬停着一个光圈就点「分析工具」，不能让圈留在那儿）。
 */
registerWatcher(
  'hoverReset',
  () => [analysis.active, layerStore.visible.heat, layerStore.visible.poi],
  ([analyzing, heatOn, poiOn]) => {
    hover?.reset();
    // 关热力图 / 进分析模式 → 选中框也该收掉，否则会浮在一张不相干的图上
    if (analyzing || (!heatOn && !poiOn)) hover?.clearSelected();
  },
);

/**
 * 格子卡被清空（点空白 / 点 ✕ / 切走）→ 收掉格子选中框。
 * ★ 只在热力图可见时生效：POI 模式下 hasInfo 恒为 false，
 *   不加这个条件会把 POI 的选中光圈一起擦掉。
 */
registerWatcher(
  'gridSelection',
  () => [layerStore.visible.heat, gridStore.hasInfo],
  ([heatOn, hasInfo]) => {
    if (heatOn && !hasInfo) hover?.clearSelected();
  },
);

/**
 * POI 详情卡被关掉（selection.poi 变 null）→ 收掉 POI 选中光圈。
 *
 * ★ store 里存的是 `poi` 对象，没有 `gid` 字段 —— 别照直觉写 selection.gid，
 *   那样 watcher 永远取到 undefined，一次都不会触发。
 * ★ 加 `visible.poi` 条件：热力图模式下 selection 本来就是空的，
 *   不加这一层，点格子时前面的 selection.clear() 会把刚设好的格子选中框擦掉。
 */
registerWatcher('poiSelection', () => selectionStore.poi, (poi) => {
  if (!poi && layerStore.visible.poi) hover?.clearSelected();
});

registerWatcher(
  'base',
  () => layerStore.baseMap,
  (kind) => {
    // ★ 必须成组换（vec 配 cva、img 配 cia），否则就是"影像图上叠矢量注记"
    // ★ 用 setSource(新对象) 而不是 setUrl + refresh：
    //   新 source 的瓦片缓存天然干净，不会残留旧底图的瓦片
    baseLayer.setSource(createBaseSource(kind));
    annoLayer.setSource(createAnnoSource(kind));
  },
);

// 进入/退出分析模式、换工具、拖滑杆、卡片带中心进来 —— 都走这一条同步
// ★ overlay 也在这里：它决定 setTool 换工具时清不清场，必须和 setTool 同一拍
registerWatcher(
  'drawing',
  () => [analysis.active, analysis.tool, analysis.radius, analysis.center, analysis.overlay],
  syncDrawing,
  { deep: true, flush: 'post' },
);

// 换工具时把上一个工具的产物清掉（否则地图上会堆一堆图形）
// ★ 叠加模式由 store 的 clearSketch 自己判断：那种模式下换工具**不清面**，
//   否则画到第 3 个想换个画法，前两个就没了。
registerWatcher('drawingTool', () => analysis.tool, () => {
  analysis.clearSketch();
});

/**
 * 叠加面列表变化 → 同步到地图。
 *
 * 三件事一次做完（见 drawing.applyShapeMeta）：
 *   ① 面板里删掉的面从地图上移除
 *   ② 剩下的更新字母与颜色（删掉中间一个后，后面的会重排 A/B/C）
 *   ③ 新加的面补上颜色
 * ★ 必须 deep：改 color/label 是**改对象属性**，浅监听看不到。
 */
registerWatcher(
  'overlayShapes',
  () => analysis.shapes,
  (list) => drawing?.applyShapeMeta(list),
  { deep: true, flush: 'post' },
);

/** 面板里点中某个面 → 高亮 + 镜头飞过去（焦点变化才动镜头，避免抖动） */
registerWatcher(
  'overlaySelected',
  () => analysis.shapeSelected,
  (id) => drawing?.focusShape(id ?? null),
);

/**
 * 哪个圆「还可以用半径滑杆调」。
 * ★ store 是唯一真相：画完一个圆它成为 active，画下一笔（圆或多边形）就顶掉。
 *   drawing 只负责把 active 标记刷到要素上（虚线 = 可调，实线 = 已锁定）。
 */
registerWatcher(
  'overlayActiveShape',
  () => analysis.activeShapeId,
  (id) => drawing?.setActiveShape(id ?? null),
);

/**
 * 叠加结果几何 → 画到「按重叠度着色」的那一层。
 * ★ 后端 ST_AsGeoJSON 出来是 4326，drawing 里会转 3857；
 *   而悬停高亮那边恰恰相反（几何跟着请求的 SRS 走，不能再转），别写混。
 */
registerWatcher(
  'overlayResult',
  () => analysis.overlayResult,
  (r) => {
    if (r?.geometry?.features?.length) drawing?.setOverlayResult(r.geometry);
    else drawing?.clearOverlayResult();
  },
  { flush: 'post' },
);

/**
 * 路网等时圈 → 画「可达面 + 可达路网」。
 *
 * ★ 为什么放在 watcher 而不是请求回调里直接调 drawing：
 *   全项目的「store 值 → OL 动作」都走这里，组件卸载时 stopAll() 才清得干净。
 * ★ store 里 setCenter 会先 clearIsochrone()，所以换点时这里会收到 null
 *   → 先清场，等慢请求（2–3 s）回来再画新的，中间不会闪旧面。
 */
registerWatcher(
  'isochrone',
  () => analysis.isochrone,
  (data) => drawing?.setIsochrone(data ?? null),
  { flush: 'post' },
);

/**
 * 点选后把镜头拉到「缓冲圈看得见」的级别。
 *
 * ★ 为什么必须有这一步：zoom 9 时分辨率约 305 m/px，
 *   800 m 半径的圆只有 2.6 像素 —— 物理上就看不见，不是样式问题。
 *   zoom 14 时约 9.5 m/px，半径约 84px，一眼能看清范围。
 *
 * 只在当前缩放比目标更远时才动镜头：用户已经放大到 16 了，
 * 就不该被"拉回去"。
 */
const BUFFER_ZOOM = 14;

registerWatcher('bufferZoom', () => analysis.center, (c) => {
  if (!c || !map) return;
  const current = map.getView();
  if ((current.getZoom() ?? 0) >= BUFFER_ZOOM) return;
  current.animate({
    center: fromLonLat([c.lon, c.lat]),
    zoom: BUFFER_ZOOM,
    duration: 520,
  });
});

/**
 * 热力图类别切换：只改 WMS 的 STYLES 参数，不重建图层。
 *
 * ★ 用 updateParams 而不是 setSource：
 *   updateParams 只重发一次 GetMap 请求，且是「合并」——LAYERS / TRANSPARENT
 *   等其它参数原样保留；setSource 会重建整个 source，视觉上会闪一下白，
 *   瓦片缓存也全丢。
 * ★ 必须先判空：registration 在 setup 阶段就执行，
 *   而 heatLayer 在 onMounted 里才创建；这中间若状态变化会读到 null。
 */
registerWatcher(
  'heat',
  () => layerStore.heatCategory,
  (key) => {
    if (!heatLayer) return;
    heatLayer.getSource().updateParams({ STYLES: heatStyleName(key) });
    // 选中框上的标签也要跟着换数字（选了学校就显示 19，不是 176）
    hover?.refreshSelected();
  },
);

/**
 * 点格卡片的「空态 / 清空」都由这一条 watcher 管。
 *
 * 三件事：
 *   ① 热力图关掉 或 进分析模式 → 清空（否则留一张卡片浮在 POI 模式上，
 *      读者会以为那格还被选中着；分析模式下右侧整块要给结果面板）
 *   ② 热力图刚打开、还没选格子 → 立刻弹一张**引导卡**
 *      （不提示的话没人知道格网可以点，点选交互等于藏起来了）
 *   ③ 用户点了格网范围外的空白 → 回到引导态，而不是留一片白
 *
 * ★ 依赖里带 hasInfo：点中格子后 hasInfo 变 true，这条 watcher 会被触发一次，
 *   但因为 info 已存在，两个分支都不动作 —— 不会把刚点出来的卡片又清掉。
 */
registerWatcher(
  'gridState',
  () => [layerStore.visible.heat, analysis.active, gridStore.hasInfo],
  ([heatOn, analyzing, hasInfo]) => {
    if (!heatOn || analyzing) {
      gridStore.clear();
      return;
    }
    if (!hasInfo) {
      gridStore.setHint('点击任意格子，查看该格 800 m 步行圈内的设施统计');
    }
  },
  // immediate：万一将来做了「记住上次图层状态」，进来就是开着热力图，
  // 也要立刻出引导卡；初始 heatOn=false 时这个回调只是清空，无害。
  { immediate: true },
);

onBeforeUnmount(() => {
  unByKey(clickKey);
  drawing?.destroy(); // 摘掉绘制交互和图形层
  drawing = null;
  hover?.destroy(); // 摘掉 pointermove 监听与高亮层
  hover = null;
  heatLayer = null;
  stopAll(); //解除所有图层的watch
  emit('ready', null); // 通知父组件地图已销毁
  map?.setTarget(undefined); // 官方释放方式
  map = null;
});
</script>
