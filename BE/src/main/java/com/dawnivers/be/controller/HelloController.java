package com.dawnivers.be.controller;                              // ① 包 = 目录

import java.time.LocalDateTime;                                   // ② 用的两个 JDK 类
import java.util.LinkedHashMap;
import java.util.Map;

import org.springframework.web.bind.annotation.GetMapping;         // ③ 三个 Spring 注解
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController                                                   // ④ 类级：Bean + 返回 JSON
@RequestMapping("/api")                                           // ⑤ 类级：路径前缀
public class HelloController {

    @GetMapping("/hello")                                         // ⑥ 方法级：GET /api/hello
    public Map<String, Object> hello() {
        Map<String, Object> body = new LinkedHashMap<>();         // ⑦ 装返回内容
        body.put("message", "BE is up");
        body.put("service", "be");
        body.put("port", 8094);
        body.put("time", LocalDateTime.now().toString());
        return body;
    }
}