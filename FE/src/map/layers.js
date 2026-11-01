import { HEAT_CATEGORIES } from './heatmap.js';

export const LAYER = [
  { id: 'base',  name: '天地图影像', kind: 'base'   },
  { id: 'anno',  name: '注记',       kind: 'base'   },
  { id: 'admin', name: '武汉区划',   kind: 'wms', wms: 'admin' },
  {
    id: 'poi', name: 'POI 设施', tag: '16,016', kind: 'wms', wms: 'poi', defaultOpacity: 1,
    chips: [
      { label: '学校', count: 4648, color: '#1565C0' },
      { label: '医院', count: 5347, color: '#C62828' },
      { label: '商场', count: 4858, color: '#EF6C00' },
      { label: '公园', count: 1163, color: '#2E7D32' },
    ],
  },
  /**
   * 格网热力图。
   *
   * ★ options 是关键：它让这一行多出一排「单选按钮」，
   *   点击切换 GeoServer 的 STYLES 参数（全部/学校/医院/商场/公园）。
   *   和上面 poi 的 chips 不同 —— chips 只是展示数量，options 是可点的。
   * ★ 类别清单来自 map/heatmap.js，不要在别处再抄一份。
   * ★ 地图上的层级要低于 poi（点浮在面之上），见 mapView 里的建层顺序。
   */
  {
    id: 'heat', name: '可达性热力图', tag: '500m 格网',
    kind: 'wms', wms: 'heat', defaultOpacity: 0.8,
    options: HEAT_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
  },
]
