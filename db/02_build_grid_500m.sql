-- ============================================================================
-- 02_build_grid_500m.sql
--   生成 500 m 格网（D16 后端第 2 步，B2）
--
--   跑法：psql -f 02_build_grid_500m.sql
--   前置：01_ddl_grid_500m.sql 已执行（表为空）
--   何时重跑：admin_area（市域边界）变化时 —— 需先 TRUNCATE grid_500m
--   耗时：约 1 分钟（外接框切出约 9.4 万个候选格，裁到 39,820 个）
--
--   ★ size 单位 = 坐标系单位。4326 下是「度」，不是米。
--     0.0045 度 → 纬向 499.5 m，经向（北纬 30°）431 m。
--     格子是 432×500 的长方形，不是正方形 —— 这是刻意的精度取舍，
--     详见 roadmap §2.4.9。写成 size=500 会生成比地球还大的格子。
-- ============================================================================

BEGIN;

-- 市域边界只算一次，避免在子查询里重复 ST_Union
CREATE TEMP TABLE _city ON COMMIT DROP AS
SELECT ST_Union(geom) AS geom
FROM admin_area;

-- 第 1 步：按市域外接框切满网格
-- 第 2 步：只保留与市域相交的（这一步能把 9.4 万砍到约 4.5 万）
INSERT INTO grid_500m (geom, centroid, cell_i, cell_j)
SELECT
    g.geom,
    ST_Centroid(g.geom),
    g.i,
    g.j
FROM ST_SquareGrid(
        0.0045,
        (SELECT ST_Envelope(geom) FROM _city)
     ) AS g
WHERE ST_Intersects(g.geom, (SELECT geom FROM _city));

-- 第 3 步：裁掉「中心点在市域外」的格子
--   统计圆以 centroid 为圆心，圆心在市外时这个 800 m 圆统计的主要是
--   武汉以外的区域，数字没有意义（roadmap §2.4.9 决策④）
DELETE FROM grid_500m g
WHERE NOT ST_Within(g.centroid, (SELECT geom FROM _city));

COMMIT;

-- ── 验收（实测基线：39,820 格 / 平均 215,238 m²）────────────────────
-- 1) 格子总数，预期 39,820 ± 5%
--      SELECT count(*) FROM grid_500m;
--
-- 2) 单格实际面积，预期 avg ≈ 215,000 m²（0.215 km²）
--      SELECT round(avg(ST_Area(geom::geography))::numeric, 0) AS avg_m2,
--             round(min(ST_Area(geom::geography))::numeric, 0) AS min_m2,
--             round(max(ST_Area(geom::geography))::numeric, 0) AS max_m2
--      FROM grid_500m;
--      → 若 avg 差几个数量级：size 单位写错（用了米）
--
-- 3) 圆心在市外的格子数，预期 0
--      SELECT count(*) FROM grid_500m g
--      WHERE NOT ST_Within(g.centroid, (SELECT ST_Union(geom) FROM admin_area));
--
-- 4) 格子总面积，预期为市域面积的 95–100%
--      SELECT round((SELECT sum(ST_Area(geom::geography))/1000000 FROM grid_500m)::numeric,1) AS grid_km2,
--             round((SELECT ST_Area(ST_Union(geom)::geography)/1000000 FROM admin_area)::numeric,1) AS city_km2;
--      → 实测 8,570.3 vs 8,574.6，比值 99.95%
