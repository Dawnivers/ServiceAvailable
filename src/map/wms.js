import ImageLayer from 'ol/layer/Image.js';
import ImageWMS from 'ol/source/ImageWMS.js';//WMS 使用

export function createAdminLayer(map, url, layer) {
  const adminLayer = new ImageLayer({
    source: new ImageWMS({
      url: url /* /geoserver/wuhan/wms*/,
      params: {
        LAYERS: layer /*wuhan:admin_area*/,
        VERSION: '1.1.1',
      },
      serverType: 'geoserver',
      ratio: 1.5, //流畅度
    }),
    opacity: 0.7, //透明度
  });
  map.addLayer(adminLayer);
  return adminLayer
}

export function createPOILayer(map, url, layer) {
  const poiLayer = new ImageLayer({
    source: new ImageWMS({
      url: url /* /geoserver/wuhan/wms*/,
      params: {
        LAYERS: layer /*wuhan:poi*/,
        VERSION: '1.1.1',
        FORMAT: 'image/png',
        STYLES: 'wuhan:poi_icons', // ★ 显式指定，否则可能用默认样式
        TRANSPARENT: true, // ★ 不设 true 会盖住底图（白底）
      },
      serverType: 'geoserver',
      ratio: 1.5, //流畅度
    }),
    opacity: 1.0, //透明度
  });
  map.addLayer(poiLayer);
  return poiLayer
}
