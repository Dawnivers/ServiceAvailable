<script setup>
/**
 * ════════════════════════════════════════════════════════════
 * AnalysisResult —— 右上角的可达性分析结果卡
 *
 * 纯展示组件（和 LayerPanel / PoiDetailCard 同一路数）：
 *   不 import store、不 fetch，只认 props + emit。
 *   数据由 useBufferAnalysis 写进 store，App 传进来。
 *
 * 结构（对照设计稿）：
 *   ① 标题 + 副标题（圆心：xxx / 范围：x km²）
 *   ② 大数字：N 个设施在 800 m 内
 *   ③ 四个类别：色条 + 数量 · 占比
 *   ④ 分隔线「最近的设施」
 *   ⑤ 列表：色点 + 名称 + 距离
 *   ⑥ 导出 CSV
 *
 * 四种状态：加载中 / 出错 / 有结果 / 没结果（不渲染整卡）
 * ════════════════════════════════════════════════════════════
 */

import { splitPercent } from '@/utils/percent'

const CARD_W = 288 // 与 PoiDetailCard / LayerPanel 同宽，右侧不跳

// 类别 → 中文名 + 颜色，与图层面板、工具面板保持一致
const CATEGORY = {
  school: { label: '学校', color: '#1565C0' },
  hospital: { label: '医院 / 诊所', color: '#C62828' },
  mall: { label: '商场 / 超市', color: '#EF6C00' },
  park: { label: '公园', color: '#2E7D32' },
}
const FALLBACK = { label: '未分类', color: '#8aa0b4' }

// 列表最多显示几条（设计稿 3 条；给到 5 条，超出靠 CSV 导出）
const LIST_MAX = 5

const props = defineProps({
  // store 的 displayResult：{ count, byCategory, items, mode, radiusM, areaKm2, centerName }
  result: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
})

const emit = defineEmits(['export', 'pick'])

// ── 派生 ───────────────────────────────────────────────────
const cat = (key) => CATEGORY[key] ?? FALLBACK

/** 副标题：点选是「圆心：xxx」，多边形是「范围：x km²」 */
function subtitle(r) {
  if (!r) return ''
  if (r.mode === 'area') {
    return r.areaKm2 == null ? '范围：已绘制区域' : `范围：${r.areaKm2.toFixed(2)} km²`
  }
  return r.centerName ? `圆心：${r.centerName}` : '圆心：已选点'
}

/** 大数字后面那句话：点选说半径，多边形说"范围内" */
function scopeText(r) {
  if (!r) return ''
  if (r.mode === 'area') return '个设施在范围内'
  return `个设施在 ${Math.round(r.radiusM ?? 0)} m 内`
}

/**
 * 分类行：按数量降序，**四个类别恒定全部显示**（数量为 0 也显示 "0 · 0%"）。
 *
 * ★ 为什么不再隐藏 0 行：只列三行会让人以为"少了一个类别"，
 *   也会让"占比加起来"看起来不完整（其实剩下那个是 0%）。
 *   四类常驻，四个数字加起来永远 100。
 *
 * ★ 占比用 splitPercent（最大余数法）算，保证四行加起来**恰好 100%**。
 *   各自 Math.round 会出现 99/101 —— 实测本数据集 21 个范围里 8 个中招。
 * ★ 色条宽度直接用这个整数百分比：条长与标签数字永远一致，不出现
 *   "写着 27% 但条比 33% 的长"。
 */
function rows(r) {
  if (!r) return []

  // 以 CATEGORY 的键为准，保证四类齐全（后端若返回未登记的类别，忽略）
  const entries = Object.keys(CATEGORY)
    .map((key) => [key, Number(r.byCategory?.[key] ?? 0)])
    .sort((a, b) => b[1] - a[1])

  const pcts = splitPercent(entries.map(([, n]) => n))

  return entries.map(([key, n], i) => ({
    key,
    label: cat(key).label,
    color: cat(key).color,
    count: n,
    pct: pcts[i],
  }))
}

/**
 * 百分比文本。
 * ★ 有设施但占比被分到 0% 时显示 "<1%"：直接写 0% 会让人以为这一类是空的。
 */
function pctLabel(row) {
  if (row.count > 0 && row.pct <= 0) return '<1%'
  return `${Number.isInteger(row.pct) ? row.pct : row.pct.toFixed(1)}%`
}

/**
 * 色条宽度。
 * ★ 数量为 0 → 宽度 0（不显示任何色块）；
 *   数量 > 0 但占比四舍五入成 0% → 给 2px，让"有东西"这件事看得出来。
 */
function barStyle(row) {
  return {
    width: `${row.pct}%`,
    background: row.color,
    minWidth: row.count > 0 && row.pct <= 0 ? '2px' : '0',
  }
}

