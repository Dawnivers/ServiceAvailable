<script setup>
/**
 * ════════════════════════════════════════════════════════════
 * OverlayPanel —— 右上角的叠加分析面板
 *
 * 纯展示组件（和 AnalysisResult / LayerPanel 同一路数）：
 *   不 import store 实例、不 fetch，只认 props + emit。
 *   ★ 只 import 纯常量（CATEGORIES / DEGREE_COLORS），
 *     颜色必须和地图、图例一套 —— 在组件里再抄一份迟早会不同步。
 *
 * 结构（从上到下）：
 *   ① 标题 + 「3 / 6 个面」
 *   ② 面列表：色块（带字母）+ 来源 + 面积 + 删除
 *      · hover 无副作用，click = 在地图上高亮并定位（再点取消）
 *   ③ 并集：大数字（设施数）+ 四个类别条
 *   ④ 交集：被 N 个面同时覆盖的那一块（可能为空）
 *   ⑤ 按重叠度：1 重 / 2 重 / 3 重 … 各自的面积与设施数
 *
 * ★ 为什么「按重叠度」是主输出而不是「组合枚举」：
 *   组合数是 2^n-1，6 个面有 63 种，没人读得过来。
 *   而重叠区互不重复（平面细分保证），所以各度面积相加 = 并集面积，
 *   这个恒等式本身就是最好的正确性提示，写在底部。
 * ════════════════════════════════════════════════════════════
 */

import { computed } from 'vue'
import { CATEGORIES, DEGREE_COLORS } from '@/stores/analysis.js'
import { splitPercent } from '@/utils/percent'

const CARD_W = 288 // 与 AnalysisResult / PoiDetailCard 同宽，右侧不跳

const props = defineProps({
  // [{ id, label, color, kind, radius, areaKm2 }]
  shapes: { type: Array, default: () => [] },
  // 后端 /api/poi/overlay 的原始结果
  result: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  maxShapes: { type: Number, default: 6 },
  // 当前在地图上高亮的面 id
  selected: { type: String, default: null },
  // 导出中：要额外拉一次设施明细，期间按钮显示「导出中…」
  exporting: { type: Boolean, default: false },
})

const emit = defineEmits(['remove', 'select', 'clear', 'retry', 'export'])

// ── 派生 ───────────────────────────────────────────────────
const union = computed(() => props.result?.union ?? null)
const intersect = computed(() => props.result?.intersect ?? null)

/** 并集里四个类别：恒四行，缺的补 0（与可达性分析卡片保持同一套读法） */
const catRows = computed(() => {
  const by = union.value?.byCategory ?? {}
  const rows = CATEGORIES.map((c) => ({
    key: c.key,
    label: c.label,
    color: c.color,
    count: Number(by[c.key] ?? 0),
  }))
  const pcts = splitPercent(rows.map((r) => r.count))
  return rows.map((r, i) => ({ ...r, pct: pcts[i] }))
})

/**
 * 重叠度行。
 * ★ 后端只返回实际存在的 deg —— 3 个面不一定有三重重叠区。
 *   这里不补齐到 N 行：补出来的「3 重 0 km²」会让人以为那层存在但是空的。
 */
const degreeRows = computed(() => {
  const list = props.result?.byDegree ?? []
  return list.map((d) => ({
    deg: d.deg,
    label: `${d.deg} 重`,
    color: DEGREE_COLORS[Math.min(d.deg, DEGREE_COLORS.length) - 1],
    areaKm2: d.areaKm2,
    poi: d.poi,
  }))
})

/** 各重叠度的面积之和，用来验证「相加 = 并集」 */
const degreeSum = computed(() =>
  degreeRows.value.reduce((a, d) => a + (Number(d.areaKm2) || 0), 0),
)

// ── 格式化 ─────────────────────────────────────────────────
function fmtKm2(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return '—'
  if (n === 0) return '0 km²'
  // 小块（比如三重重叠只剩 0.004 km²）用两位小数会显示成 0.00，看不出存在
  if (n < 0.01) return `${n.toFixed(3)} km²`
  return `${n.toFixed(2)} km²`
}

const fmtNum = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString() : '—')

function pctLabel(row) {
  if (row.count > 0 && row.pct <= 0) return '<1%'
  return `${Number.isInteger(row.pct) ? row.pct : row.pct.toFixed(1)}%`
}

function barStyle(row) {
  return {
    width: `${row.pct}%`,
    background: row.color,
    minWidth: row.count > 0 && row.pct <= 0 ? '2px' : '0',
  }
}

/** 面列表里那行小字：来源 */
function shapeSub(s) {
  return s.kind === 'circle' ? `缓冲圈 ${Math.round(s.radius ?? 0)} m` : '手绘面'
}
</script>

