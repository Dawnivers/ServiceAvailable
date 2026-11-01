<script setup>
/**
 * ════════════════════════════════════════════════════════════
 * MapLegend —— 左下角图例
 *
 * 纯展示：不 import store / 地图，只认 props。
 * 颜色与 map/layers.js 的 chips、GeoServer 样式、PoiDetailCard 的标签一致，
 * 改色时三处要一起改（这是已知的重复，roadmap §2.3「待修小账」记着）。
 * ════════════════════════════════════════════════════════════
 */

// ── 配置：类别 → 中文 / 颜色（与 layers.js chips 同源） ────
const ITEMS = [
  { key: 'school', label: '学校', color: '#1565C0' },
  { key: 'hospital', label: '医院 / 诊所', color: '#C62828' },
  { key: 'mall', label: '商场 / 超市', color: '#EF6C00' },
  { key: 'park', label: '公园', color: '#2E7D32' },
]

defineProps({
  title: { type: String, default: '图例' },
  subtitle: { type: String, default: 'WMS 样式' },
})
</script>

<template>
  <div class="legend">
    <div class="head">
      <span class="title">{{ title }}</span>
      <span class="sub">{{ subtitle }}</span>
    </div>
    <ul class="list">
      <li v-for="it in ITEMS" :key="it.key" class="item">
        <span class="dot" :style="{ background: it.color }" />
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
.label {
  color: #2b4359;
}
</style>
