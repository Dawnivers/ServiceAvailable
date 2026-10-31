<script setup>
/**
 * ════════════════════════════════════════════════════════════
 * MapStatsBar —— 底部中间的数据统计条
 *
 * 四项数据全部是**静态事实**（库里查实）：
 *   行政区 13   / POI 16,016 / 类别 4 / 数据截止 2026-10
 *
 * ★ 为什么不从接口动态取：这四项在数据入库后就不再变，
 *   每次打开页面多发 4 个请求不值。真变了就改下面的 DEFAULTS。
 *   想改成动态的，把 props 传进去即可（接口未提供，需要新加）。
 * ════════════════════════════════════════════════════════════
 */

// ── 默认值：psql 实测（2026-10-30） ────────────────────────
//   13 = admin_area 行数
//   16016 = poi 行数
//   4 = select count(distinct category) from poi
//   2026-10 = to_char(max(fetched_at),'YYYY-MM')
const DEFAULTS = [
  { value: '13', label: '行政区' },
  { value: '16,016', label: 'POI 设施' },
  { value: '4', label: '设施类别' },
  { value: '2026-10', label: '数据截至' },
]

defineProps({
  // 传入自定义项则覆盖默认（形如 [{ value, label }]）
  items: { type: Array, default: null },
})
</script>

<template>
  <div class="stats-bar">
    <div v-for="(it, i) in items || DEFAULTS" :key="it.label" class="cell" :class="{ 'has-divider': i > 0 }">
      <div class="value">{{ it.value }}</div>
      <div class="label">{{ it.label }}</div>
    </div>
  </div>
</template>

<style scoped>
/* 水平居中，不挡左右两侧的图例和比例尺 */
.stats-bar {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 15;
  display: flex;
  align-items: stretch;
  padding: 10px 6px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #dde5ec;
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(16, 42, 67, 0.12);
  backdrop-filter: blur(6px);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  user-select: none;
}

.cell {
  min-width: 88px;
  padding: 0 12px;
  text-align: center;
}
/* 分隔线用左边框，第一格没有 */
.has-divider {
  border-left: 1px solid #eef3f8;
}

.value {
  font-size: 17px;
  font-weight: 700;
  color: #17334d;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
}
.label {
  margin-top: 2px;
  font-size: 11px;
  color: #9aaec1;
  line-height: 1.3;
}
</style>
