<script setup>
/**
 * ════════════════════════════════════════════════════════════
 * MapLegend —— 左下角图例（两种模式）
 *
 *   mode = 'poi'   类别色点：学校蓝 / 医院红 / 商场橙 / 公园绿
 *   mode = 'heat'  数值色带：无覆盖 / 0.2–1 倍 / ... / ≥25 倍
 *
 * ★ 为什么必须切换而不是并排显示：
 *   POI 图例是「类别 → 颜色」，热力图图例是「数值 → 颜色」。
 *   两个同时出现，用户会以为「红 = 医院」和「红 = 密度高」是一回事。
 *
 * ★ 热力色带不在本文件里写死，全部来自 map/heatmap.js，
 *   而 heatmap.js 又与 BE/styles/grid_*.sld 逐字对齐（有校验脚本）。
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
  /** 'poi' = 类别色点；'heat' = 数值色带 */
  mode: { type: String, default: 'poi' },
  /** 热力图类别 key（heatmap.js 的 HEAT_CATEGORIES[].key） */
  heatKey: { type: String, default: 'total' },
})

const isHeat = computed(() => props.mode === 'heat')

const titleText = computed(() => (isHeat.value ? '可达性热力图' : props.title))
const subText = computed(() =>
  isHeat.value ? heatLegendSubtitle(props.heatKey) : props.subtitle,
)

/**
 * 图例条目。
 * ★ 热力模式下 color 可能是 null —— 那是「无覆盖」档（67.3% 的格子），
 *   必须用一个空心/虚线块表达，否则用户会以为地图没加载完。
 */
const items = computed(() =>
  isHeat.value
    ? heatLegend(props.heatKey).map((b, i) => ({
        key: 'band' + i,
        label: b.label,
        color: b.color,
      }))
    : POI_ITEMS,
)
</script>

<template>
  <div class="legend" :class="{ 'is-heat': isHeat }">
    <div class="head">
      <span class="title">{{ titleText }}</span>
      <span class="sub">{{ subText }}</span>
    </div>
    <ul class="list">
      <li v-for="it in items" :key="it.key" class="item">
        <span v-if="it.color" class="dot" :style="{ background: it.color }" />
        <!-- 无覆盖档：虚线空心块 -->
        <span v-else class="dot is-empty" />
        <span class="label">{{ it.label }}</span>
      </li>
    </ul>
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
</style>
