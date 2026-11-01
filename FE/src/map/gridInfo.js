import { probeFeature } from './probe.js';
import { HEAT_LAYER } from './heatmap.js';

/**
 * ════════════════════════════════════════════════════════════
 * gridInfo —— 点/悬停热力图某个格子，取该格的统计属性与几何
 *
 * ★ 走的是 WMS 的 GetFeatureInfo，不是 WFS。
 *   热力图是 ImageLayer + ImageWMS（服务器渲好的整屏 PNG），
 *   浏览器手里没有 Feature，`forEachFeatureAtPixel` 拿不到任何东西。
 *   只能回头问服务器：「你刚画的那张图上，我点的这个像素是哪个格子？」
 *   这正是 GetFeatureInfo 的语义。
 *
 *   HTTP 细节（非 JSON 响应、挑包含点、坐标参考系）都在 map/probe.js，
 *   本文件只管**热力图特有**的两件事：查询参数、以及缩放门槛。
 *
 * ★ getFeatureInfoUrl 不用你自己算像素。它的做法（ol/source/wms.js:218）是：
 *     以「点击坐标 + 当前 resolution」构造一个 101×101 像素的查询窗口
 *     （常量 GETFEATUREINFO_IMAGE_SIZE = [101, 101]），现推 BBOX / WIDTH / HEIGHT，
 *     再把点击点换算成窗口内的 X/Y —— 因为居中，恒为 (50, 50)。
 *
 *   所以两个常见误解要说清：
 *     · 与图层上一次出图的 bbox 无关。它不读 source 的缓存，
 *       哪怕图层从没请求过图，也能拼出一条合法 URL。
 *     · 与 source 的 ratio(1.5) 无关。ratio 只影响 GetMap 出的图多大，
 *       而这里的 width/height 恒为 101×101，由 resolution 推出来，不用乘 1.5。
 *
 *   resolution 在这里的唯一作用：把「地图单位」换算成「像素」
 *     x = (coordX - bboxLeft) / resolution
 *     y = (bboxTop - coordY) / resolution
 * ════════════════════════════════════════════════════════════
 */

const PARAM = {
  QUERY_LAYERS: HEAT_LAYER, // 只有点这个图层上的像素才有用
  FEATURE_COUNT: 8, // 低缩放时一个像素能压住好几个格子，多要几个回来再筛
  FI_POINT_TOLERANCE: 0, // 只查像素下那一点，不要邻近（默认容差会扩大搜索区）
};

/**
 * 点格子的最低缩放级别。
 *
 * ★ 为什么必须设这个门槛（实测，2026-11-01）：
 *   同一个坐标（江汉路格心）在不同缩放下，GetFeatureInfo 的结果会不一样：
 *
 *     zoom  1px 代表   返回候选数   是否命中正确格子
 *      9     305.7 m      8 个       ❌ 返回的 8 个全在点击点西侧 2 格
 *     10     152.9 m     6–8 个      ⚠️ 本次 3/3 命中，但候选已接近上限，可能截断
 *     11      76.4 m     1–2 个      ✅
 *     12–14   38–9.6 m   1–2 个      ✅
 *
 *   原因：GetFeatureInfo 的查询窗口固定 101×101 像素。zoom 9 时这个窗口
 *   有 30 km 宽，覆盖几千个格子，GeoServer 按 FEATURE_COUNT 截断，
 *   返回的只是表里靠前的几个 —— 跟点击位置无关。
 *
 *   所以低缩放下「点特定格子」这件事本身就没有意义（一格才 1.6 像素），
 *   与其返回错数据，不如提示用户放大。
 */
export const MIN_GRID_ZOOM = 11;

/**
 * 取整条要素（id + geometry + properties）。
 * 悬停描边需要 geometry，点选弹窗只需要 properties。
 *
 * @param {import('ol/Map').default} map
 * @param {{ coordinate: number[] }} evt
 */
export const pickGridFeature = async (map, evt) => {
  const zoom = map.getView().getZoom() ?? 0;
  if (zoom < MIN_GRID_ZOOM) return null; // 格太小，点了也不是那一格

  return probeFeature(map, evt, 'heat', PARAM, { requireContain: true });
};

/**
 * 只要属性（弹窗用）。
 *
 * ★ 保留这个薄封装：调用方（mapView 的 singleclick）只关心"这格有多少设施"，
 *   不该被迫处理 geometry。
 *
 * @param {import('ol/Map').default} map
 * @param {{ coordinate: number[] }} evt   OL 的 singleclick 事件
 * @returns {Promise<object|null>} 该格的全部属性；没点到格子返回 null
 */
export const pickGrid = async (map, evt) => {
  const hit = await pickGridFeature(map, evt);
  return hit ? hit.properties : null;
};

/** 分类顺序固定成「多 → 少」，弹窗里四条按这个顺序画 */
export const GRID_CATEGORIES = [
  { key: 'mall', field: 'mall', rField: 'r_mall', label: '商场', color: '#EF6C00' },
  { key: 'hospital', field: 'hospital', rField: 'r_hospital', label: '医院', color: '#C62828' },
  { key: 'park', field: 'park', rField: 'r_park', label: '公园', color: '#2E7D32' },
  { key: 'school', field: 'school', rField: 'r_school', label: '学校', color: '#1565C0' },
];
