import GeoJSON from 'ol/format/GeoJSON.js';
import { HEAT_LAYER } from './heatmap.js';

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

const geoJson = new GeoJSON();

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

  /**
   * ★ 不要直接 res.json()。
   *   GeoServer 出错时会返回 **HTTP 200 + XML 的 ServiceExceptionReport**，
   *   此时 .json() 会抛 "Unexpected token '<'"，把真正的报错信息埋掉。
   *   实测能碰到的例子：QUERY_LAYERS 与 LAYERS 不一致、SRS 不被支持、
   *   BBOX 退化等 —— 都是"看起来 200 其实失败"。
   */
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    const m = text.match(/<ServiceException[^>]*>([\s\S]*?)<\/ServiceException>/);
    throw new Error(m ? m[1].trim() : 'WMS 返回了非 JSON 响应');
  }

  // 点在没有覆盖的格子上时，features 是空数组 —— 这是正常的，不是错误
  if (!data.features || data.features.length === 0) return null;

  /**
   * ★ 必须挑「真正包含点击点」的那个，不能直接取 features[0]。
   *
   *   一个像素可能压住多个格子（格边界处最多 4 个），GeoServer 按什么顺序
   *   返回没有保证。实测 zoom 9 时它返回的 8 个甚至根本不在点击位置上。
   *
   *   几何无需再做坐标变换：GetFeatureInfo 跟着请求里的 SRS 走，
   *   我们传的是 view 投影（3857），回来的坐标就已经是 3857。
   *   （这里曾写成 dataProjection:4326 去解，结果把 3857 的数值当度数，
   *     几何范围变成 Infinity，永远判不中。）
   */
  for (const f of data.features) {
    const geom = geoJson.readGeometry(f.geometry);
    if (geom.intersectsCoordinate(evt.coordinate)) {
      return f.properties ?? null;
    }
  }

  // 一个都没包含：说明点落在格子边界外的空隙（理论上没有），或服务端截断了
  return null;
};

/** 分类顺序固定成「多 → 少」，弹窗里四条按这个顺序画 */
export const GRID_CATEGORIES = [
  { key: 'mall', field: 'mall', rField: 'r_mall', label: '商场', color: '#EF6C00' },
  { key: 'hospital', field: 'hospital', rField: 'r_hospital', label: '医院', color: '#C62828' },
  { key: 'park', field: 'park', rField: 'r_park', label: '公园', color: '#2E7D32' },
  { key: 'school', field: 'school', rField: 'r_school', label: '学校', color: '#1565C0' },
];
