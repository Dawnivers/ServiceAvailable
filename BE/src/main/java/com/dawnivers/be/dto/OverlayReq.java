package com.dawnivers.be.dto;

import java.util.List;

/**
 * 叠加分析请求：2–6 个面，后端一次算出「并集 / 交集 / 重叠度」。
 *
 * ★ 只做请求体，不做响应体：响应由 PostGIS 的 json_build_object 拼好，
 *   service 直接透传成 JsonNode（与 /api/areas 同一套契约：String → JsonNode）。
 *
 * ★ 一个面有两种来源，用 kind 区分：
 *     area   → wkt（前端框选 / 自由绘制出来的 POLYGON）
 *     circle → lon + lat + radius（点选落下的缓冲圈）
 *
 * ★ 圆为什么不在前端转成多边形再传 WKT：
 *   前端画的那个圆是 3857 投影里的圆（半径按 1/cos(纬度) 放大过），
 *   转成 WKT 多边形只是它在 WGS84 下的近似。而这里把圆心半径交给
 *   ST_Buffer(::geography, r)，得到的是**地面上的正圆**，
 *   和 /api/poi/nearby 用的 ST_DWithin(geom::geography, ...) 完全口径一致。
 */
public record OverlayReq(List<Shape> shapes) {

    /**
     * @param id     前端生成的稳定标识（"s1"/"s2"...），回传时原样带回，用于对应
     * @param name   展示名（"A"/"B"...），仅回显，不参与计算
     * @param kind   'area' | 'circle'
     * @param wkt    kind=area 时必填，POLYGON/MULTIPOLYGON
     * @param lon    kind=circle 时必填
     * @param lat    kind=circle 时必填
     * @param radius kind=circle 时必填，米
     */
    public record Shape(
            String id,
            String name,
            String kind,
            String wkt,
            Double lon,
            Double lat,
            Double radius) {
    }
}
