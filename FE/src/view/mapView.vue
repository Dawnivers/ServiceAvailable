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

import { pickGid } from '@/map/clickToGid';
import { pickGrid, MIN_GRID_ZOOM } from '@/map/gridInfo';
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

/**
 * 把 store 里的「工具 / 半径 / 中心」同步到绘制控制器。
 *
 * ★ 集中在一个函数里而不是拆成三个 watch 各干各的：
 *   工具切换要重建 Draw 交互，半径变化要重画圆，
 *   中心变化也要重画圆 —— 三者互相影响，分散写必然出现重复绘制。
 */
function syncDrawing() {
  if (!drawing) return;

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
    // 手绘 / 框选：拿到 4326 的 WKT，下一步直接喂 /api/poi/within
    onPolygon: ({ wkt, areaKm2 }) => analysis.setGeometry({ wkt, areaKm2 }),
    // 测距：只在地图上留一条线和长度标签
    onMeasure: ({ meters }) => analysis.setMeasure(meters),
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

  //点击图像，将点击到的poi属性存入仓库
  const selection = useSelectionStore();

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
        const props = await pickGrid(map, evt);
        // 点在没有覆盖的格子上（透明区）→ props 为 null，收起卡片即可
        if (props) gridStore.setInfo(props);
        else gridStore.clear();
      } catch (e) {
        // 把 GeoServer 的真实报错留在控制台（例如 QUERY_LAYERS 不匹配），
        // 界面上只给一句人话，不把 XML 异常甩给用户。
        console.warn('[gridInfo] 查格失败：', e);
        gridStore.setError('格子查询失败（详情见控制台）');
      }
      return;
    }

    const gid = await pickGid(map, evt);
    if (gid === null) selection.clear();
    else selection.setPoi(gid);
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
registerWatcher(
  'drawing',
  () => [analysis.active, analysis.tool, analysis.radius, analysis.center],
  syncDrawing,
  { deep: true, flush: 'post' },
);

// 换工具时把上一个工具的产物清掉（否则地图上会堆一堆图形）
registerWatcher('drawingTool', () => analysis.tool, () => {
  analysis.clearSketch();
});

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
  },
);

/**
 * 热力图关掉 / 进分析模式时，收起「点格弹窗」。
 *
 * 不收的话会留一张卡片浮在 POI 模式上，读者会以为那格还被选中着。
 * 进分析模式也要收：那时右侧整块留给结果面板，且热力图本身已被关掉。
 */
registerWatcher(
  'gridClear',
  () => [layerStore.visible.heat, analysis.active],
  ([heatOn, analyzing]) => {
    if (!heatOn || analyzing) gridStore.clear();
  },
);

onBeforeUnmount(() => {
  unByKey(clickKey);
  drawing?.destroy(); // 摘掉绘制交互和图形层
  drawing = null;
  heatLayer = null;
  stopAll(); //解除所有图层的watch
  emit('ready', null); // 通知父组件地图已销毁
  map?.setTarget(undefined); // 官方释放方式
  map = null;
});
</script>
