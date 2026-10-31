const Param = {
  QUERY_LAYERS: 'wuhan:poi', //只有点击到点图层上的像素才有用
  INFO_FORMAT: 'application/json', //要 JSON 不要 text/plain
  FEATURE_COUNT: 1,
  FI_POINT_TOLERANCE: 10, //点击容差（像素）
};

//map是OL的地图实例
//evt是鼠标点击屏幕的区域
export const pickGid = async (map, evt) => {
  const PoiLayer = map
    .getLayers()
    .getArray()
    .find((e) => e.get('id') === 'poi');
  const source = PoiLayer.getSource(); //ImgWMS

  const coordinate = evt.coordinate;
  const resolution = map.getView().getResolution();
  const projection = map.getView().getProjection(); //'EPSG:3857'
  const url = source.getFeatureInfoUrl(
    coordinate,
    resolution,
    projection,
    Param,
  );

  if (!url) return null; // getFeatureInfoUrl 可能返回

  const res = await fetch(url);
  if (!res.ok) return null;
    const data = await res.json();
    

  if (!data.features || data.features.length === 0) return null;
  console.log(data)
  const gid = Number(String(data.features[0].id).split('.').pop());

  return Number.isInteger(gid) ? gid : null;
};
