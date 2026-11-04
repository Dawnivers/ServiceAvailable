package com.dawnivers.be.mapper;

import com.dawnivers.be.dto.CategoryCount;
import com.dawnivers.be.dto.NearestDto;
import com.dawnivers.be.dto.PoiDto;
import com.dawnivers.be.dto.WithinItem;
import com.dawnivers.be.dto.WktInfoDto;

import java.util.List;

import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface PoiMapper {
    PoiDto selectByGid(@Param("gid") long gid);

    List<CategoryCount> countByCategory(@Param("lon") double lon,
                                        @Param("lat") double lat,
                                        @Param("radius") double radius);
     
    
    List<NearestDto> nearest(@Param("lon") double lon,
                         @Param("lat") double lat,
                         @Param("radius") double radius,
                         @Param("limit") int limit);

    // ── 以下三个服务于 /api/poi/within（不规则多边形范围统计）──────────
    // ★ 全部用 #{wkt} 参数化。绝不写成 ${wkt}，那是字符串拼接，等于 SQL 注入。

    /** 先给 WKT 做体检：有效性 + 面积 + 形心。放在聚合查询之前，坏几何直接 400 */
    WktInfoDto inspectWkt(@Param("wkt") String wkt);

    /** 多边形内按类别计数 */
    List<CategoryCount> countByCategoryWithin(@Param("wkt") String wkt);

    /** 多边形内距形心最近的 N 条（带 gid，供前端点回详情） */
    List<WithinItem> itemsWithin(@Param("wkt") String wkt,
                                 @Param("limit") int limit);

    // ── 服务于 /api/poi/overlay（多面叠加分析）──────────────────────
    /**
     * 一次平面细分，返回并集 / 交集 / 按重叠度 / 各地块 的完整统计。
     *
     * ★ 入参是 service 校验过、Jackson 序列化好的 JSON 数组字符串，
     *   SQL 里 cast(? as jsonb) 展开成行 —— 这样面数可变也不用拼 SQL。
     * ★ 返回 String 而不是 JsonNode：MyBatis 没有 JsonNode 的 TypeHandler，
     *   契约转换（readTree）统一放在 service 里做，和 AreaService.getAreas 同一手法。
     *
     * @param shapesJson 面数组的 JSON
     * @param withItems  是否附带设施明细 —— 只有导出 CSV 时才要（见 OverlayReq）
     * @param itemLimit  明细条数上限，防"画了六个大面"时一次返回上万条
     */
    String overlay(@Param("shapesJson") String shapesJson,
                   @Param("withItems") boolean withItems,
                   @Param("itemLimit") int itemLimit);

    // ── 服务于 /api/poi/isochrone（路网等时圈）──────────────────────
    /**
     * 从点击点出发、按路网走 budget 米能到的地方。
     *
     * 返回一段 JSON 字符串：
     * <pre>
     *   status / nodeId / snapM / usedBudgetM
     *   areaKm2 / surface(GeoJSON) / skeleton(GeoJSON)
     *   edgeCount / partialCount / walkKm
     *   count / itemsTotal / byCategory / items[]
     * </pre>
     *
     * ★ 返回 String 而不是 DTO：里面有「面」「路网」「设施列表」三块结构
     *   完全不同的数据，SQL 里 json_build_object 一次拼好最省事，
     *   readTree 放在 service（与 overlay 同一手法）。
     *
     * @param lon    点击点经度
     * @param lat    点击点纬度
     * @param budget 预算（米）。SQL 里会扣掉吸附距离，实际扩散用 budget - snap
     * @param limit  设施列表条数上限（统计不受它影响）
     */
    String isochrone(@Param("lon") double lon,
                     @Param("lat") double lat,
                     @Param("budget") double budget,
                     @Param("limit") int limit);

    /**
     * 只要几何的等时圈（给「叠加分析」用）。
     *
     * <p>返回 JSON：status / snapM / usedBudgetM / areaKm2 / edgeCount /
     * surface(GeoJSON) / surfaceWkt(WKT,4326) / skeleton(GeoJSON)。
     *
     * <p>★ 为什么单独一条而不是复用 isochrone：
     * 叠加要的是「面」而不是「面内设施」——设施在细分的原子面上按 deg 统计，
     * 每个圆各数一遍既慢又会重复计数。
     *
     * @param lon    圆心经度
     * @param lat    圆心纬度
     * @param budget 步行预算（米），内部会扣掉吸附距离
     */
    String isochroneGeom(@Param("lon") double lon,
                         @Param("lat") double lat,
                         @Param("budget") double budget);
}
