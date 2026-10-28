
package com.dawnivers.be.service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.dawnivers.be.mapper.PoiMapper;
import com.dawnivers.be.dto.CategoryCount;
import com.dawnivers.be.dto.NearbyDto;
import com.dawnivers.be.dto.NearestDto;
import com.dawnivers.be.dto.PoiDto;

@Service
public class PoiService {
    private final PoiMapper poiMapper;
    public PoiService(PoiMapper poiMapper) { this.poiMapper = poiMapper; }

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
}