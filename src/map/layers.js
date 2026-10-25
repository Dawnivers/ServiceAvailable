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
]