package com.dawnivers.be.service;

import com.dawnivers.be.dto.CoverageDto;
import com.dawnivers.be.dto.DistrictStatDto;
import com.dawnivers.be.mapper.AreaMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AreaService {

    private final AreaMapper areaMapper;
    private final ObjectMapper objectMapper;

    // 构造器注入：两个都给
    public AreaService(AreaMapper areaMapper, ObjectMapper objectMapper) {
        this.areaMapper = areaMapper;
        this.objectMapper = objectMapper;
    }

    // ① 直接透传数字，不需要加工
    public Long countAreas() {
        return areaMapper.countAreas();
    }

    // ② ★ 契约转换发生在这里：String → JsonNode
    public JsonNode getAreas() throws JsonProcessingException {
        String json = areaMapper.selectAreasGeoJson();
        return objectMapper.readTree(json);
    }

    public CoverageDto coverage(long adcode) {
    // ① 查
        DistrictStatDto s = areaMapper.statByAdcode(adcode);
        if (s == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "district not found: " + adcode);
        }

        // ② 组装分类（和 nearby 一样的手法：先铺 0 再覆盖，虽然这里 4 个都有）
        Map<String, Long> byCategory = new LinkedHashMap<>();
        byCategory.put("school",   s.school());
        byCategory.put("hospital", s.hospital());
        byCategory.put("mall",     s.mall());
        byCategory.put("park",     s.park());

        // ③ ★ 密度在这个算，不用数据库算
        double perKm2 = s.areaKm2() > 0
                ? BigDecimal.valueOf(s.total())
                    .divide(BigDecimal.valueOf(s.areaKm2()), 2, RoundingMode.HALF_UP)
                    .doubleValue()
                : 0.0;

        return new CoverageDto(s.adcode(), s.district(), s.total(), s.areaKm2(), perKm2, byCategory);
}
}
