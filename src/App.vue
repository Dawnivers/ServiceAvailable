<script setup>
import mapView from './view/mapView.vue';
import TopBar from './components/TopBar.vue';
import LayerPanel from './components/LayerPanel.vue';
import AnalysisToolbar from './components/AnalysisToolbar.vue';
import AnalysisResult from './components/AnalysisResult.vue';
import SqlHintBar from './components/SqlHintBar.vue';
import PoiDetailCard from './components/PoiDetailCard.vue';
import MapLegend from './components/MapLegend.vue';
import MapStatsBar from './components/MapStatsBar.vue';
import MapScaleReadout from './components/MapScaleReadout.vue';
import { useLayerStore } from './stores/layers.js';
import { useSelectionStore } from './stores/selection.js';
import {
  useAnalysisStore,
  TOOLS,
  CATEGORIES,
  RADIUS,
} from './stores/analysis.js';
import { useBufferAnalysis } from './composables/useBufferAnalysis.js'
import { splitPercent } from './utils/percent.js';
import { computed, shallowRef } from 'vue';
import { fromLonLat } from 'ol/proj.js';
import { LAYER } from './map/layers.js';
import { baseMapLabel } from './map/basemaps.js';

const store = useLayerStore()
const selection = useSelectionStore()
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

/** 入口一：顶栏「分析工具」——进/出切换 */
const onToggleAnalysis = () => analysis.toggle()

/**
 * 入口二：详情卡「附近分析」——带着该 POI 当圆心进来
 * 进来后把卡片收起，右侧整块空间留给分析结果
 */
const onNearbyAnalysis = (poi) => {
  if (!poi || poi.lon == null || poi.lat == null) return
  analysis.enter({
    center: { lon: poi.lon, lat: poi.lat, name: poi.name },
  })
  selection.clear()
}

/** 退出分析模式：地图、面板、顶栏一起复原 */
const onExitAnalysis = () => analysis.exit()

// ════════════════════════════════════════════════════════════
//  分析结果取数：中心 / 多边形 / 半径 一变就自动重查
//  （防抖 + 去重 + 竞态都在 composable 里，组件只管渲染）
// ════════════════════════════════════════════════════════════
useBufferAnalysis()

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

  if (analysis.tool === 'measure') {
    return { note: '前端 getLength() 计算，未请求后端' }
  }

  if (analysis.tool === 'point') {
    return {
      fn: 'ST_DWithin',
      args: `(geom::geography, 圆心, ${analysis.radius})`,
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

/**
 * 导出当前分析结果。
 *
 * ★ 内容分三段：参数 / 分类汇总 / 设施清单。
 *   设施清单只有接口返回的那几十条（/nearby 上限 50、/within 上限 200），
 *   所以文件名和表头都写清"最近的 N 条"，不假装是全量。
 * ★ 开头加 \ufeff 是给 WPS/Excel 认 UTF-8 用的，否则中文乱码。
 */
const onExportCsv = () => {
  const r = analysis.displayResult
  if (!r) return

  const esc = (v) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const line = (arr) => arr.map(esc).join(',')

  const rows = []
  rows.push(line(['可达性分析结果', stamp()]))
  if (r.mode === 'area') {
    rows.push(line(['分析范围', '手绘/框选多边形', '面积(km²)', r.areaKm2?.toFixed(2) ?? '']))
  } else {
    rows.push(line(['分析中心', r.centerName ?? '已选点', '半径(m)', r.radiusM ?? analysis.radius]))
  }
  rows.push(line(['设施总数', r.count]))
  rows.push('')

  rows.push(line(['类别', '数量', '占比']))
  // ★ 占比同样用最大余数法（这里保留一位小数），保证 CSV 里加起来是 100.0
  const catEntries = Object.entries(r.byCategory)
  const pcts = splitPercent(catEntries.map(([, n]) => n), 1)
  catEntries.forEach(([key, n], i) => {
    const label = CATEGORIES.find((c) => c.key === key)?.label ?? key
    rows.push(line([label, n, `${pcts[i].toFixed(1)}%`]))
  })
  rows.push('')

  rows.push(line(['序号', '名称', '类别', '距离(m)']))
  r.items.forEach((it, i) => {
    const label = CATEGORIES.find((c) => c.key === it.category)?.label ?? it.category
    rows.push(line([i + 1, it.name, label, Math.round(it.distanceM)]))
  })
  rows.push('')
  rows.push(line([`注：设施清单为接口返回的前 ${r.items.length} 条，非全量`]))

  const blob = new Blob(['\ufeff' + rows.join('\r\n')], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `可达性分析_${stamp()}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ── 分析工具面板的数据桥（面板是纯展示组件，状态都在 store）────
const onToolChange = (t) => analysis.setTool(t)
const onRadiusChange = (v) => analysis.setRadius(v)
const onCategoryToggle = (k) => analysis.toggleCategory(k)

const layers = computed(() =>
  LAYER.map(d => ({
    ...d,                                  // id / name / tag
    // 底图那一行的名字跟着当前底图变（天地图矢量 / 天地图影像），
    // 否则切到影像后面板还写着"天地图影像"以外的名字，容易看岔
    name: d.id === 'base' ? baseMapLabel(store.baseMap) : d.name,
    visible: store.visible[d.id],
    opacity: d.kind === 'wms' ? store.opacity[d.id] : null,
    chips: d.chips,                        // 只有 poi 有
  }))
)

const onToggle = (id, next) => store.toggle(id, next) //切换显隐
const onOpacityChange = (id, v) => store.setOpacity(id, v)  //切换透明
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
  />
  <AnalysisToolbar
    v-else
    :tool="analysis.tool"
    :radius="analysis.radius"
    :categories="analysis.categories"
    :tools="TOOLS"
    :category-list="CATEGORIES"
    :radius-range="RADIUS"
    :center="analysis.center"
    :needs-radius="analysis.needsRadius"
    @update:tool="onToolChange"
    @update:radius="onRadiusChange"
    @toggle-category="onCategoryToggle"
    @exit="onExitAnalysis"
  />

  <!-- 右上：分析结果卡（只在分析模式出现） -->
  <AnalysisResult
    v-if="analysis.active"
    :result="analysis.displayResult"
    :loading="analysis.resultLoading"
    :error="analysis.resultError"
    @export="onExportCsv"
    @pick="onPickResult"
  />

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

  <!-- 左下：图例 -->
  <MapLegend />

  <!-- 底部中：浏览模式是数据统计条，分析模式换成「请求 SQL」说明条 -->
  <MapStatsBar v-if="!analysis.active" />
  <SqlHintBar
    v-else
    :sql="sqlHint"
    :ms="analysis.resultMs"
    :count="analysis.displayResult?.count ?? null"
    :raw-count="analysis.result?.count ?? null"
    :loading="analysis.resultLoading"
    :error="analysis.resultError"
  />

  <!-- 右下：比例尺 + 坐标读数（需要 map 实例） -->
  <MapScaleReadout :map="mapRef" />
</template>

<style scoped></style>
