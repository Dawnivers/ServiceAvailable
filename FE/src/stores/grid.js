import { defineStore } from 'pinia';

/**
 * 点热力图格子后，那一格的统计属性。
 *
 * 只存「值」不存 Feature / 几何 —— 和 selection store 同一条纪律：
 * OL 对象进了响应式系统，身份会被 Proxy 破坏。
 *
 * centroid 是个纯数组 [lon, lat]，可以安全地存。
 */
export const useGridStore = defineStore('grid', {
  state: () => ({
    /** 当前选中的格子属性（GetFeatureInfo 的 properties 原样存） */
    info: null,
    loading: false,
    error: null,
  }),

  getters: {
    /** 是否要显示弹窗 */
    hasInfo: (s) => s.info !== null,

    /** 格心坐标 [lon, lat]，GetFeatureInfo 里是个 GeoJSON Point */
    centroid: (s) => {
      const c = s.info?.centroid;
      return c && Array.isArray(c.coordinates) ? c.coordinates : null;
    },
  },

  actions: {
    setLoading(v) {
      this.loading = v;
      if (v) this.error = null;
    },

    /** 成功：存属性；顺带把 error 清掉 */
    setInfo(props) {
      this.info = props;
      this.loading = false;
      this.error = null;
    },

    setError(msg) {
      this.error = msg;
      this.info = null;
      this.loading = false;
    },

    clear() {
      this.info = null;
      this.error = null;
      this.loading = false;
    },
  },
});
