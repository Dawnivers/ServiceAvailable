import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from 'ol/style.js';
import { unByKey } from 'ol/Observable.js';
import { probeFeature } from './probe.js';
import { MIN_GRID_ZOOM } from './gridInfo.js';

/**
 * ════════════════════════════════════════════════════════════
 * hover —— 悬停高亮（热力图格子描边 / POI 光圈 + 名称）
 *
 * ★ 为什么必须"问一次再画"：
 *   两种图层都是 ImageLayer + ImageWMS（服务器渲好的位图），
 *   浏览器里没有 Feature，没法像 VectorLayer 那样直接改样式。
 *   所以流程是「pointermove → 探针问服务器 → 拿回几何 → 画到高亮层」。
 *
 * ★ 性能：三层锁，实测悬停一次服务端 12 ms
 *     ① 时间锁  90 ms 内不重复发
 *     ② 位移锁  像素没走够 5 px 不发（手抖不算）
 *     ③ 结果锁  回来的 id 和上次一样就不重画（跨格子才重画）
 *   再加一层 inFlight 防止慢请求堆叠。
 *
 * ★ 高亮层不挂 ol-layer-base：分析模式下它也得保持彩色。
 *   实际上分析模式会把 mode 置空，这一层根本不会画东西。
 * ════════════════════════════════════════════════════════════
 */

const THROTTLE_MS = 90; // 时间锁
const MIN_PIXEL_MOVE = 5; // 位移锁（像素）
const LABEL_MAX = 12; // 标签最多几个字，超了截断

// ── 配色（与全站主色一致：深蓝 #17334d / 蓝 #1565C0）──────────
const INK = 'rgba(16, 42, 67, '; // 深墨蓝，拼透明度用
const ACCENT = '#1565C0';

/** 悬停标签：深色小药丸 + 白字，任何底色上都读得清 */
function label(text, offsetY) {
  return new Text({
    text,
    font: '600 12px "Microsoft YaHei", "Segoe UI", sans-serif',
    offsetY,
    overflow: true,
    fill: new Fill({ color: '#ffffff' }),
    // OL 的 Text 没有圆角，靠 padding + 深色底近似一个胶囊
    backgroundFill: new Fill({ color: INK + '0.86)' }),
    padding: [4, 8, 3, 8],
  });
}

/** 热力图格子：外深内白双描边 + 极淡填充，深红和浅黄上都看得见 */
function gridStyle(labelText) {
  return [
    new Style({
      // 外层深色描边：在浅色格子上撑出边界
      stroke: new Stroke({ color: INK + '0.55)', width: 5 }),
      fill: new Fill({ color: 'rgba(255, 255, 255, 0.10)' }),
    }),
    new Style({
      // 内层白线：在深红格子上才看得见的那一圈
      stroke: new Stroke({ color: '#ffffff', width: 2 }),
      text: labelText ? label(labelText, -2) : undefined,
    }),
  ];
}

/** POI：白色光晕 + 蓝色光圈，形状是圆的，和方形图标区分开 */
function poiStyle(labelText) {
  return [
    new Style({
      image: new CircleStyle({
        radius: 15,
        stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.95)', width: 6 }),
      }),
    }),
    new Style({
      image: new CircleStyle({
        radius: 15,
        stroke: new Stroke({ color: ACCENT, width: 2.5 }),
        fill: new Fill({ color: 'rgba(21, 101, 192, 0.14)' }),
      }),
      text: labelText ? label(labelText, -26) : undefined,
    }),
  ];
}

const geoJson = new GeoJSON();

/**
 * @param {import('ol/Map').default} map
 * @returns {{
 *   setMode: (m: 'grid'|'poi'|null) => void,
 *   clear: () => void,
 *   destroy: () => void,
 * }}
 */
