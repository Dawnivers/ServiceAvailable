<script setup>
import mapView from './view/mapView.vue';
import TopBar from './components/TopBar.vue';
import LayerPanel from './components/LayerPanel.vue';
import AnalysisToolbar from './components/AnalysisToolbar.vue';
import AnalysisResult from './components/AnalysisResult.vue';
import ReachPanel from './components/ReachPanel.vue';
import OverlayPanel from './components/OverlayPanel.vue';
import SqlHintBar from './components/SqlHintBar.vue';
import PoiDetailCard from './components/PoiDetailCard.vue';
import GridPopup from './components/GridPopup.vue';
import MapLegend from './components/MapLegend.vue';
import MapStatsBar from './components/MapStatsBar.vue';
import MapScaleReadout from './components/MapScaleReadout.vue';
import { useLayerStore } from './stores/layers.js';
import { useSelectionStore } from './stores/selection.js';
import { useGridStore } from './stores/grid.js';
import {
  useAnalysisStore,
  TOOLS,
  CATEGORIES,
  RADIUS,
  MAX_SHAPES,
  DEGREE_COLORS,
} from './stores/analysis.js';
import { useBufferAnalysis } from './composables/useBufferAnalysis.js'
import { splitPercent } from './utils/percent.js';
import { computed, ref, shallowRef } from 'vue';
import { fromLonLat } from 'ol/proj.js';
import { LAYER } from './map/layers.js';
import { baseMapLabel } from './map/basemaps.js';

const store = useLayerStore()
const selection = useSelectionStore()
const grid = useGridStore()
const analysis = useAnalysisStore()

// ★ 地图实例：用 shallowRef（不是 ref），配合 mapView 里的 emit('ready')
//   普通 ref 会把 OL 对象变成 Proxy，图层/要素身份全坏
const mapRef = shallowRef(null)
const onMapReady = (m) => { mapRef.value = m }

const onCloseCard = () => selection.clear()

// 顶栏底图：值放 store（mapView 监听它换瓦片源），这里只做 v-model 的桥
// ★ 用 computed 而不是直接绑 store.baseMap，是为了让"改底图"走 action，
//   以后要在切换处加埋点 / 记本地偏好，有地方下手
const baseMap = computed({
  get: () => store.baseMap,
  set: (v) => store.setBaseMap(v),
})

// 搜索选中 → 飞过去 + 拉详情
//   flyTo 用 animate 让镜头平滑过渡，zoom 16 是能看清图钉和周边设施的级别
const FLY_ZOOM = 16
const onPick = (item) => {
  const map = mapRef.value
  if (map && item.lon != null && item.lat != null) {
    map.getView().animate({
      center: fromLonLat([item.lon, item.lat]),
      zoom: FLY_ZOOM,
      duration: 600,
    })
  }
  // 详情走 selection store 统一入口，和地图点击是同一条链路
  if (item.gid != null) selection.setPoi(item.gid)
}

// ════════════════════════════════════════════════════════════
//  分析模式的两个入口
//  ★ 两条路只差一个 center：
//    顶栏进来 center=null（等用户点地图）
//    卡片进来 center 就是那个 POI（下一步可以直接算）
// ════════════════════════════════════════════════════════════

/**
 * 进入分析模式前，热力图是开着的吗？
 *
 * ★ 为什么要记这一下：分析模式要看清 POI 图钉和红色缓冲圈，
 *   热力图那张半透明色块会把两者都压暗，所以进来时让它让位（关掉、亮起 POI）。
 *   但用户本来就是"看着热力图"点进来的，退出时应该还给他 —— 否则要重新勾一次。
 *
 * ★ 记在模块作用域而不是 store：它只在一次进出之间有效，
 *   放进 store 反而会变成"持久化偏好"的假象。
 */
let heatBeforeAnalysis = false

/**
 * 统一进入：所有入口都走这里，避免两处入口行为不一致。
 * @param {{ center?: { lon:number, lat:number, name?:string } }} [opts]
 */
function enterAnalysis(opts = {}) {
  heatBeforeAnalysis = store.visible.heat
  analysis.enter(opts)

  // 热力图让位，POI 亮起（两者在 store 里互斥，先关热力再开 POI 顺序无所谓）
  store.toggle('heat', false)
  store.toggle('poi', true)
}

