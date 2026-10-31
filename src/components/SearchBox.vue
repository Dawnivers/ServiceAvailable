<script setup>
/**
 * ════════════════════════════════════════════════════════════
 * SearchBox —— 顶栏搜索框 + 下拉结果
 *
 * 交互设计：
 *   输入 300ms 防抖 → user 停手才查；连续输入时 abort 上一次请求
 *   ↑↓ 键在结果间移动，Enter 选中，Esc 关闭
 *   点结果 → emit('pick', item) → 父组件定位地图并拉详情
 *
 * 为什么防抖 + abort 两个都要：
 *   防抖减少请求次数（用户打字 5 个字符只发 1 次）
 *   abort 处理"上一次请求还没回就发了新的"（网络慢时会乱序）
 * ════════════════════════════════════════════════════════════
 */

import { ref, computed, watch, onScopeDispose } from 'vue'
import { searchPoi } from '@/map/searchPoi.js'

// ── 配置 ────────────────────────────────────────────────────
const DEBOUNCE_MS = 300 // 输入停顿多久才发起查询
const MIN_LEN = 1 // 至少几个字才搜（中文 1 字就有意义）
const CATEGORY = {
  school: { label: '学校', color: '#1565C0' },
  hospital: { label: '医院', color: '#C62828' },
  mall: { label: '商场', color: '#EF6C00' },
  park: { label: '公园', color: '#2E7D32' },
}

// ── 状态 ────────────────────────────────────────────────────
const keyword = ref('')
const items = ref([])
const total = ref(0)
const nameTotal = ref(0)
const addrTotal = ref(0)
const loading = ref(false)
const error = ref(null)
const open = ref(false) // 下拉是否展开
const activeIdx = ref(-1) // 键盘高亮项

let debounceTimer = null
let abortCtrl = null
let seq = 0 // 请求序号，防乱序

// ── 派生 ────────────────────────────────────────────────────
const hasKeyword = computed(() => keyword.value.trim().length >= MIN_LEN)
const showTip = computed(
  () => open.value && hasKeyword.value && !loading.value && !error.value && items.value.length === 0,
)

// ── 工具 ────────────────────────────────────────────────────
function cat(key) {
  return CATEGORY[key] ?? { label: key || '未知', color: '#8aa0b4' }
}

function clearTimer() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

/** 立即执行一次查询（abort 上一次） */
async function runSearch() {
  const kw = keyword.value.trim()
  if (kw.length < MIN_LEN) {
    items.value = []
    total.value = 0
    nameTotal.value = 0
    addrTotal.value = 0
    loading.value = false
    return
  }

  abortCtrl?.abort()
  abortCtrl = new AbortController()
  seq += 1
  const mySeq = seq

  loading.value = true
  error.value = null

  try {
    const r = await searchPoi(kw, { signal: abortCtrl.signal })
    if (mySeq !== seq) return // 过期结果
    items.value = r.items
    total.value = r.total
    nameTotal.value = r.nameTotal ?? r.items.length
    addrTotal.value = r.addrTotal ?? 0
    activeIdx.value = -1
    open.value = true
  } catch (e) {
    if (e?.name === 'AbortError') return
    if (mySeq !== seq) return
    error.value = '搜索失败，请稍后重试'
    items.value = []
    total.value = 0
    console.warn('[SearchBox]', e)
  } finally {
    if (mySeq === seq) loading.value = false
  }
}

// ── 输入监听：防抖 ──────────────────────────────────────────
watch(keyword, () => {
  clearTimer()
  // 清空就立刻收起，不需要等
  if (!hasKeyword.value) {
    open.value = false
    items.value = []
    total.value = 0
    return
  }
  debounceTimer = setTimeout(runSearch, DEBOUNCE_MS)
})

// ── 键盘交互 ────────────────────────────────────────────────
function onKeydown(e) {
  if (e.key === 'Escape') {
    open.value = false
    activeIdx.value = -1
    return
  }
  if (!open.value || !items.value.length) {
    if (e.key === 'Enter') runSearch() // 没展开时回车手动触发
    return
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIdx.value = (activeIdx.value + 1) % items.value.length
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIdx.value = activeIdx.value <= 0 ? items.value.length - 1 : activeIdx.value - 1
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const pick = items.value[activeIdx.value] ?? items.value[0]
    if (pick) pickItem(pick)
  }
}

// ── 选中 ────────────────────────────────────────────────────
function pickItem(item) {
  open.value = false
  activeIdx.value = -1
  emit('pick', item)
}

/** 失焦关闭：延迟一下，否则点结果的 mousedown 会先触发 blur */
function onBlur() {
  setTimeout(() => {
    open.value = false
    activeIdx.value = -1
  }, 150)
}

function onFocus() {
  if (hasKeyword.value && (items.value.length || error.value)) open.value = true
}

/**
 * @prop muted  分析模式下置灰。只改视觉，不禁用：
 *              用户可能还想先搜一个设施再把它当分析中心。
 */
const props = defineProps({
  muted: { type: Boolean, default: false },
})

const emit = defineEmits(['pick'])
defineExpose({ keyword, clear: () => (keyword.value = '') })

