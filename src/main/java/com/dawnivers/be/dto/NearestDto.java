package com.dawnivers.be.dto;

public record NearestDto(
        String name,
        String category,
        Double distanceM      // ⚠ 别名 distance_m → 驼峰 distanceM
) { }