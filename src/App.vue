<script setup>
import mapView from './view/mapView.vue';
import LayerPanel from './components/LayerPanel.vue';
import { reactive } from 'vue';
import { useLayerStore } from './stores/layers.js';
import { computed } from 'vue';
import { LAYER } from './map/layers.js';

const store =useLayerStore()

const layers = computed(() =>
  LAYER.map(d => ({
    ...d,                                  // id / name / tag
    visible: store.visible[d.id],
    opacity: d.kind === 'wms' ? store.opacity[d.id] : null,
    chips: d.chips,                        // 只有 poi 有
  }))
)


const onToggle = (id, next) => store.toggle(id, next) //切换显隐
const onOpacityChange = (id, v) => store.setOpacity(id, v)  //切换透明


</script>

<template>
   <LayerPanel :layers="layers" @toggle="onToggle" @opacity-change="onOpacityChange" />
  <mapView></mapView>
</template>

<style scoped></style>
