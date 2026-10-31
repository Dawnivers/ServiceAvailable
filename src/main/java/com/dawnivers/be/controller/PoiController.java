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
import com.dawnivers.be.dto.WithinDto;
import com.dawnivers.be.service.PoiService;

@RestController
@RequestMapping("/api/poi")
public class PoiController {
    private final PoiService poiService;

    public PoiController(PoiService poiService) {
        this.poiService = poiService;
    }

    @GetMapping("/{gid}")
    public PoiDto get(@PathVariable long gid) {
        return poiService.getByGid(gid);
    }

    @GetMapping("/nearby")
    public NearbyDto nearby(@RequestParam double lon,
            @RequestParam double lat,
            @RequestParam(defaultValue = "800") double radius,
            @RequestParam(defaultValue = "5") int limit) {

        if (lon < -180 || lon > 180) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "lon must be in [-180, 180], got " + lon);
        }
        if (lat < -90 || lat > 90) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "lat must be in [-90, 90], got " + lat);
        }

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

    /**
     * 不规则多边形范围统计。
     *
     *   GET /api/poi/within?wkt=POLYGON((...))&limit=20
     *
     * ★ wkt 必须 URL 编码（空格、括号、逗号）。前端用 encodeURIComponent。
     * ★ 用 GET 而不用 POST：符合"读操作"语义，且能被浏览器缓存/直接收藏。
     *   代价是 WKT 受请求行长度限制（service 里卡 6000 字符，约 300 个顶点）。
     *   真要支持上千顶点的复杂边界，再改 POST + JSON body。
     *
     * 校验分两层：静态格式/长度在这里和 service，几何有效性用 ST_IsValid 查库。
     */
    @GetMapping("/within")
    public WithinDto within(@RequestParam String wkt,
            @RequestParam(defaultValue = "20") int limit) {

        if (limit <= 0 || limit > 200) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "limit must be in (0, 200], got " + limit);
        }

        return poiService.within(wkt, limit);
    }
}
