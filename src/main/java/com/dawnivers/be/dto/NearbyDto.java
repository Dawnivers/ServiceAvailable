package com.dawnivers.be.dto;

import java.util.List;
import java.util.Map;

public record NearbyDto(
        Long count,                        // 用 Long，和 count(*) 一致
        Center center,
        Double radiusM,                    // 序列化后是 radiusM，不是 radius_m！
        Map<String, Long> byCategory,      // 四类键固定
        List<NearestDto> nearest
) {
    public record Center(Double lon, Double lat) { }   // 嵌套 record
}