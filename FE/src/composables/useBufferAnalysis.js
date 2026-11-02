import { watch } from 'vue';
import { useAnalysisStore } from '@/stores/analysis.js';

/**
 * ════════════════════════════════════════════════════════════
 * useBufferAnalysis —— 分析结果的取数器
 *
 * 职责：盯着 analysis store 的「中心 / 多边形 / 半径 / 叠加面」，
 *       自动去调接口，把结果写回 store。组件不碰 fetch。
 *
 * 三条路：
 *   点选（有 center）   → GET  /api/poi/nearby?lon&lat&radius
 *   多边形（有 geometry）→ GET  /api/poi/within?wkt
 *   叠加（有 2+ 个面）   → POST /api/poi/overlay
 *
 * 三个必须处理的问题：
 *   ① 防抖：半径滑杆拖动时 input 连续触发，不防抖会打几十个请求
 *   ② 去重：同一组参数不重复请求（比如只切换类别勾选，不该重新查库）
 *   ③ 竞态：慢请求回来时用户可能已经改了半径/换了范围，旧结果必须丢弃
 *
 * ★ 叠加走 POST 而不是 GET：6 个面 × 每个几百个顶点拼进请求行会撞
 *   Tomcat 默认 8KB 上限；WKT 里的 "+" 在 query string 还会被解成空格。
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

  /**
   * 叠加面的参数指纹。
   *
   * ★ 必须把每个面的**几何本身**算进去，不能只用 shapes.length：
   *   删掉 A 再加一个 D，面数还是 3，但结果完全不同 —— 只看数量就不会重查。
   * ★ 圆心半径也进指纹：同一个圆改半径就是一个新面。
   */
  function shapesKey() {
    return analysis.shapes
      .map((s) =>
        s.kind === 'circle'
          ? `${s.id}:c:${s.lon},${s.lat},${s.radius}`
          : `${s.id}:a:${s.wkt}`,
      )
      .join('|');
  }

  /** 当前状态够不够发起一次分析 */
  function requestKey() {
    if (!analysis.active) return null;

    // ★ 叠加优先：它和单图形是互斥的两条路，开着就不再走 nearby/within
    if (analysis.overlay) {
      if (analysis.shapes.length < 2) return null; // 1 个面没有「叠加」可言
      return `overlay|${shapesKey()}`;
    }

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
    const isOverlay = key.startsWith('overlay');
    const fail = (msg) => {
      // ★ 失败时把指纹清掉：否则参数没变的话，下一次 sync 会被去重直接 return，
      //   用户就成了「报错之后只能改图形才能重试」—— 后端刚重启这种场景会很难受。
      lastKey = null;
      if (isOverlay) analysis.setOverlayError(msg);
      else analysis.setResultError(msg);
    };

    try {
      let url;
      let init;

      if (isOverlay) {
        url = '/api/poi/overlay';
        init = {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            // ★ 只传几何来源，不传区号颜色那些展示字段：
            //   后端算的是几何，展示用的字母颜色由前端 store 管。
            shapes: analysis.shapes.map((s) =>
              s.kind === 'circle'
                ? {
                    id: s.id,
                    name: s.label,
                    kind: 'circle',
                    lon: s.lon,
                    lat: s.lat,
                    radius: s.radius,
                  }
                : { id: s.id, name: s.label, kind: 'area', wkt: s.wkt },
            ),
          }),
        };
      } else if (key.startsWith('nearby')) {
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
      const res = await fetch(url, init);
      const elapsed = Math.round(performance.now() - t0);
      if (mySeq !== seq) return; // 过期，丢弃

      if (!res.ok) {
        let msg = `服务异常（${res.status}）`;
        try {
          const body = await res.json();
          // ★ Spring Boot 3 的 ResponseStatusException 返回的是 ProblemDetail，
          //   真话在 detail 里；message 是老版本/自定义错误体的字段，两个都认。
          msg = body?.detail ?? body?.message ?? msg;
        } catch {
          /* 非 JSON 错误体，保留默认文案 */
        }
        fail(msg);
        return;
      }

      const data = await res.json();
      if (mySeq !== seq) return;

      if (isOverlay) analysis.setOverlayResult(data, elapsed);
      else analysis.setResult(data, elapsed);
    } catch (e) {
      if (mySeq !== seq) return;
      fail('网络异常，请稍后重试');
      console.warn('[useBufferAnalysis]', e);
    } finally {
      if (mySeq === seq) {
        if (isOverlay) analysis.setOverlayLoading(false);
        else analysis.setResultLoading(false);
      }
    }
  }

  /** 按当前状态决定要不要重查 */
  function sync() {
    cancelPending();

    const key = requestKey();
    if (!key) {
      seq += 1; // 让在途请求作废
      lastKey = null;
      analysis.clearResult();
      analysis.clearOverlayResult();
      return;
    }

    // 参数没变就不重复请求（切换类别勾选属于纯前端过滤，见 store 的 displayResult）
    if (key === lastKey) return;

    timer = setTimeout(() => {
      timer = null;
      lastKey = key;
      seq += 1;
      const mySeq = seq;
      if (key.startsWith('overlay')) analysis.setOverlayLoading(true);
      else analysis.setResultLoading(true);
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
      analysis.overlay,
      shapesKey(),
    ],
    sync,
    { immediate: true },
  );

  return { sync, cancel: cancelPending };
}