<template>
  <div class="ov-card" :style="{ width: CARD_W + 'px' }">
    <!-- ═══ 标题 ═══ -->
    <div class="head">
      <span class="head-title">叠加分析</span>
      <span class="head-sub">{{ shapes.length }} / {{ maxShapes }} 个面</span>
    </div>

    <!-- ═══ 面列表 ═══ -->
    <ul v-if="shapes.length" class="shapes">
      <li
        v-for="s in shapes"
        :key="s.id"
        class="shape"
        :class="{ 'is-on': s.id === selected }"
        :title="s.id === selected ? '再点一次取消高亮' : '点击在地图上高亮并定位'"
        @click="emit('select', s.id)"
      >
        <span class="swatch" :style="{ background: s.color }">{{ s.label }}</span>
        <span class="shape-text">
          <span class="shape-name">{{ shapeSub(s) }}</span>
          <span class="shape-area">{{ fmtKm2(s.areaKm2) }}</span>
        </span>
        <button class="del" type="button" title="删除这个面" @click.stop="emit('remove', s.id)">
          ×
        </button>
      </li>
    </ul>

    <!-- ═══ 不足 2 个面 ═══ -->
    <div v-if="shapes.length < 2" class="hint">
      至少需要 2 个面才能叠加<br />
      <span class="hint-sub">用左上工具继续画，已画的不会消失</span>
    </div>

    <!-- ═══ 加载 / 出错 ═══ -->
    <div v-else-if="loading" class="state">
      <span class="spin" />
      正在做平面细分…
    </div>
    <div v-else-if="error" class="state is-error">
      <span class="err-text">{{ error }}</span>
      <button class="retry" type="button" @click="emit('retry')">重试</button>
    </div>

    <!-- ═══ 结果 ═══ -->
    <template v-else-if="result">
      <!-- 并集 -->
      <div class="divider">并集 · 全部面覆盖的范围</div>
      <div class="summary">
        <span class="big">{{ fmtNum(union?.poi) }}</span>
        <span class="big-label">个设施 · {{ fmtKm2(union?.areaKm2) }}</span>
      </div>

      <div class="cats">
        <div
          v-for="r in catRows"
          :key="r.key"
          class="cat-row"
          :class="{ 'is-zero': r.count === 0 }"
        >
          <div class="cat-line">
            <span class="cat-name">{{ r.label }}</span>
            <span class="cat-num">
              <span class="cat-count">{{ fmtNum(r.count) }} 个</span>
              <span class="cat-pct">{{ pctLabel(r) }}</span>
            </span>
          </div>
          <div class="bar"><span class="bar-fill" :style="barStyle(r)" /></div>
        </div>
      </div>

      <!-- 交集 -->
      <div class="divider">交集 · 同时被 {{ shapes.length }} 个面覆盖</div>
      <div v-if="intersect?.empty" class="hint-inline">
        这 {{ shapes.length }} 个面没有共同重叠区
      </div>
      <div v-else class="kv">
        <span class="kv-k">面积</span>
        <span class="kv-v">{{ fmtKm2(intersect?.areaKm2) }}</span>
        <span class="kv-k">设施</span>
        <span class="kv-v">{{ fmtNum(intersect?.poi) }} 个</span>
      </div>

      <!-- 按重叠度 -->
      <div class="divider">按重叠度</div>
      <ul class="degs">
        <li v-for="d in degreeRows" :key="d.deg" class="deg">
          <span class="deg-dot" :style="{ background: d.color }" />
          <span class="deg-label">{{ d.label }}</span>
          <span class="deg-area">{{ fmtKm2(d.areaKm2) }}</span>
          <span class="deg-poi">{{ fmtNum(d.poi) }} 个</span>
        </li>
      </ul>

      <div class="foot">
        重叠区互不重复，各度面积相加 {{ fmtKm2(degreeSum) }} = 并集
      </div>
    </template>

    <!-- ═══ 底部动作 ═══
         ★ 导出跟着 result 走：还在算 / 报错时没有数字可导，按钮置灰。
           清空跟着 shapes 走：没画过面就没什么可清。 -->
    <div class="actions">
      <button
        class="act export"
        type="button"
        :disabled="!result || loading || exporting"
        :title="result ? '导出并集/交集/重叠度统计 + 设施明细' : '还没有可导出的结果'"
        @click="emit('export')"
      >
        {{ exporting ? '导出中…' : '导出 CSV' }}
      </button>
      <button class="act clear" type="button" :disabled="!shapes.length" @click="emit('clear')">
        清空所有面
      </button>
    </div>
  </div>
</template>

<style scoped>
.ov-card {
  position: absolute;
  right: 16px;
  top: 72px;
  z-index: 15;
  max-height: calc(100vh - 150px);
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #dde5ec;
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(16, 42, 67, 0.14);
  backdrop-filter: blur(6px);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  color: #2b4359;
  overflow: hidden;
}

/* ═══ 标题 ═══ */
.head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 12px 14px 8px;
  flex: none;
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
  font-variant-numeric: tabular-nums;
}

