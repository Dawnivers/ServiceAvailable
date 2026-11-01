package com.dawnivers.be.dto;

public record DistrictStatDto(
        Long adcode,
        String district,
        Long total,
        Double areaKm2,
        Long school,
        Long hospital,
        Long mall,
        Long park
) { }