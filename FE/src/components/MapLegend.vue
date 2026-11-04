<script setup>
/**
 * ════════════════════════════════════════════════════════════
 * MapLegend —— 左下角图例（三种模式）
 *
 *   mode = 'poi'     类别色点：学校蓝 / 医院红 / 商场橙 / 公园绿
 *   mode = 'heat'    数值色带：无覆盖 / 0.2–1 倍 / ... / ≥25 倍
 *   mode = 'degree'  重叠度色阶：1 重 / 2 重 / 3 重 …（叠加分析）
 *
 * ★ 为什么必须切换而不是并排显示：
 *   POI 图例是「类别 → 颜色」，热力图图例是「数值 → 颜色」，
 *   重叠度图例是「层数 → 颜色」。三个同时出现，用户会以为
 *   「红 = 医院」和「红 = 密度高」和「红 = 三层重叠」是一回事。
 *
 * ★ 热力色带不在本文件里写死，全部来自 map/heatmap.js，
 *   而 heatmap.js 又与 BE/styles/grid_*.sld 逐字对齐（有校验脚本）。
 *
 * ★ 重叠度色阶也不写死：行由调用方从接口结果的 byDegree 传进来，
 *   颜色取 stores/analysis.js 的 DEGREE_COLORS（和地图、面板同一份），
 *   这样"图例上有几档"永远等于"图上实际出现几档"。
 *
 * 纯展示：不 import store / 地图，只认 props。
 * POI 的颜色与 layers.js 的 chips、GeoServer 样式、PoiDetailCard 的标签一致，
 * 改色时四处要一起改（这是已知的重复，roadmap §2.3「待修小账」记着）。
 * ════════════════════════════════════════════════════════════
 */

import { computed } from 'vue'
import { heatLegend, heatLegendSubtitle } from '@/map/heatmap'

// ── 配置：POI 类别 → 中文 / 颜色（与 layers.js chips 同源） ────
const POI_ITEMS = [
  { key: 'school', label: '学校', color: '#1565C0' },
  { key: 'hospital', label: '医院 / 诊所', color: '#C62828' },
  { key: 'mall', label: '商场 / 超市', color: '#EF6C00' },
  { key: 'park', label: '公园', color: '#2E7D32' },
]

const props = defineProps({
  title: { type: String, default: '图例' },
  subtitle: { type: String, default: 'WMS 样式' },
  /** 'poi' = 类别色点；'heat' = 数值色带；'degree' = 重叠度色阶 */
  mode: { type: String, default: 'poi' },
  /** 热力图类别 key（heatmap.js 的 HEAT_CATEGORIES[].key） */
  heatKey: { type: String, default: 'total' },
  /**
   * 叠加模式的重叠度行：`[{ deg, color }]`，由调用方从 byDegree 映射而来。
   * ★ 只传实际存在的档：3 个面不一定有三重重叠，凭空补一档会误导。
   */
  degrees: { type: Array, default: () => [] },
})

const isHeat = computed(() => props.mode === 'heat')
const isDegree = computed(() => props.mode === 'degree')
const isIsochrone = computed(() => props.mode === 'isochrone')

const titleText = computed(() => {
  if (isIsochrone.value) return '可达性分析'
  if (isDegree.value) return '重叠度'
  return isHeat.value ? '可达性热力图' : props.title
})
const subText = computed(() => {
  if (isIsochrone.value) return '直线 vs 路网'
  if (isDegree.value) return '越深覆盖越多'
  return isHeat.value ? heatLegendSubtitle(props.heatKey) : props.subtitle
})

/**
 * 等时圈图例（2026-11-04 加）。
 *
 * ★ 和另外三套的本质区别：它不是「值 → 颜色」也不是「类别 → 颜色」，
 *   而是「**图层 → 图形**」——图上同时有三个东西，用户必须先分清谁是谁。
 *   所以条目里带 shape，渲染时画成虚线圆 / 填充面 / 细线，而不是色点。
 * ★ 颜色与 drawing.js 里三个图层严格一致：
 *   圆 #d93025（分析态红，虚线）、面/路网 #1565C0（蓝）。
 */
const ISOCHRONE_ITEMS = [
  { key: 'circle', label: '直线 800 m', shape: 'dash', color: '#d93025' },
  { key: 'surface', label: '路网可达面', shape: 'fill', color: '#1565C0' },
  { key: 'network', label: '可达路网', shape: 'line', color: '#1565C0' },
]

