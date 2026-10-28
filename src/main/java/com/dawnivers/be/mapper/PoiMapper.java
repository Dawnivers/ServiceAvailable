package com.dawnivers.be.mapper;

import com.dawnivers.be.dto.CategoryCount;
import com.dawnivers.be.dto.NearestDto;
import com.dawnivers.be.dto.PoiDto;

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
}