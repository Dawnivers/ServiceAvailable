-- ============================================================================
-- 04_verify_grid_500m.sql
--   grid_500m 验收脚本（只读，不修改任何数据）
--
--   跑法：psql -f 04_verify_grid_500m.sql
--   期望：输出里所有 ok_* 列都是 t / 计数都是 0 / avg 都是 1.0 附近
-- ============================================================================

\echo ''
\echo '════════ 1. 结构：15 列 / 2 几何列 SRID 4326 / 3 索引 ════════'
SELECT count(*) AS columns_expected_15
FROM information_schema.columns WHERE table_name = 'grid_500m';

SELECT f_geometry_column, srid, type
FROM geometry_columns WHERE f_table_name = 'grid_500m';

\echo ''
\echo '════════ 2. 规模：39,820 格 / 平均 215,000 m² / 圆心全在市内 ════════'
SELECT
    count(*)                                                    AS cells,
    count(*) FILTER (WHERE total IS NULL)                       AS null_total,
    round(avg(ST_Area(geom::geography))::numeric, 0)            AS avg_cell_m2,
    -- ★ 必须 ::numeric：ST_Area 返回 double precision，
    --   而 round(double precision, int) 在 PG 里不存在
    round((sum(ST_Area(geom::geography)) / 1000000.0)::numeric, 1) AS grid_km2,
    count(*) FILTER (WHERE NOT ST_Within(
        centroid,
        (SELECT ST_Union(geom) FROM admin_area)
    ))                                                          AS centroid_outside
FROM grid_500m;

\echo ''
\echo '════════ 3. 一致性：四类之和 = total，且无 NULL ════════'
SELECT
    count(*) FILTER (WHERE total IS NULL)                              AS null_total,
    count(*) FILTER (WHERE school + hospital + mall + park <> total)   AS sum4_mismatch,
    count(*) FILTER (WHERE total = 0 AND r_total <> 0)                 AS zero_ratio_wrong
FROM grid_500m;

\echo ''
\echo '════════ 4. 硬判据：gid=16822 → 176 / 19 / 53 / 96 / 8 ════════'
\echo '           r:  46.86 / 17.43 / 42.27 / 84.27 / 29.35'
SELECT gid, total, school, hospital, mall, park,
       school + hospital + mall + park AS sum4,
       r_total, r_school, r_hospital, r_mall, r_park
FROM grid_500m WHERE gid = 16822;

\echo ''
\echo '════════ 5. 分母自检：avg(r_*) 必须 ≈ 1.0000 ════════'
\echo '           偏离说明分母错了（不是算错了，是基准选错了）'
SELECT
    round(avg(r_total)::numeric,  4) AS avg_r_total,
    round(avg(r_school)::numeric, 4) AS avg_r_school,
    round(avg(r_hospital)::numeric,4) AS avg_r_hospital,
    round(avg(r_mall)::numeric,   4) AS avg_r_mall,
    round(avg(r_park)::numeric,   4) AS avg_r_park
FROM grid_500m;

\echo ''
\echo '════════ 6. 分布：67.3% 零值格是武汉的真实情况，不是 bug ════════'
SELECT
    count(*) AS cells,
    count(*) FILTER (WHERE total = 0)                                  AS zeros,
    round((count(*) FILTER (WHERE total = 0) * 100.0 / count(*))::numeric, 1) AS zero_pct,
    min(total) AS min, max(total) AS max,
    round(avg(total)::numeric, 1)                                      AS avg_total,
    round(percentile_cont(0.5) WITHIN GROUP (ORDER BY total)::numeric) AS median,
    round(percentile_cont(0.95) WITHIN GROUP (ORDER BY total)::numeric) AS p95
FROM grid_500m;

\echo ''
\echo '════════ 7. 分类零值率：park 应明显高于其他三类 ════════'
SELECT
    round((count(*) FILTER (WHERE school   = 0) * 100.0 / count(*))::numeric, 1) AS zero_school,
    round((count(*) FILTER (WHERE hospital = 0) * 100.0 / count(*))::numeric, 1) AS zero_hospital,
    round((count(*) FILTER (WHERE mall     = 0) * 100.0 / count(*))::numeric, 1) AS zero_mall,
    round((count(*) FILTER (WHERE park     = 0) * 100.0 / count(*))::numeric, 1) AS zero_park
FROM grid_500m;

\echo ''
\echo '════════ 8. 分档实测：SLD 用 [0.2, 1, 3, 10] ════════'
\echo '           第 1 档恰等于零值格（非零格最小值 1/3.7556 = 0.266 > 0.2）'
SELECT
    count(*) FILTER (WHERE r_total <  0.2)                    AS band1_transparent,
    count(*) FILTER (WHERE r_total >= 0.2 AND r_total < 1)    AS band2,
    count(*) FILTER (WHERE r_total >= 1   AND r_total < 3)    AS band3,
    count(*) FILTER (WHERE r_total >= 3   AND r_total < 10)   AS band4,
    count(*) FILTER (WHERE r_total >= 10)                     AS band5
FROM grid_500m;

\echo ''
\echo '════════ 9. 各区抽样交叉核对：match 必须全为 t ════════'
\echo '           从库里独立现查一遍，与存储值比对'
WITH pick AS (
    SELECT DISTINCT ON (a.name) g.gid, a.name
    FROM grid_500m g
    JOIN admin_area a ON ST_Within(g.centroid, a.geom)
    ORDER BY a.name, random()
)
SELECT pk.name,
       g.total AS stored,
       (SELECT count(*) FROM poi
        WHERE ST_DWithin(poi.geom::geography, g.centroid::geography, 800)) AS recomputed,
       g.total = (SELECT count(*) FROM poi
                  WHERE ST_DWithin(poi.geom::geography, g.centroid::geography, 800)) AS match
FROM pick pk JOIN grid_500m g ON g.gid = pk.gid
ORDER BY pk.name;
