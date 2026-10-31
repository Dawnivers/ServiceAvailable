<script setup>
/**
 * 图层控制面板 —— 纯展示组件（presentational）
 *
 * 设计原则：
 *   1. 不 import 任何地图对象（OL / store），只认 props 与 emit
 *   2. 状态由父组件持有：父组件改 props → 这里自动重绘
 *   3. 用户操作只抛事件：toggle / opacity-change
 *
 * 数据流（单向）：
 *   父组件 state ──props──> LayerPanel ──emit──> 父组件 action ──> state 变化 ──props──> 重绘
 *
 * props.layers 每一项的形状：
 *   {
 *     id: string,            // 唯一标识，emit 时原样带回
 *     name: string,          // 显示名
 *     tag: string,           // 右侧小灰字（底图 / WMS / 16,016）
 *     visible: boolean,      // 勾选状态（由父组件持有，不要在子组件内部改）
 *     opacity: number|null,  // null = 不显示滑杆；0~1 = 显示滑杆
 *     chips: [{ label, count, color }]  // 可选：颜色小标签
 *   }
 */

// ── 变量区：能调的 UI 常量集中放这里
const ACCENT = '#1565C0'        // 主色（与图层样式里的学校蓝一致）
const PANEL_W = 236             // 面板宽度

const props = defineProps({
  layers: { type: Array, required: true },
  title: { type: String, default: '图层控制' },
  showCount: { type: Boolean, default: true },
})

const emit = defineEmits(['toggle', 'opacity-change'])

/** 勾选框：只上报"我想要什么"，不在这里改数据 */
function onToggle(layer) {
  emit('toggle', layer.id, !layer.visible)
}

/** 透明度滑杆：input 事件 = 拖动中连续触发（实时预览） */
function onOpacity(layer, event) {
  emit('opacity-change', layer.id, Number(event.target.value))
}

/** 每层右侧的小灰字：优先用 layer.tag，没有就显示图层数 */
function tagOf(layer) {
  return layer.tag ?? ''
}

/** 滑杆填充比例（0~1），给 CSS 画蓝色进度条用 */
function ratio(layer) {
  if (layer.opacity == null) return 0
  return Math.max(0, Math.min(1, layer.opacity))
}
</script>

<template>
  <div class="layer-panel" :style="{ width: PANEL_W + 'px' }">
    <!-- 标题栏 -->
    <div class="lp-head">
      <span class="lp-title">{{ title }}</span>
      <span v-if="showCount" class="lp-count">{{ layers.length }} 个图层</span>
    </div>

    <!-- 图层行 -->
    <div
      v-for="layer in layers"
      :key="layer.id"
      class="lp-item"
      :class="{ 'is-off': !layer.visible }"
    >
      <!-- 勾选 + 名称 -->
      <label class="lp-row">
        <input
          class="lp-cb-input"
          type="checkbox"
          :checked="layer.visible"
          @change="onToggle(layer)"
        />
        <span class="lp-cb" :aria-hidden="true">
          <svg viewBox="0 0 12 12" width="10" height="10">
            <path
              d="M1.5 6.2 4.4 9 10.5 2.6"
              fill="none"
              stroke="#fff"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <span class="lp-name">{{ layer.name }}</span>
        <span class="lp-tag">{{ tagOf(layer) }}</span>
      </label>

      <!-- 透明度（opacity 为 null 时整块不渲染） -->
      <div v-if="layer.opacity != null" class="lp-op">
        <input
          class="lp-range"
          type="range"
          min="0"
          max="1"
          step="0.05"
          :value="layer.opacity"
          :style="{ '--fill': ratio(layer) * 100 + '%', '--accent': ACCENT }"
          :aria-label="layer.name + ' 透明度'"
          @input="onOpacity(layer, $event)"
        />
        <span class="lp-val">{{ layer.opacity.toFixed(1) }}</span>
      </div>

      <!-- 类别小标签（可选） -->
      <div v-if="layer.chips && layer.chips.length" class="lp-chips">
        <span
          v-for="c in layer.chips"
          :key="c.label"
          class="lp-chip"
          :style="{ background: c.color }"
        >
          {{ c.label }} {{ c.count.toLocaleString() }}
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.layer-panel {
  position: absolute;
  left: 16px;
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

.lp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px 8px;
}
.lp-title {
  font-size: 13px;
  font-weight: 700;
  color: #17334d;
}
.lp-count {
  font-size: 11px;
  color: #8aa0b4;
}

.lp-item {
  padding: 8px 14px;
  border-top: 1px solid #f0f4f8;
}
/* 关闭态：整行变淡，但勾选框仍可点 */
.lp-item.is-off .lp-name {
  color: #9aaec1;
}

.lp-row {
  display: flex;
  align-items: center;
  gap: 9px;
  cursor: pointer;
  font-size: 12.5px;
}

/* 原生 checkbox 藏起来但保留可访问性（键盘 Tab / 空格） */
.lp-cb-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
.lp-cb {
  width: 15px;
  height: 15px;
  flex: none;
  border-radius: 4px;
  border: 1.5px solid #b7c7d6;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s, border-color 0.12s;
}
.lp-cb svg {
  opacity: 0;
  transition: opacity 0.12s;
}
.lp-cb-input:checked + .lp-cb {
  background: #1565c0;
  border-color: #1565c0;
}
.lp-cb-input:checked + .lp-cb svg {
  opacity: 1;
}
.lp-cb-input:focus-visible + .lp-cb {
  outline: 2px solid rgba(21, 101, 192, 0.5);
  outline-offset: 2px;
}

.lp-name {
  flex: 1;
  color: #2b4359;
  white-space: nowrap;
}
.lp-tag {
  font-size: 10.5px;
  color: #9aaec1;
  flex: none;
}

/* ── 透明度滑杆 ─────────────────────────── */
.lp-op {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 2px 24px; /* 左边距 = 勾选框宽度 + 间距，和文字对齐 */
}
.lp-range {
  flex: 1;
  -webkit-appearance: none;
  appearance: none;
  height: 3px;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  /* 用 CSS 变量画"已填充"部分，跨浏览器稳定 */
  background: linear-gradient(
    to right,
    var(--accent) 0%,
    var(--accent) var(--fill),
    #e3eaf2 var(--fill),
    #e3eaf2 100%
  );
}
.lp-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--accent);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  cursor: grab;
}
.lp-range::-moz-range-thumb {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--accent);
  cursor: grab;
}
.lp-val {
  width: 22px;
  text-align: right;
  font-size: 10.5px;
  color: #8aa0b4;
  font-variant-numeric: tabular-nums;
}

/* ── 类别小标签 ─────────────────────────── */
.lp-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0 2px 24px;
}
.lp-chip {
  font-size: 10.5px;
  line-height: 1.5;
  padding: 2px 8px;
  border-radius: 10px;
  color: #fff;
  white-space: nowrap;
}
</style>
