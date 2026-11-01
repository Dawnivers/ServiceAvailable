import { useLayerStore } from '@/stores/layers.js';
import { watch } from 'vue';

const stops = [];
export const watchController = (ObjectsArray) => {
  const store = useLayerStore();

  ObjectsArray.forEach((element) => {
    const { id, layer } = element;

    //图层显隐 的watch
    if (id in store.visible) {
      stops.push({
        id: id,
        watch: watch(
          () => store.visible[id],
          (v) => layer.setVisible(!!v),
          { immediate: true },
        ),
      });
    }

    //图层透明度 的watch
    if (id in store.opacity) {
      stops.push({
        id: id,
        watch: watch(
          () => store.opacity[id],
          (v) => layer.setOpacity(Number(v)),
          { immediate: true },
        ),
      });
    }
  });
};

export const stopById = (id) => {
  stops.forEach((element) => {
    if (element.id === id) {
      element.watch();
    }
  });

  const keep = stops.filter((el) => el.id !== id); // 拿到「不属于这个 id」的
  stops.length = 0; // 清空原数组（不是重新赋值）
  stops.push(...keep); // 把留下的放回去
};

export const stopAll = () => {
  stops.forEach((element) => {
    element.watch();
  });
    
  stops.length=0
};
