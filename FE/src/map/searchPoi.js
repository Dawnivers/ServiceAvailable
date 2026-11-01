/**
 * ════════════════════════════════════════════════════════════
 * searchPoi —— 前端直连 GeoServer WFS 做名称/地址模糊搜索
 *
 * 为什么走 WFS 而不是后端：
 *   后端目前没有搜索接口（6 个接口里没有按名称查的），
 *   而 GeoServer 的 WFS 天然支持 CQL_FILTER 模糊匹配，
 *   一个请求就能拿到 name / 坐标，不用改 BE。
 *
 * ★ 相关性排序（这是核心，不是可选优化）：
 *   GeoServer 只支持按字段排序，不会算相关度。
 *   实测 sortBy=name A 时搜「武汉大学」：
 *     1. 7-ELEVEn(武汉大学店)     ← 数字排在最前
 *     ...
 *     10. 武汉大学                ← 用户真正要找的，被挤出前 8 条
 *   所以必须：先多取候选（CANDIDATE_LIMIT），再在**前端按相
 *   关度重排**，最后截前 MAX_FEATURES 条。
 *
 *   排序权重：完全相同 > 前缀命中 > 包含命中；同级按名字短的优先
 *   （"武汉大学" 4 字 vs "国立武汉大学农学院" 9 字，短的更可能是本体）
 *
 * CQL 注意点（实测）：
 *   ① 通配符是 %，写 `name LIKE '%公园%'`
 *   ② 字符串里的单引号要写成两个单引号 ''（CQL 的转义方式）
 *   ③ 用户输入必须走 encodeURIComponent / URLSearchParams
 * ════════════════════════════════════════════════════════════
 */

// ── 配置 ────────────────────────────────────────────────────
const WFS_URL = '/geoserver/wuhan/ows'
const TYPE_NAME = 'wuhan:poi'
const MAX_FEATURES = 10 // 下拉列表展示条数
const CANDIDATE_LIMIT = 60 // 取多少条候选来做前端排序
const TIMEOUT_MS = 8000
// 只取需要的字段：不裁剪时每条约 2.4KB（含 raw jsonb），裁剪后约 470B
const PROPERTY_NAME = 'name,address,category,lon,lat'

// ── 相关性排序 ──────────────────────────────────────────────

/**
 * 计算一条结果与关键词的匹配等级（越小越相关）
 *   0 = 完全相同
 *   1 = 以关键词开头
 *   2 = 包含关键词
 *   3 = 其他（比如只有地址命中）
 */
function matchRank(name, kw) {
  if (!name) return 3
  if (name === kw) return 0
  if (name.startsWith(kw)) return 1
  if (name.includes(kw)) return 2
  return 3
}

/** 比较器：先看匹配等级，再看名字长度（短的优先），最后按字典序稳定 */
function compareByRelevance(a, b, kw) {
  const ra = matchRank(a.name, kw)
  const rb = matchRank(b.name, kw)
  if (ra !== rb) return ra - rb

  const la = (a.name ?? '').length
  const lb = (b.name ?? '').length
  if (la !== lb) return la - lb

  return String(a.name ?? '').localeCompare(String(b.name ?? ''), 'zh')
}

// ── 工具 ────────────────────────────────────────────────────

/** 把用户输入转成安全的 CQL 字符串字面量内容（单引号 → 两个单引号） */
function escapeCql(s) {
  return String(s).replace(/'/g, "''").trim()
}

/** 从 WFS 要素里抠 gid（feature.id 形如 'poi.1'） */
function pickGid(f) {
  const fromId = Number(String(f?.id ?? '').split('.').pop())
  if (Number.isInteger(fromId)) return fromId
  const p = f?.properties ?? {}
  const cand = Number(p.gid ?? p.id)
  return Number.isInteger(cand) ? cand : null
}

/** WFS 要素 → 统一条目；无效返回 null */
function toItem(f) {
  const p = f?.properties ?? {}
  const gid = pickGid(f)
  if (gid == null) return null
  return {
    gid,
    name: p.name ?? null,
    address: p.address ?? null,
    category: p.category ?? null,
    lon: p.lon ?? null,
    lat: p.lat ?? null,
  }
}

// ── 主函数 ──────────────────────────────────────────────────

/**
 * @param {string} keyword 搜索关键词
 * @param {object} [opts]
 * @param {AbortSignal} [opts.signal] 外部取消信号
 * @returns {Promise<{total:number, nameTotal:number, addrTotal:number, items:Array}>}
 */
export async function searchPoi(keyword, opts = {}) {
  const kw = String(keyword ?? '').trim()
  if (!kw) return { total: 0, nameTotal: 0, addrTotal: 0, items: [] }

  const safe = escapeCql(kw)

  /** 发一次 WFS，返回 { total, items } */
  async function query(cql, limit, signal) {
    const params = new URLSearchParams({
      service: 'WFS',
      version: '1.0.0',
      request: 'GetFeature',
      typeName: TYPE_NAME,
      outputFormat: 'application/json',
      CQL_FILTER: cql,
      maxFeatures: String(limit),
      PROPERTYNAME: PROPERTY_NAME,
      // 服务端排序只是为了让候选集稳定，真正的排序在前端做
      sortBy: 'name A',
    })
    const res = await fetch(`${WFS_URL}?${params}`, { signal })
    if (!res.ok) throw new Error('WFS ' + res.status)
    const data = await res.json()
    const features = data?.features ?? []
    const items = features.map(toItem).filter(Boolean)
    const rawTotal = Number(data?.totalFeatures)
    const total = Number.isFinite(rawTotal) ? rawTotal : items.length
    return { total, items }
  }

  // 超时保护
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  if (opts.signal) {
    if (opts.signal.aborted) ctrl.abort()
    else opts.signal.addEventListener('abort', () => ctrl.abort(), { once: true })
  }

  try {
    // ① 名称命中：多取候选，前端按相关性重排
    const byName = await query(`name LIKE '%${safe}%'`, CANDIDATE_LIMIT, ctrl.signal)
    const ranked = [...byName.items].sort((a, b) => compareByRelevance(a, b, kw))
    let items = ranked.slice(0, MAX_FEATURES)

    // ② 名称不够 8 条时，用地址命中补齐
    let addrTotal = 0
    if (items.length < MAX_FEATURES) {
      const need = MAX_FEATURES - items.length
      const byAddr = await query(
        `address LIKE '%${safe}%' AND name NOT LIKE '%${safe}%'`,
        need,
        ctrl.signal,
      )
      addrTotal = byAddr.total
      items = [...items, ...byAddr.items]
    } else {
      // 名称已填满：地址命中数只用于展示，不要数据（maxFeatures=0 会被当成不限，所以给 1）
      const byAddrTotal = await query(
        `address LIKE '%${safe}%' AND name NOT LIKE '%${safe}%'`,
        1,
        ctrl.signal,
      )
      addrTotal = byAddrTotal.total
    }

    return {
      total: byName.total + addrTotal,
      nameTotal: byName.total,
      addrTotal,
      items,
    }
  } finally {
    clearTimeout(timer)
  }
}

export const SEARCH_LIMIT = MAX_FEATURES
