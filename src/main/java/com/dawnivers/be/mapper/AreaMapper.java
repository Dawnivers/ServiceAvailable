package com.dawnivers.be.mapper;


import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface AreaMapper {

    // ① 区总数（搬到这里的 ping-db SQL）
    Long countAreas();

    // ② 13 区 GeoJSON 文本（搬到这里的 areas SQL）
    String selectAreasGeoJson();
}
