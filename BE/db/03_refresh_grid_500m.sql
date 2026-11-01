-- ============================================================================
-- 03_refresh_grid_500m.sql
--   重算 grid_500m 的全部统计列（D16 后端第 3 步，B3 + B4 + B5）
--
--   跑法：psql -f 03_refresh_grid_500m.sql
--   前置：01 + 02 已执行（格子已生成）
--   何时跑：poi 表有任何增删改之后 —— 预计算不自动失效，必须手动刷新
--   耗时：约 5–15 分钟（主要花在第 2 步的球面距离计算）
--   幂等：可重复执行任意次，结果一致
--
--   ★ 为什么不做触发器：
--     ETL 批量导入 16,016 条会触发 16,016 次，每次更新约 9.34 格
--     → 149,524 次无用 UPDATE，导入时间从秒级变成十分钟级。
--     触发器适合「少量离散写入」，不适合「批量导入」。
-- ============================================================================

BEGIN;

-- ── 第 0 步：重算分母（每次刷新都算，不写死魔数）─────────────────────
--   分母 = 该类全市密度 × 800 m 圆面积
--        = (该类总数 / 全市面积) × π·0.8²
--
--   语义：如果该类设施完全均匀铺开，一个 800 m 圆里应有的个数。
--   所以 r_* = 1 表示完全平均，47 表示密度是平均的 47 倍。
--
--   ★ 必须动态算，不能写死：
--     若把当前值 3.755541 硬编码，将来 ETL 补采 30% 数据后
--     avg(r_total) 会变成 1.30 而不是 1.00，图例含义就崩了。
CREATE TEMP TABLE _denom ON COMMIT DROP AS
WITH base AS (
    SELECT count(*)                                     AS n_total,
           count(*) FILTER (WHERE category = 'school')   AS n_school,
           count(*) FILTER (WHERE category = 'hospital') AS n_hospital,
           count(*) FILTER (WHERE category = 'mall')     AS n_mall,
           count(*) FILTER (WHERE category = 'park')     AS n_park
    FROM poi
),
area AS (
    SELECT ST_Area(ST_Union(geom)::geography) / 1000000.0 AS km2
    FROM admin_area
),
circle AS (
    SELECT PI() * 0.8 * 0.8 AS km2   -- 半径 800 m 的圆 = 2.0106 km²
)
SELECT
    b.n_total    * c.km2 / a.km2 AS denom_total,
    b.n_school   * c.km2 / a.km2 AS denom_school,
    b.n_hospital * c.km2 / a.km2 AS denom_hospital,
    b.n_mall     * c.km2 / a.km2 AS denom_mall,
    b.n_park     * c.km2 / a.km2 AS denom_park
FROM base b, area a, circle c;

-- ── 第 1 步：全部置 0 ────────────────────────────────────────────────
--   ★ 不能省。第 2 步用的是 JOIN（不是 LEFT JOIN），
--     「800 m 内零设施」的格子不会出现在聚合结果里，不预置 0 就会一直是 NULL。
--     实测有 26,786 格（67.3%）属于这种情况。
UPDATE grid_500m
SET total = 0, school = 0, hospital = 0, mall = 0, park = 0;

-- ── 第 2 步：绝对数量（B3 + B4，一次扫描算五列）──────────────────────
--   为什么一条 UPDATE 而不是五条：五条要扫五遍全表，耗时 ×5。
--
--   两层过滤是性能关键：
--     第一层 ST_DWithin(geometry, geometry, 0.0085)  → 单位「度」，走 GiST 索引
--     第二层 ST_DWithin(geography, geography, 800)   → 单位「米」，球面精算
--   第一层用 0.0085°（≈800 m 的外接方框）粗筛，只对存活行做第二层。
--   实测：第一层筛出 203 行，第二层精算得 176 行（江汉路参考格）。
--
--   为什么用 count(*) FILTER 而不是 sum(CASE ...)：
--     FILTER 是 PG 9.4+ 专为「按条件计数」设计的语法，可读性明显更好。
UPDATE grid_500m g
SET total    = c.n_total,
    school   = c.school,
    hospital = c.hospital,
    mall     = c.mall,
    park     = c.park
FROM (
    SELECT g2.gid AS grid_gid,
           count(*)                                        AS n_total,
           count(*) FILTER (WHERE p.category = 'school')   AS school,
           count(*) FILTER (WHERE p.category = 'hospital') AS hospital,
           count(*) FILTER (WHERE p.category = 'mall')     AS mall,
           count(*) FILTER (WHERE p.category = 'park')     AS park
    FROM grid_500m g2
    JOIN poi p
      ON ST_DWithin(p.geom, g2.centroid, 0.0085)
     AND ST_DWithin(p.geom::geography, g2.centroid::geography, 800)
    GROUP BY g2.gid
) c
WHERE g.gid = c.grid_gid;

-- ── 第 3 步：相对倍数（B5，纯算术，秒级）─────────────────────────────
--   放在最后，因为它只依赖第 2 步的整数列，不重算距离。
UPDATE grid_500m g
SET r_total    = round((g.total    / d.denom_total)::numeric, 2),
    r_school   = round((g.school   / d.denom_school)::numeric, 2),
    r_hospital = round((g.hospital / d.denom_hospital)::numeric, 2),
    r_mall     = round((g.mall     / d.denom_mall)::numeric, 2),
    r_park     = round((g.park     / d.denom_park)::numeric, 2)
FROM _denom d;

-- ── 第 4 步：推进增量刷新的标记（与 03b 共用同一张表）─────────────────
--   语义：标记值 = 「grid_500m 已完整反映到哪一条 POI」。
--   全量刷完必须同步，否则 03b 会把已处理过的 POI 当成新增，重复重算
--   （结果仍正确，因为 03b 是先置 0 再重算，只是白做一遍）。
CREATE TABLE IF NOT EXISTS grid_500m_refresh_state (
    id           integer      PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    last_max_gid bigint       NOT NULL,
    poi_count    bigint       NOT NULL,
    refreshed_at timestamptz  NOT NULL DEFAULT now()
);

INSERT INTO grid_500m_refresh_state (id, last_max_gid, poi_count, refreshed_at)
SELECT 1, COALESCE(max(gid), 0), count(*), now() FROM poi
ON CONFLICT (id) DO UPDATE
SET last_max_gid = EXCLUDED.last_max_gid,
    poi_count    = EXCLUDED.poi_count,
    refreshed_at = EXCLUDED.refreshed_at;

COMMIT;

-- ============================================================================
-- 跑完请执行 04_verify_grid_500m.sql 验收。
-- 最关键的一条：avg(r_total) 必须 ≈ 1.0000
--   —— 它证明分母算对了（数学上 avg(值)/分母 恒等于 1）。
-- ============================================================================