package com.dawnivers.be.dto;

/**
 * 用户传来的 WKT 的体检结果（内部用，不对外暴露）。
 *
 * 为什么要单独查一次：ST_Within 对坏几何的行为是"返回空结果"而不是报错，
 * 前端会拿到 count=0 并以为"这片区域没有设施"，排查起来毫无线索。
 * 所以先把几何本身验一遍，坏的就明确 400。
 *
 * valid 由 ST_IsValid 判定：自相交、退化等都会 false。
 * areaKm2 兼作防滥用：一个覆盖半个中国的多边形扫全表，是明显的攻击面。
 */
public record WktInfoDto(
        Boolean valid,
        Double areaKm2,
        Double lon,      // 形心经度
        Double lat       // 形心纬度
) { }
