-- ============================================================================
-- 03b_refresh_incremental.sql
--   增量刷新：只重算「新增 POI 影响到的那约 10 个格子」（秒级，对比全量 5–15 分钟）
--
--   跑法：psql -f 03b_refresh_incremental.sql
--   适用：**只新增** POI 行（INSERT）
--   不适用：删除、修改坐标、整表重灌 —— 那几种请跑 03 全量刷新
--
--   检测原理：用 poi.gid（serial 序列，单调递增）+ 行数双保险
--     • 新增 = gid > 上次记录的 max gid      → 精确，不受时钟/时区影响
--     • 删除 = 当前行数 < 上次记录的行数      → 报错拦截，避免静默算错
--   为什么不用 fetched_at：首次初始化时无法区分「刚插入」与「已处理」；
--   而 gid 是单调序列，第一次初始化记下 max(gid) 即可，不会漏。
-- ============================================================================

BEGIN;

-- ── 第 0 步：刷新进度标记表 ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grid_500m_refresh_state (
    id           integer      PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    last_max_gid bigint       NOT NULL,
    poi_count    bigint       NOT NULL,
    refreshed_at timestamptz  NOT NULL DEFAULT now()
);

-- 首次运行：以当前 poi 的最大 gid / 行数为基线
--   ★ 前提是此刻 grid_500m 确实反映了全部数据（即刚跑过 03）。
--     若不确定，先跑 03 再跑本脚本。
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM grid_500m_refresh_state WHERE id = 1) THEN
        INSERT INTO grid_500m_refresh_state (id, last_max_gid, poi_count)
        SELECT 1, COALESCE(max(gid), 0), count(*) FROM poi;
        RAISE NOTICE '首次初始化：基线 gid=%，行数=%（假设当前 grid_500m 已是最新）',
                     (SELECT last_max_gid FROM grid_500m_refresh_state WHERE id=1),
                     (SELECT poi_count    FROM grid_500m_refresh_state WHERE id=1);
    END IF;
END $$;

-- ── 第 1 步：删除检测（必须先于任何计算）────────────────────────────
DO $$
DECLARE
    cur_cnt   bigint;
    saved_cnt bigint;
BEGIN
    SELECT count(*)             INTO cur_cnt   FROM poi;
    SELECT poi_count            INTO saved_cnt FROM grid_500m_refresh_state WHERE id = 1;
    IF cur_cnt < saved_cnt THEN
        RAISE EXCEPTION '检测到 POI 被删除（当前 % 行 < 上次 % 行）。增量刷新无法处理删除，请运行 03_refresh_grid_500m.sql 全量刷新。', cur_cnt, saved_cnt;
    END IF;
END $$;

-- ── 第 2 步：分母（与 03 相同，必须动态算）───────────────────────────
CREATE TEMP TABLE _denom ON COMMIT DROP AS
WITH base AS (
    SELECT count(*)                                       AS n_total,
           count(*) FILTER (WHERE category = 'school')    AS n_school,
           count(*) FILTER (WHERE category = 'hospital')  AS n_hospital,
           count(*) FILTER (WHERE category = 'mall')      AS n_mall,
           count(*) FILTER (WHERE category = 'park')      AS n_park
    FROM poi
),
area AS (
    SELECT ST_Area(ST_Union(geom)::geography) / 1000000.0 AS km2 FROM admin_area
),
circle AS (
    SELECT PI() * 0.8 * 0.8 AS km2
)
SELECT
    b.n_total    * c.km2 / a.km2 AS denom_total,
    b.n_school   * c.km2 / a.km2 AS denom_school,
    b.n_hospital * c.km2 / a.km2 AS denom_hospital,
    b.n_mall     * c.km2 / a.km2 AS denom_mall,
    b.n_park     * c.km2 / a.km2 AS denom_park
FROM base b, area a, circle c;

