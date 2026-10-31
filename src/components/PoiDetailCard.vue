<script setup>
/**
 * ════════════════════════════════════════════════════════════
 * PoiDetailCard —— 右侧 POI 详情卡
 *
 * 纯展示组件（presentational），与 LayerPanel 同一路数：
 *   不 import pinia store、不 fetch、不碰 map。
 *   只认 props（要显示什么）+ emit（用户点了关闭）。
 *
 * 数据来自 selection store：
 *   selection.poi      ← /api/poi/{gid} 的 11 个字段
 *   selection.loading  ← 请求在途
 *   selection.error    ← 错误文案
 *
 * 四个状态（根级判断，缺一个就会在页面上留空白框）：
 *   loading → 加载中
 *   error   → 错误
 *   poi     → 正常
 *   都不是  → 整卡不渲染
 *
 * 所属区说明：早期 poi 没有 adname，曾用 /api/areas 的 13 区边界反查。
 * 现在后端直接从 raw jsonb 取 adname（覆盖率 100%），反查那段已删除。
 * ════════════════════════════════════════════════════════════
 */

// ── 1. 常量区：能调的集中放前面 ─────────────────────────────

const CARD_W = 288 // 卡片宽度（设计稿 309px 里坐标行快贴边，收窄一点）

// 类别 → 中文 + 颜色。颜色与 map/layers.js 的 chips、GeoServer 样式保持一致
const CATEGORY = {
  school: { label: '学校', color: '#1565C0' },
  hospital: { label: '医院', color: '#C62828' },
  mall: { label: '商场', color: '#EF6C00' },
  park: { label: '公园', color: '#2E7D32' },
}
const CATEGORY_FALLBACK_COLOR = '#8aa0b4'

const COORD_FIXED = 6 // 坐标保留小数位（后端原始精度 6 位，不丢信息）

// ── 2. props / emits ────────────────────────────────────────

const props = defineProps({
  poi: { type: Object, default: null },
  // 800m 周边统计，由 selection store 算好：{ count, byCategory, sameCategoryNearest }
  nearby: { type: Object, default: null },
  // 相对密度，由 selection store 算好：{ ratio, localPerKm2, districtPerKm2, district }
  density: { type: Object, default: null },
  loading: { type: Boolean, default: false },
  error: { type: String, default: null },
})

const emit = defineEmits(['close', 'nearby-analysis'])

/**
 * 「附近分析」：以当前 POI 为圆心进入分析模式。
 * 组件只负责上报"用户点了"，具体进什么模式由 App 决定（这里不 import store）。
 */
function onNearbyAnalysis() {
  emit('nearby-analysis', props.poi)
}

// ── 3. 工具函数（全是纯函数，不含状态） ─────────────────────

/**
 * 空值降级：null / undefined / '' → '—'
 * ★ 用 === 显式判断，不用 || —— 否则数字 0 会被当成空值吃掉
 */
function show(v) {
  return v === null || v === undefined || v === '' ? '—' : v
}

/** 类别 → { label, color }；未知类别显示原文 + 灰色，不显示 undefined */
function cat(key) {
  return CATEGORY[key] ?? { label: key || '未分类', color: CATEGORY_FALLBACK_COLOR }
}

/** 坐标文本：保留 6 位小数；任一侧为空给 '—'（不能出 NaN） */
function coordText(p) {
  if (p?.lon == null || p?.lat == null) return '—'
  const lon = Number(p.lon)
  const lat = Number(p.lat)
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return '—'
  return `${lon.toFixed(COORD_FIXED)}, ${lat.toFixed(COORD_FIXED)}`
}

/** 图床死链兜底：加载失败就把这张藏掉，别留破图标 */
function onPhotoError(e) {
  const el = e?.target
  if (!el) return
  el.style.display = 'none'
}

function onClose() {
  emit('close')
}

// ── 4. 周边统计（数据由 selection store 算好，这里只负责显示） ──
// count / sameCategoryNearest 来自 /api/poi/nearby，store 里已经排除自身。
// 可达性指数属于 D13 的分析指标，后端暂无口径，先占位 '—'。

/** 800m 内设施数；null → '—' */
function statCount(nearby) {
  const n = nearby?.count
  return n === null || n === undefined ? '—' : n.toLocaleString()
}

/** 同类最近：渲染成 "191 m"；没有 → '—' */
function statSame(nearby) {
  const d = nearby?.sameCategoryNearest?.distanceM
  return d === null || d === undefined ? '—' : `${Math.round(d)} m`
}

