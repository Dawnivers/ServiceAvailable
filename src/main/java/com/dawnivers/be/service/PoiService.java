
package com.dawnivers.be.service;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import com.dawnivers.be.mapper.PoiMapper;
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
}