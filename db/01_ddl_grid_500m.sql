-- ============================================================================
-- 01_ddl_grid_500m.sql
--   grid_500m 表结构（D16 后端第 1 步，B1）
--
--   一行 = 一个 500 m 方格
--     geom     方格多边形，用于出图与点选
--     centroid 方格中心点，800 m 统计圆的圆心
--     total    圆内全部 POI 数（B3）
--     school/hospital/mall/park  四类分项（B4）
--     r_*      相对全市平均的倍数（B5），avg(r_*) 恒为 1.00
--
--   跑法：psql -f 01_ddl_grid_500m.sql
--   注意：本脚本会 DROP 已有表，重跑等于重建（数据需重跑 02 + 03）
-- ============================================================================

DROP TABLE IF EXISTS grid_500m;

CREATE TABLE grid_500m (
    gid      serial PRIMARY KEY,

    geom     geometry(Polygon, 4326) NOT NULL,
    centroid geometry(Point,   4326) NOT NULL,

    -- ST_SquareGrid 的行列号，只用于排查定位
    cell_i   integer,
    cell_j   integer,

    -- ── B3：800 m 圆内全部 POI 数 ──────────────────────────────────
    total    integer,

    -- ── B4：四类分项（与 poi.category 的取值一一对应）──────────────
    school   integer,
    hospital integer,
    mall     integer,
    park     integer,

    -- ── B5：相对倍数 = 值 / (该类全市密度 × 圆面积) ─────────────────
    --   avg(r_*) 恒为 1.00 —— 这是分母正确的自检指标
    --   用 numeric 而非 double：SLD 的 PropertyIsBetween 在浮点边界会抖
    r_total    numeric(8,2),
    r_school   numeric(8,2),
    r_hospital numeric(8,2),
    r_mall     numeric(8,2),
    r_park     numeric(8,2)
);

-- GeoServer 按视窗范围过滤出图 → 走 geom 索引
CREATE INDEX grid_500m_geom_idx     ON grid_500m USING GIST (geom);

-- 03 刷新脚本的 ST_DWithin(poi.geom, g.centroid, ...) 走 centroid 索引
--   （只建 geom 索引会让统计慢一个数量级）
CREATE INDEX grid_500m_centroid_idx ON grid_500m USING GIST (centroid);

-- ── 验收 ────────────────────────────────────────────────────────────
-- 1) 共 15 列
--      SELECT count(*) FROM information_schema.columns WHERE table_name='grid_500m';
-- 2) 两个几何列 SRID 都是 4326、类型正确
--      SELECT f_geometry_column, srid, type FROM geometry_columns
--      WHERE f_table_name='grid_500m';
--      预期：geom POLYGON 4326 / centroid POINT 4326
-- 3) 索引 3 条（含主键）
--      \d grid_500m
-- 4) 表是空的
--      SELECT count(*) FROM grid_500m;   -- 预期 0
