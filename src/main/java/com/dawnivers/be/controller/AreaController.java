package com.dawnivers.be.controller;


import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.bind.annotation.RequestMapping;

import com.fasterxml.jackson.databind.JsonNode;      // 返回类型：JSON 树

import com.fasterxml.jackson.core.JsonProcessingException; // ← 新增 import

import com.dawnivers.be.service.AreaService;

@RestController
@RequestMapping("/api")
public class AreaController {

     private final AreaService areaService;
   
    public AreaController(AreaService areaService) {
      this.areaService = areaService;
    }

    @GetMapping("/ping-db") // 与类上的 /api 拼接 → GET /api/ping-db
    public Long pingDb() {
        return areaService.countAreas();
    }

    @GetMapping("/areas")
    public JsonNode areas() throws JsonProcessingException {
        return areaService.getAreas();
}

}