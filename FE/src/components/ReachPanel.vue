<script setup>
/**
 * ════════════════════════════════════════════════════════════
 * ReachPanel —— 「路网可达」结果卡（真实步行口径）
 *
 * 与 AnalysisResult 的分工：
 *   AnalysisResult = 直线口径（ST_DWithin，圆内有什么）
 *   ReachPanel     = 路网口径（pgr_drivingDistance，沿街走能到哪）
 * 两张卡同时在右上角出现，一上一下，就是「直线 vs 路网」的对照。
 *
 * 纯展示组件（和 AnalysisResult / LayerPanel 同一路数）：
 *   不 import store、不 fetch，只认 props + emit。
 *
 * 结构：
 *   ① 标题 + 面积（路网 / 直线）
 *   ② 大数字（路网可达设施数）+ 与直线口径的差
 *   ③ 四个类别色条（与左卡同一套 CATEGORY 配色）
 *   ④ 路网信息（段数 / 半截边 / 公里数 / 起点偏移）
 *   ⑤ 最近设施列表（可点定位）
 *
 * 四种状态：加载中 / 出错 / 无路网（最近路网比预算远）/ 有结果
 * ════════════════════════════════════════════════════════════
 */

import { splitPercent } from '@/utils/percent'
import { minutesText } from '@/stores/analysis.js'

const CARD_W = 288
const LIST_MAX = 5

// 与 AnalysisResult / 图层面板保持同一套配色，改一处要同步另一处
const CATEGORY = {
  school: { label: '学校', color: '#1565C0' },
  hospital: { label: '医院 / 诊所', color: '#C62828' },
  mall: { label: '商场 / 超市', color: '#EF6C00' },
  park: { label: '公园', color: '#2E7D32' },
}
const FALLBACK = { label: '未分类', color: '#8aa0b4' }

const props = defineProps({
  /**
   * store 的 displayIsochrone：
   * { status, count, byCategory, items, areaKm2, snapM, usedBudgetM,
   *   edgeCount, partialCount, walkKm, circleCount, circleAreaKm2 }
   */
  result: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
})

const emit = defineEmits(['pick', 'export'])

const cat = (key) => CATEGORY[key] ?? FALLBACK

// ── 派生 ───────────────────────────────────────────────────

/** 分类行：四个类别恒定全部显示（数量 0 也占一行，理由同 AnalysisResult） */
function rows(r) {
  if (!r?.byCategory) return []
  const list = Object.keys(CATEGORY).map((key) => ({
    key,
    ...CATEGORY[key],
    n: Number(r.byCategory[key] ?? 0),
  }))
  list.sort((a, b) => b.n - a.n)
  const pcts = splitPercent(list.map((x) => x.n))
  return list.map((x, i) => ({ ...x, pct: pcts[i] }))
}

function rowCount(r) {
  return rows(r).reduce((s, x) => s + x.n, 0)
}

/** 色条宽度用同一个整数百分比 —— 条长与数字永远一致 */
function barStyle(row) {
  return {
    width: `${row.pct}%`,
    minWidth: row.n > 0 && row.pct === 0 ? '2px' : '0',
    background: row.color,
    opacity: row.n === 0 ? 0 : 1,
  }
}

function pctText(row) {
  if (row.n > 0 && row.pct === 0) return '<1%'
  return `${row.pct}%`
}

/** 面积：路网面 / 直线圆 的对照 */
function areaText(r) {
  if (!r?.areaKm2) return ''
  const c = r.circleAreaKm2
  if (!c) return `${r.areaKm2.toFixed(2)} km²`
  return `${r.areaKm2.toFixed(2)} km²（直线 ${c.toFixed(2)}）`
}

/** 与直线口径的差：负数表示路网口径更少 */
function diffText(r) {
  const a = r?.count
  const b = r?.circleCount
  if (a == null || b == null || b === 0) return ''
  const pct = Math.round(((a - b) / b) * 100)
  if (pct === 0) return '与直线口径相同'
  return pct > 0 ? `比直线口径多 ${pct}%` : `比直线口径少 ${Math.abs(pct)}%`
}

function topItems(r) {
  return (r?.items ?? []).slice(0, LIST_MAX)
}

