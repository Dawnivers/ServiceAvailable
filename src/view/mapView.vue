<template>
  <div id="map"></div>
</template>

<script setup>
// ── 1. import ────────────────────────────────

import Map from 'ol/Map.js';
import View from 'ol/View.js';
import TileLayer from 'ol/layer/Tile.js';
import ImageLayer from 'ol/layer/Image.js';
import 'ol/ol.css';

import XYZ from 'ol/source/XYZ.js'; //底图使用
import ImageWMS from 'ol/source/ImageWMS.js'; //WMS 使用
import { fromLonLat } from 'ol/proj'; //坐标转换

import { ref, onMounted, onBeforeUnmount } from 'vue';
import { createAdminLayer, createPOILayer } from '@/map/wms';




import { watchController,stopAll } from '@/watchControl/watchController';

// ── 3. 配置区 ────────────────────────────────
//    把会变的值集中放前面，这是你旧代码没做的（以后改起来方便）
const CONFIG = {
  LAYER: 'wuhan:admin_area', // 图层全名
  WMS_URL: '/geoserver/wuhan/wms', // 注意是相对路径！
  CENTER: [114.3, 30.55], // 经纬度
  ZOOM: 9,
};

// ── 3. 底图 ──────────────────────────────────
const tiandituLayers = new TileLayer({
  source: new XYZ({
    url: import.meta.env.VITE_TDT_VEC,
  }),
});

const MasktiandituLayers = new TileLayer({
  source: new XYZ({
    url: import.meta.env.VITE_TDT_CVA,
  }),
});

// ── 4. WMS 图层 ★ 今天的核心 ────────────────
// const adminLayer = new ImageLayer({
//   source: new ImageWMS({
//     url: CONFIG.WMS_URL/* /geoserver/wuhan/wms*/,
//     params: {
//       LAYERS:CONFIG.LAYER /*wuhan:admin_area*/,
//       VERSION: '1.1.1',
//     },
//     serverType: 'geoserver',
//     ratio:1.5 //流畅度
//   }),
//   opacity: 0.7,//透明度
// })

// ── 5. 地图 ──────────────────────────────────
const view = new View({
  center: fromLonLat(CONFIG.CENTER), //[114.30, 30.55]
  zoom: CONFIG.ZOOM, //9
});

// ── 6. 挂到 DOM ──────────────────────────────

let map = null; //别放进ref OL实例不进响应式


onMounted(() => {
  map = new Map({
    target: 'map',
    layers: [tiandituLayers, MasktiandituLayers],
    view,
  });
  const adminLayer = createAdminLayer(map, CONFIG.WMS_URL, 'wuhan:admin_area');
  const poiLayer = createPOILayer(map, CONFIG.WMS_URL, 'wuhan:poi');
  watchController([
    { id: 'base', layer: tiandituLayers },
    { id: 'anno', layer: MasktiandituLayers },
    { id: 'admin', layer: adminLayer },
    { id: 'poi', layer: poiLayer },
  ]);
});

onBeforeUnmount(() => {
  stopAll() //解除所有图层的watch
  map?.setTarget(undefined); // 官方释放方式
  map = null;
});
</script>
