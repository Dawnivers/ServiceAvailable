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
}
