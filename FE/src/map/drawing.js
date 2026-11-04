/**
 * ════════════════════════════════════════════════════════════
 * drawing —— 分析图形的绘制控制器
 *
 * 职责：把「当前工具 + 半径 + 中心点」翻译成地图上的图形与交互。
 *   point    → 单击落一个中心点 + 半径圆（缓冲圈）
 *   measure  → 连续点击量距离
 *   叠加模式 → point 的每次点击追加一个圆（kind='shape'），不清场
 *
 * ★ 2026-11-04：freehand（自由绘制）与 rect（框选）已移除。
 *   它们服务于「圈一块地看里面有什么」，而本项目问的是
 *   「从我的位置出发，走得到什么」——起点必须是点，不是面。
 *   连带删掉的东西：WKT 导出（toWkt）、多边形面积（getArea/formatArea）、
 *   getPolygon()、onPolygon 回调，以及 /api/poi/within 的前端调用。
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
import Draw from 'ol/interaction/Draw.js';
import Feature from 'ol/Feature.js';
import Point from 'ol/geom/Point.js';
import Circle from 'ol/geom/Circle.js';
import GeoJSON from 'ol/format/GeoJSON.js';
import { Style, Stroke, Fill, Circle as CircleStyle, Text } from 'ol/style.js';
import { getLength } from 'ol/sphere.js';
import { fromLonLat, toLonLat } from 'ol/proj.js';

// 重叠度色板只有这一个定义处（面板的色块也读它）。
// 只取常量、不碰 store 状态，所以不违反「drawing 不 import store」的纪律。
import { DEGREE_COLORS } from '@/stores/analysis.js';

// ── 配置区 ─────────────────────────────────────────────────
const ACCENT = '#d93025'; // 分析态红，与顶栏徽章、滑杆统一
const FILL_ALPHA = 0.08; // 多边形/圆的填充透明度
const DASH = [7, 5]; // 缓冲圈的虚线节奏

// ── 叠加分析：重叠度配色 ────────────────────────────────────
// ★ 色板只在 stores/analysis.js 定义一份（面板的色块也读它），
//   这里只负责「把同一个颜色按重叠度加不同透明度」——
//   越深代表被越多面覆盖。改配色只改那一处，地图和面板不会走散。
const DEG_FILL_ALPHA = [0.3, 0.36, 0.4, 0.44, 0.48, 0.52];
const DEG_STROKE_ALPHA = [0.9, 0.9, 0.9, 0.9, 0.9, 0.9];

/** '#1E88E5' → 'rgba(30,136,229,0.06)'。面只留极淡填充，让下面的重叠色块透出来 */
function withAlpha(hex, alpha) {
  const h = String(hex).replace('#', '');
  if (h.length !== 6) return `rgba(217, 48, 37, ${alpha})`;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** 重叠度样式：deg 来自后端 GeoJSON 的 properties.deg */
function overlayResultStyle(feature) {
  const deg = Number(feature.get('deg') ?? 1);
  const i = Math.max(0, Math.min(DEGREE_COLORS.length - 1, deg - 1));
  const base = DEGREE_COLORS[i];
  return new Style({
    fill: new Fill({ color: withAlpha(base, DEG_FILL_ALPHA[i]) }),
    stroke: new Stroke({ color: withAlpha(base, DEG_STROKE_ALPHA[i]), width: 1 }),
  });
}

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
  } else if (kind === 'shape') {
    /**
     * 叠加分析画出来的面（可能多个）。
     *
     * ★ 用 kind='shape' 而不是复用 'circle'/'polygon'：
     *   那两个 kind 会被 paintCircle / removeByKind 当成「单图形」清掉，
     *   叠加模式一调半径或换中心，画好的面就没了。
     *   'shape' 自成一路，只有 clearShapes / applyShapeMeta 管它。
     *
     * ★ 填充压到 0.06：底下还压着一层「按重叠度着色」的原子面，
     *   给深了重叠区就糊成一片，看不出几重。
     */
    const color = feature.get('color') || ACCENT;
    const selected = !!feature.get('selected');
    const isCircle = type === 'Circle';

    /**
     * active = 这个圆**还能用半径滑杆调**（刚画完、还没被下一笔顶掉）。
     * 只有它会画虚线，锁定的一律实线 —— 用户一眼能看出滑杆在调哪个。
     */
    const active = !!feature.get('active');

    styles.push(
      new Style({
        stroke: new Stroke({
          color,
          width: selected ? 3.5 : active ? 2.5 : 2,
          lineDash: isCircle && active ? DASH : undefined,
        }),
        fill: new Fill({ color: withAlpha(color, 0.06) }),
      }),
    );

    // 选中的面再加一圈白内衬：深色的三重重叠区上，纯色描边容易被吃掉
    if (selected) {
      styles.push(
        new Style({ stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.9)', width: 1.5 }) }),
      );
    }
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
      // 叠加的面带上字母前缀：「A · 1.80 km²」；其它图形的标签就是原文
      const shapeName = feature.get('shapeName');
      const text = shapeName ? `${shapeName} · ${label}` : label;
      const bg =
        kind === 'shape'
          ? withAlpha(feature.get('color') || ACCENT, 0.92)
          : 'rgba(217, 48, 37, 0.92)';

      styles.push(
        new Style({
          geometry: anchor,
          text: new Text({
            text,
            font: '600 11.5px "Microsoft YaHei", "Segoe UI", sans-serif',
            fill: new Fill({ color: '#fff' }),
            backgroundFill: new Fill({ color: bg }),
            padding: [3, 6, 2, 6],
          }),
        }),
      );
    }
  }

  return styles;
}

