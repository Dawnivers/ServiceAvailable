import { defineStore } from 'pinia';

// ── 周边统计的查询参数（卡片三宫格里的数就是从这来的）─────────────
// radius 后端校验是 (0, 5000]，limit 是 (0, 50]；越界直接 400
const NEARBY_RADIUS = 800; // 单位米
const NEARBY_LIMIT = 50; // ★ 不能用默认的 5：同类设施未必排得进前 5 条

const KM_PER_DEG2 = Math.PI * 0.8 * 0.8; // 800m 圆的面积，单位 km² ≈ 2.0106
const RATIO_MAX = 10; // 相对密度封顶：汉南区本区密度低到 0.69/km²，比值会爆

/** 空值模板：键永远存在，缺值给 null（与后端契约同一套纪律） */
const EMPTY_NEARBY = {
  count: null, // 800m 内设施总数（已排除自身）
  byCategory: {}, // { school, hospital, mall, park }
  sameCategoryNearest: null, // 排除自身后最近的同类，{ name, distanceM } | null
};

/** 空值模板：相对密度（需要本区覆盖统计，单独请求） */
const EMPTY_DENSITY = {
  district: null, // 区名（来自 /api/stats/coverage）
  ratio: null, // 800m 密度 ÷ 本区密度
  localPerKm2: null, // 800m 内密度，个/km²
  districtPerKm2: null, // 本区密度，个/km²
};

/**
 * 从 nearby 响应里算出卡片要的数。
 *
 * ★ 只有 count 可以减一：圆心必然在半径内，所以 count >= 1 恒成立。
 *   byCategory 的分类计数**不能减** —— 圆心那个点未必落在自己所属的类别里
 *   （实测：用东湖水体坐标查 800m，四个分类全 0，减一就变成 -1）。
 *   同类数用 nearest[] 滤出自身后按类别计数，这样既不含自身也不会为负。
 *
 * ★ nearest[0] 永远是自己、distanceM = 0，判定用 distanceM > 0 而不是比名字
 *   —— 重名 POI 是真实存在的。
 *
 * ★ nearest 只返回"最近的 N 个"，同类可能有漏；取不到就是 null（显示 '—'），
 *   不能编 0。
 */
function summarizeNearby(raw, category) {
  if (!raw) return { ...EMPTY_NEARBY };

  const list = Array.isArray(raw.nearest) ? raw.nearest : [];
  const others = list.filter((x) => Number(x.distanceM) > 0);
  const same = category ? others.find((x) => x.category === category) : null;

  return {
    count: typeof raw.count === 'number' ? Math.max(0, raw.count - 1) : null,
    byCategory: raw.byCategory ?? {},
    sameCategoryNearest: same
      ? { name: same.name, distanceM: Number(same.distanceM) }
      : null,
  };
}

/**
 * 相对密度：本地 800m 密度 ÷ 本区平均密度。
 *   local  = nearby.count（已排除自身）/ 2.0106 km²
 *   base   = coverage.perKm2（该区全部 POI / 该区面积）
 *   ratio  = local / base，封顶 RATIO_MAX
 *
 * 为什么要用相对值：单看 "13.4 个/km²" 没人知道算多算少；
 * "是本区平均的 3.6 倍" 一眼就懂，而且不用拍脑袋定阈值。
 *
 * 注意口径：perKm2 是全域平均（含水域山地），洪山区 514 km² 里东湖占了大片，
 * 所以各区比值普遍偏高。这是"相对本区平均"这个口径的固有性质，不是 bug。
 */
function summarizeDensity(nearbyCount, coverage) {
  if (nearbyCount === null || nearbyCount === undefined) return { ...EMPTY_DENSITY };
  const base = Number(coverage?.perKm2);
  if (!Number.isFinite(base) || base <= 0) return { ...EMPTY_DENSITY };

  const local = nearbyCount / KM_PER_DEG2;
  const ratio = Math.min(local / base, RATIO_MAX);

  return {
    district: coverage?.district ?? null,
    ratio,
    localPerKm2: local,
    districtPerKm2: base,
  };
}

