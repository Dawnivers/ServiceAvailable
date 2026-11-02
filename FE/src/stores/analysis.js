import { defineStore } from 'pinia';

/**
 * ════════════════════════════════════════════════════════════
 * analysis store —— 分析模式的全部状态
 *
 * 设计原则（与 layers / selection 保持一致）：
 *   这里只存「值」，不存 OL 对象。
 *   画圆、画矩形、调接口都由 composable 去读它、翻译成动作。
 *
 * 状态机的核心是 active：
 *   active=false → 浏览模式：图层面板 + 正常底图
 *   active=true  → 分析模式：分析工具面板 + 底图变灰 + 搜索框弱化
 *
 * ★ center 允许为 null：
 *   这是「从顶栏进入」和「从卡片进入」的**唯一区别**。
 *   顶栏进来 center=null，等用户点地图；
 *   卡片进来 center 直接就是那个 POI，下一步可以立即算。
 * ════════════════════════════════════════════════════════════
 */

// ── 工具清单：没有"缓冲区"，但有"自由绘制" ────────────────────
// 缓冲区是分析动作，不是选择方式，它由下面的 radius 滑杆表达。
// 放一个"缓冲区"按钮会变成永远按下的死键（设计稿里那处是重复的）。
//
// ★ 为什么必须有"自由绘制"：后端 /api/poi/within 吃的是任意 WKT 多边形，
//   只给"框选"等于把后端能力砍掉一半——用户画不出弧形边界、也圈不了沿江的
//   狭长地带。三者的产出物是不同的几何：
//     点选   → 一个点 + 半径 → 圆（走 /api/poi/nearby）
//     自由绘制 → 任意多边形   → 走 /api/poi/within
//     框选   → 矩形           → 也走 /api/poi/within（矩形是特殊多边形）
export const TOOLS = [
  { key: 'point', label: '点选' },
  { key: 'freehand', label: '自由绘制' },
  { key: 'rect', label: '框选' },
  { key: 'measure', label: '测距' },
];

/** 参与统计的类别。key 必须和后端 category 字段一致 */
export const CATEGORIES = [
  { key: 'school', label: '学校', color: '#1565C0' },
  { key: 'hospital', label: '医院 / 诊所', color: '#C62828' },
  { key: 'mall', label: '商场 / 超市', color: '#EF6C00' },
  { key: 'park', label: '公园', color: '#2E7D32' },
];

/** 半径滑杆的范围。后端校验是 (0, 5000]，这里收窄到更实用的区间 */
export const RADIUS = { min: 100, max: 2000, step: 50, default: 800 };

// ════════════════════════════════════════════════════════════
//  叠加分析：多面求交 / 重叠度
//
//  与「单图形分析」的关系：它是一个**开关**，不是第 5 个工具。
//  开着的时候，框选 / 自由绘制 / 点选都照常可用，只是**画完不清场**，
//  一个接一个地累积成多个面；关掉就回到原来「一次一个图形」的逻辑。
//  这样不用在工具栏里塞一个和 rect/freehand 语义打架的选项。
// ════════════════════════════════════════════════════════════

/**
 * 最多 6 个面。
 * ★ 不是性能限制，是人的阅读限制：组合数是 2^n-1，7 个面就 127 种，
 *   真实叠加分析通常只有 2–4 个。后端同名常量会再校验一次。
 */
export const MAX_SHAPES = 6;

/**
 * 面的字母 + 颜色。
 * ★ 颜色特意避开四个类别色（学校蓝 / 医院红 / 商场橙 / 公园绿）的**原值**，
 *   否则图例里「红=医院」和「红=区域B」会混。这里用相近但不同的色阶。
 */
export const SHAPE_LABELS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const SHAPE_COLORS = ['#1E88E5', '#FB8C00', '#43A047', '#8E24AA', '#00897B', '#D81B60'];

/**
 * 重叠度配色：1 重→6 重，由浅黄到深靛，越深代表被越多面覆盖。
 * 前 4 档与后端 SLD / 地图上 VectorLayer 的填色一一对应，改一处要同步另一处。
 */
export const DEGREE_COLORS = ['#FFD54F', '#FF9800', '#F44336', '#9C27B0', '#1A237E', '#0D1230'];


const DEFAULT_CATEGORIES = () => ({
  school: true,
  hospital: true,
  mall: true,
  park: true,
});

