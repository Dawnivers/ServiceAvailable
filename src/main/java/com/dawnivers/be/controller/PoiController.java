package com.dawnivers.be.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.dawnivers.be.dto.PoiDto;
import com.dawnivers.be.service.PoiService;

@RestController
@RequestMapping("/api/poi")
public class PoiController {
    private final PoiService poiService;
    public PoiController(PoiService poiService) { this.poiService = poiService; }

    @GetMapping("/{gid}")
    public PoiDto get(@PathVariable long gid) {
        return poiService.getByGid(gid);
    }
}
