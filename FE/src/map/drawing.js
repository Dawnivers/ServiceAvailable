/**
 * ════════════════════════════════════════════════════════════
 * drawing —— 分析图形的绘制控制器
 *
 * 职责：把「当前工具 + 半径 + 中心点」翻译成地图上的图形与交互。
 *   point    → 单击落一个中心点 + 半径圆（缓冲圈）
 *   freehand → 按住拖拽手绘任意多边形
 *   rect     → 拖拽出矩形（本质是特殊的多边形）
 *   measure  → 连续点击量距离
 *
 * 与 store 的分工（沿用本项目的一贯纪律）：
 *   本文件不 import store，只接收参数、回调上报。
 *   「画完了要存到哪、要不要调接口」是 mapView / store 的事。
 *
 * ★ 图形几何全部用 3857（地图投影）绘制，
 *   导出 WKT 时才转 4326 —— 后端 poi.geom 是 4326，不转就是空结果。
 * ════════════════════════════════════════════════════════════
 */

import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Draw, { createBox } from 'ol/interaction/Draw.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Circle from 'ol/geom/Circle.js';
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from 'ol/style.js';
import { getArea, getLength } from 'ol/sphere.js';
import WKT from 'ol/format/WKT.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';

// ── 配置区 ─────────────────────────────────────────────────
const ACCENT = '#d93025'; // 分析态红，与顶栏徽章、滑杆统一
const FILL_ALPHA = 0.08; // 多边形/圆的填充透明度
const DASH = [7, 5]; // 缓冲圈的虚线节奏

// ── 样式：按 feature 的 kind / 几何类型分别上色 ──────────────
function analysisStyle(feature) {
  const kind = feature.get('kind');
  const geom = feature.getGeometry();
  const type = geom.getType();
  const styles = [];

  if (kind === 'center') {
    // 圆心：白底红边小圆点，压在虚线圆上面要看得见
    styles.push(
      new Style({
        image: new CircleStyle({
          radius: 5,
          fill: new Fill({ color: '#fff' }),
          stroke: new Stroke({ color: ACCENT, width: 2 }),
        }),
      }),
    );
  } else if (kind === 'circle') {
    styles.push(
      new Style({
        stroke: new Stroke({ color: ACCENT, width: 2, lineDash: DASH }),
        fill: new Fill({ color: `rgba(217, 48, 37, ${FILL_ALPHA})` }),
      }),
    );
  } else if (type.includes('Polygon')) {
    styles.push(
      new Style({
        stroke: new Stroke({ color: ACCENT, width: 2 }),
        fill: new Fill({ color: `rgba(217, 48, 37, ${FILL_ALPHA})` }),
      }),
    );
  } else if (type === 'LineString') {
    styles.push(new Style({ stroke: new Stroke({ color: ACCENT, width: 2.5 }) }));
  }

  // 文字标签：面积 / 长度 / 半径
  const label = feature.get('label');
  if (label) {
    const anchor = labelAnchor(geom, kind);
    if (anchor) {
      styles.push(
        new Style({
          geometry: anchor,
          text: new Text({
            text: label,
            font: '600 11.5px "Microsoft YaHei", "Segoe UI", sans-serif',
            fill: new Fill({ color: '#fff' }),
            backgroundFill: new Fill({ color: 'rgba(217, 48, 37, 0.92)' }),
            padding: [3, 6, 2, 6],
          }),
        }),
      );
    }
  }

  return styles;
}

/** 标签挂在哪：面用内部点，线用末端，圆用圆心 */
function labelAnchor(geom, kind) {
  try {
    if (kind === 'circle') return new Point(geom.getCenter());
    if (geom.getType().includes('Polygon')) return geom.getInteriorPoint();
    if (geom.getType() === 'LineString') return new Point(geom.getLastCoordinate());
  } catch {
    /* 退化几何（零面积/单点）取不到内部点，就不画标签 */
  }
  return null;
}

