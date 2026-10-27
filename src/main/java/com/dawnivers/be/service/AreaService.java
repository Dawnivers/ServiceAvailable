package com.dawnivers.be.service;

import com.dawnivers.be.mapper.AreaMapper;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

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
}
