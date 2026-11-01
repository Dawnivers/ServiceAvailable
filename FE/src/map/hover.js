import VectorLayer from 'ol/layer/Vector.js';
import VectorSource from 'ol/source/Vector.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from 'ol/style.js';
import { unByKey } from 'ol/Observable.js';
import { fromLonLat } from 'ol/proj.js';
import { probeFeature } from './probe.js';
import { MIN_GRID_ZOOM } from './gridInfo.js';
import { heatCategory } from './heatmap.js';

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

/**
 * ★ 悬停的两种「模式」与图层 id 并不相同：
 *     模式 'grid'  → 图层 'heat'（wuhan:grid_500m）
 *     模式 'poi'   → 图层 'poi'
 *   这里必须显式映射。曾经直接把 mode 当图层 id 传进探针，
 *   POI 因为两者同名侥幸能用，热力图则永远查不到图层 → 静默返回 null。
 */
const LAYER_OF = { grid: 'heat', poi: 'poi' };

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

/** 只有文字、没有图形的提示样式（低缩放时用） */
function hintStyle(text) {
  return [new Style({ text: label(text, -18) })];
}

// ════════════════════════════════════════════════════════════
//  选中态样式
//
//  ★ 与悬停必须一眼分开：悬停是"临时指示"（深墨 + 白），
//    选中是"已经定下来的对象"（主色实线 + 常驻标签）。
//    两者可以同时存在（选中 A 格，鼠标划过 B 格），所以各自一个图层。
// ════════════════════════════════════════════════════════════

/** 选中标签：主色底 + 白字，和悬停的深色药丸区分 */
function selectedLabel(text, offsetY) {
  return new Text({
    text,
    font: '700 12px "Microsoft YaHei", "Segoe UI", sans-serif',
    offsetY,
    overflow: true,
    fill: new Fill({ color: '#ffffff' }),
    backgroundFill: new Fill({ color: ACCENT }),
    padding: [4, 9, 3, 9],
  });
}

/** 选中格子：主色实线 + 白内衬 + 略强填充 */
function gridSelectedStyle(labelText) {
  return [
    new Style({
      stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.95)', width: 6 }),
      fill: new Fill({ color: 'rgba(21, 101, 192, 0.16)' }),
    }),
    new Style({
      stroke: new Stroke({ color: ACCENT, width: 3 }),
      text: labelText ? selectedLabel(labelText, -2) : undefined,
    }),
  ];
}

/** 选中 POI：比悬停大一圈的实心主色圆环 */
function poiSelectedStyle(labelText) {
  return [
    new Style({
      image: new CircleStyle({
        radius: 18,
        stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.98)', width: 7 }),
      }),
    }),
    new Style({
      image: new CircleStyle({
        radius: 18,
        stroke: new Stroke({ color: ACCENT, width: 3.5 }),
        fill: new Fill({ color: 'rgba(21, 101, 192, 0.20)' }),
      }),
      text: labelText ? selectedLabel(labelText, -30) : undefined,
    }),
  ];
}

const geoJson = new GeoJSON();

/**
 * 悬停标签取哪个数。
 *
 * ★ 必须跟当前热力图类别一致：
 *   选「全部」→ 总设施数；选「学校」→ 只报学校数。
 *   否则图上染的是学校色、标签却报 176（总数），读者会以为学校有 176 个。
 */
function gridLabelOf(properties, categoryKey) {
  if (!properties) return '';
  const c = heatCategory(categoryKey);
  const field = c.field.startsWith('r_') ? c.field.slice(2) : c.field;
  const n = properties[field];
  return n == null ? '' : `${n} 个`;
}

/**
 * @param {import('ol/Map').default} map
 * @param {{ resolve?: () => ('grid'|'poi'|null) }} [options]
 *   resolve 由调用方提供，每次鼠标移动 / 每次探针前都会重新问一遍
 *   「现在该查哪个图层」—— 不走 watcher，避免状态同步不上导致的静默失效。
 * @returns {{
 *   clear: () => void,
 *   reset: () => void,
 *   destroy: () => void,
 * }}
 */
