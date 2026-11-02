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
}
