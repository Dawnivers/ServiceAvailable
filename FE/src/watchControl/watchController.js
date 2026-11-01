import { useLayerStore } from '@/stores/layers.js';
import { watch } from 'vue';

/**
 * 全局 watcher 登记表。
 *
 * ★ 所有 watch 都从这里注册，好处是「清理只有一条路」：
 *   stopById(id) 单独停、stopAll() 组件卸载时全停。
 *   若在组件里直接写 watch()，Vue 虽然也会随组件卸载自动停止，
 *   但清理逻辑就被劈成两套 —— 以后再想临时停掉某个监听时找不到它。
 */
const stops = [];

/**
 * 按图层注册：自动挂 store.visible[id] 与 store.opacity[id]。
 *
 * @param {{ id: string, layer: import('ol/layer/Base').default }[]} ObjectsArray
 *   每一项的 id 必须在 store.visible / store.opacity 里存在才会挂钩子
 *   （只做显隐不存透明度的图层，比如 base/anno，就只挂显隐那一条）。
 */
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

/**
 * 注册一个「非图层」的 watcher —— 底图换源、分析模式同步、热力图类别等。
 *
 * 它和上面 watchController 的图层 watcher 共用同一个 stops 栈，
 * 所以 stopById / stopAll 一视同仁地清理。
 *
 * @param {string}   id      标签，供 stopById 使用
 * @param {Function} getter  取值函数（与 vue 的 watch 第一个参数一致）
 * @param {Function} cb      变化回调
 * @param {object}  [options] 透传给 watch：immediate / deep / flush
 */
export const registerWatcher = (id, getter, cb, options = {}) => {
  stops.push({ id, watch: watch(getter, cb, options) });
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

  stops.length = 0;
};