export function createHoverController(map, options = {}) {
  /**
   * ★ 模式不靠 watcher 同步，而是**每次事件现读一次**。
   *
   *   原先用 registerWatcher 把 store → 'grid'|'poi' 推过来，但那是条
   *   "多一次跳转"的链路：watcher 没触发 / 触发时 hover 还没建 / 顺序错开，
   *   都会表现为"悬停完全没反应"，而且很难查。
   *
   *   这里改成 resolve() 回调，由 mapView 提供，直接读当前 store：
   *     · 无状态可缓存 → 不存在"没同步上"这种 bug
   *     · 一次 pointermove 里读一次，成本可忽略
   */
  const resolve = options.resolve ?? (() => null);
  /** 当前热力图类别（'total' / 'school' / ...），同样每次现读，保证标签与配色一致 */
  const category = options.category ?? (() => 'total');

  /** 格子标签：跟着当前类别取数 */
  function gridLabel(properties) {
    return gridLabelOf(properties, category());
  }

  const source = new VectorSource();

  const layer = new VectorLayer({
    source,
    zIndex: 90, // 高于所有 WMS 层（0/10），低于分析图形的 100
    className: 'ol-hover', // 不挂 ol-layer-base → 永不被去色
    // 悬停层不该抢事件：不是 interactive 的图层，默认就不吃事件，这里显式声明
    updateWhileInteracting: false,
  });

  map.addLayer(layer);

  /**
   * 选中层：和悬停层分开。
   * ★ 必须分开 —— 用户可能"选中 A 格，鼠标划过 B 格"，
   *   共用一个 source 的话，悬停清场会把选中一起擦掉。
   */
  const selSource = new VectorSource();
  const selLayer = new VectorLayer({
    source: selSource,
    zIndex: 91, // 压在高亮层之上：选中比悬停"更重"
    className: 'ol-select',
    updateWhileInteracting: false,
  });
  map.addLayer(selLayer);

  /** 当前选中的要素（{ id, geometry, properties }）与它属于哪一类 */
  let selectedHit = null;
  let selectedKind = null; // 'grid' | 'poi'

  /** 选中要素上挂的标签文字 */
  function selectedText(hit, kind) {
    return kind === 'poi'
      ? String(hit.properties?.name ?? '').slice(0, LABEL_MAX)
      : gridLabel(hit.properties);
  }

  /** 重画选中要素（类别切换后标签文字会变，也要重画） */
  function drawSelected() {
    selSource.clear();
    if (!selectedHit || !selectedHit.geometry) return;
    let geom;
    try {
      geom = geoJson.readGeometry(selectedHit.geometry);
    } catch {
      return;
    }
    const f = new Feature({ geometry: geom });
    const text = selectedText(selectedHit, selectedKind);
    f.setStyle(
      selectedKind === 'poi' ? poiSelectedStyle(text) : gridSelectedStyle(text),
    );
    selSource.addFeature(f);
  }

  /** 'grid' | 'poi' | null —— 只记录"上一次算出来的模式"，用来判断要不要清场 */
  let mode = null;
  let key = null; // pointermove 的监听句柄
  let timer = null; // 拖尾定时器
  let inFlight = false;
  let lastAt = 0; // 上次真正发请求的时刻
  let lastPixel = null; // 上次发请求时的像素位置
  let lastId = null; // 上次命中的要素 id（结果锁）
  let lastCoord = null; // 最近一次鼠标位置（拖尾时用）

  const target = map.getTargetElement();

  /**
   * 取当前模式，并在模式变化时清场。
   * ★ 这是整个悬停的"唯一真相来源"：每次 pointermove / 每次 run() 都重新问一遍。
   */
  function currentMode() {
    const next = resolve() ?? null;
    if (next !== mode) {
      mode = next;
      lastPixel = null; // 换模式后重新开始算位移
      lastId = null;
      source.clear();
      if (target) target.style.cursor = '';
      // 开发期线索：悬停不灵时先看这行有没有打出来（生产构建会摇掉）
      if (import.meta.env.DEV && next) console.info('[hover] 模式 →', next);
    }
    return mode;
  }

  function clear() {
    if (source.getFeatures().length) source.clear();
    lastId = null;
    if (target && mode) target.style.cursor = '';
  }

  function draw(hit) {
    const labelText =
      mode === 'poi'
        ? String(hit.properties?.name ?? '').slice(0, LABEL_MAX)
        : gridLabel(hit.properties);

    const geom = hit.geometry ? geoJson.readGeometry(hit.geometry) : null;
    if (!geom) return;

    const f = new Feature({ geometry: geom });
    f.setStyle(mode === 'poi' ? poiStyle(labelText) : gridStyle(labelText));

    source.clear();
    source.addFeature(f);
  }

  async function run() {
    timer = null;
    if (!currentMode() || !lastCoord || inFlight) return;

    // 热力图在低缩放下格太小（一格不到 2 px），探针会返回错格子，直接不查。
    // ★ 但不能静默什么都不做 —— 用户只会觉得"悬停失灵"。
    //   这里在光标旁浮一句提示，告诉他为什么没有高亮。
    //   提示要跟着光标走：复用同一个 Feature，只改坐标，不重建样式。
    if (mode === 'grid' && (map.getView().getZoom() ?? 0) < MIN_GRID_ZOOM) {
      lastId = '__hint__';
      const existing = source.getFeatures()[0];
      if (existing && existing.get('__hint')) {
        existing.getGeometry().setCoordinates(lastCoord);
      } else {
        const tip = new Feature({ geometry: new Point(lastCoord) });
        tip.set('__hint', true);
        tip.setStyle(hintStyle(`放大到 z${MIN_GRID_ZOOM} 才能选格子`));
        source.clear();
        source.addFeature(tip);
      }
      if (target) target.style.cursor = '';
      return;
    }

    lastAt = performance.now();
    inFlight = true;

    try {
      const hit = await probeFeature(
        map,
        { coordinate: lastCoord },
        LAYER_OF[mode], // ★ 必须是图层 id（heat/poi），不能直接传 mode（grid/poi）
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
    if (evt.dragging) return; // 拖动地图时不查，否则一路狂发请求

    lastCoord = evt.coordinate;
    if (!currentMode()) return; // 现在不该悬停（分析模式 / 图层都关了）

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
    clear,

    /** 供调用方在外部状态突变后（如进出分析模式）立刻清掉残留高亮 */
    reset() {
      currentMode();
    },

    /**
     * 设定"选中"对象（点击后调用）。
     * @param {{ id: string|null, geometry: object, properties: object }|null} hit
     * @param {'grid'|'poi'} [kind] 不传则用当前模式
     */
    setSelected(hit, kind) {
      if (!hit || !hit.geometry) {
        selectedHit = null;
        selectedKind = null;
        selSource.clear();
        return;
      }
      selectedHit = hit;
      selectedKind = kind ?? mode ?? 'grid';
      drawSelected();
    },

    clearSelected() {
      selectedHit = null;
      selectedKind = null;
      selSource.clear();
    },

    /** 类别切换后标签数字会变，重画一次（几何不用重新请求） */
    refreshSelected() {
      if (selectedHit) drawSelected();
    },

    destroy() {
      if (timer) clearTimeout(timer);
      timer = null;
      if (key) unByKey(key);
      key = null;
      mode = null;
      if (target) target.style.cursor = '';
      source.clear();
      selSource.clear();
      map.removeLayer(layer);
      map.removeLayer(selLayer);
    },
  };
}
