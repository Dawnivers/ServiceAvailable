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
 * ★ getFeatureInfoUrl 会自动带上出图那次的 BBOX / WIDTH / HEIGHT，
 *   并把经纬度换成像素坐标 —— 连 source 的 ratio(1.5) 也按图片实际尺寸处理，
 *   不用自己乘。手写这条 URL 时最容易漏的就是这一步。
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

  // 图层没建 / 没打开时不要发请求：
  //   getFeatureInfoUrl 依赖 source 上一次出图的 bbox，
  //   图层不可见时那片区域根本没请求过，URL 会是 undefined
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