/**
 * 图例条目。
 * ★ 热力模式下 color 可能是 null —— 那是「无覆盖」档（67.3% 的格子），
 *   必须用一个空心/虚线块表达，否则用户会以为地图没加载完。
 */
const items = computed(() => {
  if (isIsochrone.value) return ISOCHRONE_ITEMS
  if (isDegree.value) {
    return props.degrees.map((d) => ({
      key: 'deg' + d.deg,
      label: `${d.deg} 重`,
      color: d.color,
    }))
  }
  return isHeat.value
    ? heatLegend(props.heatKey).map((b, i) => ({
        key: 'band' + i,
        label: b.label,
        color: b.color,
      }))
    : POI_ITEMS
})
</script>

<template>
  <div class="legend" :class="{ 'is-heat': isHeat, 'is-degree': isDegree, 'is-iso': isIsochrone }">
    <div class="head">
      <span class="title">{{ titleText }}</span>
      <span class="sub">{{ subText }}</span>
    </div>
    <ul v-if="items.length" class="list">
      <li v-for="it in items" :key="it.key" class="item">
        <!-- 等时圈：按 shape 画虚线圆 / 填充面 / 细线 -->
        <template v-if="it.shape">
          <span v-if="it.shape === 'dash'" class="glyph glyph-dash" :style="{ borderColor: it.color }" />
          <span v-else-if="it.shape === 'fill'" class="glyph glyph-fill"
                :style="{ background: it.color + '22', borderColor: it.color }" />
          <span v-else class="glyph glyph-line" :style="{ background: it.color }" />
        </template>
        <span v-else-if="it.color" class="dot" :style="{ background: it.color }" />
        <!-- 无覆盖档：虚线空心块 -->
        <span v-else class="dot is-empty" />
        <span class="label">{{ it.label }}</span>
      </li>
    </ul>
    <!-- 叠加模式下还没算出结果（不足 2 个面）：给出下一步，而不是留一个空框 -->
    <div v-else class="hint">叠满 2 个面后显示</div>
  </div>
</template>

<style scoped>
.legend {
  position: absolute;
  left: 16px;
  bottom: 16px;
  z-index: 15;
  width: 148px;
  padding: 10px 14px 8px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #dde5ec;
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(16, 42, 67, 0.12);
  backdrop-filter: blur(6px);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  color: #2b4359;
  user-select: none;
}
/* 热力模式下条目多两条，略加宽一点，避免「10–25 倍」被挤断 */
.legend.is-heat {
  width: 160px;
}
/* 重叠度：档数不定（最多 6），条目标签最长「6 重」，常规宽度够 */
.legend.is-degree {
  width: 148px;
}
/* 等时圈：三条说明比色点长，略加宽 */
.legend.is-iso {
  width: 156px;
}

/* ═══ 等时圈的三种图形 ═══
   为什么不用统一色点：这三样是"三个图层"，形状本身就是信息 ——
   虚线圆 = 直线口径、填充面 = 可达范围、细线 = 路网。 */
.glyph {
  flex: none;
  width: 14px;
  height: 10px;
  box-sizing: border-box;
}
.glyph-dash {
  border: 1.5px dashed;
  border-radius: 50%;
  height: 12px;
}
.glyph-fill {
  border: 1.5px solid;
  border-radius: 2px;
}
.glyph-line {
  height: 3px;
  border-radius: 1.5px;
}

.head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding-bottom: 6px;
}
.title {
  font-size: 13px;
  font-weight: 700;
  color: #17334d;
}
.sub {
  font-size: 10px;
  color: #a8bccd;
  white-space: nowrap;
}

.list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
}
.dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.9);
}
/* 热力色带：改成小方块，更像"色阶"而不是"类别点" */
.legend.is-heat .dot {
  width: 14px;
  height: 10px;
  border-radius: 2px;
}
/* 重叠度也是色阶（层数递增），跟热力一样用方块 */
.legend.is-degree .dot {
  width: 14px;
  height: 10px;
  border-radius: 2px;
}
/* 无覆盖：虚线空心 */
.dot.is-empty {
  background: transparent;
  border: 1px dashed #b7c7d6;
  box-shadow: none;
}
.label {
  color: #2b4359;
}
/* 热力模式的数值文字用等宽数字，扫一眼更整齐 */
.legend.is-heat .label {
  font-variant-numeric: tabular-nums;
}

/* 叠加模式下还没有结果时的引导文案 */
.hint {
  padding: 2px 0 4px;
  font-size: 11.5px;
  color: #a8bccd;
  line-height: 1.5;
}
</style>
