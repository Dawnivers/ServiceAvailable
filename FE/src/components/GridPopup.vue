<script setup>
/**
 * ════════════════════════════════════════════════════════════
 * GridPopup —— 点击热力图格子后弹出的统计卡
 *
 * 纯展示组件：不 import store / 地图，只认 props。
 * 定位与视觉刻意和 PoiDetailCard 对齐（右上、右 16 / 上 76、圆角 12），
 * 两者不会同时出现 —— 热力图与 POI 图层在 store 里是互斥的。
 *
 * 数据来自 WMS 的 GetFeatureInfo（见 map/gridInfo.js），
 * 字段：total / school / hospital / mall / park 与对应的 r_* 倍数。
 * ════════════════════════════════════════════════════════════
 */

import { computed } from 'vue'
import { GRID_CATEGORIES } from '@/map/gridInfo'

const CARD_W = 288 // 与 PoiDetailCard 一致

const props = defineProps({
  info: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
  /** 中性提示（不是错误），比如「先放大再点格子」 */
  hint: { type: String, default: null },
})

defineEmits(['close'])

/** GetFeatureInfo 偶尔会把数字序列化成字符串，统一转成数字再算 */
const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** 格心坐标，保留 4 位（约 10 m 精度，够定位到街区） */
const center = computed(() => {
  const c = props.info?.centroid
  const arr = c && Array.isArray(c.coordinates) ? c.coordinates : null
  if (!arr) return null
  return `${arr[0].toFixed(4)}, ${arr[1].toFixed(4)}`
})

const total = computed(() => num(props.info?.total))
const rTotal = computed(() => num(props.info?.r_total))

/**
 * 四条分类。柱长按「本格最大值」归一，不按全市 —— 这一格内部的横向对比，
 * 用绝对值归一才看得出哪类设施在这里更密。
 */
const rows = computed(() => {
  const list = GRID_CATEGORIES.map((c) => ({
    ...c,
    count: num(props.info?.[c.field]),
    multiple: num(props.info?.[c.rField]),
  }))
  const max = Math.max(1, ...list.map((r) => r.count))
  return list
    .map((r) => ({ ...r, pct: Math.round((r.count / max) * 100) }))
    .sort((a, b) => b.count - a.count)
})

const visible = computed(
  () => props.loading || props.error || props.hint || props.info,
)
</script>

<template>
  <div v-if="visible" class="card" :style="{ width: CARD_W + 'px' }">
    <!-- ═══ 头部 ═══ -->
    <div class="head">
      <div class="head-main">
        <span class="badge">格</span>
        <div class="head-text">
          <span class="title">本格 500 m</span>
          <span class="sub">{{ center ? '格心 ' + center : '热力图格网' }}</span>
        </div>
      </div>
      <button class="close" type="button" title="关闭" @click="$emit('close')">
        ✕
      </button>
    </div>

    <!-- ═══ 加载 / 提示 / 错误 ═══ -->
    <div v-if="loading" class="state">正在查询本格…</div>
    <div v-else-if="hint" class="state is-hint">{{ hint }}</div>
    <div v-else-if="error" class="state is-error">{{ error }}</div>

    <!-- ═══ 统计 ═══ -->
    <template v-else-if="info">
      <!-- 大数字 -->
      <div class="hero">
        <div class="hero-num">{{ total }}</div>
        <div class="hero-side">
          <div class="hero-label">800 m 步行圈内设施</div>
          <div class="hero-mul">
            相对全市平均 <b>{{ rTotal.toFixed(1) }}×</b>
          </div>
        </div>
      </div>

      <!-- 四条分类 -->
      <ul class="rows">
        <li v-for="r in rows" :key="r.key" class="row">
          <span class="dot" :style="{ background: r.color }" />
          <span class="row-label">{{ r.label }}</span>
          <span class="row-count">{{ r.count }}</span>
          <span class="bar">
            <i :style="{ width: r.pct + '%', background: r.color }" />
          </span>
          <span class="row-mul">{{ r.multiple.toFixed(1) }}×</span>
        </li>
      </ul>

      <p class="foot">
        柱长按本格最大值归一；倍数 = 该格 ÷ 全市平均（1 = 平均）。
        公园按个数着色，其余按倍数。
      </p>
    </template>
  </div>
</template>

<style scoped>
.card {
  position: absolute;
  right: 16px;
  top: 76px;
  z-index: 15;
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid #dde5ec;
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(16, 42, 67, 0.12);
  backdrop-filter: blur(6px);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  color: #2b4359;
  overflow: hidden;
  user-select: none;
}

/* ═══ 头部 ═══ */
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 12px 10px 14px;
  border-bottom: 1px solid #eef3f8;
}
.head-main {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}
.badge {
  width: 26px;
  height: 26px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: linear-gradient(145deg, #f2994a, #e07012);
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(224, 112, 18, 0.3);
}
.head-text {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  min-width: 0;
}
.title {
  font-size: 13.5px;
  font-weight: 700;
  color: #17334d;
}
.sub {
  font-size: 10.5px;
  color: #9aaec1;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.close {
  flex: none;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #9aaec1;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.close:hover {
  background: #f1f5f9;
  color: #2b4359;
}

/* ═══ 加载 / 错误 ═══ */
.state {
  padding: 18px 14px;
  font-size: 12.5px;
  color: #7d93a8;
}
/* 引导态：热力图刚打开、还没选格子时，告诉用户"这里可以点"。
   用暖色左框而不是灰色文字 —— 它是唯一一次主动引导，需要被看见。 */
.state.is-hint {
  margin: 10px 14px 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border-left: 3px solid #f2994a;
  background: #fff8ec;
  color: #8a5a1e;
  line-height: 1.65;
}
.state.is-error {
  color: #c62828;
}

/* ═══ 大数字 ═══ */
.hero {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 14px 10px;
}
.hero-num {
  font-size: 34px;
  font-weight: 800;
  line-height: 1;
  color: #e07012;
  font-variant-numeric: tabular-nums;
}
.hero-side {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.hero-label {
  font-size: 11.5px;
  color: #7d93a8;
}
.hero-mul {
  font-size: 11.5px;
  color: #5b7286;
}
.hero-mul b {
  color: #17334d;
  font-variant-numeric: tabular-nums;
}

/* ═══ 分类行 ═══ */
.rows {
  margin: 0;
  padding: 2px 14px 8px;
  list-style: none;
}
.row {
  display: grid;
  grid-template-columns: 8px 30px 26px 1fr 38px;
  align-items: center;
  gap: 7px;
  padding: 5px 0;
  font-size: 11.5px;
}
.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.row-label {
  color: #5b7286;
  white-space: nowrap;
}
.row-count {
  text-align: right;
  font-weight: 700;
  color: #17334d;
  font-variant-numeric: tabular-nums;
}
.bar {
  height: 6px;
  border-radius: 3px;
  background: #eef3f8;
  overflow: hidden;
}
.bar i {
  display: block;
  height: 100%;
  border-radius: 3px;
  transition: width 0.2s;
}
.row-mul {
  text-align: right;
  color: #9aaec1;
  font-variant-numeric: tabular-nums;
}

/* ═══ 脚注 ═══ */
.foot {
  margin: 0;
  padding: 8px 14px 12px;
  border-top: 1px solid #eef3f8;
  font-size: 10.5px;
  line-height: 1.6;
  color: #a8bccd;
}
</style>