/** 统一退出：分析结束 → 复原进去前的图层状态 */
function exitAnalysis() {
  analysis.exit()

  // 只有"进来时热力图是开的"才恢复；本来就没开就别多事
  if (heatBeforeAnalysis) store.toggle('heat', true)
  heatBeforeAnalysis = false
}

/** 入口一：顶栏「分析工具」——进/出切换 */
const onToggleAnalysis = () => {
  if (analysis.active) exitAnalysis()
  else enterAnalysis()
}

/**
 * 入口二：详情卡「附近分析」——带着该 POI 当圆心进来
 * 进来后把卡片收起，右侧整块空间留给分析结果
 */
const onNearbyAnalysis = (poi) => {
  if (!poi || poi.lon == null || poi.lat == null) return
  enterAnalysis({
    center: { lon: poi.lon, lat: poi.lat, name: poi.name },
  })
  selection.clear()
}

/** 退出分析模式：地图、面板、顶栏、图层一起复原 */
const onExitAnalysis = () => exitAnalysis()

// ════════════════════════════════════════════════════════════
//  分析结果取数：中心 / 多边形 / 半径 一变就自动重查
//  （防抖 + 去重 + 竞态都在 composable 里，组件只管渲染）
// ════════════════════════════════════════════════════════════
// ★ 取数器在这里挂上，同时留一个手工重试入口：
//   后端刚重启 / 网络抖一下时，用户不该被迫"删掉一个面再画回来"才能重试。
const { sync: syncAnalysis } = useBufferAnalysis()

/**
 * 底部横幅要展示的 SQL 谓词。按当前工具决定。
 *
 * ★ 只写核心谓词，不贴整条 SQL —— 真实语句还有 group by / order by /
 *   ST_Distance 求距离，一条横幅放不下。这里要说明的是
 *   "空间计算下推到了 PostGIS"，不是给出一份可执行的 SQL。
 * ★ 测距是纯前端 getLength()，一句 SQL 都没发，必须如实写"未请求后端"。
 */
const sqlHint = computed(() => {
  if (!analysis.active) return null

  // ★ 叠加分析用的是平面细分，一句话说不完，只报最核心那一环。
  //   真正的语句是 ST_Node → ST_Polygonize → 反查 members，
  //   比简单地"两个面求交"要绕，值得单独说明。
  if (analysis.overlay) {
    return {
      fn: 'ST_Polygonize',
      args: '(ST_Node(ST_Collect(ST_Boundary(geom))))',
    }
  }

  if (analysis.tool === 'measure') {
    return { note: '前端 getLength() 计算，未请求后端' }
  }

  if (analysis.tool === 'point') {
    /**
     * 点选模式现在是**两套口径同时跑**：
     *   直线  ST_DWithin（/api/poi/nearby）
     *   路网  pgr_drivingDistance（/api/poi/isochrone）
     * 横幅必须两个都写，否则下面显示的「耗时 / 返回条数」只对应其中一个，
     * 看着像数字对不上（这正是 D13 时踩过的坑：横幅与面板必须同源）。
     */
    const iso = analysis.isochrone;
    const used = iso?.usedBudgetM;
    const net = used != null ? ` + pgr_drivingDistance(${Math.round(used)} m)` : ' + pgr_drivingDistance';
    return {
      fn: 'ST_DWithin',
      args: `(geom::geography, 圆心, ${analysis.radius})${net}`,
    }
  }

  // 框选 / 自由绘制都走 /api/poi/within
  return {
    fn: 'ST_Within',
    args: '(geom, ST_GeomFromText(多边形, 4326))',
  }
})

/**
 * 点结果列表里的设施 → 飞到它那儿。
 *
 * ★ 分析模式下**故意不打开详情卡**：那张卡在分析模式下是隐藏的
 *   （右侧位置让给结果面板），打开等于"点了一下什么都没发生"。
 *   想查详情，退出分析模式再点地图即可。
 */
const onPickResult = (item) => {
  const map = mapRef.value
  if (!map || item?.lon == null || item?.lat == null) return
  map.getView().animate({
    center: fromLonLat([item.lon, item.lat]),
    zoom: Math.max(map.getView().getZoom() ?? 0, FLY_ZOOM),
    duration: 480,
  })
}