export const useAnalysisStore = defineStore('analysis', {
  state: () => ({
    active: false, // 是否处于分析模式
    tool: 'point', // 'point' | 'rect' | 'measure'
    radius: RADIUS.default, // 缓冲区半径，米（只在 point 模式有意义）
    categories: DEFAULT_CATEGORIES(), // 参与统计的类别
    center: null, // 分析中心 { lon, lat, name } | null
    geometry: null, // 画出来的多边形 { wkt, areaKm2 } | null（下一步拿去调 /within）
    measure: null, // 测距结果，单位米
    result: null, // 接口原始结果（点选→NearbyDto / 多边形→WithinDto）
    resultLoading: false,
    resultError: null,
    resultMs: null, // 这次请求的实际耗时（毫秒），底部 SQL 提示条用

    // ── 叠加分析 ─────────────────────────────────────────────
    overlay: false, // 开关：开着时绘制「累积不清场」
    shapes: [], // [{ id, label, color, kind:'area'|'circle', wkt?, lon?, lat?, radius?, areaKm2 }]
    shapeSeq: 0, // 自增序号，生成 s1/s2…（删了不回收，避免和地图上的残留要素撞名）
    shapeSelected: null, // 面板里点中的面 id（null = 没选）

    /**
     * 「还能用半径滑杆调」的那个圆。
     *
     * ★ 语义：**只有刚画完、还没被下一个图形顶掉的那个圆**可以调。
     *   画下一笔（不管圆还是多边形）它就锁定 —— 否则回头拖滑杆时，
     *   到底在调哪个圆完全靠猜，多面叠加会变成一团乱。
     * ★ 只有 kind='circle' 的面会成为 active；手绘多边形没有半径这个概念，
     *   画完多边形也会把上一个圆顶掉（active = null）。
     */
    activeShapeId: null,

    overlayResult: null, // 接口原始结果（union / intersect / byDegree / shapes / geometry）
    overlayLoading: false,
    overlayError: null,
    overlayMs: null,
  }),

  getters: {
    /** 勾选中的类别 key 数组，传给接口/查询用 */
    activeCategories: (s) =>
      CATEGORIES.filter((c) => s.categories[c.key]).map((c) => c.key),

    /** 当前工具的中文名，面板右上角「点选模式」用 */
    toolLabel: (s) => TOOLS.find((t) => t.key === s.tool)?.label ?? '点选',

    /** 是否已经有中心点（决定提示文案 + 能否立即出结果） */
    hasCenter: (s) => s.center !== null,

    /** 测距不需要半径和类别，面板据此置灰那两块 */
    needsRadius: (s) => s.tool !== 'measure',

    /**
     * 面板真正拿去渲染的结果：在原始结果上套一层「类别勾选」过滤。
     *
     * ★ 为什么能在前端过滤而不用改后端：byCategory 是**全量**分类计数
     *   （count = ΣbyCategory），所以把未勾选的类别去掉后重新求和，
     *   得到的 count 与后端按类别过滤一模一样，不是近似。
     *   只有 items/nearest 列表是"最近 N 个"，前端过滤会让条数变少 —— 这是可接受的。
     */
    displayResult: (s) => {
      const r = s.result;
      if (!r) return null;

      const byCategory = {};
      let count = 0;
      for (const c of CATEGORIES) {
        if (!s.categories[c.key]) continue;
        const n = Number(r.byCategory?.[c.key] ?? 0);
        byCategory[c.key] = n;
        count += n;
      }

      const list = r.nearest ?? r.items ?? [];
      const items = list.filter((x) => s.categories[x.category]);

      return {
        count,
        byCategory,
        items,
        // 两种模式的元信息不一样，UI 据此决定副标题
        mode: s.tool === 'point' ? 'circle' : 'area',
        radiusM: r.radiusM ?? null,
        areaKm2: r.areaKm2 ?? null,
        centerName: s.center?.name ?? null,
      };
    },
  },

  actions: {
    /**
     * 进入分析模式。
     * @param {{ center?: {lon:number, lat:number, name?:string} | null }} opts
     */
    enter({ center = null } = {}) {
      this.active = true;
      this.tool = 'point'; // 带中心点进来时一定是点选语义
      this.center = center;
      this.geometry = null;
      this.measure = null;
      this.result = null; // 上一轮的结果作废
      this.resetOverlay();
    },

    /** 退出分析模式：所有状态回默认，别把上个中心带到下次 */
    exit() {
      this.active = false;
      this.tool = 'point';
      this.center = null;
      this.geometry = null;
      this.measure = null;
      this.result = null;
      this.resultError = null;
      this.resultLoading = false;
      this.resultMs = null;
      this.resetOverlay();
      // radius / categories 保留用户上次的选择，不重置——
      // 这是「偏好」不是「临时状态」，重置反而让人骂娘
    },

    /** 顶栏按钮：进/出切换 */
    toggle(opts) {
      if (this.active) this.exit();
      else this.enter(opts);
    },

    setTool(tool) {
      if (!TOOLS.some((t) => t.key === tool)) return;
      // ★ 叠加模式下没有「测距」这一档：它不出统计，也没有面可以加进叠加列表。
      //   工具栏那边也会把按钮压淡，这里是第二道闸（快捷键/程序调用也挡住）。
      if (this.overlay && tool === 'measure') return;
      this.tool = tool;
    },

    /** 半径夹到合法区间，防滑杆传进来越界值（后端会 400） */
    setRadius(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return;
      this.radius = Math.min(RADIUS.max, Math.max(RADIUS.min, Math.round(n)));
    },

    toggleCategory(key) {
      if (!(key in this.categories)) return;
      this.categories[key] = !this.categories[key];
    },

    setCenter(center) {
      this.center = center;
    },

    clearCenter() {
      this.center = null;
      this.result = null;
    },

    /** 手绘/框选画完一个多边形。wkt 已是 4326，可直接喂 /api/poi/within */
    setGeometry(geometry) {
      this.geometry = geometry;
      // 画了多边形就不再走"圆心 + 半径"那条路，两者互斥
      this.center = null;
      this.result = null;
    },

    /** 测距结果（米） */
    setMeasure(meters) {
      this.measure = meters;
    },

    setResult(result, ms = null) {
      this.result = result;
      this.resultError = null;
      this.resultMs = ms;
    },

    setResultLoading(v) {
      this.resultLoading = !!v;
    },

    setResultError(msg) {
      this.resultError = msg;
      this.result = null;
    },

    clearResult() {
      this.result = null;
      this.resultError = null;
      this.resultLoading = false;
      this.resultMs = null;
    },

    /**
     * 换工具时的清理：**上一轮的一切都作废**。
     *
     * 早期保留「点选模式下不清圆心」，因为改半径还要用；
     * 但换工具本来就该是"重新开始"，而且现在绘图层会在换工具时清空图形，
     * store 里若还留着 center，面板就会显示一个地图上已经不存在的圆 —— 状态自相矛盾。
     */
    clearSketch() {
      this.center = null;
      this.geometry = null;
      this.measure = null;
      this.result = null;
      this.resultError = null;
      this.resultLoading = false;
      this.resultMs = null;

      // ★ 叠加模式下换工具（矩形 ↔ 自由绘制 ↔ 点选）**不清已经画好的面**，
      //   否则画到第 3 个想换个画法，前两个就没了 —— 这正是用户要解决的问题。
      //   清空面由「清空」按钮或关掉叠加开关负责。
      if (!this.overlay) {
        this.shapes = [];
        this.shapeSelected = null;
        this.activeShapeId = null;
        this.overlayResult = null;
        this.overlayError = null;
        this.overlayMs = null;
      }
    },

    // ════════════════════════════════════════════════════════════
    //  叠加分析
    // ════════════════════════════════════════════════════════════

    /**
     * 开关叠加分析。
     *
     * ★ 打开时清掉单图形那一套（圆心 / 多边形 / 结果），
     *   两者的产物在地图上会互相干扰：
     *   单图形模式下 drawing 一旦 setCenter 就会 removeByKind('circle')，
     *   而叠加模式的面用的是 kind='shape'，本来就是两套，但 store 里混着会乱。
     */
    setOverlay(on) {
      const next = !!on;
      if (next === this.overlay) return;

      this.overlay = next;
      this.resetOverlay();

      if (next) {
        this.center = null;
        this.geometry = null;
        this.measure = null;
        this.result = null;
        this.resultError = null;
        this.resultMs = null;
        // 测距不出统计，叠加入口不能停在它上面
        if (this.tool === 'measure') this.tool = 'rect';
      }
    },

    toggleOverlay() {
      this.setOverlay(!this.overlay);
    },

    /** 清掉叠加相关的一切（面本身 + 结果 + 选中），不动 overlay 开关 */
    resetOverlay() {
      this.shapes = [];
      this.shapeSeq = 0;
      this.shapeSelected = null;
      this.activeShapeId = null;
      this.overlayResult = null;
      this.overlayError = null;
      this.overlayLoading = false;
      this.overlayMs = null;
    },

    /**
     * 追加一个面。
     *
     * @param {{ id:string, kind:'area'|'circle', wkt?:string, lon?:number,
     *           lat?:number, radius?:number, areaKm2:number }} shape
     *        id 由 drawing.js 生成（它才是持有 OL Feature 的一方），
     *        字母和颜色按「当前第几个」分配，删掉后会重新排。
     * @returns {boolean} 是否加成功（超过上限返回 false）
     */
    addShape(shape) {
      if (!this.overlay || !shape?.id) return false;
      if (this.shapes.length >= MAX_SHAPES) return false;
      if (this.shapes.some((s) => s.id === shape.id)) return false;

      const idx = this.shapes.length;
      this.shapes.push({
        id: shape.id,
        label: SHAPE_LABELS[idx],
        color: SHAPE_COLORS[idx],
        kind: shape.kind,
        wkt: shape.wkt ?? null,
        lon: shape.lon ?? null,
        lat: shape.lat ?? null,
        radius: shape.radius ?? null,
        areaKm2: shape.areaKm2 ?? 0,
      });

      // 面变了，上一轮统计作废（不要显示一份对不上的结果）
      this.overlayResult = null;
      this.overlayError = null;

      // ★ 刚画完的圆成为「可调半径」的那一个；画多边形则把上一个圆顶掉
      this.activeShapeId = shape.kind === 'circle' ? shape.id : null;
      return true;
    },

    /**
     * 删一个面。
     * ★ 删完要**重新排字母和颜色**，否则面板上是「区域 A、区域 C」，
     *   用户会以为 B 丢了或者自己画漏了。
     *   地图上对应的要素由 mapView 的 overlayShapes watcher 同步改色。
     */
    removeShape(id) {
      const i = this.shapes.findIndex((s) => s.id === id);
      if (i < 0) return;
      this.shapes.splice(i, 1);
      this.shapes.forEach((s, k) => {
        s.label = SHAPE_LABELS[k];
        s.color = SHAPE_COLORS[k];
      });
      if (this.shapeSelected === id) this.shapeSelected = null;
      if (this.activeShapeId === id) this.activeShapeId = null;
      this.overlayResult = null;
      this.overlayError = null;
    },

    /**
     * 拖动半径滑杆时，实时改「当前那个圆」的半径。
     *
     * ★ 只更新 shapes 里那一条，不动 activeShapeId：
     *   用户还在拖，这个圆仍然是可调的，直到画下一笔。
     * ★ **不**把 overlayResult 置空：拖滑杆时每一下都清空，面板会一直闪。
     *   新结果由 useBufferAnalysis 的 260 ms 去抖请求覆盖，这中间先显示旧数字
     *   （轻微滞后，但比空白好读）。这和 addShape/removeShape 的"清空"是两种取舍：
     *   增删面 → 统计语义变了，必须清；改半径 → 还是同一组面，可以留。
     */
    updateShapeRadius(id, radius, areaKm2) {
      const s = this.shapes.find((x) => x.id === id);
      if (!s || s.kind !== 'circle') return;
      s.radius = radius;
      s.areaKm2 = areaKm2;
    },

    clearShapes() {
      if (!this.shapes.length) return;
      this.shapes = [];
      this.shapeSelected = null;
      this.activeShapeId = null;
      this.overlayResult = null;
      this.overlayError = null;
      this.overlayMs = null;
    },

    /** 面板里点中一个面：地图上高亮并缩放过去；再点一次取消 */
    toggleShapeSelected(id) {
      this.shapeSelected = this.shapeSelected === id ? null : id;
    },

    setShapeSelected(id) {
      this.shapeSelected = id ?? null;
    },

    setOverlayResult(result, ms = null) {
      this.overlayResult = result;
      this.overlayError = null;
      this.overlayMs = ms;
    },

    setOverlayLoading(v) {
      this.overlayLoading = !!v;
    },

    setOverlayError(msg) {
      this.overlayError = msg;
      this.overlayResult = null;
    },

    clearOverlayResult() {
      this.overlayResult = null;
      this.overlayError = null;
      this.overlayLoading = false;
      this.overlayMs = null;
    },
  },
});