/** 同类最近是哪个设施（悬停提示用，三宫格放不下名字） */
function statSameTitle(nearby) {
  const s = nearby?.sameCategoryNearest
  if (!s) return '800m 内没有其它同类设施'
  return `${s.name} · ${Math.round(s.distanceM)} m`
}

/**
 * 相对密度：800m 内密度 ÷ 本区平均密度。
 * 显示成 "3.6 倍"，比无量纲的 0.807 好读得多。
 */
function statDensity(density) {
  const r = density?.ratio
  if (r === null || r === undefined) return '—'
  return `${r.toFixed(1)} 倍`
}

/** 密度的悬停说明：把两个绝对值摊开，解释倍数是哪两个数比出来的 */
function statDensityTitle(density) {
  if (!density || density.ratio == null) return '本区密度数据不可用'
  const d = density.district ? `${density.district}全区平均` : '本区平均'
  return (
    `800m 内 ${density.localPerKm2.toFixed(1)} 个/km² ÷ ` +
    `${d} ${density.districtPerKm2.toFixed(2)} 个/km²`
  )
}
</script>

<template>
  <!-- ★ 根级判断：什么都没有时不渲染，否则会留一个空白白框 -->
  <div v-if="loading || error || poi" class="card" :style="{ width: CARD_W + 'px' }">
    <!-- ═══ ① 加载中（优先级最高：又点了一个新 POI 时先显示加载） ═══ -->
    <div v-if="loading" class="state">
      <span class="spin" />
      正在读取…
    </div>

    <!-- ═══ ② 错误 ═══ -->
    <div v-else-if="error" class="state is-error">
      {{ error }}
    </div>

    <!-- ═══ ③ 正常 ═══ -->
    <template v-else-if="poi">
      <!-- 头部：标题 + 高德 ID + 关闭 -->
      <div class="head">
        <span class="head-title">设施详情</span>
        <span class="head-id">{{ show(poi.amapId) }}</span>
        <button class="btn-x" type="button" aria-label="关闭" @click="onClose">✕</button>
      </div>

      <!-- 字段行：固定骨架，缺值给 '—'，绝不因为缺字段而少一行 -->
      <dl class="rows">
        <div class="row">
          <dt>名称</dt>
          <dd>
            <span class="name" :title="poi.name">{{ show(poi.name) }}</span>
            <span
              class="tag"
              :style="{
                color: cat(poi.category).color,
                background: cat(poi.category).color + '1a',
              }"
            >
              {{ cat(poi.category).label }}
            </span>
          </dd>
        </div>

        <div class="row">
          <dt>地址</dt>
          <dd :title="show(poi.address)">{{ show(poi.address) }}</dd>
        </div>

        <div class="row">
          <dt>所属区</dt>
          <dd>{{ show(poi.adname) }}</dd>
        </div>

        <div class="row">
          <dt>商圈</dt>
          <dd>{{ show(poi.businessArea) }}</dd>
        </div>

        <div class="row">
          <dt>评分</dt>
          <dd>
            <span v-if="poi.rating != null" class="rating">{{ poi.rating.toFixed(1) }}</span>
            <span v-if="poi.rating != null" class="star">★</span>
            <span v-else>—</span>
          </dd>
        </div>

        <div class="row">
          <dt>营业时间</dt>
          <dd>{{ show(poi.openTime) }}</dd>
        </div>

        <div class="row">
          <dt>类型</dt>
          <dd :title="show(poi.poiType)">{{ show(poi.poiType) }}</dd>
        </div>

        <div class="row">
          <dt>坐标</dt>
          <dd class="mono">{{ coordText(poi) }}</dd>
        </div>

        <div class="row">
          <dt>电话</dt>
          <dd>{{ show(poi.tel) }}</dd>
        </div>
      </dl>

      <!-- ═══ 照片插槽（A 位置：正文下方、统计块上方） ═══
           空数组时整块不渲染，避免留一条空白的区域 -->
      <div v-if="poi.photos && poi.photos.length" class="photos">
        <img
          v-for="(url, i) in poi.photos"
          :key="url + '-' + i"
          class="photo"
          :src="url"
          alt=""
          loading="lazy"
          referrerpolicy="no-referrer"
          @error="onPhotoError"
        />
      </div>

      <!-- ═══ 统计块：前两个来自 /api/poi/nearby，第三个是相对密度 ═══ -->
      <div class="stats">
        <div class="stat" title="800m 内设施总数，不含本设施自身">
          <div class="stat-num">{{ statCount(nearby) }}</div>
          <div class="stat-label">周边设施</div>
        </div>
        <div class="stat" :title="statSameTitle(nearby)">
          <div class="stat-num">{{ statSame(nearby) }}</div>
          <div class="stat-label">同类最近</div>
        </div>
        <div class="stat" :title="statDensityTitle(density)">
          <div class="stat-num">{{ statDensity(density) }}</div>
          <div class="stat-label">密度倍数</div>
        </div>
      </div>

      <!-- ═══ 按钮：以本设施为圆心进入分析模式 ═══ -->
      <div class="actions">
        <button class="btn" type="button" @click="onNearbyAnalysis">附近分析</button>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ═══ 卡片外壳：与 LayerPanel 同一套皮肤，左右对称 ═══ */
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