export function createHoverController(map) {
  const source = new VectorSource();

  const layer = new VectorLayer({
    source,
    zIndex: 90, // 高于所有 WMS 层（0/10），低于分析图形的 100
    className: 'ol-hover', // 不挂 ol-layer-base → 永不被去色
    // 悬停层不该抢事件：不是 interactive 的图层，默认就不吃事件，这里显式声明
    updateWhileInteracting: false,
  });

  map.addLayer(layer);

  /** 'grid' | 'poi' | null */
  let mode = null;
  let key = null; // pointermove 的监听句柄
  let timer = null; // 拖尾定时器
  let inFlight = false;
  let lastAt = 0; // 上次真正发请求的时刻
  let lastPixel = null; // 上次发请求时的像素位置
  let lastId = null; // 上次命中的要素 id（结果锁）
  let lastCoord = null; // 最近一次鼠标位置（拖尾时用）

  const target = map.getTargetElement();

  function clear() {
    if (source.getFeatures().length) source.clear();
    lastId = null;
    if (target && mode) target.style.cursor = '';
  }

  function draw(hit) {
    const labelText =
      mode === 'poi'
        ? String(hit.properties?.name ?? '').slice(0, LABEL_MAX)
        : hit.properties?.total != null
          ? `${hit.properties.total} 个`
          : '';

    const geom = hit.geometry ? geoJson.readGeometry(hit.geometry) : null;
    if (!geom) return;

    const f = new Feature({ geometry: geom });
    f.setStyle(mode === 'poi' ? poiStyle(labelText) : gridStyle(labelText));

    source.clear();
    source.addFeature(f);
  }

  async function run() {
    timer = null;
    if (!mode || !lastCoord || inFlight) return;

    // 热力图在低缩放下格太小（一格不到 2 px），探针会返回错格子，直接不查
    if (mode === 'grid' && (map.getView().getZoom() ?? 0) < MIN_GRID_ZOOM) {
      clear();
      return;
    }

    lastAt = performance.now();
    inFlight = true;

    try {
      const hit = await probeFeature(
        map,
        { coordinate: lastCoord },
        mode,
        mode === 'poi'
          ? { QUERY_LAYERS: 'wuhan:poi', FI_POINT_TOLERANCE: 8 }
          : { QUERY_LAYERS: 'wuhan:grid_500m', FI_POINT_TOLERANCE: 0, FEATURE_COUNT: 4 },
        { requireContain: mode === 'grid' },
      );

      // 请求期间用户可能已经移开 / 切了模式
      if (!mode) return;

      if (!hit) {
        // 点在没有要素的地方（热力图透明格）→ 收掉高亮，别留着上一格的框
        clear();
        return;
      }

      // 结果锁：还在同一个格子上，不重画
      if (hit.id && hit.id === lastId) return;
      lastId = hit.id;

      draw(hit);
      if (target) target.style.cursor = 'pointer';
    } catch {
      // 悬停不该把错误抛到界面上：探针失败就当没悬停到东西
      clear();
    } finally {
      inFlight = false;
    }
  }

  function onMove(evt) {
    if (!mode) return;
    if (evt.dragging) return; // 拖动地图时不查，否则一路狂发请求

    lastCoord = evt.coordinate;

    const px = evt.pixel;
    if (lastPixel) {
      const dx = px[0] - lastPixel[0];
      const dy = px[1] - lastPixel[1];
      if (Math.hypot(dx, dy) < MIN_PIXEL_MOVE) return; // 位移锁
    }
    lastPixel = px;

    const wait = THROTTLE_MS - (performance.now() - lastAt);
    if (wait > 0) {
      // 时间锁：冷却结束再补一次，保证鼠标停下时最后一格也能亮
      if (!timer) timer = setTimeout(run, wait);
      return;
    }
    run();
  }

  key = map.on('pointermove', onMove);

  return {
    setMode(next) {
      if (next === mode) return;
      mode = next;
      lastPixel = null;
      lastId = null;
      clear();
      if (target) target.style.cursor = ''; // 交给下面的判定
    },

    clear,

    destroy() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (key) unByKey(key);
      key = null;
      mode = null;
      if (target) target.style.cursor = '';
      source.clear();
      map.removeLayer(layer);
    },
  };
}