/** 距离：小于 1km 显示米，否则显示千米 */
function distText(m) {
  if (m == null) return ''
  return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${Math.round(m)} m`
}

/** 「最近的设施」最多 5 条 */
const topItems = (r) => (r?.items ?? []).slice(0, LIST_MAX)

/** 还有多少条没显示出来 */
function moreCount(r) {
  const total = r?.items?.length ?? 0
  return total > LIST_MAX ? total - LIST_MAX : 0
}

function onExport() {
  emit('export')
}

function onPick(item) {
  emit('pick', item)
}
</script>

<template>
  <!-- 没有任何可显示的内容时整卡不渲染，避免留一个空框 -->
  <div
    v-if="loading || error || result"
    class="result-card"
    :style="{ width: CARD_W + 'px' }"
  >
    <!-- ═══ 加载 ═══ -->
    <div v-if="loading" class="state">
      <span class="spin" />
      正在统计…
    </div>

    <!-- ═══ 出错 ═══ -->
    <div v-else-if="error" class="state is-error">{{ error }}</div>

    <!-- ═══ 正常 ═══ -->
    <template v-else-if="result">
      <div class="head">
        <span class="head-title">可达性分析结果</span>
        <span class="head-sub" :title="subtitle(result)">{{ subtitle(result) }}</span>
      </div>

      <!-- 大数字 -->
      <div class="summary">
        <span class="big">{{ result.count.toLocaleString() }}</span>
        <span class="big-label">{{ scopeText(result) }}</span>
      </div>

      <!-- 没勾任何类别 / 范围内确实没设施 -->
      <div v-if="result.count === 0" class="empty">
        该范围内没有符合条件的设施<br />
        <span class="empty-hint">试试放宽半径或勾选更多类别</span>
      </div>

      <!-- 分类条：四类常驻，0 的也显示出来 -->
      <div v-else class="cats">
        <div
          v-for="row in rows(result)"
          :key="row.key"
          class="cat-row"
          :class="{ 'is-zero': row.count === 0 }"
        >
          <div class="cat-line">
            <span class="cat-name">{{ row.label }}</span>
            <!-- ★ 数量和占比分成两个独立元素，不能拼成 "8 · 34%"：
                 连在一起读很容易看成 "8.34%"。这里用间距 + 不同颜色分开 -->
            <span class="cat-num">
              <span class="cat-count">{{ row.count.toLocaleString() }} 个</span>
              <span class="cat-pct">{{ pctLabel(row) }}</span>
            </span>
          </div>
          <div class="bar">
            <span class="bar-fill" :style="barStyle(row)" />
          </div>
        </div>
      </div>

      <!-- 最近的设施 -->
      <template v-if="topItems(result).length">
        <div class="divider">最近的设施</div>
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
        <div v-if="moreCount(result)" class="more">
          还有 {{ moreCount(result) }} 条，导出 CSV 查看全部
        </div>
      </template>

      <!-- 导出 -->
      <div class="actions">
        <button class="export" type="button" @click="onExport">导出 CSV</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
.result-card {
  position: absolute;
  right: 16px;
  top: 72px;
  z-index: 15;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #dde5ec;
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(16, 42, 67, 0.14);
  backdrop-filter: blur(6px);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  color: #2b4359;
  overflow: hidden;
}

/* ═══ 加载 / 错误 ═══ */
.state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 14px;
  font-size: 12.5px;
  color: #5b7288;
}
.state.is-error {
  color: #c62828;
}
.spin {
  width: 12px;
  height: 12px;
  border: 2px solid #d6e2ee;
  border-top-color: #d93025;
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

/* ═══ 大数字 ═══ */
.summary {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 14px 10px;
}
/* 设计稿里这个数字是整卡视觉重心，红色、大、等宽数字 */
.big {
  font-size: 30px;
  font-weight: 700;
  line-height: 1.1;
  color: #d93025;
  font-variant-numeric: tabular-nums;
}
.big-label {
  font-size: 11px;
  color: #8aa0b4;
}

/* ═══ 空结果 ═══ */
.empty {
  padding: 4px 14px 12px;
  font-size: 11.5px;
  color: #8aa0b4;
  line-height: 1.7;
}
.empty-hint {
  color: #b7c7d6;
  font-size: 10.5px;
}

/* ═══ 分类条 ═══ */
.cats {
  padding: 0 14px 10px;
}
.cat-row + .cat-row {
  margin-top: 7px;
}
/* 数量为 0 的类别：整行压淡，但仍然占位，让人知道这一类"查过了、是 0" */
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
  /* 数量与百分比并排，中间留 12px —— 两个数字绝不粘连成 "8.34%" */
  display: inline-flex;
  align-items: baseline;
  gap: 12px;
  font-variant-numeric: tabular-nums;
}
/* 数量：小一号、更淡，视觉上退到次要位置 */
.cat-count {
  font-size: 10.5px;
  color: #a8bccd;
}
/* 百分比：右对齐且定宽，四行的小数点/百分号能对齐成一列 */
.cat-pct {
  min-width: 34px;
  text-align: right;
  font-size: 11px;
  color: #5b7288;
}
.bar {
  height: 5px;
  border-radius: 3px;
  background: #eef2f6;
  overflow: hidden;
}
.bar-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  /* min-width 由 barStyle 按行决定：0 数量给 0，"<1%" 给 2px */
  transition: width 0.35s ease;
}

/* ═══ 分隔标题 ═══ */
.divider {
  padding: 8px 14px 6px;
  border-top: 1px solid #f0f4f8;
  font-size: 10.5px;
  color: #a8bccd;
}

/* ═══ 最近设施列表 ═══ */
.list {
  margin: 0;
  padding: 0 14px 4px;
  list-style: none;
}
.item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 0;
  font-size: 12px;
  border-radius: 6px;
}
.item.is-link {
  cursor: pointer;
}
.item.is-link:hover {
  background: #f5f8fc;
}
.dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.item-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-dist {
  flex: none;
  color: #8aa0b4;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.more {
  padding: 2px 14px 8px;
  font-size: 10px;
  color: #b7c7d6;
}

/* ═══ 导出按钮 ═══ */
.actions {
  padding: 8px 14px 12px;
  border-top: 1px solid #f0f4f8;
}
.export {
  width: 100%;
  height: 30px;
  border-radius: 7px;
  border: 1px solid #dde5ec;
  background: #fff;
  color: #2b4359;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.export:hover {
  border-color: #d93025;
  color: #d93025;
  background: #fdf6f5;
}
</style>