// ── 单位格式化 ─────────────────────────────────────────────
function formatArea(m2) {
  return m2 >= 1e6 ? `${(m2 / 1e6).toFixed(2)} km²` : `${Math.round(m2)} m²`;
}

function formatLength(m) {
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`;
}

/**
 * 创建绘制控制器。
 * @param {import('ol/Map').default} map
 */
export function createDrawingController(map) {
  const source = new VectorSource();

  const layer = new VectorLayer({
    source,
    // 默认 'ol-layer'：★ 故意不挂 'ol-layer-base'，
    // 这样分析图形不会被分析模式的 grayscale 一起灰掉
    zIndex: 100,
    style: analysisStyle,
    updateWhileAnimating: true,
    updateWhileInteracting: true,
  });
  map.addLayer(layer);

  // ── 内部状态 ──────────────────────────────────────────────
  let draw = null; // 当前挂着的 Draw 交互（同一时刻只能有一个）
  let tool = null;
  let radius = 800; // 米
  let center = null; // { lon, lat } 度
  let handlers = {}; // { onPoint, onPolygon, onMeasure }

  const proj = () => map.getView().getProjection();

  // ── 图形管理 ──────────────────────────────────────────────
  function removeDraw() {
    if (draw) {
      // 若用户正画到一半就换工具，先掐掉草图，否则草图会留在悬停层上
      // （草图在 Draw 自带的 overlay 里，不在我们的 source 里，clear() 清不到）
      try {
        draw.abortDrawing();
      } catch {
        /* 没有正在进行的绘制时 abortDrawing 可能抛错，忽略即可 */
      }
      map.removeInteraction(draw);
      draw = null;
    }
  }

  function clear() {
    source.clear();
  }

  /** 按 kind 删掉指定图形（圆和圆心会随半径变化重建） */
  function removeByKind(...kinds) {
    for (const f of [...source.getFeatures()]) {
      if (kinds.includes(f.get('kind'))) source.removeFeature(f);
    }
  }

  /** 半径或中心变了，重画缓冲圈（点选模式和卡片入口都用它） */
  function paintCircle() {
    removeByKind('circle', 'center');
    if (!center) return;

    const c = fromLonLat([center.lon, center.lat]);

    source.addFeature(
      new Feature({
        kind: 'circle',
        label: `缓冲区 ${Math.round(radius)} m`,
        geometry: new Circle(c, radius),
      }),
    );
    source.addFeature(new Feature({ kind: 'center', geometry: new Point(c) }));
  }

  // ── 导出 ──────────────────────────────────────────────────
  /** 3857 几何 → WGS84 WKT。后端 /api/poi/within 只认 4326 */
  function toWkt(geom) {
    return new WKT().writeGeometry(geom, {
      dataProjection: 'EPSG:4326',
      featureProjection: proj(),
    });
  }

  /** 当前画的多边形（没有就返回 null） */
  function getPolygon() {
    const f = source.getFeatures().find((x) => x.get('kind') === 'polygon');
    if (!f) return null;
    const geom = f.getGeometry();
    return { wkt: toWkt(geom), areaKm2: getArea(geom) / 1e6 };
  }

  // ── 工具切换 ──────────────────────────────────────────────
  /**
   * @param {'point'|'freehand'|'rect'|'measure'|null} next
   * @param {{ onPoint?:Function, onPolygon?:Function, onMeasure?:Function }} cb
   */
  function setTool(next, cb = {}) {
    // ★ 只有「工具真的换了」才清图形。
    //   setTool 会被 syncDrawing 反复调用（拖半径滑杆、改中心都会调），
    //   若无条件 clear，则每拖一下滑杆刚画好的圆就被擦掉又重画，画面会闪。
    const changed = next !== tool;

    removeDraw();
    tool = next;
    handlers = cb;

    // ★ 换工具 = 上一轮画的圆/多边形/测距线全部作废（用户明确要求）
    if (changed) clear();

    if (!next) return;

    if (next === 'point') {
      // stopClick：避免这次点击同时被地图的 singleclick 吃掉（那会去查 POI 详情）
      draw = new Draw({ source, type: 'Point', stopClick: true });
      draw.on('drawend', (e) => {
        const [lon, lat] = toLonLat(e.feature.getGeometry().getCoordinates());
        center = { lon, lat };
        e.feature.set('kind', 'center');
        // ★ Draw 是在 dispatchEvent('drawend') **之后**才把要素加进 source 的，
        //   所以这里立刻 paintCircle() 会清不到它，结果是"两个圆心"（实测复现）。
        //   推到下一拍再画：那时要素已在 source 里，paintCircle 能把它一起清掉。
        setTimeout(paintCircle, 0);
        handlers.onPoint?.({ lon, lat });
      });
    } else if (next === 'freehand') {
      // 自由绘制：点击加折点，双击闭合。
      // ★ 不用 freehand:true —— 那是"按住鼠标拖"的画法，用户要的是逐点点击
      // Draw 默认的 Polygon 行为就是：单击加点、双击（在最后一个点上）结束并闭合
      draw = new Draw({ source, type: 'Polygon' });
      draw.on('drawend', (e) => {
        // 完成时替换上一个多边形（不在这里 clear 全部，原因见文件末尾注释）
        removeByKind('polygon');
        const geom = e.feature.getGeometry();
        const area = getArea(geom);
        e.feature.set('kind', 'polygon');
        e.feature.set('label', formatArea(area));
        handlers.onPolygon?.({ wkt: toWkt(geom), areaKm2: area / 1e6 });
      });
    } else if (next === 'rect') {
      // 框选：点击定第一个角 → 移动鼠标实时改变长宽 → 再点击完成。
      // ★ type:'Circle' + createBox() 就是"两击"交互，不是拖拽。
      //   （Draw 在非手绘模式下只要拖动位移超容差就放弃接管，事件会落到
      //     DragPan 变成平移地图 —— 所以千万别让用户"按住拖"）
      draw = new Draw({ source, type: 'Circle', geometryFunction: createBox() });
      draw.on('drawend', (e) => {
        removeByKind('polygon');
        const geom = e.feature.getGeometry();
        const area = getArea(geom);
        e.feature.set('kind', 'polygon');
        e.feature.set('label', formatArea(area));
        handlers.onPolygon?.({ wkt: toWkt(geom), areaKm2: area / 1e6 });
      });
    } else if (next === 'measure') {
      draw = new Draw({ source, type: 'LineString' });
      draw.on('drawend', (e) => {
        removeByKind('line');
        const geom = e.feature.getGeometry();
        const meters = getLength(geom);
        e.feature.set('kind', 'line');
        e.feature.set('label', formatLength(meters));
        handlers.onMeasure?.({ meters });
      });
    }

    if (draw) map.addInteraction(draw);
  }

  // ── 外部同步入口 ──────────────────────────────────────────
  /** 半径变化（滑杆拖动时实时重画） */
  function setRadius(next) {
    const n = Number(next);
    if (!Number.isFinite(n) || n === radius) return;
    radius = n;
    if (center) paintCircle();
  }

  /** 中心点变化（卡片「附近分析」进来时直接给一个中心） */
  function setCenter(next) {
    if (!next) {
      center = null;
      removeByKind('circle', 'center');
      return;
    }
    if (center && center.lon === next.lon && center.lat === next.lat) return;
    center = { lon: next.lon, lat: next.lat };
    paintCircle();
  }

  /** 卸载：摘掉交互和图层，别让 map 上留着旧回调 */
  function destroy() {
    removeDraw();
    map.removeLayer(layer);
    source.clear();
  }

  return {
    layer,
    source,
    setTool,
    setRadius,
    setCenter,
    getPolygon,
    clear,
    destroy,
    // 只读一下当前状态，方便调试
    get tool() {
      return tool;
    },
  };
}