/* ═══ 面列表 ═══ */
.shapes {
  margin: 0;
  padding: 0 10px 6px;
  list-style: none;
  flex: none;
  max-height: 152px; /* 6 个面时约 3.5 行，超出滚动，别把统计挤出去 */
  overflow-y: auto;
}
.shape {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 4px 4px;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.12s;
}
.shape:hover {
  background: #f5f8fc;
}
/* 选中态：淡主色底 + 左侧色块加粗，和地图上的粗描边呼应 */
.shape.is-on {
  background: #eef4fb;
}
.shape.is-on .swatch {
  box-shadow: 0 0 0 2px #fff, 0 0 0 3.5px currentColor;
}
.swatch {
  flex: none;
  width: 18px;
  height: 18px;
  border-radius: 5px;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
  /* currentColor 给选中态的描边用：让 ring 跟着色块本身颜色 */
  --ring: currentColor;
}
.shape-text {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.shape-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11.5px;
  color: #5b7288;
}
.shape-area {
  flex: none;
  font-size: 11px;
  color: #8aa0b4;
  font-variant-numeric: tabular-nums;
}
.del {
  flex: none;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #b7c7d6;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}
.del:hover {
  background: #fdecea;
  color: #c62828;
}

/* ═══ 状态 ═══ */
.state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 14px;
  font-size: 12px;
  color: #5b7288;
  flex: none;
}
.state.is-error {
  color: #c62828;
  align-items: flex-start;
}
/* 错误文案可能很长（后端 400 的 detail），允许折行，别把卡片撑坏 */
.err-text {
  flex: 1;
  min-width: 0;
  line-height: 1.55;
  word-break: break-word;
}
.retry {
  flex: none;
  padding: 3px 9px;
  border: 1px solid #f0c7c4;
  border-radius: 6px;
  background: #fff;
  color: #c62828;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.retry:hover {
  background: #fdecea;
  border-color: #c62828;
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

.hint {
  padding: 6px 14px 12px;
  font-size: 11.5px;
  color: #8aa0b4;
  line-height: 1.7;
  flex: none;
}
.hint-sub {
  color: #b7c7d6;
  font-size: 10.5px;
}
.hint-inline {
  padding: 2px 14px 10px;
  font-size: 11.5px;
  color: #8aa0b4;
}

/* ═══ 分隔标题 ═══ */
.divider {
  padding: 8px 14px 5px;
  border-top: 1px solid #f0f4f8;
  font-size: 10.5px;
  color: #a8bccd;
  flex: none;
}

/* ═══ 并集大数字 ═══ */
.summary {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 0 14px 8px;
  flex: none;
}
.big {
  font-size: 26px;
  font-weight: 700;
  line-height: 1.1;
  color: #d93025;
  font-variant-numeric: tabular-nums;
}
.big-label {
  font-size: 11px;
  color: #8aa0b4;
}

/* ═══ 分类条（与 AnalysisResult 同一套尺寸）═══ */
.cats {
  padding: 0 14px 8px;
  flex: none;
}
.cat-row + .cat-row {
  margin-top: 6px;
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
  font-size: 10.5px;
  color: #a8bccd;
}
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
  transition: width 0.35s ease;
}

/* ═══ 交集：两列键值 ═══ */
.kv {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 3px 10px;
  padding: 0 14px 8px;
  font-size: 11.5px;
  flex: none;
}
.kv-k {
  color: #8aa0b4;
}
.kv-v {
  text-align: right;
  color: #2b4359;
  font-variant-numeric: tabular-nums;
}

/* ═══ 重叠度列表 ═══ */
.degs {
  margin: 0;
  padding: 0 14px 8px;
  list-style: none;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.deg {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
}
.deg-dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 3px;
}
.deg-label {
  flex: 1;
  color: #2b4359;
}
.deg-area {
  flex: none;
  color: #5b7288;
}
.deg-poi {
  flex: none;
  min-width: 52px;
  text-align: right;
  color: #8aa0b4;
  font-size: 11px;
}

/* ═══ 底部说明 ═══ */
.foot {
  padding: 2px 14px 10px;
  font-size: 10px;
  color: #b7c7d6;
  line-height: 1.6;
  flex: none;
}

/* ═══ 底部动作（导出 / 清空 并排）═══ */
.actions {
  display: flex;
  gap: 8px;
  padding: 8px 14px 12px;
  border-top: 1px solid #f0f4f8;
  flex: none;
}
.act {
  flex: 1;
  min-width: 0;
  height: 30px;
  border-radius: 7px;
  border: 1px solid #dde5ec;
  background: #fff;
  color: #2b4359;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: border-color 0.15s, background 0.15s, color 0.15s;
}
/* 导出是主操作：实心红，和其它面板里的「导出 CSV」视觉一致 */
.act.export {
  border-color: #d93025;
  background: #d93025;
  color: #fff;
  font-weight: 700;
}
.act.export:hover:not(:disabled) {
  background: #c02a20;
  border-color: #c02a20;
}
.act.clear:hover:not(:disabled) {
  border-color: #d93025;
  color: #d93025;
  background: #fdf6f5;
}
.act:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
/* 置灰时别保留实心红，否则看不出是禁用的 */
.act.export:disabled {
  background: #f3d5d3;
  border-color: #f3d5d3;
  color: #fff;
}
</style>
