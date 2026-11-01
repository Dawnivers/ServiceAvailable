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
    className: 'ol-layer-base'
  });
  map.addLayer(poiLayer);
  return poiLayer
}

/**
 * 创建格网热力图层（wuhan:grid_500m）。
 *
 * @param {string} style  SLD 样式名，**必须带工作区前缀**（如 wuhan:grid_total）。
 *   不带前缀时 GeoServer 会静默回落到默认样式 —— 结果是一张灰图，不报错。
 * @param {string} [className] 传 'ol-layer-base' 让它跟随分析模式一起变灰。
 *
 * ★ className 必须挂在 ImageLayer 上，不能写进 ImageWMS 的 options：
 *   source 不认识这个键，写了会被忽略，图层永远是彩色的。
 * ★ 透明度默认 0.8：热力图是"面"，1.0 会把底图完全盖死。
 */
export function createHeatLayer(map, url, layer, id, style, className) {
  const heatLayer = new ImageLayer({
    ...(className ? { className } : {}),
    properties: { id: id },
    source: new ImageWMS({
      url: url /* /geoserver/wuhan/wms*/,
      params: {
        LAYERS: layer /*wuhan:grid_500m*/,
        VERSION: '1.1.1',
        FORMAT: 'image/png',
        STYLES: style, // ★ wuhan:grid_total / grid_school / ...
        TRANSPARENT: true, // ★ 不设 true 会用白底把底图盖住
      },
      serverType: 'geoserver',
      ratio: 1.5, //流畅度
    }),
    opacity: 0.8,
  });
  map.addLayer(heatLayer);
  return heatLayer
}
