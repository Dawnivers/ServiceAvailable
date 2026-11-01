<script setup>
/**
 * ════════════════════════════════════════════════════════════
 * AnalysisToolbar —— 分析工具面板（替代 LayerPanel 出现在左上）
 *
 * 纯展示组件，和 LayerPanel 同一路数：
 *   不 import store、不 import 地图，只认 props 与 emit。
 *   状态由 App 持有，用户操作只抛事件。
 *
 * 结构（从上到下）：
 *   ① 标题 + 当前模式（点选模式）
 *   ② 三个工具：点选 / 框选 / 测距
 *      ★ 没有「缓冲区」按钮：缓冲区是「以点为中心向外扩」这个动作本身，
 *        它由下面的半径滑杆表达。做成按钮就等于一个永远按下的死键。
 *   ③ 缓冲区半径滑杆（100–2000m）
 *   ④ 参与统计的类别（四色勾选）
 *   ⑤ 底部提示：还没选中心 / 已选哪个中心
 *
 * 测距模式下 ③④ 置灰：量距离不需要半径，也不需要类别。
 * ════════════════════════════════════════════════════════════
 */

// ── 1. 常量区 ───────────────────────────────────────────────
const ACCENT = '#d93025' // 分析模式的强调色（红），与勾选态一致
const PANEL_W = 236 // 与 LayerPanel 同宽，切换时不会跳

// 工具图标：用最简单的 SVG 形状，不引第三方图标库
// freehand 画一条不规则的闭合折线，暗示"自己描边界"
const ICONS = {
  point: 'M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z M12 10.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z',
  freehand: 'M4 15l3-7 5 9 3-11 5 6',
  rect: 'M4 5h16v14H4z',
  measure: 'M4 12h16 M8 9v6 M16 9v6',
}

// ── 2. props / emits ────────────────────────────────────────
const props = defineProps({
  tool: { type: String, default: 'point' },
  radius: { type: Number, default: 800 },
  // { school: true, hospital: true, ... }
  categories: { type: Object, required: true },
  // 下拉清单 [{ key, label, color }]，由 App 从 store 常量传进来
  tools: { type: Array, required: true },
  categoryList: { type: Array, required: true },
  radiusRange: { type: Object, required: true }, // { min, max, step }
  // 当前中心点（可能为 null）
  center: { type: Object, default: null },
  // 测距模式下半径/类别无效
  needsRadius: { type: Boolean, default: true },
})

const emit = defineEmits([
  'update:tool',
  'update:radius',
  'toggle-category',
  'exit', // 退出分析模式
])

// ── 3. 派生 ─────────────────────────────────────────────────
/** 当前工具的中文名，标题右侧「点选模式」 */
function modeText() {
  const t = props.tools.find((x) => x.key === props.tool)
  return `${t?.label ?? '点选'}模式`
}

/** 滑杆填充比例，给 CSS 画红色进度条 */
function fillRatio() {
  const { min, max } = props.radiusRange
  const span = max - min
  if (span <= 0) return 0
  return Math.max(0, Math.min(1, (props.radius - min) / span))
}

/** 中心点提示文案 */
function centerText() {
  if (!props.center) return '点击地图选择分析中心'
  const name = props.center.name
  return name ? `中心：${name}` : '中心：已选点'
}

// ── 4. 事件 ─────────────────────────────────────────────────
const onTool = (key) => {
  if (key === props.tool) return
  emit('update:tool', key)
}

const onRadius = (e) => emit('update:radius', Number(e.target.value))

const onCategory = (key) => {
  if (!props.needsRadius) return // 测距模式下类别无效
  emit('toggle-category', key)
}
</script>

<template>
  <div class="tool-panel" :style="{ width: PANEL_W + 'px' }">
    <!-- ═══ 标题 ═══ -->
    <div class="tp-head">
      <span class="tp-title">分析工具</span>
      <span class="tp-mode">{{ modeText() }}</span>
      <button class="tp-x" type="button" aria-label="退出分析模式" title="退出分析模式" @click="emit('exit')">
        ✕
      </button>
    </div>

    <!-- ═══ 三个工具 ═══ -->
    <div class="tp-tools">
      <button
        v-for="t in tools"
        :key="t.key"
        class="tp-tool"
        :class="{ 'is-active': t.key === tool }"
        type="button"
        :title="t.label"
        @click="onTool(t.key)"
      >
        <svg class="tp-icon" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path :d="ICONS[t.key]" fill="none" stroke="currentColor" stroke-width="1.6"
                stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="tp-tool-label">{{ t.label }}</span>
      </button>
    </div>

    <!-- ═══ 缓冲区半径 ═══ -->
    <div class="tp-block" :class="{ 'is-off': !needsRadius }">
      <div class="tp-block-title">缓冲区半径</div>

      <input
        class="tp-range"
        type="range"
        :min="radiusRange.min"
        :max="radiusRange.max"
        :step="radiusRange.step"
        :value="radius"
        :disabled="!needsRadius"
        :style="{ '--fill': fillRatio() * 100 + '%', '--accent': ACCENT }"
        aria-label="缓冲区半径"
        @input="onRadius"
      />

      <!-- 三个刻度：左端 / 当前值 / 右端 -->
      <div class="tp-scale">
        <span>{{ radiusRange.min }} m</span>
        <span class="tp-cur">{{ radius }} m</span>
        <span>{{ radiusRange.max }} m</span>
      </div>
    </div>

    <!-- ═══ 参与统计的类别 ═══ -->
    <div class="tp-block" :class="{ 'is-off': !needsRadius }">
      <div class="tp-block-title">参与统计的类别</div>
      <label
        v-for="c in categoryList"
        :key="c.key"
        class="tp-cat"
        :class="{ 'is-unchecked': !categories[c.key] }"
        @click.prevent="onCategory(c.key)"
      >
        <input class="tp-cb-input" type="checkbox" :checked="categories[c.key]" :disabled="!needsRadius" />
        <span class="tp-cb" :style="{ '--c': c.color }">
          <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
            <path d="M1.5 6.2 4.4 9 10.5 2.6" fill="none" stroke="#fff" stroke-width="2"
                  stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
        <span class="tp-cat-label">{{ c.label }}</span>
      </label>
    </div>

    <!-- ═══ 底部：中心提示 ═══ -->
    <div class="tp-foot" :class="{ 'has-center': !!center }">
      {{ centerText() }}
    </div>
  </div>