onScopeDispose(() => {
  clearTimer()
  abortCtrl?.abort()
  seq += 1
})
</script>

<template>
  <div class="search" :class="{ 'is-muted': muted }">
    <div class="box">
      <svg class="icon" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
        <circle cx="7" cy="7" r="4.6" fill="none" stroke="currentColor" stroke-width="1.6" />
        <path d="M10.6 10.6 L14 14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
      </svg>
      <input
        v-model="keyword"
        class="input"
        type="text"
        placeholder="搜索设施名称 / 地址 …"
        autocomplete="off"
        @keydown="onKeydown"
        @focus="onFocus"
        @blur="onBlur"
      />
      <span v-if="loading" class="spinner" />
      <button v-else-if="keyword" class="clear" type="button" aria-label="清空" @click="keyword = ''">
        ✕
      </button>
    </div>

    <!-- ── 下拉结果 ── -->
    <div v-if="open" class="panel">
      <!-- 加载中 -->
      <div v-if="loading" class="tip">搜索中…</div>

      <!-- 出错 -->
      <div v-else-if="error" class="tip is-error">{{ error }}</div>

      <!-- 无结果 -->
      <div v-else-if="showTip" class="tip">没有找到匹配的设施</div>

      <!-- 结果列表 -->
      <template v-else>
        <ul class="list">
          <li
            v-for="(it, i) in items"
            :key="it.gid"
            class="item"
            :class="{ 'is-active': i === activeIdx }"
            @mouseenter="activeIdx = i"
            @mousedown.prevent="pickItem(it)"
          >
            <span class="dot" :style="{ background: cat(it.category).color }" />
            <span class="name" :title="it.name">{{ it.name || '未命名' }}</span>
            <span class="badge" :style="{ color: cat(it.category).color }">
              {{ cat(it.category).label }}
            </span>
          </li>
        </ul>
        <div class="foot">
          <span>名称命中 {{ nameTotal.toLocaleString() }}</span>
          <span v-if="addrTotal">· 地址命中 {{ addrTotal.toLocaleString() }}</span>
          <span v-if="total > items.length" class="foot-more">· 显示前 {{ items.length }} 条</span>
        </div>
      </template>
    </div>
  </div>
</template>

<style scoped>
.search {
  position: relative;
  width: 100%;
}

/* ═══ 输入框 ═══ */
.box {
  position: relative;
  display: flex;
  align-items: center;
}
.icon {
  position: absolute;
  left: 12px;
  color: #a8bccd;
  pointer-events: none;
}
.input {
  width: 100%;
  height: 34px;
  padding: 0 32px 0 32px;
  box-sizing: border-box;
  border: 1px solid #e3eaf2;
  border-radius: 17px;
  background: #f5f8fc;
  color: #2b4359;
  font-size: 12.5px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s, background 0.15s;
}
.input::placeholder {
  color: #a8bccd;
}
.input:focus {
  border-color: #9dc2ea;
  background: #fff;
}

/* ═══ 分析模式：弱化，别和地图上的红圈抢注意力 ═══ */
.search.is-muted .input {
  background: #eef2f6;
  border-color: #e0e7ef;
  color: #8aa0b4;
}
.search.is-muted .input::placeholder {
  color: #b7c7d6;
}
.search.is-muted .icon {
  color: #c4d2de;
}
/* 聚焦时恢复常态：一旦用户真要输入，就不该还是灰的 */
.search.is-muted .input:focus {
  background: #fff;
  border-color: #9dc2ea;
  color: #2b4359;
}

/* 右侧：加载转圈 / 清空按钮 */
.spinner {
  position: absolute;
  right: 12px;
  width: 12px;
  height: 12px;
  border: 2px solid #d6e2ee;
  border-top-color: #1565c0;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.clear {
  position: absolute;
  right: 8px;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #a8bccd;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}
.clear:hover {
  background: #e8eef4;
  color: #2b4359;
}

/* ═══ 下拉面板 ═══ */
.panel {
  position: absolute;
  top: 40px;
  left: 0;
  right: 0;
  z-index: 40;
  max-height: 340px;
  overflow-y: auto;
  padding: 5px 0;
  background: #fff;
  border: 1px solid #e3eaf2;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(16, 42, 67, 0.16);
}

.tip {
  padding: 14px 14px;
  font-size: 12px;
  color: #8aa0b4;
  text-align: center;
}
.tip.is-error {
  color: #c62828;
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
  padding: 7px 12px;
  font-size: 12.5px;
  color: #2b4359;
  cursor: pointer;
}
.item.is-active {
  background: #f0f6fd;
}
.dot {
  flex: none;
  width: 7px;
  height: 7px;
  border-radius: 50%;
}
.name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.badge {
  flex: none;
  font-size: 10.5px;
  opacity: 0.85;
}

.foot {
  display: flex;
  gap: 6px;
  padding: 6px 12px 2px;
  font-size: 10.5px;
  color: #a8bccd;
  border-top: 1px solid #f0f4f8;
  margin-top: 4px;
}
.foot-more {
  margin-left: auto;
}
</style>
