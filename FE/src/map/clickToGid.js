import { probeFeature } from './probe';

/**
 * 点击地图 → 取被点到的 POI。
 *
 * 查询本身交给 map/probe.js（和热力图共用一个探针），
 * 这里只负责带上 POI 特有的参数。
 */
const PARAM = {
  QUERY_LAYERS: 'wuhan:poi', // 只有点这个图层上的像素才有用
  FI_POINT_TOLERANCE: 10, // 点击容差（像素）：图标 36px，手指点不准时放宽一点
};

/**
 * 取整条要素（id + geometry + properties）。
 * 选中高亮需要 geometry；只拿 gid 的话，画不出那个光圈。
 *
 * @param {import('ol/Map').default} map
 * @param {{ coordinate: number[] }} evt
 * @returns {Promise<{ id: string|null, geometry: object|null, properties: object }|null>}
 */
export const pickPoi = (map, evt) => probeFeature(map, evt, 'poi', PARAM);

/**
 * 只要 gid（历史调用方用）。
 *
 * @param {import('ol/Map').default} map
 * @param {{ coordinate: number[] }} evt
 * @returns {Promise<number|null>} gid；没点到 POI 返回 null
 */
export const pickGid = async (map, evt) => {
  const hit = await pickPoi(map, evt);
  if (!hit || !hit.id) return null;

  // id 形如 "poi.963" → 963
  const gid = Number(String(hit.id).split('.').pop());
  return Number.isInteger(gid) ? gid : null;
};
