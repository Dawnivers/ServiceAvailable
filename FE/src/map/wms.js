import ImageLayer from 'ol/layer/Image.js';
import ImageWMS from 'ol/source/ImageWMS.js';//WMS 使用

/**
 * @param {string} [className] 图层容器的 CSS 类，给「分析模式去色」用。
 *   只有传了同一个类名的图层才会一起被 grayscale；
 *   POI 层不传，所以图钉在分析模式下仍然是彩色的。
 */
export function createAdminLayer(map, url, layer, id, className) {
  const adminLayer = new ImageLayer({
    ...(className ? { className } : {}),
    properties: { id: id },
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

export function createPOILayer(map, url, layer,id) {
  const poiLayer = new ImageLayer({
    properties: { id: id },
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
