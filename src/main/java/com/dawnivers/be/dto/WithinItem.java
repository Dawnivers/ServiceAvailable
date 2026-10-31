package com.dawnivers.be.dto;

/**
 * 多边形内的一条设施。
 *
 * 2026-10-31 补了 lon / lat：结果面板的列表要能点击定位，
 * 没有坐标飞不过去（gid 只够打开详情卡，不够定位）。
 *
 * ★ 字段顺序 = MyBatis constructor resultMap 的顺序，改动必须两边同步。
 */
public record WithinItem(
        Long gid,
        String name,
        String category,
        Double distanceM,     // 距【多边形形心】的米数，不是距某个设施
        Double lon,           // WGS84，取自 ST_X(geom)
        Double lat            // WGS84，取自 ST_Y(geom)
) { }
