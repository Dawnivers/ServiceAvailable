<script setup>
/**
 * ════════════════════════════════════════════════════════════
 * TopBar —— 顶部栏
 *
 * 左：品牌标识（武字徽章）+ 主标题 + 英文副标题
 * 中：搜索框（暂不实现检索，仅 UI + emit）
 * 右：影像底图 / 矢量底图 / 分析工具
 *
 * ★ 布局要点：这是 fixed 定高的栏（HEAD_H = 64），
 *   它压在 #map 之上，所以地图容器和所有浮层面板都要让出这 64px：
 *     - 地图：#map 用 height: calc(100% - 64px) 或 margin-top
 *     - 面板：top 从 72px 起步（64 + 8）
 *   这里用 fixed 而不是 flex 列布局，是为了不动既有的 absolute 面板体系。
 *
 * ★ 分析工具：暂不实现（用户明确），按钮渲染但 disabled。
 * ════════════════════════════════════════════════════════════
 */

import { computed } from 'vue'
import SearchBox from './SearchBox.vue'

// ── 配置区 ─────────────────────────────────────────────────
const HEAD_H = 64 // 顶栏高度，改这里要同步 mapView 的 #map 高度
const BRAND = {
  badge: '武',
  title: '武汉公共服务设施可达性分析平台',
  subtitle: 'Wuhan Facility Accessibility',
}

// 右侧按钮：base = 底图切换；tool = 分析工具开关
const BUTTONS = [
  { key: 'image', label: '影像底图', kind: 'base' },
  { key: 'vector', label: '矢量底图', kind: 'base' },
  { key: 'tool', label: '分析工具', kind: 'tool' },
]

const props = defineProps({
  // 当前底图：'image' | 'vector'（与 map/basemaps.js 的键一致）
  baseMap: { type: String, default: 'vector' },
  searchable: { type: Boolean, default: true },
  // 是否处于分析模式：决定按钮高亮、徽章显示、搜索框弱化、底图按钮禁用
  analysisMode: { type: Boolean, default: false },
})

const emit = defineEmits(['update:baseMap', 'search', 'tool', 'pick', 'toggle-analysis'])

// ★ 分析模式下按钮文案变成「退出分析」：
//   同一个按钮承担进/出两个动作，文案必须跟着变，否则用户不知道它是开关
const buttons = computed(() =>
  BUTTONS.map((b) =>
    b.kind === 'tool' && props.analysisMode ? { ...b, label: '退出分析' } : b,
  ),
)

// ── 局部状态 ───────────────────────────────────────────────
/** 底图按钮：切换并上报 */
function onBase(key) {
  if (key === props.baseMap) return
  emit('update:baseMap', key)
}

/** SearchBox 选中一条结果 → 继续往上传 */
function onPick(item) {
  emit('pick', item)
}

/** 分析工具：进/出分析模式 */
function onTool() {
  emit('toggle-analysis')
}

// 对外暴露高度，方便父组件同步
defineExpose({ HEAD_H })
</script>