function moreCount(r) {
  const total = r?.itemsTotal ?? r?.items?.length ?? 0
  return Math.max(0, total - LIST_MAX)
}

/** 距离文本：等时圈接口现在不带 distanceM，有就显示，没有就留空 */
function distText(d) {
  if (d == null) return ''
  return d < 1000 ? `${Math.round(d)} m` : `${(d / 1000).toFixed(1)} km`
}

function onPick(it) {
  if (it?.lon == null || it?.lat == null) return
  emit('pick', it)
}

/**
 * ★ 不能直接在模板里写 `@click="emit('export')"`：
 *   `<script setup>` 中 defineEmits 的返回值**不会进入模板作用域**，
 *   编译出来是 `$setup.emit(...)`，而 $setup 上没有 emit →
 *   点了抛 "is not a function"，**界面上完全没反应**（实测踩到）。
 *   包一层普通函数才是稳的写法。
 */
function onExport() {
  emit('export')
}

const isNoNetwork = () => props.result?.status === 'no_network'
</script>

<template>
  <div class="reach-card" :style="{ width: CARD_W + 'px' }">
    <!-- 加载：路网计算要 2–3 秒，必须给反馈 -->
    <div v-if="loading" class="state">
      <span class="spin" />正在沿路网计算可达范围…
    </div>

    <!-- 出错 -->
    <div v-else-if="error" class="state is-error">{{ error }}</div>

    <!-- 无路网：最近路网比预算还远（不是找不到，是太远） -->
    <div v-else-if="isNoNetwork()" class="state is-error">
      最近步行路网在 {{ Math.round(result.snapM ?? 0) }} m 外，超出搜索预算
    </div>

    <!-- 有结果 -->
    <template v-else-if="result">
      <div class="head">
        <span class="head-title">路网可达</span>
        <span class="head-sub">{{ areaText(result) }}</span>
      </div>

      <div class="summary">
        <span class="big">{{ result.count }}</span>
        <span class="big-label">
          个设施在 {{ Math.round(result.usedBudgetM ?? 0) }} m
          （≈{{ minutesText(result.usedBudgetM) }}）步行内
        </span>
      </div>

      <div v-if="diffText(result)" class="diff">{{ diffText(result) }}（直线口径 {{ result.circleCount }} 个）</div>

      <!-- 分类条 -->
      <div class="cats">
        <div
          v-for="row in rows(result)"
          :key="row.key"
          class="cat-row"
          :class="{ 'is-zero': row.n === 0 }"
        >
          <div class="cat-line">
            <span class="cat-name">{{ row.label }}</span>
            <span class="cat-num">
              <span class="cat-count">{{ row.n }} 个</span>
              <span class="cat-pct">{{ pctText(row) }}</span>
            </span>
          </div>
          <div class="bar">
            <span class="bar-fill" :style="barStyle(row)" />
          </div>
        </div>
      </div>

      <!-- 路网信息：这是路网口径独有的，直线口径没有 -->
      <div class="net">
        <span>路网 {{ result.edgeCount }} 段</span>
        <span v-if="result.partialCount">+{{ result.partialCount }} 段半截</span>
        <span>{{ result.walkKm }} km</span>
        <span>起点偏移 {{ Math.round(result.snapM ?? 0) }} m</span>
      </div>

      <!-- 最近设施 -->
      <template v-if="topItems(result).length">
        <div class="divider">可达设施</div>
        <ul class="list">
          <li
            v-for="(it, i) in topItems(result)"
            :key="(it.gid ?? '') + it.name + i"
            class="item"
            :class="{ 'is-link': it.lon != null }"
            :title="it.lon != null ? '点击定位到该设施' : ''"
            @click="onPick(it)"
          >
            <span class="dot" :style="{ background: cat(it.category).color }" />
            <span class="item-name">{{ it.name || '未命名' }}</span>
            <span class="item-dist">{{ distText(it.distanceM) }}</span>
          </li>
        </ul>
        <div v-if="moreCount(result)" class="more">还有 {{ moreCount(result) }} 条</div>
      </template>

      <div v-else class="empty">
        该可达范围内没有设施
      </div>

      <!-- 导出：与上方直线口径那份分开文件（口径不同，合并会被误读） -->
      <div class="actions">
        <button class="export" type="button" @click="onExport">导出 CSV（路网口径）</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ★ 位置由 App.vue 的 .right-stack 容器决定（这里用 static） */
