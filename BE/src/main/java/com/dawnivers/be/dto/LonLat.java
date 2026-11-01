package com.dawnivers.be.dto;

/** 经纬度对。单独抽出来，避免新接口去复用 NearbyDto 的嵌套 Center 造成耦合。 */
public record LonLat(Double lon, Double lat) { }