// ── 导出 CSV ───────────────────────────────────────────────
/** 两位时间戳：20261031_1703 */
function stamp() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return (
    d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    '_' + p(d.getHours()) + p(d.getMinutes())
  )
}

// ★ 两个导出（可达性 / 叠加）共用这三个小工具：
//   同样的转义、同样的 BOM、同样的下载动作，抄两遍迟早会改歪一处。

/** CSV 单元格转义：含逗号、引号、换行时整体加引号，内部引号翻倍 */
const csvEsc = (v) => {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const csvLine = (arr) => arr.map(csvEsc).join(',')

/**
 * 生成并下载 CSV 文件。
 * ★ 开头加 \ufeff 是给 WPS/Excel 认 UTF-8 用的，否则中文乱码。
 * ★ 行分隔用 \r\n：Excel 对它兼容性最好（只用 \n 在老版本里会挤成一行）。
 */
function downloadCsv(rows, filename) {
  const blob = new Blob(['\ufeff' + rows.join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * 导出当前分析结果。
 *
 * ★ 内容分三段：参数 / 分类汇总 / 设施清单。
 *   设施清单只有接口返回的那几十条（/nearby 上限 50、/within 上限 200），
 *   所以文件名和表头都写清"最近的 N 条"，不假装是全量。
 */
const onExportCsv = () => {
  const r = analysis.displayResult
  if (!r) return

  const rows = []
  rows.push(csvLine(['可达性分析结果', stamp()]))
  if (r.mode === 'area') {
    rows.push(csvLine(['分析范围', '手绘/框选多边形', '面积(km²)', r.areaKm2?.toFixed(2) ?? '']))
  } else {
    rows.push(csvLine(['分析中心', r.centerName ?? '已选点', '半径(m)', r.radiusM ?? analysis.radius]))
  }
  rows.push(csvLine(['设施总数', r.count]))
  rows.push('')

  rows.push(csvLine(['类别', '数量', '占比']))
  // ★ 占比同样用最大余数法（这里保留一位小数），保证 CSV 里加起来是 100.0
  const catEntries = Object.entries(r.byCategory)
  const pcts = splitPercent(catEntries.map(([, n]) => n), 1)
  catEntries.forEach(([key, n], i) => {
    const label = CATEGORIES.find((c) => c.key === key)?.label ?? key
    rows.push(csvLine([label, n, `${pcts[i].toFixed(1)}%`]))
  })
  rows.push('')

  rows.push(csvLine(['序号', '名称', '类别', '距离(m)']))
  r.items.forEach((it, i) => {
    const label = CATEGORIES.find((c) => c.key === it.category)?.label ?? it.category
    rows.push(csvLine([i + 1, it.name, label, Math.round(it.distanceM)]))
  })
  rows.push('')
  rows.push(csvLine([`注：设施清单为接口返回的前 ${r.items.length} 条，非全量`]))

  downloadCsv(rows, `可达性分析_${stamp()}.csv`)
}

/**
 * 导出「路网可达」这一份。
 *
 * ★ 为什么不并进上面那份导出一个文件：
 *   两份的**口径不同**（直线 vs 路网），合并会让"设施总数 76"和"18"
 *   挤在同一列里，拿到 CSV 的人分不清哪个是哪个。
 *   分开导出、文件名带口径，是最不容易误读的做法。
 *
 * ★ 前三行是**口径说明**而不是装饰：
 *   起点偏移 191 m、实际路网预算 609 m —— 没有这两行，
 *   别人看到"800 m 只到了 0.46 km²"会以为算错了。
 */
const onExportIsochroneCsv = () => {
  const r = analysis.displayIsochrone
  if (!r || r.status !== 'ok') return

  const c = analysis.center
  // 经纬度只留 6 位（约 0.1 m）：原始 double 会印出 114.02675800323485 这种一长串，
  // 拿到 CSV 的人既看不清也不需要那个精度
  const lon6 = c?.lon != null ? Number(c.lon).toFixed(6) : ''
  const lat6 = c?.lat != null ? Number(c.lat).toFixed(6) : ''
  const rows = []
  rows.push(csvLine(['可达性分析结果（路网口径）', stamp()]))
  rows.push(csvLine(['点击点经度', lon6, '点击点纬度', lat6]))
  rows.push(csvLine(['预算(m)', analysis.radius]))
  rows.push(csvLine(['起点偏移(m)', r.snapM ?? '', '实际路网预算(m)', r.usedBudgetM ?? '']))
  rows.push(csvLine(['可达面积(km²)', r.areaKm2?.toFixed(3) ?? '',
                     '直线口径面积(km²)', r.circleAreaKm2?.toFixed(3) ?? '']))
  rows.push(csvLine(['可达设施数', r.count,
                     '直线口径设施数', r.circleCount ?? '']))
  rows.push(csvLine(['可达路网', `${r.edgeCount ?? 0} 段`,
                     `半截边 ${r.partialCount ?? 0} 段`,
                     `合计 ${r.walkKm ?? 0} km`]))
  rows.push('')

  rows.push(csvLine(['类别', '数量', '占比']))
  const catEntries = Object.entries(r.byCategory)
  const pcts = splitPercent(catEntries.map(([, n]) => n), 1)
  catEntries.forEach(([key, n], i) => {
    const label = CATEGORIES.find((x) => x.key === key)?.label ?? key
    rows.push(csvLine([label, n, `${pcts[i].toFixed(1)}%`]))
  })
  rows.push('')

  rows.push(csvLine(['序号', 'gid', '名称', '类别', '经度', '纬度']))
  r.items.forEach((it, i) => {
    const label = CATEGORIES.find((x) => x.key === it.category)?.label ?? it.category
    rows.push(csvLine([i + 1, it.gid ?? '', it.name, label, it.lon ?? '', it.lat ?? '']))
  })
  rows.push('')
  // ★ 如实写清"非全量"：接口的 items 受 limit 限制（默认 50），
  //   而统计里的 count 是全量 —— 两者可能不等，不说明就是骗人。
  rows.push(csvLine([
    `注：设施清单为接口返回的前 ${r.items.length} 条（可达总数 ${r.itemsTotal ?? r.count}），非全量`,
  ]))

  downloadCsv(rows, `可达性分析_路网口径_${stamp()}.csv`)
}

/** 叠加导出进行中：要额外拉一次明细，按钮得有个"正在取数据"的态 */
const overlayExporting = ref(false)

/**
 * 导出叠加分析结果。
 *
 * ★ 结构和可达性那份不同：
 *   那边是「一个范围 + 一份设施清单」，这边是「N 个面 + 三张汇总表 + 一份设施明细」。
 *
 * ★ 明细要单独再请求一次（withItems: true）：
 *   面板平时只拉统计和几何，几百条 POI 不该在每次拖滑杆时都传一遍。
 *   导出时多一次往返，换来面板的流畅 —— 这个交换值得。
 *
 * ★ 所有数字**直接用后端返回的**，前端一个都不重算：
 *   ol/sphere 是球面公式、PostGIS geography 是椭球公式，两边面积差 0.3%，
 *   同一份 CSV 里出现两套数会让人怀疑数据出处。
 *   （这也是为什么"每个面的面积"取自返回的 shapes[]，而不是 store 里那个估算值）
 *
 * ★ 面积**不补 toFixed(2)**，保留后端的三位小数 —— 不是偷懒：
 *   面板底部那句「各重叠度面积相加 = 并集」是个恒等式，靠的是全精度。
 *   四舍五入到两位就会破：实测 2.056 + 0.968 = 3.024，
 *   显示成 2.06 + 0.97 = 3.03，而并集是 3.02 —— 看起来像 bug。
 *   导出给人做数据处理，精度比"和面板长得一样"重要。
 */
const onExportOverlayCsv = async () => {
  const shown = analysis.overlayResult
  if (!shown || overlayExporting.value) return

  // ── 明细：已经加载过就直接用，没加载过才补一次请求 ──────────
  // ★ store 里一旦 overlayResult 被替换就会清空 overlayItems，
  //   所以"非空"本身就意味着"是当前这组面的"。
  overlayExporting.value = true
  let data = shown
  let items = analysis.overlayItems
  let itemsTotal = analysis.overlayItemsTotal
  let itemsFailed = false
  if (!items.length) {
    try {
      const got = await fetchOverlayItems()
      data = got.data
      items = got.items
      itemsTotal = got.total
    } catch (e) {
      itemsFailed = true
      console.warn('[导出] 拉取设施明细失败', e)
    }
  }
  overlayExporting.value = false

  const n = data.shapeCount ?? analysis.shapes.length
  const rows = []

  rows.push(csvLine(['叠加分析结果', stamp()]))
  rows.push(csvLine(['面数', n]))
  rows.push('')

  // ① 参与叠加的面
  // ★ 用 id 去 shapes[] 里配对：那块是后端算的权威值，store 里的是前端估算
  const statById = new Map((data.shapes ?? []).map((s) => [s.id, s]))
  rows.push(csvLine(['【参与叠加的面】']))
  rows.push(csvLine(['序号', '区域', '类型', '半径(m)', '面积(km²)', '设施数']))
  analysis.shapes.forEach((s, i) => {
    const st = statById.get(s.id) ?? {}
    rows.push(csvLine([
      i + 1,
      s.label,
      s.kind === 'circle' ? '缓冲圈' : '手绘面',
      s.kind === 'circle' ? Math.round(s.radius ?? 0) : '',
      st.areaKm2 ?? s.areaKm2?.toFixed(2) ?? '',
      st.poi ?? '',
    ]))
  })
  rows.push('')

  // ② 并集
  const u = data.union ?? {}
  rows.push(csvLine(['【并集 · 全部面覆盖的范围】']))
  rows.push(csvLine(['面积(km²)', u.areaKm2 ?? '']))
  rows.push(csvLine(['设施总数', u.poi ?? '']))
  rows.push('')

  // ③ 并集按类别（四类常驻，0 也写出来，和面板一致）
  rows.push(csvLine(['【并集按类别】']))
  rows.push(csvLine(['类别', '数量', '占比']))
  const catEntries = CATEGORIES.map((c) => [c.key, Number(u.byCategory?.[c.key] ?? 0)])
  const pcts = splitPercent(catEntries.map(([, cnt]) => cnt), 1)
  catEntries.forEach(([key, cnt], i) => {
    const label = CATEGORIES.find((c) => c.key === key)?.label ?? key
    rows.push(csvLine([label, cnt, `${pcts[i].toFixed(1)}%`]))
  })
  rows.push('')

  // ④ 交集（全部 n 个面共同覆盖）
  const it = data.intersect ?? {}
  rows.push(csvLine([`【交集 · 同时被 ${n} 个面覆盖】`]))
  if (it.empty) {
    // 明确写一句，而不是留空 —— 空单元格会被读成"没算出来"
    rows.push(csvLine(['结论', '无共同重叠区']))
  } else {
    rows.push(csvLine(['面积(km²)', it.areaKm2 ?? '']))
    rows.push(csvLine(['设施数', it.poi ?? '']))
  }
  rows.push('')

  // ⑤ 按重叠度
  rows.push(csvLine(['【按重叠度】']))
  rows.push(csvLine(['重叠度', '面积(km²)', '设施数']))
  for (const d of data.byDegree ?? []) {
    rows.push(csvLine([`${d.deg} 重`, d.areaKm2, d.poi]))
  }
  rows.push('')

  // ⑥ 设施明细
  // ★ 「重叠度」这一列是这份表最有价值的东西：平面细分保证每个设施**恰好**
  //   落在一个原子面里，所以"被几层覆盖"是唯一确定的值，不会有歧义。
  rows.push(csvLine(['【设施明细】']))
  rows.push(csvLine(['序号', '名称', '类别', '经度', '纬度', '重叠度', '覆盖区域']))

  const labelById = new Map(analysis.shapes.map((s) => [s.id, s.label]))
  if (!items.length) {
    rows.push(csvLine([itemsFailed ? '（明细获取失败，仅导出统计）' : '（范围内没有设施）']))
  } else {
    items.forEach((x, i) => {
      const members = (x.members ?? []).map((id) => labelById.get(id) ?? id).join('·')
      rows.push(csvLine([
        i + 1,
        x.name || '未命名',
        CATEGORIES.find((c) => c.key === x.category)?.label ?? x.category ?? '',
        x.lon,
        x.lat,
        `${x.deg} 重`,
        members,
      ]))
    })
  }
  rows.push('')

  // ⑦ 脚注
  rows.push(csvLine(['注：重叠区互不重复，各重叠度面积相加等于并集面积']))
  rows.push(csvLine(['注：「重叠度」指该设施位于被几层服务圈同时覆盖的区域']))
  if (itemsTotal > items.length) {
    rows.push(csvLine([`注：设施共 ${itemsTotal} 条，此处仅导出前 ${items.length} 条`]))
  }

  downloadCsv(rows, `叠加分析_${stamp()}.csv`)
}

// ── 分析工具面板的数据桥（面板是纯展示组件，状态都在 store）────
const onToolChange = (t) => analysis.setTool(t)

/**
 * 工具栏显示哪些工具。
 *
 * ★ 2026-11-04 定稿：全项目只剩「点选 / 测距」——
 *   矩形与自由绘制回答的是「这块地里有什么」，
 *   不属于「从一个点出发能走到哪」这个命题，已整体移除；
 *   叠加分析改为「多个 800 m 步行圈求交」，用的也是点选。
 * ★ 不再需要按 overlay 切换工具组，这一行就是全部。
 */
const toolList = TOOLS
const onRadiusChange = (v) => analysis.setRadius(v)
const onCategoryToggle = (k) => analysis.toggleCategory(k)

// ── 叠加分析 ────────────────────────────────────────────────
/** 开关叠加模式。打开会清掉单图形那一套（圆心/多边形/结果），反之亦然 */
const onToggleOverlay = () => analysis.toggleOverlay()
/** 面板里删掉一个面；字母与颜色会自动重排（见 store.removeShape） */
const onShapeRemove = (id) => analysis.removeShape(id)
/** 点中一个面：地图上高亮并定位，再点一次取消 */
const onShapeSelect = (id) => analysis.toggleShapeSelected(id)
const onShapeClear = () => analysis.clearShapes()
/** 重试：先清错误让 spinner 出来，再让取数器重新发一次（失败时指纹已清，不会被去重挡） */
const onOverlayRetry = () => {
  analysis.setOverlayError(null)
  syncAnalysis()
}

/**
 * 拉一次带明细的叠加结果（面板展开明细 / 导出 CSV 共用）。
 *
 * ★ 主接口默认 withItems=false（4KB vs 26KB），所以这是**按需**的额外一次请求。
 * ★ 失败不抛到界面上：面板显示「加载失败」，导出退回只导统计。
 */
async function fetchOverlayItems() {
  const res = await fetch('/api/poi/overlay', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      shapes: analysis.overlayShapes,
      withItems: true,
    }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  return { data, items: data.items ?? [], total: data.itemsTotal ?? 0 }
}

/** 面板里展开「设施明细」时触发 */
const onLoadOverlayItems = async () => {
  if (analysis.overlayItemsLoading) return
  analysis.setOverlayItemsLoading(true)
  try {
    const { items, total } = await fetchOverlayItems()
    analysis.setOverlayItems(items, total)
  } catch (e) {
    analysis.setOverlayItemsError('明细加载失败')
    console.warn('[叠加] 加载设施明细失败', e)
  } finally {
    analysis.setOverlayItemsLoading(false)
  }
}

/**
 * 当前「还能用半径滑杆调」的那个面的字母，给工具栏显示「调 A」。
 * ★ activeShapeId 是 store 里唯一的真相：画完一个圆它成为 active，
 *   画下一笔（圆或多边形）就顶掉，滑杆随即失去作用。
 */
const activeShapeLabel = computed(() => {
  const s = analysis.shapes.find((x) => x.id === analysis.activeShapeId)
  return s ? s.label : null
})

/**
 * 图例该显示哪一套。
 * ★ 叠加模式优先：此时地图上真正需要解码的是"这块颜色深到几重"，
 *   而不是 POI 的四个类别色（分析模式下 POI 层虽然亮着，但它是背景）。
 * ★ 点选模式优先于热力图：此时图上多了三层（圆/面/路网），
 *   如果不切图例，左下角还在解释"学校蓝、医院红"，而用户真正想问的是
 *   "蓝面是什么、红虚线是什么"。
 */
const legendMode = computed(() => {
  if (analysis.active && analysis.overlay) return 'degree'
  if (analysis.active && analysis.tool === 'point') return 'isochrone'
  return store.visible.heat ? 'heat' : 'poi'
})

/**
 * 重叠度的档位，直接由接口结果的 byDegree 映射。
 * ★ 只列实际出现的档：3 个面不一定有三重重叠区，
 *   凭空补一档会让图例和地图对不上。
 */
const overlayDegrees = computed(() =>
  (analysis.overlayResult?.byDegree ?? []).map((d) => ({
    deg: d.deg,
    color: DEGREE_COLORS[Math.min(d.deg, DEGREE_COLORS.length) - 1],
  })),
)

const layers = computed(() =>
  LAYER.map(d => ({
    ...d,                                  // id / name / tag
    // 底图那一行的名字跟着当前底图变（天地图矢量 / 天地图影像），
    // 否则切到影像后面板还写着"天地图影像"以外的名字，容易看岔
    name: d.id === 'base' ? baseMapLabel(store.baseMap) : d.name,
    visible: store.visible[d.id],
    opacity: d.kind === 'wms' ? store.opacity[d.id] : null,
    chips: d.chips,                        // 只有 poi 有
    options: d.options,                    // 只有 heat 有（可点的类别单选）
    selected: d.id === 'heat' ? store.heatCategory : undefined,
  }))
)

const onToggle = (id, next) => store.toggle(id, next) //切换显隐
const onOpacityChange = (id, v) => store.setOpacity(id, v)  //切换透明

/**
 * 热力图类别切换（全部/学校/医院/商场/公园）。
 * ★ 只改 store，地图上的 STYLES 由 mapView 里的 watch → updateParams 完成。
 *   组件不做请求、不碰图层，保持「面板只上报意图」的分工。
 */
const onOptionPick = (id, key) => {
  if (id === 'heat') store.setHeatCategory(key)
}
</script>

<template>
  <!-- 顶部栏：fixed 64px，地图与面板都让它 -->
  <TopBar
    v-model:baseMap="baseMap"
    :analysis-mode="analysis.active"
    @pick="onPick"
    @toggle-analysis="onToggleAnalysis"
  />

  <mapView @ready="onMapReady" />

  <!-- 左上：浏览模式是图层控制，分析模式换成分析工具（同一位置，宽度一致，切换不跳） -->
  <LayerPanel
    v-if="!analysis.active"
    :layers="layers"
    @toggle="onToggle"
    @opacity-change="onOpacityChange"
    @option-pick="onOptionPick"
  />
  <AnalysisToolbar
    v-else
    :tool="analysis.tool"
    :radius="analysis.radius"
    :categories="analysis.categories"
    :tools="toolList"
    :category-list="CATEGORIES"
    :radius-range="RADIUS"
    :center="analysis.center"
    :needs-radius="analysis.needsRadius"
    :overlay="analysis.overlay"
    :shape-count="analysis.shapes.length"
    :max-shapes="MAX_SHAPES"
    :active-label="activeShapeLabel"
    @update:tool="onToolChange"
    @update:radius="onRadiusChange"
    @toggle-category="onCategoryToggle"
    @toggle-overlay="onToggleOverlay"
    @exit="onExitAnalysis"
  />

  <!-- 右上：分析结果卡（只在分析模式出现）
       ★ 叠加模式下换成 OverlayPanel：那一块要展示面列表 + 并集/交集/重叠度，
         和「单个圆/多边形的可达性结果」是两种信息结构，硬塞进一张卡会打架 -->
  <OverlayPanel
    v-if="analysis.active && analysis.overlay"
    :shapes="analysis.shapes"
    :result="analysis.overlayResult"
    :loading="analysis.overlayLoading"
    :error="analysis.overlayError"
    :max-shapes="MAX_SHAPES"
    :selected="analysis.shapeSelected"
    :exporting="overlayExporting"
    :items="analysis.overlayItems"
    :items-total="analysis.overlayItemsTotal"
    :items-loading="analysis.overlayItemsLoading"
    :items-error="analysis.overlayItemsError"
    @remove="onShapeRemove"
    @select="onShapeSelect"
    @clear="onShapeClear"
    @retry="onOverlayRetry"
    @export="onExportOverlayCsv"
    @load-items="onLoadOverlayItems"
  />
  <!-- 非叠加模式：两张卡上下堆叠 —— 上面直线口径，下面路网口径。
       ★ 为什么不并排：288 × 2 + 间距 = 600px，会压掉近一半地图视野；
         竖向堆叠时地图宽度不受影响，对比关系也更强（同一列、同一预算）。 -->
  <div v-if="analysis.active && !analysis.overlay" class="right-stack">
    <AnalysisResult
      :result="analysis.displayResult"
      :loading="analysis.resultLoading"
      :error="analysis.resultError"
      @export="onExportCsv"
      @pick="onPickResult"
    />
    <ReachPanel
      :result="analysis.displayIsochrone"
      :loading="analysis.isochroneLoading"
      :error="analysis.isochroneError"
      @pick="onPickResult"
      @export="onExportIsochroneCsv"
    />
  </div>

  <!-- 右上：POI 详情卡 -->
  <PoiDetailCard
    v-if="!analysis.active"
    :poi="selection.poi"
    :nearby="selection.nearby"
    :density="selection.density"
    :loading="selection.loading"
    :error="selection.error"
    @close="onCloseCard"
    @nearby-analysis="onNearbyAnalysis"
  />

  <!-- 右上：点击热力图格子的统计卡。
       与 POI 卡共用同一个位置，但两者不会同时出现 ——
       热力图与 POI 图层在 store 里互斥，点选逻辑也按热力图优先分叉。 -->
  <GridPopup
    v-if="!analysis.active"
    :info="grid.info"
    :loading="grid.loading"
    :error="grid.error"
    :hint="grid.hint"
    :category="store.heatCategory"
    @close="grid.clear()"
  />

  <!-- 左下：图例。
       ★ 三种模式互斥，不能并排 —— POI 图例是「类别→颜色」，
         热力图例是「数值→颜色」，重叠度图例是「层数→颜色」，
         同时出现会让人以为"红=医院"和"红=三层重叠"是一回事。 -->
  <MapLegend
    :mode="legendMode"
    :heat-key="store.heatCategory"
    :degrees="overlayDegrees"
  />

  <!-- 底部中：浏览模式是数据统计条，分析模式换成「请求 SQL」说明条 -->
  <MapStatsBar v-if="!analysis.active" />
  <SqlHintBar
    v-else
    :sql="sqlHint"
    :ms="analysis.overlay ? analysis.overlayMs : analysis.resultMs"
    :count="
      analysis.overlay
        ? (analysis.overlayResult?.union?.poi ?? null)
        : (analysis.displayResult?.count ?? null)
    "
    :raw-count="
      analysis.overlay
        ? (analysis.overlayResult?.union?.poi ?? null)
        : (analysis.result?.count ?? null)
    "
    :loading="analysis.overlay ? analysis.overlayLoading : analysis.resultLoading"
    :error="analysis.overlay ? analysis.overlayError : analysis.resultError"
  />

  <!-- 右下：比例尺 + 坐标读数（需要 map 实例） -->
  <MapScaleReadout :map="mapRef" />
</template>

<style scoped>
/**
 * 右侧两张结果卡的堆叠容器。
 *
 * ★ AnalysisResult 自己的样式是 position:absolute; right:16px; top:72px。
 *   放进容器后必须改成 static，否则它会「相对容器再偏移 16/72」——
 *   表现是第二张卡跑到屏幕中间去。
 *   用 :deep() 覆盖子组件内部类，不修改 AnalysisResult 本身。
 */
.right-stack {
  position: absolute;
  right: 16px;
  top: 72px;
  z-index: 15;
  width: 288px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* 两张卡加起来可能超高：给个上限，超出滚动，别顶到屏幕外 */
  max-height: calc(100vh - 72px - 56px);
  overflow-y: auto;
  overflow-x: hidden;
  /* 容器本身不吃鼠标事件，只有卡片吃 —— 否则地图在这块区域拖不动 */
  pointer-events: none;
  scrollbar-width: thin;
}
.right-stack > * {
  pointer-events: auto;
}
.right-stack :deep(.result-card) {
  position: static;
  right: auto;
  top: auto;
  width: 100%;
}
</style>
