<script setup>
/**
 * ════════════════════════════════════════════════════════════
 * SqlHintBar —— 分析模式下替换底部统计条的「请求 SQL」说明
 *
 * 目的：把「这一屏数字是怎么算出来的」摊开给用户/面试官看。
 *   浏览模式：行政区 13 / POI 16,016 / 类别 4 / 数据截至          （静态事实）
 *   分析模式：请求 SQL： ST_DWithin (geom, 圆心, 800) · 耗时 42 ms · 返回 187 条
 *
 * ★ 只展示**核心谓词**，不贴完整 SQL：真正的语句还有 group by、order by、
 *   ST_Distance 求距离，一条横幅塞不下。这里要表达的是"空间计算下推到了 PostGIS"。
 * ★ 耗时是实测的（`useBufferAnalysis` 里 fetch 前后取 performance.now()），
 *   不是写死的装饰数字。
 * ★ 测距是纯前端 getLength() 算的，一句 SQL 都没发 —— 这种时候要如实说"未请求后端"，
 *   否则横幅会撒谎。
 * ════════════════════════════════════════════════════════════
 */

const props = defineProps({
  // { fn, args } 或 { note } —— 由 App 依据当前工具算好
  sql: { type: Object, default: null },
  // 实际耗时（毫秒），null 表示还没请求过
  ms: { type: Number, default: null },
  // 当前展示的条数（已按类别勾选过滤，与右侧面板一致）
  count: { type: Number, default: null },
  // SQL 真正返回的原始条数（未过滤），用于 tooltip 说明差额
  rawCount: { type: Number, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
})

/** 千分位，187 / 11,399 */
function fmtCount(n) {
  return n == null ? null : n.toLocaleString()
}

/**
 * 条数的 tooltip。
 * ★ 用户取消勾选某个类别时，面板和这条横幅都会变小，但 SQL 其实返回了更多 ——
 *   差额在勾选变化后才出现，容易被当成 bug，所以在这里说清楚。
 */
function countTitle() {
  const shown = props.count
  const raw = props.rawCount
  if (shown == null || raw == null) return ''
  if (shown === raw) return `SQL 返回 ${fmtCount(raw)} 条`
  return `SQL 返回 ${fmtCount(raw)} 条；未勾选的类别已在前端剔除，当前统计 ${fmtCount(shown)} 条`
}
</script>

<template>
  <div class="sql-bar">
    <!-- ① 测距这类不发请求的工具：如实说明 -->
    <template v-if="sql?.note">
      <span class="k">计算方式：</span>
      <span class="note">{{ sql.note }}</span>
    </template>

    <!-- ② 有 SQL 可展示 -->
    <template v-else-if="sql?.fn">
      <span class="k">请求 SQL：</span>
      <span class="fn">{{ sql.fn }}</span>
      <span class="args">{{ sql.args }}</span>

      <template v-if="error">
        <span class="sep">·</span>
        <span class="err">{{ error }}</span>
      </template>

      <template v-else-if="loading">
        <span class="sep">·</span>
        <span class="muted">查询中…</span>
      </template>

      <template v-else-if="count != null">
        <span class="sep">·</span>
        <span class="muted">耗时</span>
        <span class="num">{{ ms == null ? '—' : ms }}</span>
        <span class="muted">ms</span>
        <span class="sep">·</span>
        <span class="muted">返回</span>
        <span class="num" :title="countTitle()">{{ fmtCount(count) }}</span>
        <span class="muted">条</span>
      </template>

      <template v-else>
        <span class="sep">·</span>
        <span class="muted">等待选择分析中心</span>
      </template>
    </template>

    <!-- ③ 兜底 -->
    <span v-else class="muted">分析模式</span>
  </div>
</template>

<style scoped>
.sql-bar {
  position: absolute;
  left: 50%;
  bottom: 16px;
  transform: translateX(-50%);
  z-index: 15;
  display: flex;
  align-items: center;
  gap: 6px;
  max-width: min(760px, calc(100vw - 340px));
  padding: 8px 16px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid #dde5ec;
  border-radius: 20px;
  box-shadow: 0 6px 20px rgba(16, 42, 67, 0.12);
  backdrop-filter: blur(6px);
  font-family: 'Microsoft YaHei', 'Segoe UI', sans-serif;
  font-size: 12px;
  color: #2b4359;
  white-space: nowrap;
  overflow: hidden;
  user-select: text; /* 允许选中复制那句 SQL —— 面试演示时要贴给人看 */
}

/* 标签：灰一点，别抢 SQL 的注意力 */
.k {
  flex: none;
  color: #8aa0b4;
}

/* 函数名：红色加粗，等宽字体，一眼看出是 PostGIS 函数 */
.fn {
  flex: none;
  font-family: 'Consolas', 'Cascadia Mono', monospace;
  font-weight: 700;
  color: #d93025;
}

/* 参数：等宽但用正文色，弱于函数名 */
.args {
  flex: none;
  font-family: 'Consolas', 'Cascadia Mono', monospace;
  color: #2b4359;
}

.sep {
  flex: none;
  color: #c4d2de;
}

/* 数字（耗时 / 返回条数）：红黑相间，和概念图一致 */
.num {
  flex: none;
  font-weight: 700;
  color: #d93025;
  font-variant-numeric: tabular-nums;
}

.muted {
  flex: none;
  color: #8aa0b4;
}

.note {
  color: #5b7288;
}

.err {
  flex: none;
  color: #c62828;
}

/* 窄屏时允许省略，别把左右面板顶开 */
.args {
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
