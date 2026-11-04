import { watch } from 'vue';
import { useAnalysisStore } from '@/stores/analysis.js';

/**
 * ════════════════════════════════════════════════════════════
 * useBufferAnalysis —— 分析结果的取数器
 *
 * 职责：盯着 analysis store 的「中心 / 半径 / 叠加圆」，自动去调接口，
 *       把结果写回 store。组件不碰 fetch。
 *
 * 两条路（2026-11-04：矩形/自由绘制移除，/within 分支一并删除）：
 *   点选（有 center）   → GET  /api/poi/nearby?lon&lat&radius
 *   叠加（有 2+ 个圆）  → POST /api/poi/overlay
 *
 * 三个必须处理的问题：
 *   ① 防抖：半径滑杆拖动时 input 连续触发，不防抖会打几十个请求
 *   ② 去重：同一组参数不重复请求（比如只切换类别勾选，不该重新查库）
 *   ③ 竞态：慢请求回来时用户可能已经改了半径/换了范围，旧结果必须丢弃
 *
 * ★ 叠加走 POST 而不是 GET：面数最多 6 个，每个都带经纬度与半径，
 *   拼进请求行虽然不至于超限，但 POST + JSON 更能表达"一组结构化参数"。
 * ════════════════════════════════════════════════════════════
 */

const DEBOUNCE_MS = 260;
const NEARBY_LIMIT = 50; // 后端上限就是 50

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

    // ★ 叠加优先：它和单图形是互斥的两条路，开着就不再走 nearby
    if (analysis.overlay) {
      if (analysis.shapes.length < 2) return null; // 1 个面没有「叠加」可言
      return `overlay|${shapesKey()}`;
    }

    // 测距不需要统计
    if (analysis.tool === 'measure') return null;

    // 2026-11-04：矩形/自由绘制已移除，这里只剩「点选」一条路。
    // （/api/poi/within 的调用分支一并删掉了 —— 没有工具能产出 WKT）
    const c = analysis.center;
    if (!c) return null;
    return `nearby|${c.lon}|${c.lat}|${analysis.radius}`;
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
            // ★ 载荷形状由 store 的 overlayShapes getter 统一给出，
            //   和导出 CSV 走同一份 —— 两边各拼一份漏字段就会各错各的。
            shapes: analysis.overlayShapes,
            // ★ 面板只要数字和几何。明细（几百条 POI）等点「导出 CSV」时再拉，
            //   否则每次拖半径滑杆都要多传几百 KB。
            withItems: false,
          }),
        };
      } else {
        // 只剩点选（nearby）；矩形/自由绘制移除后没有别的分支
        const c = analysis.center;
        const qs = new URLSearchParams({
          lon: String(c.lon),
          lat: String(c.lat),
          radius: String(analysis.radius),
          limit: String(NEARBY_LIMIT),
        });
        url = `/api/poi/nearby?${qs}`;
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
      else {
        analysis.setResult(data, elapsed);
        // ★ 点选模式：直线口径先出数字（约 20 ms），再串行拉路网等时圈（2–3 s）。
        //   不并发的原因：并发的慢请求会把面板整体拖进"加载中"，
        //   用户要干等 3 秒才看到任何数字；串行是数字立刻出现、面随后补上。
        if (key.startsWith('nearby')) fetchIsochrone(mySeq);
      }
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

  /**
   * 路网等时圈 —— 点选模式专用，跟在 /nearby 之后串行发。
   *
   * 与 nearby 的关系：同一个「从我的位置出发 800 米」，
   *   nearby   = 直线（ST_DWithin）
   *   isochrone = 路网（pgr_drivingDistance）
   * 两个数字都要，面板才能做「面积只剩 54%、设施还有 96%」的对比。
   *
   * ★ 三个必须守住的点：
   *   ① 用同一个 mySeq 判竞态：用户换点后旧结果必须丢弃，
   *      否则"慢请求回来把新点的面覆盖成旧点的面"——这类 bug 极难复现。
   *   ② 失败不清 result：直线口径的数字是好的，不该被路网失败连累。
   *   ③ 请求超时会长（2–3 s），loading 单独一个状态位，不阻塞数字展示。
   */
  async function fetchIsochrone(mySeq) {
    const c = analysis.center;
    if (!c) return;

    analysis.setIsochroneLoading(true);
    const t0 = performance.now();

    try {
      const qs = new URLSearchParams({
        lon: String(c.lon),
        lat: String(c.lat),
        budget: String(analysis.radius),
        limit: '50',
      });

      const res = await fetch(`/api/poi/isochrone?${qs}`);
      const ms = Math.round(performance.now() - t0);
      if (mySeq !== seq) return; // 过期，丢弃

      if (!res.ok) {
        let msg = `服务异常（${res.status}）`;
        try {
          const body = await res.json();
          // Spring Boot 3 的 ResponseStatusException → ProblemDetail，真话在 detail
          msg = body?.detail ?? body?.message ?? msg;
        } catch {
          /* 非 JSON 错误体，保留默认文案 */
        }
        analysis.setIsochroneError(msg);
        return;
      }

      const data = await res.json();
      if (mySeq !== seq) return;
      analysis.setIsochrone(data, ms);
    } catch (e) {
      if (mySeq !== seq) return;
      analysis.setIsochroneError('路网可达计算失败');
      console.warn('[isochrone]', e);
    } finally {
      if (mySeq === seq) analysis.setIsochroneLoading(false);
    }
  }

  /** 按当前状态决定要不要重查 */
  function sync() {    cancelPending();

    const key = requestKey();
    if (!key) {
      seq += 1; // 让在途请求作废
      lastKey = null;
      analysis.clearResult();
      analysis.clearOverlayResult();
      // ★ 等时圈也要清：否则退出/切到测距后，地图上还挂着上一次的面和路网
      analysis.clearIsochrone();
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
      // ★ 2026-11-04：analysis.geometry 已移除（矩形/自由绘制下线），
      //   这里的依赖少一条；shapesKey 仍然覆盖叠加圆的增删改。
      analysis.overlay,
      shapesKey(),
    ],
    sync,
    { immediate: true },
  );

  return { sync, cancel: cancelPending };
}
