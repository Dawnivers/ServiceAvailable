import { ref, computed } from 'vue';
import { defineStore } from 'pinia';

export const useLayerStore = defineStore('layers', {
    state: () => ({
        visible: { base: true, anno: true, admin: true, poi: true },
        opacity: { admin: 0.7, poi: 1 },
    }),
    actions: {
        toggle(id, next) { this.visible[id] = next },
        setOpacity(id, v) { this.opacity[id] = v },
    },
}
);
