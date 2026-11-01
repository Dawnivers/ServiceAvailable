import { HEAT_LAYER } from './heatmap';

/**
 * ════════════════════════════════════════════════════════════
 * gridInfo —— 点热力图某个格子，取该格的统计属性
 *
 * ★ 走的是 WMS 的 GetFeatureInfo，不是 WFS。
 *   热力图是 ImageLayer + ImageWMS（服务器渲好的整屏 PNG），
 *   浏览器手里没有 Feature，`forEachFeatureAtPixel` 拿不到任何东西。
 *   只能回头问服务器：「你刚画的那张图上，我点的这个像素是哪个格子？」
 *   这正是 GetFeatureInfo 的语义。
 *
 * ★ 为什么不用 WFS：视窗内动辄上千个 500m 方格，每个 5 个顶点 + 15 个属性，
 *   WFS 要序列化成 GeoJSON 几百 KB 起步，还得前端自己判断点落在哪个面里。
 *   GetFeatureInfo 只回 1 个要素、约 700 字节。
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
  INFO_FORMAT: 'application/json', // 要 JSON 不要 text/plain
  FEATURE_COUNT: 1, // 一个像素只可能落在一个 500m 格里
  FI_POINT_TOLERANCE: 6, // 点击容差（像素）
};

/**
 * @param {import('ol/Map').default} map
 * @param {{ coordinate: number[] }} evt   OL 的 singleclick 事件
 * @returns {Promise<object|null>} 该格的全部属性；没点到格子返回 null
 */
export const pickGrid = async (map, evt) => {
  const heatLayer = map
    .getLayers()
    .getArray()
    .find((l) => l.get('id') === 'heat');

  // 图层没建 / 没打开时不发请求。
  // ★ 技术上 getFeatureInfoUrl 在图层不可见时照样能拼出 URL（它只看坐标和
  //   resolution，不依赖上次出图）。这里主动跳过是产品决定：
  //   用户看不见格子却点了弹出卡片，会以为界面错乱。
  if (!heatLayer || !heatLayer.getVisible()) return null;

  const source = heatLayer.getSource();
  const view = map.getView();

  const url = source.getFeatureInfoUrl(
    evt.coordinate,
    view.getResolution(),
    view.getProjection(),
    PARAM,
  );

  if (!url) return null;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();

  // 点在没有覆盖的格子上时，features 是空数组 —— 这是正常的，不是错误
  if (!data.features || data.features.length === 0) return null;

  return data.features[0].properties ?? null;
};

/** 分类顺序固定成「多 → 少」，弹窗里四条按这个顺序画 */
export const GRID_CATEGORIES = [
  { key: 'mall', field: 'mall', rField: 'r_mall', label: '商场', color: '#EF6C00' },
  { key: 'hospital', field: 'hospital', rField: 'r_hospital', label: '医院', color: '#C62828' },
  { key: 'park', field: 'park', rField: 'r_park', label: '公园', color: '#2E7D32' },
  { key: 'school', field: 'school', rField: 'r_school', label: '学校', color: '#1565C0' },
];
