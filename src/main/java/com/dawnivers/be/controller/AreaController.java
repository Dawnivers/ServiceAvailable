package com.dawnivers.be.controller;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestMapping;

import com.fasterxml.jackson.databind.JsonNode;      // 返回类型：JSON 树
import com.fasterxml.jackson.databind.ObjectMapper; // readTree 的持有者

import com.fasterxml.jackson.core.JsonProcessingException;   // ← 新增 import

@RestController
@RequestMapping("/api")
public class AreaController {

    private static final String BUILD_SQL = """
    SELECT json_build_object('type','FeatureCollection','features', json_agg(f))
FROM (
  SELECT json_build_object(
    'type','Feature',
    'properties', json_build_object('adcode',adcode,'name',name,'level',level,'center',center),
    'geometry', ST_AsGeoJSON(geom)::json
  ) AS f
  FROM admin_area
) t
    """;

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public AreaController(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @GetMapping("/ping-db") // 与类上的 /api 拼接 → GET /api/ping-db
    public Long pingDb() {
        return jdbcTemplate.queryForObject("select count(*) from admin_area", Long.class);
    }

    @GetMapping("/areas")
    public JsonNode areas() throws JsonProcessingException {
    // ① 让数据库把 13 个区拼成一段 JSON 文本
    // ② 把文本解析成 Jackson 的树（顺便校验它是不是合法 JSON）
    // ③ 直接返回这棵树——Jackson 会原样写进响应体，不再转义
        String json = jdbcTemplate.queryForObject(BUILD_SQL, String.class);
        return objectMapper.readTree(json);
}

}