-- ── 第 3 步：找出本次新增的 POI ──────────────────────────────────────
CREATE TEMP TABLE _new_poi ON COMMIT DROP AS
SELECT p.gid, p.geom
FROM poi p
WHERE p.gid > (SELECT last_max_gid FROM grid_500m_refresh_state WHERE id = 1);

-- ── 第 4 步：新增 POI 影响的格子（实测每 POI 约 10 个）────────────────
CREATE TEMP TABLE _affected ON COMMIT DROP AS
SELECT DISTINCT g.gid AS grid_gid
FROM grid_500m g
JOIN _new_poi n ON ST_DWithin(n.geom, g.centroid, 0.0085);

DO $$
DECLARE
    n_poi  integer;
    n_cell integer;
BEGIN
    SELECT count(*) INTO n_poi  FROM _new_poi;
    SELECT count(*) INTO n_cell FROM _affected;
    IF n_poi = 0 THEN
        RAISE NOTICE '没有新增 POI，跳过重算（仅推进标记）';
    ELSE
        RAISE NOTICE '新增 POI: % 条，受影响格子: % 个', n_poi, n_cell;
    END IF;
END $$;

-- ── 第 5 步：受影响格子先置 0 ────────────────────────────────────────
--   必须做：第 6 步用 JOIN，重算后「变空」的格子不会出现在结果里。
UPDATE grid_500m
SET total = 0, school = 0, hospital = 0, mall = 0, park = 0
WHERE gid IN (SELECT grid_gid FROM _affected);

-- ── 第 6 步：只重算受影响格子 ────────────────────────────────────────
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
    WHERE g2.gid IN (SELECT grid_gid FROM _affected)
    GROUP BY g2.gid
) c
WHERE g.gid = c.grid_gid;

-- ── 第 7 步：全表重算倍数 ────────────────────────────────────────────
--   ★ 为什么是「全表」而不是「受影响格子」：
--     新增 POI 会改变全市总数 → 分母变化 → 所有格子的倍数都该跟着变。
--     这一句是纯算术（39,820 行 × 5 次除法），实测 1–2 秒，不必省。
UPDATE grid_500m g
SET r_total    = round((g.total    / d.denom_total)::numeric, 2),
    r_school   = round((g.school   / d.denom_school)::numeric, 2),
    r_hospital = round((g.hospital / d.denom_hospital)::numeric, 2),
    r_mall     = round((g.mall     / d.denom_mall)::numeric, 2),
    r_park     = round((g.park     / d.denom_park)::numeric, 2)
FROM _denom d;

-- ── 第 8 步：推进标记 ────────────────────────────────────────────────
UPDATE grid_500m_refresh_state
SET last_max_gid = (SELECT COALESCE(max(gid), 0) FROM poi),
    poi_count    = (SELECT count(*) FROM poi),
    refreshed_at = now()
WHERE id = 1;

COMMIT;

-- ── 验收 ─────────────────────────────────────────────────────────────
-- 1) 一致性（必须 0 / 0）
--      SELECT count(*) FILTER (WHERE school+hospital+mall+park <> total) AS mismatch,
--             count(*) FILTER (WHERE total IS NULL) AS nulls FROM grid_500m;
--
-- 2) 分母自检（必须 ≈ 1.0000）
--      SELECT round(avg(r_total)::numeric,4) AS avg_r FROM grid_500m;
--
-- 3) 抽查任意 5 格，与独立现查对比
--      SELECT g.gid, g.total AS stored,
--             (SELECT count(*) FROM poi
--              WHERE ST_DWithin(poi.geom::geography, g.centroid::geography, 800)) AS truth
--      FROM grid_500m g ORDER BY random() LIMIT 5;
--
-- ── 什么时候必须用 03 全量 ───────────────────────────────────────────
--   • 删除 POI             （本脚本会 RAISE EXCEPTION 拦截）
--   • 修改 POI 的坐标       （gid 不变，检测不到 → 静默漏算，务必手动跑 03）
--   • 整表重灌 / TRUNCATE   （gid 序列可能重启，检测失效）
--   • 修改 admin_area       （格子本身要重建：先 02 再 03）
