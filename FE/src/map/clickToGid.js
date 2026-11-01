import { probeFeature } from './probe';

/**
 * 点击地图 → 取被点到的 POI 的 gid。
 *
 * 查询本身交给 map/probe.js（和热力图共用一个探针），
 * 这里只负责把 "poi.963" 这种 id 拆成数字 gid。
 */
const PARAM = {
  QUERY_LAYERS: 'wuhan:poi', // 只有点这个图层上的像素才有用
  FI_POINT_TOLERANCE: 10, // 点击容差（像素）：图标 36px，手指点不准时放宽一点
};

/**
 * @param {import('ol/Map').default} map
 * @param {{ coordinate: number[] }} evt
 * @returns {Promise<number|null>} gid；没点到 POI 返回 null
 */
export const pickGid = async (map, evt) => {
  const hit = await probeFeature(map, evt, 'poi', PARAM);
  if (!hit || !hit.id) return null;

  // id 形如 "poi.963" → 963
  const gid = Number(String(hit.id).split('.').pop());
  return Number.isInteger(gid) ? gid : null;
};
