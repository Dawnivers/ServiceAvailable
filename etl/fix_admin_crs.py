"""修复 admin_area 坐标系：GCJ-02 → WGS84（逐顶点转换）。

背景（2026-10-25 实测）：
    DataV 的区划面是 **GCJ-02（火星坐标）**，而 poi 表与天地图底图是 WGS84。
    判据：用高德原始 GCJ 坐标套区划面，adcode 归属一致率 99.3%；
          用转换后的 WGS84 坐标套，只有 95.2% → 说明区划面自己才是偏的那一方。

做法：
    不改数据库里的列结构，只把每个顶点做一次 gcj02_to_wgs84（逐点纯函数，
    相邻区共享的边界点会得到相同结果，所以 13 个区转换后依然严丝合缝）。
    center / centroid 是 float8[2] 的 [lon, lat] 数组，一并转换。

安全性：
    * 首次运行自动建 admin_area_gcj_backup 备份表（存在则跳过，不覆盖）
    * 默认 --dry-run，只打印不写库
    * 转换后自动复检：SRID、无效几何数、bbox 变化

用法：
    python fix_admin_crs.py            # 预览
    python fix_admin_crs.py --apply    # 真正写库
"""
import argparse
import json
import sys

import config
import load as loadmod
from transform import gcj02_to_wgs84, gcj_offset


def walk_coords(coords):
    """递归把 [[...]] 结构的坐标数组里的每个 [lon,lat] 转成 WGS84。"""
    if (isinstance(coords, list) and coords
            and isinstance(coords[0], (int, float))):
        lon, lat = float(coords[0]), float(coords[1])
        nlon, nlat = gcj02_to_wgs84(lon, lat)
        return [round(nlon, 7), round(nlat, 7)] + coords[2:]
    return [walk_coords(c) for c in coords]


def transform_geojson(gj: dict) -> tuple[dict, int]:
    """返回 (新 geojson, 顶点数)。"""
    coords = gj["coordinates"]
    count = _count_points(coords)
    return {"type": gj["type"], "coordinates": walk_coords(coords)}, count


def _count_points(coords):
    if coords and isinstance(coords[0], (int, float)):
        return 1
    return sum(_count_points(c) for c in coords)


def ab_metric(cur, label):
    """区县归属一致率：点落在哪个区 vs 高德给的 adcode。"""
    cur.execute("""
      select count(*) filter (where a.adcode::text = p.adcode), count(*)
      from poi p join admin_area a on ST_Within(p.geom, a.geom)
    """)
    same, total = cur.fetchone()
    pct = same / total * 100 if total else 0
    print(f"  {label:<22} 归属一致 {same:>6}/{total:>6} = {pct:5.1f}%")
    return pct


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="真正写库（默认只预览）")
    args = ap.parse_args()

    conn = loadmod.connect(config.PG)
    cur = conn.cursor()

    print("═══ 修复前 ═══")
    cur.execute("select count(*), count(distinct ST_SRID(geom)), count(*) filter (where not ST_IsValid(geom)) from admin_area")
    n, srids, invalid = cur.fetchone()
    print(f"  admin_area: {n} 行, SRID 种类 {srids}, 无效几何 {invalid}")
    cur.execute("""select round(ST_XMin(ST_Extent(geom))::numeric,4), round(ST_YMin(ST_Extent(geom))::numeric,4),
                          round(ST_XMax(ST_Extent(geom))::numeric,4), round(ST_YMax(ST_Extent(geom))::numeric)
                   from admin_area""")
    bbox_before = cur.fetchone()
    print(f"  整体 bbox: {bbox_before}")
    print("  区县归属一致率（此时区划面还是 GCJ）：")
    before = ab_metric(cur, "WGS84 点 vs GCJ 面")

    print("\n═══ 预览：江岸区前 3 个顶点 ═══")
    cur.execute("""select ST_AsGeoJSON(geom) from admin_area where adcode=420102""")
    gj = json.loads(cur.fetchone()[0])
    new_gj, npts = transform_geojson(gj)
    def first_ring(c):
        """一路下钻到"环"这一层：环的元素是 [lon, lat] 对。"""
        while (isinstance(c, list) and c
               and isinstance(c[0], list) and isinstance(c[0][0], list)):
            c = c[0]
        return c or []

    old_ring = first_ring(gj["coordinates"])[:3]
    new_ring = first_ring(new_gj["coordinates"])[:3]
    for (olon, olat), (nlon, nlat) in zip(old_ring, new_ring):
        print(f"  GCJ({olon:.6f}, {olat:.6f}) → WGS({nlon:.6f}, {nlat:.6f})  Δ({nlon-olon:+.6f}, {nlat-olat:+.6f})")
    print(f"  该区顶点总数: {npts}")

    if not args.apply:
        print("\n（预览模式，未写库。确认无误后加 --apply）")
        return 0

    # ── 备份（只建一次，不覆盖）
    cur.execute("select to_regclass('public.admin_area_gcj_backup')")
    if cur.fetchone()[0] is None:
        cur.execute("create table admin_area_gcj_backup as select * from admin_area")
        conn.commit()
        print("\n✅ 已建备份表 admin_area_gcj_backup（13 行原始 GCJ 数据）")
    else:
        print("\nℹ️  备份表已存在，跳过创建（不覆盖）")

    # ── 逐区转换
    print("\n═══ 开始转换 ═══")
    cur.execute("select adcode, name, ST_AsGeoJSON(geom), center, centroid from admin_area order by adcode")
    rows = cur.fetchall()
    for adcode, name, geom_json, center, centroid in rows:
        gj = json.loads(geom_json)
        new_gj, npts = transform_geojson(gj)
        new_center = walk_coords(list(center)) if center else None
        new_centroid = walk_coords(list(centroid)) if centroid else None
        cur.execute(
            """update admin_area
                  set geom = ST_SetSRID(ST_GeomFromGeoJSON(%s), 4326),
                      center = %s, centroid = %s
                where adcode = %s""",
            (json.dumps(new_gj), new_center, new_centroid, adcode),
        )
        print(f"  {name:<6} {adcode}  顶点 {npts:>5}  → WGS84")
    conn.commit()

    print("\n═══ 修复后 ═══")
    cur.execute("select count(*), count(distinct ST_SRID(geom)), count(*) filter (where not ST_IsValid(geom)) from admin_area")
    n2, srids2, invalid2 = cur.fetchone()
    print(f"  admin_area: {n2} 行, SRID 种类 {srids2}, 无效几何 {invalid2}")
    cur.execute("""select round(ST_XMin(ST_Extent(geom))::numeric,4), round(ST_YMin(ST_Extent(geom))::numeric,4),
                          round(ST_XMax(ST_Extent(geom))::numeric,4), round(ST_YMax(ST_Extent(geom))::numeric)
                   from admin_area""")
    print(f"  整体 bbox: {cur.fetchone()}   （修复前 {bbox_before}）")
    print("  区县归属一致率（区划面现在是 WGS，应该显著上升）：")
    after = ab_metric(cur, "WGS84 点 vs WGS84 面")

    print(f"\n  判据是否反转：{before:.1f}% → {after:.1f}%  " + ("✅ 符合预期" if after > before else "❌ 反常，检查转换方向"))
    print("  提示：GeoServer 里 admin_area 图层的 bbox 需要重算（recalculate=nativebbox,latlonbbox）")
    conn.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
