package com.dawnivers.be.dto;

/**
 * /api/poi/nearby 返回的一条"最近设施"。
 *
 * 2026-10-31 补了 gid / lon / lat：结果显示面板要把列表做成可点击的
 * （点一下飞到该设施），没有坐标就飞不过去。gid 同时保留了
 * "点回详情卡"的可能。
 *
 * ★ 字段顺序 = MyBatis constructor resultMap 的顺序，改动必须两边同步。
 */
public record NearestDto(
        Long gid,
        String name,
        String category,
        Double distanceM,     // ⚠ 别名 distance_m → 驼峰 distanceM
        Double lon,           // WGS84，取自 ST_X(geom)
        Double lat            // WGS84，取自 ST_Y(geom)
) { }