/* ═══ 加载 / 错误 ═══ */
.state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 18px 14px;
  font-size: 12.5px;
  color: #5b7288;
}
.state.is-error {
  color: #c62828;
}
.spin {
  width: 12px;
  height: 12px;
  flex: none;
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

/* ═══ 头部 ═══ */
.head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 14px 9px;
  border-bottom: 1px solid #f0f4f8;
}
.head-title {
  font-size: 13px;
  font-weight: 700;
  color: #17334d;
  flex: none;
}
.head-id {
  flex: 1;
  text-align: right;
  font-size: 10.5px;
  color: #9aaec1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-variant-numeric: tabular-nums;
}
.btn-x {
  flex: none;
  width: 18px;
  height: 18px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #9aaec1;
  font-size: 11px;
  line-height: 1;
  cursor: pointer;
}
.btn-x:hover {
  background: #eef3f8;
  color: #2b4359;
}

/* ═══ 字段行 ═══ */
.rows {
  margin: 0;
  padding: 8px 14px 10px;
}
.row {
  display: flex;
  gap: 10px;
  padding: 4px 0;
  font-size: 12px;
  line-height: 1.55;
}
.row dt {
  flex: none;
  width: 44px;
  color: #9aaec1;
}
.row dd {
  flex: 1;
  min-width: 0;
  margin: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  color: #2b4359;
  word-break: break-all;
}
.mono {
  font-variant-numeric: tabular-nums;
  font-size: 11.5px;
}

/* 评分：数字加粗 + 金色星，缺值时退化成一个破折号（模板里已处理） */
.rating {
  font-weight: 700;
  color: #e08600;
  font-variant-numeric: tabular-nums;
}
.star {
  margin-left: 2px;
  color: #ffb300;
  font-size: 11px;
}
.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tag {
  flex: none;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 10.5px;
  line-height: 16px;
}

/* ═══ 照片插槽 ═══ */
.photos {
  display: flex;
  gap: 6px;
  padding: 0 14px 10px;
  overflow-x: auto;
}
.photo {
  width: 80px;
  height: 60px;
  flex: none;
  object-fit: cover;
  border-radius: 6px;
  background: #eef3f8;
}

/* ═══ 统计块 ═══ */
.stats {
  display: flex;
  gap: 6px;
  padding: 10px 14px;
  border-top: 1px solid #f0f4f8;
}
.stat {
  flex: 1;
  padding: 7px 4px 6px;
  border-radius: 8px;
  background: #f5f8fc;
  text-align: center;
}
/* 有悬停提示的格子（同类最近）给个手型，暗示"可以停一下" */
.stat[title] {
  cursor: help;
}
.stat-num {
  font-size: 15px;
  font-weight: 700;
  color: #1565c0;
  line-height: 1.3;
  font-variant-numeric: tabular-nums;
  /* "191 m" 比纯数字长，留点收缩余地，别把格子撑出卡片 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.stat-label {
  font-size: 10px;
  color: #8aa0b4;
  line-height: 1.4;
}

/* ═══ 按钮（占位，D13 接线） ═══ */
.actions {
  display: flex;
  gap: 8px;
  padding: 0 14px 12px;
}
.btn {
  flex: 1;
  height: 30px;
  border-radius: 7px;
  border: 1px solid #dde5ec;
  background: #fff;
  color: #2b4359;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.btn:hover {
  border-color: #b7c7d6;
}
</style>
