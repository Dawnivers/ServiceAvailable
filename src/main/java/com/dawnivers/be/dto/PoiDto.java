package com.dawnivers.be.dto;

import java.util.List;

public record PoiDto(
        Long gid,
        String amapId,
        String name,
        String category,
        String typecode,
        String address,
        String tel,
        Double lon,
        Double lat,
        List<String> photos,     // ← 目标类型
        Boolean detailFetched
) { }