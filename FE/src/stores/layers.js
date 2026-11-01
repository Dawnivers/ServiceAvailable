import { defineStore } from 'pinia';
import { BASE_MAPS, DEFAULT_BASE_MAP } from '@/map/basemaps.js';
import { HEAT_CATEGORIES, HEAT_DEFAULT_CATEGORY } from '@/map/heatmap.js';

export const useLayerStore = defineStore('layers', {
    state: () => ({
        // heat 默认关闭：热力图是"分析视角"，不该一进站就糊在底图上
        visible: { base: true, anno: true, admin: true, poi: true, heat: false },
        opacity: { admin: 0.7, poi: 1, heat: 0.8 },
        // 当前底图：'vector'（矢量）| 'image'（影像）
        // ★ 取值与 map/basemaps.js 的 URLS 键一一对应，加底图时两边一起加
        baseMap: DEFAULT_BASE_MAP,
        // 热力图类别：与 map/heatmap.js 的 HEAT_CATEGORIES[].key 对应
        heatCategory: HEAT_DEFAULT_CATEGORY,
    }),
    actions: {
        /**
         * 切图层显隐。
         *
         * ★ 热力图与 POI 点层互斥（打开一个自动关另一个）：
         *   热力图是 800m 可达密度的"面"，POI 是同一批数据的"点"；
         *   两层同时开，面的半透明填充会把图钉压暗，谁也看不清。
         *   想要点回来，勾一下 POI 就行，热力图会自动让位。
         */
        toggle(id, next) {
            this.visible[id] = next
            if (id === 'heat' && next) this.visible.poi = false
            if (id === 'poi' && next) this.visible.heat = false
        },
        setOpacity(id, v) { this.opacity[id] = v },
        // 白名单校验：拼错的值会让 basemaps 回落到默认底图，
        // 但 store 里留个脏值更麻烦，这里直接拒收
        setBaseMap(v) { if (BASE_MAPS.includes(v)) this.baseMap = v },
        // 同上：只有 heatmap.js 里声明过的 key 才收，避免拼错导致显示默认样式
        setHeatCategory(key) {
            if (HEAT_CATEGORIES.some((c) => c.key === key)) this.heatCategory = key
        },
    },
}
);
