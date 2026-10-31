/**
 * ════════════════════════════════════════════════════════════
 * basemaps —— 天地图瓦片源工厂
 *
 * 天地图把「底图」和「注记」拆成两个独立服务，而且两者必须成组配对：
 *
 *   vector = 矢量底图 vec_w  +  矢量注记 cva_w
 *   image  = 影像底图 img_w  +  影像注记 cia_w
 *
 * 配错的后果不是报错，而是"影像图上叠矢量注记"——字和地物对不上，
 * 看起来像坐标偏移，实际只是注记层配错了。
 *
 * 为什么单独一个文件、不塞进 wms.js：
 *   wms.js 管的是自建 GeoServer（/geoserver/wuhan/wms）；
 *   这里是外部瓦片服务（t0.tianditu.gov.cn）。两类东西别混。
 *
 * 与 store 的关系：store.baseMap 取 'vector' | 'image'，
 * 就是下面 URLS 的键，一一对应。
 * ════════════════════════════════════════════════════════════
 */

import XYZ from 'ol/source/XYZ.js';

// ── 1. 配置区 ───────────────────────────────────────────────
// ★ 键名必须写成字面量：import.meta.env.X 是构建期静态替换的，
//   用变量拼键名（import.meta.env['VITE_TDT_' + kind]）属于碰运气
const URLS = {
  vector: {
    base: import.meta.env.VITE_TDT_VEC, // vec_w
    anno: import.meta.env.VITE_TDT_CVA, // cva_w
  },
  image: {
    base: import.meta.env.VITE_TDT_IMG, // img_w
    anno: import.meta.env.VITE_TDT_CIA, // cia_w
  },
};

/** 所有可用底图，顺序即顶栏按钮顺序 */
export const BASE_MAPS = Object.keys(URLS);

/** 默认底图：矢量。与地图初始观感一致，进页面不会突然变 */
export const DEFAULT_BASE_MAP = 'vector';

/** 给图层控制面板看的显示名 */
export const BASE_MAP_LABEL = {
  vector: '天地图矢量',
  image: '天地图影像',
};

// ── 2. 内部工具 ─────────────────────────────────────────────
/** 取一对 URL；未知取值回落到默认底图，避免拼出 undefined 的瓦片地址 */
function urlsOf(kind) {
  return URLS[kind] ?? URLS[DEFAULT_BASE_MAP];
}

// ── 3. 对外工厂 ─────────────────────────────────────────────
/** 底图 source（vec 或 img） */
export function createBaseSource(kind) {
  return new XYZ({ url: urlsOf(kind).base });
}

/** 注记 source（cva 或 cia）—— 必须和底图用同一个 kind */
export function createAnnoSource(kind) {
  return new XYZ({ url: urlsOf(kind).anno });
}

/** 面板上显示的名字 */
export function baseMapLabel(kind) {
  return BASE_MAP_LABEL[kind] ?? BASE_MAP_LABEL[DEFAULT_BASE_MAP];
}
