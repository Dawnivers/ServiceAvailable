package com.dawnivers.be.mapper;

import com.dawnivers.be.dto.PoiDto;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface PoiMapper {
    PoiDto selectByGid(@Param("gid") long gid);
}