</template>

<style scoped>
.tool-panel {
  position: absolute;
  left: 16px;
  top: 72px;
  z-index: 15;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid #dde5ec;
  border-radius: 12px;
  box-shadow: 0 6px 20px rgba(16, 42, 67, 0.12);
  backdrop-filter: blur(6px);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  color: #2b4359;
  overflow: hidden;
  user-select: none;
}

/* ═══ 标题 ═══ */
.tp-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 12px 14px 8px;
}
.tp-title {
  font-size: 13px;
  font-weight: 700;
  color: #17334d;
}
.tp-mode {
  flex: 1;
  font-size: 10.5px;
  color: #a8bccd;
  text-align: right;
}
.tp-x {
  flex: none;
  width: 18px;
  height: 18px;
  margin-left: -2px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #a8bccd;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
}
.tp-x:hover {
  background: #eef3f8;
  color: #2b4359;
}

/* ═══ 工具按钮（4 个：点选 / 自由绘制 / 框选 / 测距）═══ */
.tp-tools {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 5px;
  padding: 0 12px 12px;
}
.tp-tool {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 6px 1px 5px;
  border: 1px solid #e3eaf2;
  border-radius: 8px;
  background: #fff;
  color: #5b7288;
  font-size: 9.5px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.tp-tool:hover {
  border-color: #b7c7d6;
  color: #2b4359;
}
/* 选中态：红边框 + 淡红底（与设计稿一致） */
.tp-tool.is-active {
  border-color: #d93025;
  background: #fdf2f1;
  color: #d93025;
  font-weight: 700;
}
.tp-icon {
  flex: none;
}
.tp-tool-label {
  line-height: 1;
  white-space: nowrap;
  letter-spacing: -0.3px; /* 4 字标签在 48px 格子里要挤一点 */
}

/* ═══ 区块（半径 / 类别） ═══ */
.tp-block {
  padding: 10px 14px;
  border-top: 1px solid #f0f4f8;
  transition: opacity 0.15s;
}
/* 测距模式下这两块无效 */
.tp-block.is-off {
  opacity: 0.4;
  pointer-events: none;
}
.tp-block-title {
  font-size: 10.5px;
  color: #9aaec1;
  margin-bottom: 6px;
}

/* ═══ 半径滑杆 ═══ */
.tp-range {
  width: 100%;
  -webkit-appearance: none;
  appearance: none;
  height: 3px;
  border-radius: 2px;
  outline: none;
  cursor: pointer;
  background: linear-gradient(
    to right,
    var(--accent) 0%,
    var(--accent) var(--fill),
    #e3eaf2 var(--fill),
    #e3eaf2 100%
  );
}
.tp-range::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--accent);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  cursor: grab;
}
.tp-range::-moz-range-thumb {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--accent);
  cursor: grab;
}
.tp-scale {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 10px;
  color: #a8bccd;
  font-variant-numeric: tabular-nums;
}
/* 当前值：红色加粗，压在中间（设计稿里 800 m 就是这样） */
.tp-cur {
  flex: 1;
  text-align: center;
  color: #d93025;
  font-weight: 700;
}

/* ═══ 类别勾选 ═══ */
.tp-cat {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 0;
  font-size: 12px;
  cursor: pointer;
}
.tp-cat.is-unchecked {
  color: #9aaec1;
}
.tp-cb-input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
}
/* 方块用类别色填充，未勾选时变白底灰边 */
.tp-cb {
  width: 13px;
  height: 13px;
  flex: none;
  border-radius: 3px;
  background: var(--c);
  border: 1.5px solid var(--c);
  display: flex;
  align-items: center;
  justify-content: center;
}
.tp-cb svg {
  opacity: 1;
  transition: opacity 0.12s;
}
.tp-cat.is-unchecked .tp-cb {
  background: #fff;
  border-color: #b7c7d6;
}
.tp-cat.is-unchecked .tp-cb svg {
  opacity: 0;
}
.tp-cat-label {
  flex: 1;
}

/* ═══ 底部提示 ═══ */
.tp-foot {
  padding: 8px 14px 10px;
  border-top: 1px solid #f0f4f8;
  font-size: 10.5px;
  color: #a8bccd;
  line-height: 1.5;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tp-foot.has-center {
  color: #d93025;
  font-weight: 700;
}
</style>
