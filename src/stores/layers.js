import { defineStore } from 'pinia';
import { BASE_MAPS, DEFAULT_BASE_MAP } from '@/map/basemaps.js';

export const useLayerStore = defineStore('layers', {
    state: () => ({
        visible: { base: true, anno: true, admin: true, poi: true },
        opacity: { admin: 0.7, poi: 1 },
        // 当前底图：'vector'（矢量）| 'image'（影像）
        // ★ 取值与 map/basemaps.js 的 URLS 键一一对应，加底图时两边一起加
        baseMap: DEFAULT_BASE_MAP,
    }),
    actions: {
        toggle(id, next) { this.visible[id] = next },
        setOpacity(id, v) { this.opacity[id] = v },
        // 白名单校验：拼错的值会让 basemaps 回落到默认底图，
        // 但 store 里留个脏值更麻烦，这里直接拒收
        setBaseMap(v) { if (BASE_MAPS.includes(v)) this.baseMap = v },
    },
}
);
