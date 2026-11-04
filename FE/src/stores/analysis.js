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

/**
 * 工具分组（2026-11-04 起）。
 *
 * ★ 为什么分组：矩形 / 自由绘制是「圈一块地」的画法，
 *   它们回答的是「这块地里有什么」，和「从这里能走到哪」是两种问题。
 *   可达性分析只认一个起点（点选），所以**非叠加模式下不再暴露这两个工具**。
 *
 * ★ 但叠加分析离不开它们：叠加就是「连续画 2–6 个面相求交」，
 *   只允许画圆的话叠加就退化成同心圆，没有意义。
 *   所以它们在**叠加模式下仍然可用**，只是不出现在普通分析模式的工具栏里。
 *
 * 校验白名单仍然用合并后的 TOOLS —— 程序调用/快捷键传进来时依旧合法。
 */
export const TOOLS_BASE = [
  { key: 'point', label: '点选' },
  { key: 'measure', label: '测距' },
];
export const TOOLS_OVERLAY = [
  { key: 'rect', label: '框选' },
  { key: 'freehand', label: '自由绘制' },
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

    // ── 路网等时圈（可达性分析的主角，2026-11-04 加）──────────
    // ★ 和 result 是**两条腿**：result 是直线口径（/nearby），
    //   isochrone 是路网口径（/isochrone）。两个都留着才能做对比。
    // ★ 只在点选模式下请求；矩形/自由绘制不再属于可达性分析。
    isochrone: null, // /api/poi/isochrone 原始结果
    isochroneLoading: false,
    isochroneError: null,
    isochroneMs: null,

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

    // ── 设施明细（面板里展开时才拉）──────────────────────────
    // ★ 和 overlayResult 分开存：主接口默认不带明细（withItems=false），
    //   这几项只由「展开明细」/「导出 CSV」两个动作填充。
    // ★ 一旦 overlayResult 被替换（面变了、半径变了），明细立即作废 ——
    //   否则会出现"列表还是旧的 165 条，但统计已经变成新的一组面"。
    overlayItems: [],
    overlayItemsTotal: 0,
    overlayItemsLoading: false,
    overlayItemsError: null,
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

    /**
     * 叠加请求的 shapes 数组（已翻成后端要的形状）。
     *
     * ★ 放 getter 是为了只有一处真相：面板取数和导出 CSV 用的是**同一个载荷**，
     *   各拼一份迟早会漏字段（比如导出时忘了带 radius，圆就变成 0 米）。
     * ★ 只传几何来源，不传颜色/面积那些展示字段 —— 见 /api/poi/overlay 的说明。
     */
    overlayShapes: (s) =>
      s.shapes.map((x) =>
        x.kind === 'circle'
          ? {
              id: x.id,
              name: x.label,
              kind: 'circle',
              lon: x.lon,
              lat: x.lat,
              radius: x.radius,
            }
          : { id: x.id, name: x.label, kind: 'area', wkt: x.wkt },
      ),

    /**
     * 「真实可达」面板要渲染的数据（与 displayResult 同一套类别过滤逻辑）。
     *
     * ★ 为什么单独一个 getter 而不是复用 displayResult：
     *   两者口径不同 —— displayResult 是「直线圆内」，这里是「路网可达」。
     *   硬塞进一个 getter 会出现"面板切换时数字跳变但标签没变"的错位。
     *
     * ★ circleCount / circleAreaKm2 是**对照值**，取自直线口径的结果：
     *   - circleCount 来自 /nearby 的 count（已按类别过滤）
     *   - circleAreaKm2 用 πr² 直接算，不再开接口
     *   有了这两个，面板才能说「面积只剩 54%，设施还有 96%」。
     */
    displayIsochrone: (s) => {
      const r = s.isochrone;
      if (!r) return null;

      // 非 ok 状态（最近路网比预算还远）：只回状态，不给数字
      if (r.status !== 'ok') {
        return {
          status: r.status,
          snapM: r.snapM ?? null,
          usedBudgetM: r.usedBudgetM ?? 0,
          count: 0,
          byCategory: {},
          items: [],
        };
      }

      const byCategory = {};
      let count = 0;
      for (const c of CATEGORIES) {
        if (!s.categories[c.key]) continue;
        const n = Number(r.byCategory?.[c.key] ?? 0);
        byCategory[c.key] = n;
        count += n;
      }

      const items = (r.items ?? []).filter((x) => s.categories[x.category]);

      // 直线口径的圆面积：π r²（r 用当前半径，单位米 → km²）
      const rM = Number(s.radius ?? 800);
      const circleAreaKm2 = (Math.PI * rM * rM) / 1e6;

      return {
        status: 'ok',
        count,
        byCategory,
        items,
        itemsTotal: r.itemsTotal ?? items.length,
        areaKm2: r.areaKm2 ?? null,
        snapM: r.snapM ?? null,
        usedBudgetM: r.usedBudgetM ?? null,
        edgeCount: r.edgeCount ?? null,
        partialCount: r.partialCount ?? null,
        walkKm: r.walkKm ?? null,
        // ── 对照：直线口径 ───────────────────────────────
        circleCount: s.displayResult?.count ?? null,
        circleAreaKm2,
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
      this.clearIsochrone(); // 路网等时圈同样作废（否则会带着上次的面进来）
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
      this.clearIsochrone();
      /**
       * ★ 2026-11-04 修：退出时必须把叠加开关也关掉。
       *   原来只调 resetOverlay()（它清面、清结果，但**不动 overlay 这个布尔值**），
       *   于是「退出 → 再进分析」会直接落在叠加模式里：
       *   工具栏显示的是框选/自由绘制、点一下地图却画不出点选的圆，
       *   实测就是这样多出一个 A·缓冲区 800 m 的面。
       */
      this.overlay = false;
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
      // ★ 起点变了，上一张等时圈就无效了 —— 必须在这里清，
      //   否则新请求回来之前，图上会挂着「以旧点为圆心」的面，看着像算错了。
      this.clearIsochrone();
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
      // 等时圈只认"一个起点"，多边形没有起点可言 → 一起清掉
      this.clearIsochrone();
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

    // ── 路网等时圈 ───────────────────────────────────────────
    setIsochrone(data, ms = null) {
      this.isochrone = data;
      this.isochroneError = null;
      this.isochroneMs = ms;
      this.isochroneLoading = false;
    },

    setIsochroneLoading(v) {
      this.isochroneLoading = !!v;
    },

    setIsochroneError(msg) {
      this.isochroneError = msg;
      this.isochrone = null;
      this.isochroneLoading = false;
    },

    clearIsochrone() {
      this.isochrone = null;
      this.isochroneError = null;
      this.isochroneLoading = false;
      this.isochroneMs = null;
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
        this.clearIsochrone(); // 叠加模式不做等时圈
        // 测距不出统计，叠加入口不能停在它上面
        if (this.tool === 'measure') this.tool = 'rect';
      } else {
        /**
         * ★ 2026-11-04：关掉叠加时要检查「当前工具是否还在可用列表里」。
         *   叠加模式用的是 rect / freehand，而普通分析模式只暴露 point / measure。
         *   不收回的话，工具栏上会出现「一个都没选中」的状态，
         *   而且 drawing 里还挂着一个用户看不见按钮的矩形交互 —— 点地图就画框，莫名奇妙。
         */
        if (!TOOLS_BASE.some((t) => t.key === this.tool)) this.tool = 'point';
      }
    },

    toggleOverlay() {
      this.setOverlay(!this.overlay);
    },

    /** 清掉叠加相关的一切（面本身 + 结果 + 明细 + 选中），不动 overlay 开关 */
    resetOverlay() {
      this.shapes = [];
      this.shapeSeq = 0;
      this.shapeSelected = null;
      this.activeShapeId = null;
      this.overlayResult = null;
      this.overlayError = null;
      this.clearOverlayItems();
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
      this.clearOverlayItems();

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
      this.clearOverlayItems();
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
      // 半径变了，范围内的设施也就变了 —— 明细必须一起作废。
      // （主统计这里故意不清、免得拖滑杆时面板闪；明细没有这个问题，
      //   它只在展开时才按需加载。）
      this.clearOverlayItems();
    },

    clearShapes() {
      if (!this.shapes.length) return;
      this.shapes = [];
      this.shapeSelected = null;
      this.activeShapeId = null;
      this.overlayResult = null;
      this.overlayError = null;
      this.overlayMs = null;
      this.clearOverlayItems();
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

      // ★ 结果一换，明细立刻作废。
      //   否则会出现「列表明明还是旧的 165 条，统计却已经换了一组面」——
      //   两块钱信息互相对不上，比不显示更糟。
      this.clearOverlayItems();
    },

    setOverlayLoading(v) {
      this.overlayLoading = !!v;
    },

    setOverlayError(msg) {
      this.overlayError = msg;
      this.overlayResult = null;
      this.clearOverlayItems();
    },

    clearOverlayResult() {
      this.overlayResult = null;
      this.overlayError = null;
      this.overlayLoading = false;
      this.overlayMs = null;
      this.clearOverlayItems();
    },

    // ── 设施明细（面板展开 / 导出时才拉）──────────────────────

    setOverlayItems(items, total = null) {
      this.overlayItems = Array.isArray(items) ? items : [];
      this.overlayItemsTotal = total == null ? this.overlayItems.length : total;
      this.overlayItemsError = null;
    },

    setOverlayItemsLoading(v) {
      this.overlayItemsLoading = !!v;
    },

    setOverlayItemsError(msg) {
      this.overlayItemsError = msg;
      this.overlayItems = [];
      this.overlayItemsTotal = 0;
    },

    clearOverlayItems() {
      this.overlayItems = [];
      this.overlayItemsTotal = 0;
      this.overlayItemsLoading = false;
      this.overlayItemsError = null;
    },
  },
});
