/**
 * ════════════════════════════════════════════════════════════
 * heatmap —— 格网热力图配置（类别 / STYLES 名 / 图例色带）
 *
 * 数据来自 PG 表 grid_500m：39,820 个 500m 方格，
 * 每格存「以格心为圆心、800m 步行圈内」的设施数与相对全市平均的倍数。
 * GeoServer 图层：wuhan:grid_500m（EPSG:4326）。
 *
 * ★★ 这个文件是**前端唯一真源**，但不是全局唯一：
 *    真正的渲染颜色在 BE/styles/grid_*.sld 里。
 *    改色必须两边一起改，否则图例与地图颜色不一致 —— 而且不会报错。
 *
 * 为什么单独立一个文件：
 *    类别列表、STYLES 参数、图例色带三处都要用同一份数据。
 *    散在 LayerPanel / MapLegend / mapView 里迟早漂移。
 * ════════════════════════════════════════════════════════════
 */

// ── 1. 图层与默认值 ─────────────────────────────────────────
/** GeoServer 图层名（FE 走 vite 代理 /geoserver → 8080） */
export const HEAT_LAYER = 'wuhan:grid_500m';

/** 打开热力图时默认看的类别 */
export const HEAT_DEFAULT_CATEGORY = 'total';

// ── 2. 类别配置 ─────────────────────────────────────────────
/**
 * thresholds 与 colors **长度必须相同**，对应关系：
 *
 *   x <  thresholds[0]                → 不画（该格 800m 内一个设施都没有）
 *   [t0, t1)  → colors[0]
 *   [t1, t2)  → colors[1]
 *   ...
 *   x >= t(n-1) → colors[n-1]
 *
 * 例如 total：thresholds [0.2, 1, 3, 10, 25]（5 个）+ colors 5 个
 *   <0.2 不画 / 0.2–1 / 1–3 / 3–10 / 10–25 / ≥25
 */
export const HEAT_CATEGORIES = [
  {
    key: 'total',
    label: '全部',
    field: 'r_total',
    style: 'wuhan:grid_total',
    unit: 'ratio', // 倍数 → 图例写「x 倍」
    thresholds: [0.2, 1, 3, 10, 25],
    colors: ['#fecc5c', '#fd8d3c', '#f03b20', '#bd0026', '#67000d'], // YlOrRd
  },
  {
    key: 'school',
    label: '学校',
    field: 'r_school',
    style: 'wuhan:grid_school',
    unit: 'ratio',
    thresholds: [0.2, 1, 3, 10, 25],
    colors: ['#c6dbef', '#6baed6', '#4292c6', '#2171b5', '#08306b'], // Blues
  },
  {
    key: 'hospital',
    label: '医院',
    field: 'r_hospital',
    style: 'wuhan:grid_hospital',
    unit: 'ratio',
    thresholds: [0.2, 1, 3, 10, 25],
    colors: ['#fcbba1', '#fb6a4a', '#ef3b2c', '#cb181d', '#67000d'], // Reds
  },
  {
    key: 'mall',
    label: '商场',
    field: 'r_mall',
    style: 'wuhan:grid_mall',
    unit: 'ratio',
    thresholds: [0.2, 1, 3, 10, 25],
    colors: ['#fee391', '#fec44f', '#fe9929', '#d95f0e', '#993404'], // YlOrBr
  },
  {
    key: 'park',
    // ★ 公园是唯一按「原始个数」着色的类别，不是倍数。
    //   原因：全市仅 1,163 条，1 个公园就等于全市平均的 3.67 倍，
    //   按倍数分档会让 0.2~3 这段完全没有格子（实测 0 个），出现两个空档。
    //   改按个数后：1 / 2 / 3 / ≥4 个，读者一眼能对上。
    label: '公园',
    field: 'park',
    style: 'wuhan:grid_park',
    unit: 'count', // 个数 → 图例写「x 个」
    thresholds: [1, 2, 3, 4],
    colors: ['#c7e9c0', '#74c476', '#31a354', '#006d2c'], // Greens
  },
];

// ── 3. 派生工具 ─────────────────────────────────────────────

/** 按 key 取类别配置，取不到就退回「全部」——避免一个错 key 让整个面板白屏 */
export function heatCategory(key) {
  return (
    HEAT_CATEGORIES.find((c) => c.key === key) ??
    HEAT_CATEGORIES.find((c) => c.key === HEAT_DEFAULT_CATEGORY) ??
    HEAT_CATEGORIES[0]
  );
}

/** 取 WMS 的 STYLES 参数值（带工作区前缀，例如 wuhan:grid_school） */
export function heatStyleName(key) {
  return heatCategory(key).style;
}

/** 图例副标题：说明这张图到底在表达什么 */
export function heatLegendSubtitle(key) {
  const c = heatCategory(key);
  return c.unit === 'count' ? '800m 步行圈内个数' : '相对全市平均的倍数';
}

/**
 * 生成图例条目（含第一档「无覆盖」）。
 *
 * 返回 [{ label, color }]，color 为 null 表示透明（不画）。
 * 顺序与 SLD 的 Rule 顺序一致，直接喂给 MapLegend 渲染即可。
 *
 * @param {string} key 类别 key
 * @returns {{ label: string, color: string|null }[]}
 */
export function heatLegend(key) {
  const { unit, thresholds: t, colors } = heatCategory(key);

  // 第一档统一是「不画」：ratio 是 <0.2，count 是 0 个
  const items = [
    { label: unit === 'count' ? '0 个' : '无覆盖', color: null },
  ];

  colors.forEach((color, i) => {
    const lo = t[i];
    const hi = t[i + 1];
    let label;

    if (unit === 'count') {
      // 个数：区间是整数[lo, hi)，直接写 lo 个即可
      label = hi === undefined ? `≥${lo} 个` : `${lo} 个`;
    } else {
      // 倍数：区间是连续的 [lo, hi)
      label = hi === undefined ? `≥${lo} 倍` : `${lo}–${hi} 倍`;
    }

    items.push({ label, color });
  });

  return items;
}
