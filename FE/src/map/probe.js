import GeoJSON from 'ol/format/GeoJSON';

/**
 * ════════════════════════════════════════════════════════════
 * probe —— 问 GeoServer「屏幕上这个像素上是什么要素」
 *
 * ★ 这是 WMS 的 GetFeatureInfo，不是 WFS。
 *   POI 与热力图都是 ImageLayer + ImageWMS（服务器渲好的整屏位图），
 *   浏览器里没有 Feature，`map.forEachFeatureAtPixel` 永远返回空。
 *   唯一的路是回头问服务器。
 *
 * ★ 为什么不用 WFS：视窗内动辄上千个要素，WFS 要序列化成 GeoJSON
 *   几百 KB 起步，返回的还是"一堆几何"，得前端自己判断点落在哪个面里。
 *   GetFeatureInfo 只回 1 个要素、约 700 字节，实测 **12 ms**。
 *
 * ★ 它会把 geometry 一起带回来（实测 grid_500m 是 Polygon、poi 是 Point），
 *   所以悬停高亮不需要在前端存要素数据 —— 拿回几何画一层就行。
 *
 * ★ 坐标参考系：回来的几何**跟着请求里的 SRS 走**。
 *   OL 的 getFeatureInfoUrl 传的是 view 投影（3857），所以拿到的就是 3857。
 *   这里不再做任何投影变换 —— 曾写成 dataProjection:4326 去解，
 *   等于把 3857 的米数当度数，几何范围变成 Infinity。
 * ════════════════════════════════════════════════════════════
 */

const geoJson = new GeoJSON();

/**
 * @param {import('ol/Map').default} map
 * @param {{ coordinate: number[] }} evt   OL 的 pointer/click 事件
 * @param {string} layerId   图层身份（'poi' | 'heat'）
 * @param {object} [extra]   额外的 GetFeatureInfo 参数（QUERY_LAYERS / 容差 / 数量）
 * @param {{ requireContain?: boolean }} [opts]
 *        requireContain = true 时，只接受「真正包含点击点」的要素
 *        （一个像素可能压住多个格子，GeoServer 返回顺序没有保证）
 * @returns {Promise<{ id: string|null, geometry: object|null, properties: object }|null>}
 */
export const probeFeature = async (map, evt, layerId, extra = {}, opts = {}) => {
  const layer = map
    .getLayers()
    .getArray()
    .find((l) => l.get('id') === layerId);

  // 图层没建 / 没打开时不发请求：
  // 用户看不见要素却弹出卡片，会以为界面错乱。
  if (!layer || !layer.getVisible()) return null;

  const source = layer.getSource();
  const view = map.getView();

  const url = source.getFeatureInfoUrl(
    evt.coordinate,
    view.getResolution(),
    view.getProjection(),
    {
      INFO_FORMAT: 'application/json', // 要 JSON 不要 text/plain
      FEATURE_COUNT: 1, // 一个像素通常只落在一个要素上
      ...extra,
    },
  );

  if (!url) return null;

  const res = await fetch(url);
  if (!res.ok) return null;

  /**
   * ★ 不要直接 res.json()。
   *   GeoServer 出错时会返回 **HTTP 200 + XML 的 ServiceExceptionReport**，
   *   此时 .json() 会抛 "Unexpected token '<'"，把真正的报错埋掉。
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

  // 点在没有要素的地方（热力图透明格 / 空的街区）→ 空数组，这是正常的，不是错误
  if (!data.features || data.features.length === 0) return null;

  let hit = data.features[0];

  if (opts.requireContain) {
    // 必须挑「真正包含该点」的那个：格边界处一个像素能压住 4 个格子，
    // 而 GeoServer 的返回顺序没有保证。
    hit =
      data.features.find((f) => {
        try {
          return geoJson.readGeometry(f.geometry).intersectsCoordinate(evt.coordinate);
        } catch {
          return false;
        }
      }) ?? null;
    if (!hit) return null;
  }

  return {
    id: hit.id ?? null, // 形如 "grid_500m.16822" / "poi.963"，悬停去重用
    geometry: hit.geometry ?? null, // GeoJSON，坐标已在 view 投影下
    properties: hit.properties ?? {},
  };
};
