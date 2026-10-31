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
      // radius / categories 保留用户上次的选择，不重置——
      // 这是「偏好」不是「临时状态」，重置反而让人骂娘
    },

    /** 顶栏按钮：进/出切换 */
    toggle(opts) {
      if (this.active) this.exit();
      else this.enter(opts);
    },

    setTool(tool) {
      if (TOOLS.some((t) => t.key === tool)) this.tool = tool;
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
    },
  },
});
