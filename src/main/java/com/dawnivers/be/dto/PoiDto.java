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
        Boolean detailFetched,
        Integer adcode,          // ★ 行政区码：前端拿它去调 /api/stats/coverage 算相对密度

        // ── 以下 5 个字段全部来自 raw jsonb，零额外高德配额 ──────────────
        String adname,           // 所属区（raw->>'adname'，覆盖率 100%）
        String businessArea,     // 商圈（raw->>'business_area'）
        String poiType,          // 高德原始类型串，如 "风景名胜;公园广场;公园"
        Double rating,           // 评分（raw->'biz_ext'->>'rating'，仅 45% 有值，其余 null）
        String openTime          // 营业时间（raw->'biz_ext'->>'open_time'，58% 有值）
) { }