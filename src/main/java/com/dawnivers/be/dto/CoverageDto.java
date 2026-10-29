package com.dawnivers.be.dto;

import java.util.Map;

public record CoverageDto(
        Long adcode,
        String district,
        Long total,
        Double areaKm2,
        Double perKm2,
        Map<String, Long> byCategory
) { }