export const useSelectionStore = defineStore('selection', {
  state: () => ({
    poi: null, //后端返回的POI点对象
    nearby: { ...EMPTY_NEARBY }, // 800m 周边统计（卡片三宫格用）
    density: { ...EMPTY_DENSITY }, // 相对密度（= 800m 密度 ÷ 本区密度）
    loading: false, //请求在途中为true 卡片显示：正在读取
    error: null, //出错时储存错误文案
    reqSeq: 0, //请求编号
  }), // 存什么
  getters: {}, // computed（可选）
  actions: {
    async setPoi(gid) {
      if (!gid) return;
      this.reqSeq += 1;
      const seq = this.reqSeq; //记录局部变量

      this.loading = true; //进入请求中状态
      this.error = null; //清除上一次的错误信息
      // ★ 先清旧值：连点时别让新 POI 顶着上一个的坐标和统计
      this.poi = null;
      this.nearby = { ...EMPTY_NEARBY };
      this.density = { ...EMPTY_DENSITY };

      //连接后端请求数据
      try {
        const res = await fetch(`/api/poi/${gid}`);
        if (!res.ok) {
          this.error =
            res.status === 404 ? '该设施不存在' : `服务异常（${res.status}）`;
          this.poi = null;
          return; // ← 这行不能漏
        }

        const data = await res.json(); //json解析

        if (seq !== this.reqSeq) return;
        this.poi = data;

        // 详情拿到经纬度后，接着拉 800m 周边统计
        await this.loadNearby(seq, data);
        // 再按 adcode 拉本区覆盖统计，算相对密度（依赖上一步的 count）
        await this.loadDensity(seq, data);
      } catch (e) {
        if (seq === this.reqSeq) {
          this.error = '网络异常';
          console.warn(e);
        }
      } finally {
        if (seq === this.reqSeq) this.loading = false;
      }
    },

    /**
     * 拉周边统计。★ 失败不写 error、不抛：卡片主体已经拿到了，
     * 不能因为一个次要请求把整张卡变成"网络异常"。
     */
    async loadNearby(seq, poi) {
      if (poi?.lon == null || poi?.lat == null) return;

      const qs = new URLSearchParams({
        lon: poi.lon,
        lat: poi.lat,
        radius: String(NEARBY_RADIUS),
        limit: String(NEARBY_LIMIT),
      });

      try {
        const res = await fetch(`/api/poi/nearby?${qs}`);
        if (!res.ok) {
          console.warn('[nearby]', res.status);
          return;
        }
        const raw = await res.json();
        if (seq !== this.reqSeq) return; // 过期结果，丢弃
        this.nearby = summarizeNearby(raw, poi.category);
      } catch (e) {
        if (seq !== this.reqSeq) return;
        console.warn('[nearby]', e); // 静默降级：两个数保持 '—'
      }
    },

    /**
     * 拉本区覆盖统计，算相对密度。同样失败不写 error。
     * 依赖：poi.adcode（后端 PoiDto 已补）+ 上一步的 nearby.count。
     */
    async loadDensity(seq, poi) {
      if (poi?.adcode == null) return;
      if (this.nearby.count === null) return; // 没拿到周边数就没得比

      try {
        const res = await fetch(`/api/stats/coverage?adcode=${poi.adcode}`);
        if (!res.ok) {
          console.warn('[coverage]', res.status);
          return;
        }
        const cov = await res.json();
        if (seq !== this.reqSeq) return; // 过期结果，丢弃
        this.density = summarizeDensity(this.nearby.count, cov);
      } catch (e) {
        if (seq !== this.reqSeq) return;
        console.warn('[coverage]', e); // 静默降级
      }
    },

    clear() {
      this.poi = null;
      this.nearby = { ...EMPTY_NEARBY };
      this.density = { ...EMPTY_DENSITY };
      this.error = null;
      this.loading = false;
      this.reqSeq += 1; // ← 这行容易漏
    },
  },
});
