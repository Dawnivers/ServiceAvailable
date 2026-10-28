package com.dawnivers.be.controller;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.dawnivers.be.dto.NearbyDto;
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

    @GetMapping("/nearby")
public NearbyDto nearby(@RequestParam double lon,
                        @RequestParam double lat,
                        @RequestParam(defaultValue = "800") double radius,
                        @RequestParam(defaultValue = "5") int limit) {
    if (radius <= 0 || radius > 5000) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "radius must be in (0, 5000], got " + radius);
    }
    if (limit <= 0 || limit > 50) {
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                "limit must be in (0, 50], got " + limit);
    }
    return poiService.nearby(lon, lat, radius, limit);
}
}
