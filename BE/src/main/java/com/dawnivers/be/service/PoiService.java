
package com.dawnivers.be.service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.dawnivers.be.mapper.PoiMapper;
import com.dawnivers.be.dto.CategoryCount;
import com.dawnivers.be.dto.LonLat;
import com.dawnivers.be.dto.NearbyDto;
import com.dawnivers.be.dto.NearestDto;
import com.dawnivers.be.dto.OverlayReq;
import com.dawnivers.be.dto.PoiDto;
import com.dawnivers.be.dto.WithinDto;
import com.dawnivers.be.dto.WithinItem;
import com.dawnivers.be.dto.WktInfoDto;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

@Service
public class PoiService {
    private final PoiMapper poiMapper;

    /** 和 AreaService 一样：JSON 文本 ↔ JsonNode 的契约转换交给它 */
    private final ObjectMapper objectMapper;

    public PoiService(PoiMapper poiMapper, ObjectMapper objectMapper) {
        this.poiMapper = poiMapper;
        this.objectMapper = objectMapper;
    }

    public PoiDto getByGid(long gid) {
        PoiDto dto = poiMapper.selectByGid(gid);
        if (dto == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "poi not found: " + gid);
        }
        return dto;
    }

    //nearby
    private static final List<String> ALL_CATEGORIES =
        List.of("school", "hospital", "mall", "park");

    public NearbyDto nearby(double lon, double lat, double radius, int limit) {
   
        // ① 两个查询
    List<CategoryCount> counts = poiMapper.countByCategory(lon, lat, radius);
    List<NearestDto> nearest = poiMapper.nearest(lon, lat, radius, limit);

    // ② ★ 组装：四类键补 0
    Map<String, Long> byCategory = new LinkedHashMap<>();
    for (String c : ALL_CATEGORIES) byCategory.put(c, 0L);      // 先全填 0
    for (CategoryCount cc : counts) byCategory.put(cc.category(), cc.cnt());  // 用实际值覆盖

    // ③ 汇总
    long total = byCategory.values().stream().mapToLong(Long::longValue).sum();

    return new NearbyDto(total, new NearbyDto.Center(lon, lat), radius, byCategory, nearest);
}

    // ════════════════════════════════════════════════════════════
    //  within —— 不规则多边形范围统计
    // ════════════════════════════════════════════════════════════

    /** 只接受这两种面类型。点位/线不该走这个接口（那用 nearby 或测距） */
    private static final Pattern WKT_POLYGON = Pattern.compile(
            "^\\s*(MULTI)?POLYGON\\s*\\(.*\\)\\s*$",
            Pattern.CASE_INSENSITIVE | Pattern.DOTALL);

    /** WKT 长度上限。Tomcat 默认请求头 8KB，6000 字符留出余量（约 300 个顶点） */
    private static final int MAX_WKT_CHARS = 6000;

    /** 面积上限，km²。武汉全域约 8569，给到 2 万足够，同时挡住"覆盖半个中国"的滥用 */
    private static final double MAX_AREA_KM2 = 20000.0;

    public WithinDto within(String wkt, int limit) {
        String w = wkt == null ? "" : wkt.trim();

        // ① 静态校验：非空 / 长度 / 类型
        if (w.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "wkt is required");
        }
        if (w.length() > MAX_WKT_CHARS) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "wkt too long: " + w.length() + " chars, max " + MAX_WKT_CHARS);
        }
        if (!WKT_POLYGON.matcher(w).matches()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "wkt must be POLYGON(...) or MULTIPOLYGON(...)");
        }

        // ② 几何体检：解析失败（语法错）和"能解析但无效"（自相交）分开报
        WktInfoDto info;
        try {
            info = poiMapper.inspectWkt(w);
        } catch (Exception e) {
            // ST_GeomFromText 解析失败会抛 SQL 异常，这里转成 400 而不是 500
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "wkt cannot be parsed: " + rootMessage(e), e);
        }
        if (info == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "wkt cannot be parsed");
        }
        if (!Boolean.TRUE.equals(info.valid())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "wkt is not a valid polygon (self-intersecting or degenerate?)");
        }

        // ③ 面积守卫：0 面积（退化）和过大的多边形都拒绝
        double areaKm2 = info.areaKm2() == null ? 0.0 : info.areaKm2();
        if (areaKm2 <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "polygon area must be > 0");
        }
        if (areaKm2 > MAX_AREA_KM2) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "polygon too large: " + plain2(areaKm2) + " km², max " + plain2(MAX_AREA_KM2));
        }

        // ④ 两个查询 + 组装（与 nearby 同一套纪律：四类补 0、count 由分类求和）
        List<CategoryCount> counts = poiMapper.countByCategoryWithin(w);
        List<WithinItem> items = poiMapper.itemsWithin(w, limit);

        Map<String, Long> byCategory = new LinkedHashMap<>();
        for (String c : ALL_CATEGORIES) byCategory.put(c, 0L);
        for (CategoryCount cc : counts) byCategory.put(cc.category(), cc.cnt());

        long total = byCategory.values().stream().mapToLong(Long::longValue).sum();

        return new WithinDto(total, round2(areaKm2), new LonLat(info.lon(), info.lat()),
                byCategory, items);
    }

    // ════════════════════════════════════════════════════════════
    //  overlay —— 多面叠加分析（面-面求交 + 重叠度）
    // ════════════════════════════════════════════════════════════

    /** 少于 2 个面没有「叠加」可言 */
    private static final int MIN_SHAPES = 2;

    /**
     * 上限 6 个。
     * ★ 不是性能限制（平面细分布局很小），是**人眼限制**：
     *   组合数是 2^n-1，7 个面就有 127 种组合，谁看都晕。
     *   真实叠加分析通常 2–4 个面。
     */
    private static final int MAX_SHAPES = 6;

    /** 半径区间与前端滑杆一致（100–2000），前后端各留一点余量 */
    private static final double MIN_RADIUS_M = 50.0;
    private static final double MAX_RADIUS_M = 5000.0;

    /**
     * 导出时设施明细的条数上限。
     *
     * ★ 5000 是个折中：城市核心区画两个 2 km 的圈，并集里也就一两千个设施，
     *   够覆盖真实使用；再往上响应会到几 MB，浏览器解析比查库还慢。
     * ★ 超了不是错，接口会一并返回 itemsTotal，前端在 CSV 末尾写一句「共 N 条，仅导出前 M 条」。
     */
    private static final int MAX_ITEM_LIMIT = 5000;

    /**
     * 多面叠加分析。
     *
     * ★ 校验放在 service、几何运算放在 SQL，和 within 同一分工。
     * ★ 但**没有**做 within 那样的 ST_IsValid 体检：
     *   叠加是「用户边画边加」的多面场景，一个手抖的自相交面不该让整批 6 个面全 400。
     *   SQL 里用 CASE WHEN ST_IsValid THEN geom ELSE ST_MakeValid(geom) 就地修正。
     *
     * @param withItems 是否附带设施明细（导出 CSV 才要）。面板取数时传 false，
     *                  避免每次拖滑杆都把几百条 POI 一起拉回来。
     */
    public JsonNode overlay(List<OverlayReq.Shape> shapes, boolean withItems) {
        // ① 数量
        if (shapes == null || shapes.size() < MIN_SHAPES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "at least " + MIN_SHAPES + " shapes are required");
        }
        if (shapes.size() > MAX_SHAPES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "at most " + MAX_SHAPES + " shapes are allowed, got " + shapes.size());
        }

        // ② 逐个校验（错误信息带下标，前端能定位到是第几个面）
        for (int i = 0; i < shapes.size(); i++) {
            OverlayReq.Shape s = shapes.get(i);
            String tag = "shapes[" + i + "]";
            if (s == null) {
                throw badRequest(tag + " must not be null");
            }

            String kind = s.kind() == null ? "" : s.kind().trim();
            if ("circle".equals(kind)) {
                if (s.lon() == null || s.lat() == null || s.radius() == null) {
                    throw badRequest(tag + ": circle needs lon / lat / radius");
                }
                if (s.lon() < -180 || s.lon() > 180) {
                    throw badRequest(tag + ".lon must be in [-180, 180], got " + s.lon());
                }
                if (s.lat() < -90 || s.lat() > 90) {
                    throw badRequest(tag + ".lat must be in [-90, 90], got " + s.lat());
                }
                if (s.radius() <= MIN_RADIUS_M || s.radius() > MAX_RADIUS_M) {
                    throw badRequest(tag + ".radius must be in (" + (int) MIN_RADIUS_M
                            + ", " + (int) MAX_RADIUS_M + "], got " + s.radius());
                }
            } else if ("area".equals(kind)) {
                String w = s.wkt() == null ? "" : s.wkt().trim();
                if (w.isEmpty()) {
                    throw badRequest(tag + ".wkt is required when kind=area");
                }
                if (w.length() > MAX_WKT_CHARS) {
                    throw badRequest(tag + ".wkt too long: " + w.length()
                            + " chars, max " + MAX_WKT_CHARS);
                }
                if (!WKT_POLYGON.matcher(w).matches()) {
                    throw badRequest(tag + ".wkt must be POLYGON(...) or MULTIPOLYGON(...)");
                }
            } else {
                throw badRequest(tag + ".kind must be 'area' or 'circle', got '" + kind + "'");
            }
        }

        // ③ 序列化后交给 SQL（不拼 SQL，全部走 #{} 参数化）
        String json;
        try {
            json = objectMapper.writeValueAsString(shapes);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "cannot encode shapes", e);
        }

        String raw = poiMapper.overlay(json, withItems, MAX_ITEM_LIMIT);
        if (raw == null) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "overlay query returned nothing");
        }

        // ④ 契约转换：String → JsonNode（与 /api/areas 一致）
        try {
            return objectMapper.readTree(raw);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "cannot parse overlay result", e);
        }
    }

    private static ResponseStatusException badRequest(String msg) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, msg);
    }

    // ══════════════════════════════════════════════════════════
    //  叠加分析（路网口径）：每个圆先算成「可达面」，再求交
    // ══════════════════════════════════════════════════════════

    /**
     * 多个步行圈的叠加：每个圆先折算成真实可达面（路网 800 m + 50 m 缓冲），
     * 再把这些面交给平面细分求交。
     *
     * <p>与 {@link #overlay} 的区别只有一处：**输入面的构造方式**。
     * overlay 用 {@code ST_Buffer(圆心, radius)} 画的是直线圆；
     * 这里用 {@code isochroneGeom} 得到沿路网走出来的面。
     * 求交、按重叠度分组、数设施，全部复用同一条 overlay SQL —— 不复制那 200 行。
     *
     * <p>★ 为什么在 service 里循环而不是写一条巨型 SQL：
     * 每个圆都要跑一次 Dijkstra + 建缓冲，SQL 里用 LATERAL 串起来会变成
     * 五层嵌套、几乎无法调试；循环 2–6 次，代价是 N 次往返（每个 1–3 秒），
     * 换来的是「每个圆的几何都能单独返回给前端画」。
     *
     * <p>返回在原 overlay 结果上追加：
     * <pre>
     *   surfaces: [{ id, name, areaKm2, snapM, usedBudgetM, edgeCount,
     *                surface(GeoJSON), skeleton(GeoJSON) }]
     * </pre>
     * 前端据此把「每个圈的可达面 + 路网」一起画出来。
     */
    public JsonNode overlayNetwork(List<OverlayReq.Shape> shapes, boolean withItems) {
        // ① 校验：这里只接受圆（叠加的输入就是一个个点）
        if (shapes == null || shapes.size() < MIN_SHAPES) {
            throw badRequest("at least " + MIN_SHAPES + " circles are required");
        }
        if (shapes.size() > MAX_SHAPES) {
            throw badRequest("at most " + MAX_SHAPES + " circles are allowed, got " + shapes.size());
        }
        for (int i = 0; i < shapes.size(); i++) {
            OverlayReq.Shape s = shapes.get(i);
            String tag = "shapes[" + i + "]";
            if (s == null) throw badRequest(tag + " must not be null");
            if (s.lon() == null || s.lat() == null || s.radius() == null) {
                throw badRequest(tag + ": circle needs lon / lat / radius");
            }
            if (s.lon() < -180 || s.lon() > 180) {
                throw badRequest(tag + ".lon must be in [-180, 180], got " + s.lon());
            }
            if (s.lat() < -90 || s.lat() > 90) {
                throw badRequest(tag + ".lat must be in [-90, 90], got " + s.lat());
            }
            if (s.radius() <= MIN_RADIUS_M || s.radius() > MAX_RADIUS_M) {
                throw badRequest(tag + ".radius must be in (" + (int) MIN_RADIUS_M
                        + ", " + (int) MAX_RADIUS_M + "], got " + s.radius());
            }
        }

        // ② 每个圆 → 可达面（WKT 给细分用，GeoJSON 给前端画）
        JsonNode surfaces = objectMapper.createArrayNode();
        List<Map<String, Object>> areaShapes = new java.util.ArrayList<>();

        for (OverlayReq.Shape s : shapes) {
            String raw;
            try {
                raw = poiMapper.isochroneGeom(s.lon(), s.lat(), s.radius());
            } catch (Exception e) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "isochrone failed for shape " + s.id() + ": " + rootMessage(e), e);
            }
            JsonNode geom;
            try {
                geom = objectMapper.readTree(raw);
            } catch (JsonProcessingException e) {
                throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                        "cannot parse isochrone for shape " + s.id(), e);
            }

            // status=no_network（最近路网比预算还远）：这个圆没有面可叠，跳过。
            // ★ 不报 400：用户画 3 个圈、其中 1 个在山里，不该让整批失败。
            if (geom == null || !"ok".equals(geom.path("status").asText())) {
                continue;
            }
            String wkt = geom.path("surfaceWkt").asText("");
            if (wkt.isBlank()) continue;

            /**
             * ★ 不要写成一串 .put().set() 链：ObjectNode.set() 的返回类型是泛型 T
             *   （<T extends JsonNode> T set(String, JsonNode)），链式调用时
             *   javac 推不出 T，会把静态类型退化成 JsonNode，
             *   而后面的 .set(...) 就报「找不到符号」。
             *   拆成显式变量，类型稳定。
             */
            com.fasterxml.jackson.databind.node.ObjectNode one = objectMapper.createObjectNode();
            one.put("id", s.id());
            one.put("name", s.name());
            one.put("areaKm2", geom.path("areaKm2").asDouble(0));
            one.put("snapM", geom.path("snapM").asInt(0));
            one.put("usedBudgetM", geom.path("usedBudgetM").asInt(0));
            one.put("edgeCount", geom.path("edgeCount").asInt(0));
            one.set("surface", geom.path("surface"));
            one.set("skeleton", geom.path("skeleton"));
            ((com.fasterxml.jackson.databind.node.ArrayNode) surfaces).add(one);

            areaShapes.add(Map.of(
                    "id", s.id(),
                    "name", s.name() == null ? s.id() : s.name(),
                    "kind", "area",
                    "wkt", wkt));
        }

        if (areaShapes.size() < MIN_SHAPES) {
            throw badRequest("fewer than " + MIN_SHAPES
                    + " circles have a reachable network (nearest road may be farther than the budget)");
        }

        // ③ 交给既有细分 SQL：它不关心面是圆还是等时圈，只认 WKT
        String shapesJson;
        try {
            shapesJson = objectMapper.writeValueAsString(areaShapes);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "cannot encode isochrone shapes", e);
        }

        String baseRaw = poiMapper.overlay(shapesJson, withItems, MAX_ITEM_LIMIT);
        if (baseRaw == null) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "overlay query returned nothing");
        }

        // ④ 在原结果上追加 surfaces（前端靠它画「每个圈的可达面 + 路网」）
        try {
            JsonNode base = objectMapper.readTree(baseRaw);
            ((com.fasterxml.jackson.databind.node.ObjectNode) base).set("surfaces", surfaces);
            return base;
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "cannot parse overlay result", e);
        }
    }

    // ══════════════════════════════════════════════════════════
    //  路网等时圈（/api/poi/isochrone）
    // ══════════════════════════════════════════════════════════

    /**
     * 从点击点沿步行路网走 budget 米能到的地方：可达面 + 可达路网 + 面内设施。
     *
     * <p>与 /nearby 的关系：同一个「从我的位置出发 800 米」的问题，两种口径——
     * nearby 算直线（ST_DWithin），这里算路网（pgr_drivingDistance）。
     * 两个数字放在一张卡里对比，就是这个接口存在的理由。
     *
     * <p>★ 校验只做「参数合法性」，不做「几何有效性」：
     * 吸附到最近路网节点、扣掉吸附距离、半截边补齐，全部在 SQL 里完成。
     * 这样接口层薄、规则只有一处。
     */
    public JsonNode isochrone(double lon, double lat, double budget, int limit) {
        if (lon < -180 || lon > 180) {
            throw badRequest("lon must be in [-180, 180], got " + lon);
        }
        if (lat < -90 || lat > 90) {
            throw badRequest("lat must be in [-90, 90], got " + lat);
        }
        // 预算区间与前端滑杆一致（analysis.js 的 RADIUS: 100–2000）
        if (budget <= 50 || budget > 2000) {
            throw badRequest("budget must be in (50, 2000], got " + budget);
        }
        if (limit <= 0 || limit > 200) {
            throw badRequest("limit must be in (0, 200], got " + limit);
        }

        String raw;
        try {
            raw = poiMapper.isochrone(lon, lat, budget, limit);
        } catch (Exception e) {
            // 路网表没导入 / pgRouting 没装，都会落到这里。把真话带出去，
            // 前端 SqlHintBar 才有东西可显示（与 within 的 rootMessage 同一手法）。
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "isochrone query failed: " + rootMessage(e), e);
        }

        if (raw == null || raw.isBlank()) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "isochrone query returned nothing");
        }

        try {
            return objectMapper.readTree(raw);
        } catch (JsonProcessingException e) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR,
                    "cannot parse isochrone result", e);
        }
    }

    /** 保留 2 位小数。用 BigDecimal，别用 double 直接四舍五入 */
    private static Double round2(double v) {
        return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP).doubleValue();
    }

    /**
     * 保留 2 位小数的文本形式，专门给错误提示用。
     * ★ 不能直接拼 double：Double.toString 超过 1e7 会变成科学计数法
     *   （实测 "polygon too large: 2.183110349E7 km²"），toPlainString 才是平的。
     */
    private static String plain2(double v) {
        return BigDecimal.valueOf(v).setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    /**
     * 取异常链最底层的信息，Spring/MyBatis 会把真正的 SQL 报错裹三四层。
     * ★ 只取第一行：PG 的 parse error 后面会跟 "建议：…" 和一段图形摘录，
     *   塞进 HTTP 响应体又长又乱，前端展示不下。
     */
    private static String rootMessage(Throwable e) {
        Throwable cur = e;
        while (cur.getCause() != null && cur.getCause() != cur) {
            cur = cur.getCause();
        }
        String msg = cur.getMessage();
        if (msg == null) return cur.getClass().getSimpleName();
        String first = msg.strip().split("\\R", 2)[0].trim();
        return first.length() > 200 ? first.substring(0, 200) : first;
    }
}
