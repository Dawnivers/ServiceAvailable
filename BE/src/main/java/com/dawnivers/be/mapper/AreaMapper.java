package com.dawnivers.be.mapper;


import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import com.dawnivers.be.dto.DistrictStatDto;

@Mapper
public interface AreaMapper {

    // ① 区总数（搬到这里的 ping-db SQL）
    Long countAreas();

    // ② 13 区 GeoJSON 文本（搬到这里的 areas SQL）
    String selectAreasGeoJson();

    //获取各区域内点的分布信息
    DistrictStatDto statByAdcode(@Param("adcode") long adcode);
}