/**
 * 标签挂在哪：圆用圆心，面用内部点，线用末端。
 *
 * ★ 按**几何类型**判断，而不是按 kind。
 *   叠加分析的面 kind='shape'，但点选生成的那一个几何是 Circle，
 *   按 kind 判断会漏掉它（标签不显示），按类型判断才覆盖得住。
 */
function labelAnchor(geom, kind) {
  try {
    const type = geom.getType();
    if (type === 'Circle') return new Point(geom.getCenter());
    if (type.includes('Polygon')) return geom.getInteriorPoint();
    if (type === 'LineString') return new Point(geom.getLastCoordinate());
  } catch {
    /* 退化几何（零面积/单点）取不到内部点，就不画标签 */
  }
  return null;
}

// ── 单位格式化 ─────────────────────────────────────────────
// （面积格式化已随矩形/自由绘制一起移除：现在只剩圆，面积用 πr² 直接算）
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

  /**
   * 叠加分析的结果层：后端算出来的「原子面」，每个带 properties.deg。
   *
   * ★ zIndex 99 —— 压在绘图层(100)之下：
   *   用户画的面要留着轮廓压在上面，否则一算完结果，自己画的边界就被盖掉了。
   * ★ 这一层永远不参与事件（不是 interactive），只是显示。
   */
  const resultSource = new VectorSource();
  const resultLayer = new VectorLayer({
    source: resultSource,
    zIndex: 99,
    style: overlayResultStyle,
    updateWhileInteracting: false,
  });
  map.addLayer(resultLayer);

  /**
   * 路网等时圈：两个图层（面 + 路网）。
   *
   * ★ 为什么单独两层而不是塞进上面的 source：
   *   ① 两者来源不同（后端算的 vs 用户画的），清场时机也不同；
   *   ② zIndex 要压在用户图形（100）之下、结果层（99）附近，
   *      塞进 source 就没法单独控制层级。
   *
   * zIndex 96 = 面（最底），97 = 路网（线压面之上、用户图形之下）。
   * ★ 面在下面：否则 50 m 缓冲的半透明面会把细线糊掉。
   */
  const surfaceSource = new VectorSource();
  const surfaceLayer = new VectorLayer({
    source: surfaceSource,
    zIndex: 96,
    style: new Style({
      fill: new Fill({ color: 'rgba(21, 101, 192, 0.12)' }),
      stroke: new Stroke({ color: 'rgba(21, 101, 192, 0.9)', width: 2 }),
    }),
    updateWhileInteracting: false,
  });
  map.addLayer(surfaceLayer);

  const networkSource = new VectorSource();
  const networkLayer = new VectorLayer({
    source: networkSource,
    zIndex: 97,
    style: new Style({
      stroke: new Stroke({ color: 'rgba(21, 101, 192, 0.75)', width: 1 }),
    }),
    updateWhileInteracting: false,
  });
  map.addLayer(networkLayer);

  // ── 内部状态 ──────────────────────────────────────────────
  let draw = null; // 当前挂着的 Draw 交互（同一时刻只能有一个）
  let tool = null;
  let radius = 800; // 米
  let center = null; // { lon, lat } 度
  let handlers = {}; // { onPoint, onMeasure, onShape }

  /** 叠加分析是否开启（开启时画完**不清场**，连续累积多个面） */
  let overlay = false;

  /**
   * 叠加面的登记表：sid → Feature。
   *
   * ★ 为什么不用 source.getFeatures() 现扫：
   *   这个 source 里同时躺着单图形的圆/多边形/测距线，
   *   按 kind 过滤再找 sid 会写得很脆；直接按 sid 存一张表，增删改都是 O(1)。
   * ★ sid 由这里生成（`s1`/`s2`…），因为 Feature 是这一层创建的；
   *   字母和颜色由 store 按「第几个」分配，再通过 applyShapeMeta 回写到 Feature 上。
   */
  const shapeFeatures = new Map();
  let shapeSeq = 0;

  /**
   * 当前「还能用半径滑杆调」的那个圆（sid），没有则为 null。
   * ★ 由 store 的 activeShapeId 单向推过来（setActiveShape），这里不自己决定，
   *   免得"地图上能调 / 面板上以为不能调"这种两套状态。
   */
  let activeCircleId = null;

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
    shapeFeatures.clear();
    activeCircleId = null;
    // ★ 等时圈的两个图层也必须清 —— 它们不在 source 里，
    //   漏了这行就会出现「退出分析模式后面和路网还挂在图上」。
    surfaceSource.clear();
    networkSource.clear();
  }

  /** 按 kind 删掉指定图形（圆和圆心会随半径变化重建） */
  function removeByKind(...kinds) {
    for (const f of [...source.getFeatures()]) {
      if (kinds.includes(f.get('kind'))) source.removeFeature(f);
    }
  }

  // ── 叠加分析：多面的登记与同步 ────────────────────────────

  /**
   * 地面米 → 3857 投影米。
   * 详见 paintCircle 里那段说明：Web Mercator 的「米」不是地面米，差 1/cos(纬度)。
   */
  function toMapRadius(meters, lat) {
    return meters / Math.cos((lat * Math.PI) / 180);
  }

  /** 下一个面的 id。只增不回收，避免删了再加时和地图上残留要素撞名 */
  function nextSid() {
    shapeSeq += 1;
    return `s${shapeSeq}`;
  }

  /**
   * 把一个刚画完的 Feature 登记成「叠加面」。
   *
   * ★ kind 用 'shape' 而不是 'circle'/'polygon'：
   *   那两个会被 paintCircle / removeByKind 当成单图形清掉，
   *   叠加模式下一拖半径或者换中心，画好的面就全没了。
   */
  function registerShape(feature, meta) {
    const sid = nextSid();
    feature.set('kind', 'shape');
    feature.set('sid', sid);
    feature.set('color', ACCENT); // 占位；store 分配好字母颜色后由 applyShapeMeta 覆盖
    if (meta.label) feature.set('label', meta.label);
    // 圆心经纬度挂在要素上：改半径时要用它重算几何，不必回头问 store
    if (meta.lon != null) feature.set('lon', meta.lon);
    if (meta.lat != null) feature.set('lat', meta.lat);
    shapeFeatures.set(sid, feature);
    return { id: sid, ...meta };
  }

  /**
   * 设定「哪个圆可以用滑杆调半径」。
   * 顺带把 active 标记刷到每个要素上 —— 只有它会画虚线。
   */
  function setActiveShape(id) {
    activeCircleId = id || null;
    for (const [sid, f] of shapeFeatures) {
      const on = sid === activeCircleId;
      if (!!f.get('active') !== on) {
        f.set('active', on);
        f.changed();
      }
    }
  }

  /**
   * 按新半径重建这个圆的几何，并把结果回传给调用方。
   *
   * ★ 半径要按 1/cos(纬度) 换算成投影米，和 paintCircle 同一个道理：
   *   ol 的 Circle 半径是投影米，后端 ST_Buffer(::geography) 用的是地面米。
   * ★ 面积用 πr²（地面米）而不是量几何 —— 圆本来就是这么定义的，
   *   量 32 边形会永远比 πr² 小 0.3%。
   */
  function resizeCircle(sid, meters) {
    const f = shapeFeatures.get(sid);
    const lon = f?.get('lon');
    const lat = f?.get('lat');
    if (lon == null || lat == null) return;

    f.setGeometry(new Circle(fromLonLat([lon, lat]), toMapRadius(meters, lat)));
    f.set('label', `${Math.round(meters)} m`);
    f.changed();

    handlers.onShapeRadius?.({
      id: sid,
      radius: meters,
      areaKm2: (Math.PI * meters * meters) / 1e6,
    });
  }

  /**
   * 把 store 里的面列表同步到地图。
   *
   * 三件事，一次遍历解决：
   *   ① store 里没有的 → 从地图上删掉（用户在面板点了删除）
   *   ② 还在的 → 更新字母和颜色（删掉中间一个后，后面会重新排 A/B/C）
   *   ③ 选中态由 setShapeSelected 单独管，这里不动
   */
  function applyShapeMeta(list) {
    const arr = Array.isArray(list) ? list : [];
    const keep = new Set(arr.map((s) => s.id));

    for (const [sid, f] of [...shapeFeatures]) {
      if (!keep.has(sid)) {
        source.removeFeature(f);
        shapeFeatures.delete(sid);
      }
    }

    for (const s of arr) {
      const f = shapeFeatures.get(s.id);
      if (!f) continue;
      f.set('shapeName', s.label);
      f.set('color', s.color);
    }

    // 可调半径的那个圆被删掉了 → 没有可调对象了
    if (activeCircleId && !shapeFeatures.has(activeCircleId)) activeCircleId = null;
  }

  /** 高亮某一个面（面板里点中）。传 null 表示取消全部选中 */
  function setShapeSelected(id) {
    for (const [sid, f] of shapeFeatures) {
      const on = sid === id;
      if (!!f.get('selected') !== on) {
        f.set('selected', on);
        f.changed();
      }
    }
  }

  /** 点中面板里的面：高亮 + 镜头飞过去 */
  function focusShape(id) {
    setShapeSelected(id);
    const f = id ? shapeFeatures.get(id) : null;
    const ext = f?.getGeometry()?.getExtent();
    if (!ext || !Number.isFinite(ext[0])) return;
    map.getView().fit(ext, {
      padding: [90, 90, 90, 90], // 避开左侧工具面板和右侧结果面板
      duration: 520,
      maxZoom: 17, // 面很小时别一头扎进 22 级
    });
  }

  /**
   * 把后端算出来的原子面画上去。
   * @param {object|null} fc GeoJSON FeatureCollection（坐标系是 4326）
   */
  function setOverlayResult(fc) {
    resultSource.clear();
    if (!fc || !fc.features || !fc.features.length) return;

    // ★ 必须 4326 → 3857：ST_AsGeoJSON 出来的永远是 WGS84 经纬度。
    //   悬停高亮那边不一样（GetFeatureInfo 的几何跟着请求的 SRS 走，不能再转），
    //   两处正好相反，别写混。
    resultSource.addFeatures(
      new GeoJSON().readFeatures(fc, {
        dataProjection: 'EPSG:4326',
        featureProjection: proj(),
      }),
    );
  }

  function clearOverlayResult() {
    resultSource.clear();
  }

  /**
   * 路网等时圈：把后端算的「可达面 + 可达路网」画上去。
   *
   * @param {object|null} data /api/poi/isochrone 的响应
   *   { status, surface(GeoJSON Polygon/MultiPolygon), skeleton(GeoJSON MultiLineString), ... }
   *
   * ★ 几何是 4326（ST_AsGeoJSON 只输出 WGS84），必须转 3857 —— 和 setOverlayResult 一致。
   *   注意与悬停高亮相反：那边 GetFeatureInfo 的几何跟着请求 SRS 走，不能再转。
   * ★ status !== 'ok' 时（最近路网比预算还远）只清场、不画 —— 空几何画不出东西。
   */
  function setIsochrone(data) {
    surfaceSource.clear();
    networkSource.clear();
    if (!data || data.status !== 'ok') return;

    const fmt = new GeoJSON();
    const opts = {
      dataProjection: 'EPSG:4326',
      featureProjection: proj(),
    };

    if (data.surface) {
      surfaceSource.addFeatures(
        fmt.readFeatures({ type: 'Feature', properties: {}, geometry: data.surface }, opts),
      );
    }
    if (data.skeleton) {
      networkSource.addFeatures(
        fmt.readFeatures({ type: 'Feature', properties: {}, geometry: data.skeleton }, opts),
      );
    }
  }

  function clearIsochrone() {
    surfaceSource.clear();
    networkSource.clear();
  }

  /**
   * 叠加模式的「多个可达面 + 多条可达路网」。
   *
   * @param {Array<{id:string, surface:object, skeleton:object}>} surfaces
   *        /api/poi/overlay-network 返回的 surfaces[]，几何都是 4326
   *
   * ★ 和 setIsochrone 共用同一对图层（surfaceLayer 96 / networkLayer 97）：
   *   两种模式互斥（叠加模式不做单点等时圈），共用图层反而能保证
   *   「切模式时旧内容一定被清掉」——各自一套 source 才容易出现残留。
   */
  function setOverlaySurfaces(surfaces) {
    surfaceSource.clear();
    networkSource.clear();
    if (!Array.isArray(surfaces) || !surfaces.length) return;

    const fmt = new GeoJSON();
    const opts = { dataProjection: 'EPSG:4326', featureProjection: proj() };

    for (const s of surfaces) {
      if (s?.surface) {
        surfaceSource.addFeatures(
          fmt.readFeatures({ type: 'Feature', properties: {}, geometry: s.surface }, opts),
        );
      }
      if (s?.skeleton) {
        networkSource.addFeatures(
          fmt.readFeatures({ type: 'Feature', properties: {}, geometry: s.skeleton }, opts),
        );
      }
    }
  }

  /** 开关叠加模式。关掉时把面与结果一起收干净 */
  function setOverlay(v) {
    overlay = !!v;
    if (overlay) return;
    for (const f of shapeFeatures.values()) source.removeFeature(f);
    shapeFeatures.clear();
    resultSource.clear();
    activeCircleId = null;
  }

  /** 半径或中心变了，重画缓冲圈（点选模式和卡片入口都用它） */
  function paintCircle() {
    removeByKind('circle', 'center');
    if (!center) return;

    const c = fromLonLat([center.lon, center.lat]);

    /**
     * ★★ 3857 是等角投影：地图上的 1 米 ≠ 地面 1 米 ★★
     *
     *   缩放因子 = 1 / cos(纬度)。武汉 φ≈30.6°，cos≈0.861，
     *   也就是「地图上 1 米」只对应地面 0.861 米。
     *
     *   后端是 ST_DWithin(geom::geography, 圆心, radius) —— 算的是**地面米**；
     *   而 ol/geom/Circle 的半径单位是**投影米**。
     *   若直接 new Circle(c, radius)：
     *     650 m 的圆实际只画成 650×0.861 ≈ 560 m，
     *     于是 606 m、626 m 这些"确实在 650 m 内"的设施会落在圆外，
     *     看起来就像"圆画小了 / 数据和图不匹配"。
     *
     *   所以画的时候要放大 1/cos(纬度)，圆的**地面半径**才等于 radius。
     *   （Web Mercator 是等角投影，局部各方向比例一致，
     *     放大后仍然是圆，不会变成椭圆。）
     */
    const mapRadius = toMapRadius(radius, center.lat);

    source.addFeature(
      new Feature({
        kind: 'circle',
        label: `缓冲区 ${Math.round(radius)} m`,
        geometry: new Circle(c, mapRadius),
      }),
    );
    source.addFeature(new Feature({ kind: 'center', geometry: new Point(c) }));
  }

  // ── 工具切换 ──────────────────────────────────────────────
  /**
   * 2026-11-04：只剩 point / measure 两种。
   * rect / freehand 连同它们的 WKT 导出、面积计算一并移除 ——
   * 「圈一块地」与本项目「从一个点出发能到哪」不是同一个命题。
   *
   * @param {'point'|'measure'|null} next
   * @param {{ onPoint?:Function, onMeasure?:Function, onShape?:Function }} cb
   *        onShape 只在叠加模式下触发，带 { id, lon, lat, radius, areaKm2, label }
   */
  function setTool(next, cb = {}) {
    // ★ 只有「工具真的换了」才清图形。
    //   setTool 会被 syncDrawing 反复调用（拖半径滑杆、改中心都会调），
    //   若无条件 clear，则每拖一下滑杆刚画好的圆就被擦掉又重画，画面会闪。
    const changed = next !== tool;

    removeDraw();
    tool = next;
    handlers = cb;

    // ★ 换工具 = 上一轮画的圆/测距线全部作废（用户明确要求）
    // ★ 但**叠加模式下不能清** —— 叠加是「连续画多个圆」，
    //   画到第 3 个时前面两个不该消失。
    if (changed && !overlay) clear();

    if (!next) return;

    if (next === 'point') {
      // stopClick：避免这次点击同时被地图的 singleclick 吃掉（那会去查 POI 详情）
      draw = new Draw({ source, type: 'Point', stopClick: true });
      draw.on('drawend', (e) => {
        const [lon, lat] = toLonLat(e.feature.getGeometry().getCoordinates());

        // ── 叠加模式：每次点击追加一个「圆面」，而不是重建唯一的缓冲圈 ──
        if (overlay) {
          e.feature.setGeometry(new Circle(fromLonLat([lon, lat]), toMapRadius(radius, lat)));
          // 面积用 πr²（地面米），比按投影几何量更准，也和圆本身的定义一致
          const meta = registerShape(e.feature, {
            kind: 'circle',
            lon,
            lat,
            radius,
            areaKm2: (Math.PI * radius * radius) / 1e6,
            label: `${Math.round(radius)} m`,
          });
          handlers.onShape?.(meta);
          return;
        }

        center = { lon, lat };
        e.feature.set('kind', 'center');
        // ★ Draw 是在 dispatchEvent('drawend') **之后**才把要素加进 source 的，
        //   所以这里立刻 paintCircle() 会清不到它，结果是"两个圆心"（实测复现）。
        //   推到下一拍再画：那时要素已在 source 里，paintCircle 能把它一起清掉。
        setTimeout(paintCircle, 0);
        handlers.onPoint?.({ lon, lat });
      });
    } else if (next === 'measure') {
      // 测距在叠加模式下没有意义（store 那边会把 tool 从 measure 踢走）
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
  /**
   * 半径变化（滑杆拖动时实时生效）。
   *
   * 两条完全不同的路：
   *   普通模式 → 重画「唯一的那个缓冲圈」（圆心在 center）
   *   叠加模式 → 只改**当前可调的那一个圆**（activeCircleId）：
   *              刚画完的圆跟着滑杆长大缩小，一旦画了下一笔它就锁定，
   *              之后怎么拖滑杆都与它无关。多面叠加里"到底在调哪个"必须唯一，
   *              否则拖一下半径几个圆一起变，重叠关系直接乱掉。
   */
  function setRadius(next) {
    const n = Number(next);
    if (!Number.isFinite(n) || n === radius) return;
    radius = n;

    if (overlay) {
      if (activeCircleId) resizeCircle(activeCircleId, n);
      return;
    }

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
    map.removeLayer(resultLayer);
    map.removeLayer(surfaceLayer);
    map.removeLayer(networkLayer);
    source.clear();
    resultSource.clear();
    surfaceSource.clear();
    networkSource.clear();
    shapeFeatures.clear();
    activeCircleId = null;
  }

  return {
    layer,
    source,
    setTool,
    setRadius,
    setCenter,
    clear,
    destroy,

    // ── 叠加分析 ──
    setOverlay,
    applyShapeMeta,
    setActiveShape,
    setShapeSelected,
    focusShape,
    setOverlayResult,
    clearOverlayResult,

    // ── 路网等时圈 ──
    setIsochrone,
    clearIsochrone,
    // ── 叠加（路网口径）：多个可达面 + 多条路网 ──
    setOverlaySurfaces,

    // 只读一下当前状态，方便调试
    get tool() {
      return tool;
    },
  };
}
