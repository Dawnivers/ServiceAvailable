package com.dawnivers.be.controller;

import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import com.dawnivers.be.dto.NearbyDto;
import com.dawnivers.be.dto.OverlayReq;
import com.dawnivers.be.dto.PoiDto;
import com.dawnivers.be.dto.WithinDto;
import com.dawnivers.be.service.PoiService;
import com.fasterxml.jackson.databind.JsonNode;

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

    /**
     * 多面叠加分析（面-面求交 + 按重叠度统计）。
     *
     * <pre>
     *   POST /api/poi/overlay
     *   { "shapes": [
     *       { "id":"s1", "name":"A", "kind":"area",   "wkt":"POLYGON((...))" },
     *       { "id":"s2", "name":"B", "kind":"circle", "lon":114.3, "lat":30.55, "radius":800 }
     *     ],
     *     "withItems": false }
     * </pre>
     *
     * ★ 为什么这里换成 POST + JSON body，而 /within 还是 GET：
     *   ① 面数最多 6 个，每个手绘面动辄几百个顶点，
     *      拼进请求行会撞 Tomcat 默认 8KB 的上限；
     *   ② WKT 里的 "+" 在 query string 会被解成空格，编码层面也不省心。
     *   单个面（/within）用 G E T 仍够用，也符合"读操作"语义。
     *
     * ★ 返回 JsonNode 而不是 DTO：结果里有「面列表」「重叠度列表」「GeoJSON 几何」
     *   三块结构完全不同的数据，用嵌套 record 反而比 JSON 更啰嗦。
     *   SQL 里 json_build_object 一次拼好，这里透传（与 /api/areas 同一手法）。
     *
     * ★ withItems：面板取数传 false（只要数字和几何）；导出 CSV 时传 true，
     *   响应里会多出 items[]（每条带 gid/名称/类别/经纬度/deg/members）。
     *   同一个接口不同载荷，比再开一个只差两个字段的端点好维护。
     */
    @PostMapping("/overlay")
    public JsonNode overlay(@RequestBody(required = false) OverlayReq req) {
        if (req == null) {
            // 空 body 交给 service 报「至少 2 个面」，别在这里 NPE
            return poiService.overlay(null, false);
        }
        return poiService.overlay(req.shapes(), Boolean.TRUE.equals(req.withItems()));
    }

    /**
     * 路网等时圈：从点击点沿步行路网走 budget 米能到的地方。
     *
     * <pre>
     *   GET /api/poi/isochrone?lon=114.36&amp;lat=30.54&amp;budget=800&amp;limit=50
     * </pre>
     *
     * ★ 与 /nearby 是**同口径对照**而不是替代：
     *   nearby    = 直线 800 m（ST_DWithin）
     *   isochrone = 路网 800 m（pgr_drivingDistance）
     *   两个都调，面板上才能说「面积只剩 54%、设施还有 96%」。
     *
     * ★ 用 GET 不用 POST：参数就 4 个数字，不涉及 WKT，
     *   不会撞 Tomcat 8KB 请求行限制（/within 才需要小心那个）。
     */
    @GetMapping("/isochrone")
    public JsonNode isochrone(@RequestParam double lon,
            @RequestParam double lat,
            @RequestParam(defaultValue = "800") double budget,
            @RequestParam(defaultValue = "50") int limit) {

        return poiService.isochrone(lon, lat, budget, limit);
    }
}
