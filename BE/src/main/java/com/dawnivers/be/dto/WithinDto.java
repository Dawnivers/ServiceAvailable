package com.dawnivers.be.dto;

import java.util.List;
import java.util.Map;

/**
 * 多边形范围统计的返回体。
 *
 * 与 {@code NearbyDto} 刻意保持同形（count + byCategory），差别只有两处：
 *   ① 没有 radiusM —— 范围是用户画的多边形，不是一个半径
 *   ② 列表叫 items 不叫 nearest —— 多边形没有"圆心"，
 *      排序基准是多边形形心（centroid），语义上是"离形心最近的 N 个"，
 *      叫 nearest 会让人误以为是"离某个设施最近"
 *
 * 每个 item 都带 gid，前端可以据此再点开详情（详情接口只认 gid）。
 */
public record WithinDto(
        Long count,                        // 范围内设施总数（= byCategory 之和）
        Double areaKm2,                    // 多边形面积，km²，保留 2 位
        LonLat centroid,                   // 多边形形心，item 的距离就是相对它算的
        Map<String, Long> byCategory,      // 四类键固定，缺的补 0
        List<WithinItem> items             // 距形心最近的 N 条，按距离、gid 稳定排序
) { }
