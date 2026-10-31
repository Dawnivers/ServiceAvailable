/**
 * ════════════════════════════════════════════════════════════
 * splitPercent —— 把一组数量换算成「合计恰好 100」的百分比
 *
 * 为什么需要它：
 *   直接 `Math.round(n / total * 100)` 是**各自独立取整**，取整不保总和。
 *   实测本项目的数据（21 个圆形范围里有 8 个）：
 *     school 3 / hospital 5 / mall 3（共 11）
 *       → 27.27 / 45.45 / 27.27 → 27 + 45 + 27 = 99%   ← 少了 1
 *     school 4 / hospital 1 / mall 1（共 6）
 *       → 66.67 / 16.67 / 16.67 → 67 + 17 + 17 = 101%  ← 多了 1
 *
 * 解法：最大余数法（Hamilton / 最大余额法）
 *   ① 先全部向下取整，得到"地板"；
 *   ② 计算还差多少个最小单位（1% 或 0.1%）；
 *   ③ 按小数部分从大到小，逐个补一个单位 —— 余数大的"更该被进位"。
 *   这样合计恒等于 100，且每个值与精确值相差不超过一个最小单位。
 *
 * ★ 数量为 0 的项不参与补位（否则没有设施的类别会显示成 1%）。
 * ★ 余数相同时按原始顺序，保证同样的数据每次渲染结果一致。
 * ════════════════════════════════════════════════════════════
 *
 * @param {number[]} values 各项数量
 * @param {number} [decimals=0] 小数位，0 → 整数百分比；1 → 保留一位（如 31.6）
 * @returns {number[]} 与入参等长，求和恰好为 100
 */
export function splitPercent(values, decimals = 0) {
  const list = (values ?? []).map((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  });

  const total = list.reduce((s, v) => s + v, 0);
  if (total <= 0) return list.map(() => 0);

  const scale = 10 ** decimals; // 0 → 100 个单位；1 → 1000 个单位
  const target = 100 * scale;

  const exact = list.map((v) => (v / total) * target);
  const out = exact.map((v) => Math.floor(v)); // ① 地板

  // ② 还差多少单位（floor 之和一定 ≤ target，所以 rest ≥ 0）
  let rest = target - out.reduce((s, v) => s + v, 0);

  // ③ 按小数部分降序补位，只补给有数量的项
  const order = exact
    .map((v, i) => ({ i, frac: v - Math.floor(v) }))
    .filter((x) => list[x.i] > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i);

  for (let k = 0; rest > 0 && order.length > 0; k++) {
    out[order[k % order.length].i] += 1;
    rest -= 1;
  }

  // 归一：把"单位"换回百分比数值
  return out.map((v) => v / scale);
}