.reach-card {
  position: static;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #dde5ec;
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(16, 42, 67, 0.14);
  backdrop-filter: blur(6px);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  color: #2b4359;
  overflow: hidden;
}

/* ═══ 加载 / 错误 / 无路网 ═══ */
.state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 14px;
  font-size: 12.5px;
  color: #5b7288;
  line-height: 1.6;
}
.state.is-error {
  color: #c62828;
}
.spin {
  flex: none;
  width: 12px;
  height: 12px;
  border: 2px solid #d6e2ee;
  border-top-color: #1565c0;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* ═══ 标题 ═══ */
.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 12px 14px 0;
}
.head-title {
  flex: none;
  font-size: 12.5px;
  font-weight: 700;
  color: #17334d;
}
.head-sub {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
  font-size: 10.5px;
  color: #a8bccd;
}

/* ═══ 大数字（蓝色系：与直线口径的红色区分开）═══ */
.summary {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 14px 2px;
}
.big {
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
  color: #1565c0;
  font-variant-numeric: tabular-nums;
}
.big-label {
  font-size: 11px;
  color: #8aa0b4;
}

/* 与直线口径的差：这行是两张卡的"接缝"，一眼看出对比关系 */
.diff {
  padding: 0 14px 8px;
  font-size: 10.5px;
  color: #5b7288;
}

/* ═══ 分类条 ═══ */
.cats {
  padding: 4px 14px 10px;
}
.cat-row + .cat-row {
  margin-top: 7px;
}
.cat-row.is-zero .cat-name,
.cat-row.is-zero .cat-count,
.cat-row.is-zero .cat-pct {
  color: #b7c7d6;
}
.cat-line {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  margin-bottom: 3px;
}
.cat-name {
  color: #2b4359;
}
.cat-num {
  flex: none;
  display: inline-flex;
  align-items: baseline;
  gap: 12px;
  font-variant-numeric: tabular-nums;
}
.cat-count {
  color: #a8bccd;
  font-size: 10.5px;
}
.cat-pct {
  min-width: 34px;
  text-align: right;
  color: #2b4359;
  font-weight: 600;
}
.bar {
  height: 4px;
  background: #eef3f8;
  border-radius: 2px;
  overflow: hidden;
}
.bar-fill {
  display: block;
  height: 100%;
  border-radius: 2px;
  transition: width 0.2s ease;
}

/* ═══ 路网信息一行 ═══ */
.net {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  padding: 0 14px 10px;
  font-size: 10px;
  color: #8aa0b4;
  font-variant-numeric: tabular-nums;
}

/* ═══ 分隔线 + 列表 ═══ */
.divider {
  padding: 0 14px 6px;
  font-size: 10.5px;
  color: #a8bccd;
  border-top: 1px solid #eef3f8;
  padding-top: 8px;
}
.list {
  margin: 0;
  padding: 0 14px;
  list-style: none;
}
.item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 0;
  font-size: 11.5px;
}
.item.is-link {
  cursor: pointer;
}
.item.is-link:hover .item-name {
  color: #1565c0;
}
.dot {
  flex: none;
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #2b4359;
}
.item-dist {
  flex: none;
  color: #a8bccd;
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
}
.more {
  padding: 6px 14px 0;
  font-size: 10.5px;
  color: #a8bccd;
}
.empty {
  padding: 0 14px 12px;
  font-size: 11.5px;
  color: #8aa0b4;
}

/* ═══ 导出按钮（与 AnalysisResult 的样式保持一致：细边框、整宽）═══ */
.actions {
  padding: 8px 14px 12px;
}
.export {
  width: 100%;
  padding: 6px 0;
  font-size: 11.5px;
  font-family: inherit;
  color: #1565c0;
  background: #f2f7fd;
  border: 1px solid #cfe0f2;
  border-radius: 7px;
  cursor: pointer;
}
.export:hover {
  background: #e8f1fb;
}
</style>
