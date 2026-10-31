<script setup>
/**
 * ════════════════════════════════════════════════════════════
 * MapScaleReadout —— 右下角比例尺 + 坐标/级别读数
 *
 * 上半：比例尺（├── 5 km ──┤）
 * 下半：114.3000, 30.5500 · Z9
 *
 * 这个组件与其他"固定组件"不同：它必须**跟地图联动**，需要 map 实例。
 * 传 map 的原则：可以传，但绝不能放进 reactive / ref()！
 * 这里用 shallowRef + markRaw 兜住。
 * ════════════════════════════════════════════════════════════
 */

import { ref, shallowRef, watch, onScopeDispose, markRaw } from 'vue'
import { getPointResolution, toLonLat } from 'ol/proj.js'
import { unByKey } from 'ol/Observable.js'

// ── 配置 ────────────────────────────────────────────────────
const MIN_WIDTH = 70 // 比例尺条最小像素宽
const MAX_WIDTH = 140 // 最大像素宽
const STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000]
const COORD_PRECISION = 4 // 小数位（设计稿是 4 位）

const props = defineProps({
  map: { type: Object, default: null },
})

// ── 状态 ────────────────────────────────────────────────────
const barWidth = ref(0)
const barLabel = ref('')
const lonText = ref('')
const latText = ref('')
const zoomText = ref('')

const mapRef = shallowRef(null) // markRaw 包一层，防 Proxy
const keys = [] // 收集 OL 的监听 key，卸载时 unByKey

// ── 比例尺 ─────────────────────────────────────────────────

/**
 * 选出像素宽度落进 [MIN, MAX] 的最佳档位。
 *
 * 算法：从大到小遍历档位，取**第一个像素宽度不超过 MAX_WIDTH 的**。
 * 这样得到的条总是尽量长（精度高），又不会撑破卡片。
 * 如果最小档位都超过 MAX，就退回最小档。
 */
function computeScale(m) {
  const view = m.getView()
  const res = view.getResolution()
  if (!res) return

  const center = view.getCenter()
  // 3857 在高纬度有形变，用 getPointResolution 换算成真实米/像素
  const mpp = getPointResolution(view.getProjection(), res, center, 'm')
  if (!mpp || !Number.isFinite(mpp)) return

  let chosen = STEPS[0]
  for (let i = STEPS.length - 1; i >= 0; i--) {
    const px = STEPS[i] / mpp
    if (px <= MAX_WIDTH) {
      chosen = STEPS[i]
      break
    }
  }
  // 最小档位也超宽（极度放大的情况），往下压到最小值
  if (chosen / mpp > MAX_WIDTH) chosen = STEPS[0]

  barWidth.value = Math.round(chosen / mpp)
  barLabel.value = chosen >= 1000 ? chosen / 1000 + ' km' : chosen + ' m'
}

// ── 坐标 / 级别 ─────────────────────────────────────────────

function updateCoord(coord) {
  if (!coord) return
  const [lon, lat] = toLonLat(coord)
  lonText.value = lon.toFixed(COORD_PRECISION)
  latText.value = lat.toFixed(COORD_PRECISION)
}

function updateZoom(m) {
  const z = m.getView().getZoom()
  zoomText.value = 'Z' + (z == null ? '—' : Math.round(z))
}

function refreshAll(m) {
  computeScale(m)
  updateZoom(m)
  updateCoord(m.getView().getCenter())
}

// ── 绑定 / 解绑 ─────────────────────────────────────────────

function unbind() {
  for (const k of keys) unByKey(k)
  keys.length = 0
  mapRef.value = null
}

function bind(m) {
  if (!m) return
  mapRef.value = markRaw(m)
  refreshAll(m)

  // moveend：拖动/缩放结束才重算比例尺，避免拖动中疯狂计算
  keys.push(m.on('moveend', () => refreshAll(m)))

  // pointermove：鼠标移动实时更新坐标（读数跟鼠标走，比只显示中心点实用）
  keys.push(
    m.on('pointermove', (e) => {
      if (e.dragging) return
      updateCoord(e.coordinate)
    }),
  )
}

// props.map 可能一开始是 null（地图还没建好），watch 到有值再绑
watch(
  () => props.map,
  (m) => {
    unbind()
    if (m) bind(m)
  },
  { immediate: true },
)

onScopeDispose(unbind)
</script>

<template>
  <div class="scale-readout">
    <!-- 比例尺 -->
    <div class="scale-row">
      <div class="scale-bar" :style="{ width: (barWidth || 60) + 'px' }" />
      <span class="scale-text">{{ barLabel || '—' }}</span>
    </div>
    <!-- 坐标 + 级别 -->
    <div class="coord-row">
      <span class="coord">{{ lonText || '—' }}, {{ latText || '—' }}</span>
      <span class="sep">·</span>
      <span class="zoom">{{ zoomText || '—' }}</span>
    </div>
  </div>
</template>

<style scoped>
.scale-readout {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 15;
  padding: 8px 12px 6px;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #dde5ec;
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(16, 42, 67, 0.12);
  backdrop-filter: blur(6px);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  user-select: none;
}

/* 比例尺：底部横线 + 两端竖线 */
.scale-row {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.scale-bar {
  position: relative;
  height: 6px;
  border-bottom: 1.5px solid #6f8aa6;
  transition: width 0.15s ease;
}
.scale-bar::before,
.scale-bar::after {
  content: '';
  position: absolute;
  bottom: 0;
  width: 1.5px;
  height: 5px;
  background: #6f8aa6;
}
.scale-bar::before {
  left: 0;
}
.scale-bar::after {
  right: 0;
}
.scale-text {
  font-size: 11px;
  color: #3d5a75;
  line-height: 1;
  white-space: nowrap;
}

/* 坐标行 */
.coord-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
  font-size: 10.5px;
  color: #8aa0b4;
  font-variant-numeric: tabular-nums;
}
.sep {
  opacity: 0.6;
}
.zoom {
  color: #3d5a75;
  font-weight: 600;
}
</style>
