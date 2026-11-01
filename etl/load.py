"""写库：建表 / 幂等 UPSERT / 体检。

表是三方合同（ETL 写、GeoServer 读、Spring Boot 读），列名改动必须三方同步。
"""
import json
import logging

import psycopg2
import psycopg2.extras

DDL = """
CREATE TABLE IF NOT EXISTS poi (
  gid               bigserial PRIMARY KEY,
  amap_id           text UNIQUE NOT NULL,
  name              text NOT NULL,
  category          text NOT NULL,
  typecode          text,
  address           text,
  adcode            text,
  tel               text,
  lon               numeric(10,6) NOT NULL,
  lat               numeric(10,6) NOT NULL,
  geom              geometry(Point,4326) NOT NULL,
  raw               jsonb,
  detail            jsonb,
  detail_fetched_at timestamptz,
  source            text NOT NULL DEFAULT 'amap',
  fetched_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_poi_geom     ON poi USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_poi_category ON poi (category);
CREATE INDEX IF NOT EXISTS idx_poi_adcode   ON poi (adcode);
"""

UPSERT_TEMPLATE = """(
  %s, %s, %s, %s, %s, %s, %s, %s, %s,
  ST_SetSRID(ST_MakePoint(%s, %s), 4326),
  %s, %s, now()
)"""

UPSERT_SQL = """
INSERT INTO poi (amap_id, name, category, typecode, address, adcode, tel,
                 lon, lat, geom, raw, source, fetched_at)
VALUES %s
ON CONFLICT (amap_id) DO UPDATE SET
  name       = EXCLUDED.name,
  category   = EXCLUDED.category,
  typecode   = EXCLUDED.typecode,
  address    = EXCLUDED.address,
  adcode     = EXCLUDED.adcode,
  tel        = EXCLUDED.tel,
  lon        = EXCLUDED.lon,
  lat        = EXCLUDED.lat,
  geom       = EXCLUDED.geom,
  raw        = EXCLUDED.raw,
  source     = EXCLUDED.source,
  fetched_at = now()
"""

log = logging.getLogger("load")


def connect(pg: dict):
    return psycopg2.connect(**pg)


def ensure_schema(conn):
    """建表；若已存在同名旧表且缺列，给出明确迁移指令而不是静默出错。"""
    with conn.cursor() as cur:
        cur.execute(DDL)
        cur.execute(
            "select column_name from information_schema.columns where table_name='poi'"
        )
        cols = {r[0] for r in cur.fetchall()}
    conn.commit()

    required = {"amap_id", "name", "category", "geom", "raw", "detail", "detail_fetched_at"}
    missing = required - cols
    if missing:
        raise RuntimeError(
            f"poi 表结构不匹配（缺少 {sorted(missing)}）。\n"
            "如果是之前练习建的同名表，先留档改名再重跑：\n"
            "  ALTER TABLE poi RENAME TO poi_scratch_20261025;"
        )
    log.info("表结构就绪：poi(%d 列)", len(cols))


def upsert(conn, rows) -> int:
    if not rows:
        return 0
    values = [
        (r["amap_id"], r["name"], r["category"], r["typecode"], r["address"],
         r["adcode"], r["tel"], r["lon"], r["lat"],
         r["lon"], r["lat"],                    # ← 给 ST_MakePoint 用
         json.dumps(r["raw"], ensure_ascii=False), r["source"])
        for r in rows
    ]
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, UPSERT_SQL, values, template=UPSERT_TEMPLATE,
                                       page_size=200)
    conn.commit()
    return len(values)


def truncate(conn):
    with conn.cursor() as cur:
        cur.execute("TRUNCATE poi RESTART IDENTITY")
    conn.commit()
    log.warning("已清空 poi 表")


def check(conn) -> dict:
    """体检：分类分布 / 坐标范围 / SRID / 重复 / 空值。"""
    out = {}
    with conn.cursor() as cur:
        cur.execute("select count(*) from poi")
        out["total"] = cur.fetchone()[0]

        cur.execute("select category, count(*) from poi group by 1 order by 2 desc")
        out["by_category"] = cur.fetchall()

        cur.execute("select count(*) from poi where ST_SRID(geom) <> 4326")
        out["wrong_srid"] = cur.fetchone()[0]

        cur.execute("""select count(*) from poi
                       where lon not between 113.0 and 115.2
                          or lat not between 29.8 and 31.5""")
        out["out_of_bbox"] = cur.fetchone()[0]

        cur.execute("""select count(*) from (
                         select amap_id from poi group by 1 having count(*) > 1
                       ) t""")
        out["dup_amap_id"] = cur.fetchone()[0]

        cur.execute("select count(*) from poi where name is null or name = ''")
        out["empty_name"] = cur.fetchone()[0]

        cur.execute("select count(*) from poi where detail_fetched_at is not null")
        out["detail_fetched"] = cur.fetchone()[0]

        # 高德 adcode 与矢量边界口径不一致的条数（不是坐标错误，是归区差异）
        # 注意：admin_area.adcode 是 integer，poi.adcode 是 text，必须显式转型
        try:
            cur.execute("""select count(*) from poi p
                             join admin_area a on a.adcode::text = p.adcode
                            where not ST_Within(p.geom, a.geom)""")
            out["adcode_geom_mismatch"] = cur.fetchone()[0]
        except Exception:
            conn.rollback()
            out["adcode_geom_mismatch"] = None
    return out


def print_check(result: dict):
    print("── 体检结果 ─────────────────────────────")
    print(f"  总数            : {result['total']}")
    print(f"  分类分布        : " + ", ".join(f"{c}={n}" for c, n in result["by_category"]))
    print(f"  SRID≠4326       : {result['wrong_srid']}  (应为 0)")
    print(f"  越界坐标        : {result['out_of_bbox']}  (应为 0)")
    print(f"  重复 amap_id    : {result['dup_amap_id']}  (应为 0)")
    print(f"  空名称          : {result['empty_name']}  (应为 0)")
    print(f"  已补详情        : {result['detail_fetched']}")
    mismatch = result.get("adcode_geom_mismatch")
    if mismatch is not None:
        print(f"  归区口径差异    : {mismatch}  (高德 adcode 与矢量边界不一致，非坐标错误)")
