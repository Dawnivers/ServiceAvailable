import { watch } from 'vue';
import { useAnalysisStore } from '@/stores/analysis.js';

/**
 * ════════════════════════════════════════════════════════════
 * useBufferAnalysis —— 分析结果的取数器
 *
 * 职责：盯着 analysis store 的「中心 / 多边形 / 半径」，自动去调接口，
 *       把结果写回 store。组件不碰 fetch。
 *
 * 两条路：
 *   点选（有 center）  → GET /api/poi/nearby?lon&lat&radius
 *   多边形（有 geometry）→ GET /api/poi/within?wkt
 *
 * 三个必须处理的问题：
 *   ① 防抖：半径滑杆拖动时 input 连续触发，不防抖会打几十个请求
 *   ② 去重：同一组参数不重复请求（比如只切换类别勾选，不该重新查库）
 *   ③ 竞态：慢请求回来时用户可能已经改了半径/换了范围，旧结果必须丢弃
 * ════════════════════════════════════════════════════════════
 */

const DEBOUNCE_MS = 260;
const NEARBY_LIMIT = 50; // 后端上限就是 50
const WITHIN_LIMIT = 50; // 后端上限 200，50 条足够面板展示与导出

export function useBufferAnalysis() {
  const analysis = useAnalysisStore();

  let timer = null;
  let seq = 0; // 请求序号，处理竞态
  let lastKey = null; // 上次请求的参数指纹，用于去重

  function cancelPending() {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  }

  /** 当前状态够不够发起一次分析 */
  function requestKey() {
    if (!analysis.active) return null;
    // 测距不需要统计
    if (analysis.tool === 'measure') return null;

    if (analysis.tool === 'point') {
      const c = analysis.center;
      if (!c) return null;
      return `nearby|${c.lon}|${c.lat}|${analysis.radius}`;
    }

    const g = analysis.geometry;
    if (!g?.wkt) return null;
    return `within|${g.wkt}`;
  }

  async function fetchResult(key, mySeq) {
    try {
      let url;
      if (key.startsWith('nearby')) {
        const c = analysis.center;
        const qs = new URLSearchParams({
          lon: String(c.lon),
          lat: String(c.lat),
          radius: String(analysis.radius),
          limit: String(NEARBY_LIMIT),
        });
        url = `/api/poi/nearby?${qs}`;
      } else {
        url = `/api/poi/within?wkt=${encodeURIComponent(analysis.geometry.wkt)}&limit=${WITHIN_LIMIT}`;
      }

      // ★ 计时只统计网络+服务端往返，不含前面的防抖等待
      const t0 = performance.now();
      const res = await fetch(url);
      const elapsed = Math.round(performance.now() - t0);
      if (mySeq !== seq) return; // 过期，丢弃

      if (!res.ok) {
        let msg = `服务异常（${res.status}）`;
        try {
          const body = await res.json();
          if (body?.message) msg = body.message;
        } catch {
          /* 非 JSON 错误体，保留默认文案 */
        }
        analysis.setResultError(msg);
        return;
      }

      const data = await res.json();
      if (mySeq !== seq) return;
      analysis.setResult(data, elapsed);
    } catch (e) {
      if (mySeq !== seq) return;
      analysis.setResultError('网络异常，请稍后重试');
      console.warn('[useBufferAnalysis]', e);
    } finally {
      if (mySeq === seq) analysis.setResultLoading(false);
    }
  }

  /** 按当前状态决定要不要重查 */
  function sync() {
    cancelPending();

    if (!analysis.active) {
      seq += 1; // 让在途请求作废
      lastKey = null;
      analysis.clearResult();
      return;
    }

    const key = requestKey();
    if (!key) {
      seq += 1;
      lastKey = null;
      analysis.clearResult();
      return;
    }

    // 参数没变就不重复请求（切换类别勾选属于纯前端过滤，见 store 的 displayResult）
    if (key === lastKey) return;

    timer = setTimeout(() => {
      timer = null;
      lastKey = key;
      seq += 1;
      const mySeq = seq;
      analysis.setResultLoading(true);
      fetchResult(key, mySeq);
    }, DEBOUNCE_MS);
  }

  watch(
    () => [
      analysis.active,
      analysis.tool,
      analysis.radius,
      analysis.center?.lon,
      analysis.center?.lat,
      analysis.geometry?.wkt,
    ],
    sync,
    { immediate: true },
  );

  return { sync, cancel: cancelPending };
}