<template>
  <header class="topbar">
    <!-- ═══ 左：品牌 ═══ -->
    <div class="brand">
      <!-- 分析模式下徽章变红，和概念图一致：整站的「红色 = 分析态」 -->
      <span class="badge" :class="{ 'is-analysis': analysisMode }">{{ BRAND.badge }}</span>
      <div class="titles">
        <span class="title">{{ BRAND.title }}</span>
        <span class="subtitle">{{ BRAND.subtitle }}</span>
      </div>
      <!-- 分析模式徽章：只在分析模式下出现 -->
      <span v-if="analysisMode" class="mode-badge">
        <span class="mode-dot" />分析模式
      </span>
    </div>

    <!-- ═══ 中：搜索 ═══ -->
    <div class="search-wrap">
      <SearchBox v-if="searchable" :muted="analysisMode" @pick="onPick" />
    </div>

    <!-- ═══ 右：底图切换 + 分析工具 ═══ -->
    <div class="actions">
      <button
        v-for="b in buttons"
        :key="b.key"
        class="btn"
        :class="{
          'is-active':
            (b.kind === 'base' && !analysisMode && b.key === props.baseMap) ||
            (b.kind === 'tool' && analysisMode),
          // 分析模式下定图按钮失效：切底图会打乱灰底效果，也容易让人以为在浏览
          'is-disabled': b.kind === 'base' && analysisMode,
        }"
        type="button"
        :disabled="b.kind === 'base' && analysisMode"
        :title="
          b.kind === 'tool'
            ? analysisMode
              ? '退出分析模式'
              : '进入分析模式'
            : analysisMode
              ? '分析模式下底图固定'
              : b.label
        "
        @click="b.kind === 'base' ? onBase(b.key) : onTool()"
      >
        {{ b.label }}
      </button>
    </div>
  </header>
</template>

<style scoped>
/* ═══ 顶栏外壳：固定高，压在页面最上层 ═══ */
.topbar {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 64px;
  z-index: 30; /* 高于所有面板（15），低于弹窗级别 */
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  box-sizing: border-box;
  background: rgba(255, 255, 255, 0.97);
  border-bottom: 1px solid #e3eaf2;
  box-shadow: 0 2px 8px rgba(16, 42, 67, 0.06);
  backdrop-filter: blur(8px);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  user-select: none;
}

/* ═══ 品牌 ═══ */
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: none;
}
.badge {
  width: 34px;
  height: 34px;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  background: linear-gradient(145deg, #2f7dd1, #1565c0);
  color: #fff;
  font-size: 17px;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(21, 101, 192, 0.3);
  transition: background 0.25s, box-shadow 0.25s;
}
/* 分析模式：徽章转红，与「分析模式」红徽章、红圈、红滑杆统一成一套语义 */
.badge.is-analysis {
  background: linear-gradient(145deg, #ef5350, #d93025);
  box-shadow: 0 2px 6px rgba(217, 48, 37, 0.32);
}
.titles {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}
.title {
  font-size: 15.5px;
  font-weight: 700;
  color: #17334d;
  white-space: nowrap;
}
.subtitle {
  font-size: 10.5px;
  color: #9aaec1;
  letter-spacing: 0.2px;
  white-space: nowrap;
}

/* ═══ 分析模式徽章 ═══ */
.mode-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 6px;
  padding: 3px 9px 3px 7px;
  border-radius: 10px;
  border: 1px solid #f3c9c5;
  background: #fdf2f1;
  color: #d93025;
  font-size: 10.5px;
  font-weight: 700;
  white-space: nowrap;
}
.mode-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #d93025;
  /* 呼吸灯：提醒"当前处在非浏览状态" */
  animation: mode-pulse 1.8s ease-in-out infinite;
}
@keyframes mode-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

/* ═══ 搜索：居中，弹性宽度 ═══ */
.search-wrap {
  flex: 1;
  display: flex;
  justify-content: center;
  min-width: 0;
  max-width: 420px;
  margin: 0 auto;
}
/* ═══ 右侧按钮 ═══ */
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
}
.btn {
  height: 32px;
  padding: 0 14px;
  border-radius: 8px;
  border: 1px solid #dde5ec;
  background: #fff;
  color: #2b4359;
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
}
.btn:hover:not(.is-disabled) {
  border-color: #b7c7d6;
  background: #f7fafd;
}
/* 当前底图：蓝底白字 */
.btn.is-active {
  border-color: #1565c0;
  background: #1565c0;
  color: #fff;
}
.btn.is-active:hover {
  background: #0d4f9e;
}
/* 分析工具：未实现，置灰但保留可点（点了没反应） */
.btn.is-disabled {
  color: #b7c7d6;
  cursor: not-allowed;
  background: #fafcfe;
}
</style>
