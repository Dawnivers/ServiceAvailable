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

import { onMounted, onBeforeUnmount, watch } from 'vue';
import { createAdminLayer, createPOILayer } from '@/map/wms';
import { createBaseSource, createAnnoSource } from '@/map/basemaps';

import { watchController, stopAll } from '@/watchControl/watchController';
import { useLayerStore } from '@/stores/layers.js';
import { useAnalysisStore } from '@/stores/analysis.js';

import { pickGid } from '@/map/clickToGid';
import { useSelectionStore } from '@/stores/selection.js';
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

// 底图切换：一个值 → 两个图层同时换源
//   ★ 必须成组换（vec 配 cva、img 配 cia），否则就是"影像图上叠矢量注记"
//   ★ 不加 immediate：初始 source 在上面建图层时已经按当前 baseMap 建好了，
//     加了会白建两轮 source、白发两轮瓦片请求
//   ★ 用 setSource(新对象) 而不是 setUrl + refresh：
//     新 source 的瓦片缓存天然干净，不会残留旧底图的瓦片
watch(
  () => layerStore.baseMap,
  (kind) => {
    baseLayer.setSource(createBaseSource(kind));
    annoLayer.setSource(createAnnoSource(kind));
  },
);

// ── 4. 地图 ──────────────────────────────────
const view = new View({
  center: fromLonLat(CONFIG.CENTER), //[114.30, 30.55]
  zoom: CONFIG.ZOOM, //9
});

// ── 5. 挂到 DOM ──────────────────────────────
let map = null; //别放进ref OL实例不进响应式
let clickKey = null;
let drawing = null; // 绘制控制器（分析模式才有内容）

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
  const poiLayer = createPOILayer(map, CONFIG.WMS_URL, 'wuhan:poi', 'poi');

  watchController([
    { id: 'base', layer: baseLayer },
    { id: 'anno', layer: annoLayer },
    { id: 'admin', layer: adminLayer },
    { id: 'poi', layer: poiLayer },
  ]);

  // 绘制控制器：分析图形单独一层，压在最上面（zIndex 100）
  drawing = createDrawingController(map);

  //点击图像，将点击到的poi属性存入仓库
  const selection = useSelectionStore();

  clickKey = map.on('singleclick', async (evt) => {
    // ★ 分析模式下不查 POI 详情：
    //   这一下点击是"选分析中心"或"落测距点"，不是"看设施"
    if (analysis.active) return;

    const gid = await pickGid(map, evt);
    if (gid === null) selection.clear();
    else selection.setPoi(gid);
  });

  // 地图就绪后通知父组件（比例尺组件需要 map 实例）
  // ★ 传出去的必须是原始实例，父组件那边用 shallowRef 接，别进 reactive
  emit('ready', map);
});

// 进入/退出分析模式、换工具、拖滑杆、卡片带中心进来 —— 都走这一条同步
watch(
  () => [analysis.active, analysis.tool, analysis.radius, analysis.center],
  syncDrawing,
  { deep: true, flush: 'post' },
);

// 换工具时把上一个工具的产物清掉（否则地图上会堆一堆图形）
watch(
  () => analysis.tool,
  () => {
    analysis.clearSketch();
  },
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

watch(
  () => analysis.center,
  (c) => {
    if (!c || !map) return;
    const view = map.getView();
    if ((view.getZoom() ?? 0) >= BUFFER_ZOOM) return;
    view.animate({
      center: fromLonLat([c.lon, c.lat]),
      zoom: BUFFER_ZOOM,
      duration: 520,
    });
  },
);

onBeforeUnmount(() => {
  unByKey(clickKey);
  drawing?.destroy(); // 摘掉绘制交互和图形层
  drawing = null;
  stopAll(); //解除所有图层的watch
  emit('ready', null); // 通知父组件地图已销毁
  map?.setTarget(undefined); // 官方释放方式
  map = null;
});
</script>
