"""ETL 入口。

常用：
  python main.py --check                                   # 只看库里现状
  python main.py --dry-run                                 # 只打印计划，不联网
  python main.py --categories school --districts 420102 --max-requests 20   # 小样试探
  python main.py --categories school,hospital,mall,park --max-requests 500  # 全量（可中断，--resume 接着跑）
  python main.py --load-only --truncate                    # 从 raw 重放，0 次请求

退出码：0 正常 / 2 配额用尽（进度已保存）/ 3 配置或数据错误
"""
import argparse
import json
import logging
import sys
from pathlib import Path

import config
import load as loadmod
from config import CATEGORIES, DATA_RAW, DISTRICTS, LOGS
from manifest import Manifest
from normalize import normalize_many
from transform import amap_to_wgs84

log = logging.getLogger("etl")


# ── 工具 ────────────────────────────────────────────────────
def setup_logging(verbose=False):
    LOGS.mkdir(parents=True, exist_ok=True)
    stamp = __import__("time").strftime("%Y%m%d-%H%M%S")
    fmt = logging.Formatter("%(asctime)s %(levelname)-5s %(name)-6s %(message)s", "%H:%M:%S")
    root = logging.getLogger()
    root.setLevel(logging.DEBUG)
    sh = logging.StreamHandler(sys.stdout)
    sh.setLevel(logging.DEBUG if verbose else logging.INFO)
    sh.setFormatter(fmt)
    fh = logging.FileHandler(LOGS / f"run-{stamp}.log", encoding="utf-8")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(fmt)
    root.addHandler(sh)
    root.addHandler(fh)
    # ★ 安全：urllib3/requests 的 DEBUG 会把「带 key 的完整 URL」写进日志，必须静音
    for noisy in ("urllib3", "requests", "urllib3.connectionpool"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    return LOGS / f"run-{stamp}.log"


def identity_location(location: str):
    """OSM 的 location 已经是 WGS84，只做解析。"""
    try:
        lon, lat = (float(v) for v in location.split(",", 1))
        return lon, lat
    except Exception:
        return None


def parse_categories(raw: str):
    cats = [c.strip() for c in raw.split(",") if c.strip()]
    bad = [c for c in cats if c not in CATEGORIES]
    if bad:
        raise SystemExit(f"未知分类 {bad}，可选：{list(CATEGORIES)}")
    return cats


def parse_districts(raw: str):
    if not raw:
        return None
    codes = [d.strip() for d in raw.split(",") if d.strip()]
    known = dict(DISTRICTS)
    bad = [c for c in codes if c not in known]
    if bad:
        raise SystemExit(f"未知 adcode {bad}")
    return set(codes)


def build_tasks(districts, categories):
    return [(code, name, cat)
            for code, name in DISTRICTS
            if districts is None or code in districts
            for cat in categories]


def task_path(adcode, category) -> Path:
    return DATA_RAW / "amap" / adcode / f"{category}.json"


def save_raw(adcode, category, payload):
    p = task_path(adcode, category)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")


def dedupe(rows):
    """同一 amap_id 只能出现一次（否则 UPSERT 批量会报 cannot affect row a second time）。"""
    seen, out = set(), []
    for r in rows:
        if r["amap_id"] in seen:
            continue
        seen.add(r["amap_id"])
        out.append(r)
    return out


# ── 采集 ────────────────────────────────────────────────────
def fetch_amap(tasks, args, manifest, client):
    """返回 (rows, dropped, done_tasks, quota_hit)。quota_hit=True 时调用方仍应入库已有数据。"""
    from sources.amap import QuotaExhausted

    rows, dropped, done_tasks = [], 0, 0
    quota_hit = False

    for adcode, dname, cat in tasks:
        key = f"{adcode}|{cat}"
        if args.resume and manifest.is_done(key):
            log.info("[跳过] %s %s（已完成）", dname, cat)
            continue

        rule = CATEGORIES[cat]
        types = "|".join(rule["coarse"])
        pois = []
        total, pages = 0, 0
        try:
            pois, total, pages = client.collect(adcode, types)
            # ★ 真正的「触顶」信号是取满了 API 硬上限 200 条；
            #   count 与实际条数差一两条是常态（高德计数口径/失效 POI），不值得再花一轮细分。
            truncated = len(pois) >= 200
            if total != len(pois):
                log.info("  注：count=%s 实取 %d（差异 %d，非触顶）",
                         total, len(pois), total - len(pois))
            if truncated:
                log.warning("[触顶] %s %s count=%s 已取 200（上限）→ 用细分码重查",
                            dname, cat, total)
                seen = {p.get("id") for p in pois}
                for fine in rule["fine"]:
                    extra, _, _ = client.collect(adcode, fine)
                    for p in extra:
                        if p.get("id") not in seen:
                            seen.add(p.get("id"))
                            pois.append(p)
                truncated = False       # 已细分补齐
        except QuotaExhausted as exc:
            log.error("[中断] %s %s: %s —— 已取 %d 条，先入库再停", dname, cat, exc, len(pois))
            quota_hit = True
        except Exception as exc:
            log.error("[失败] %s %s: %s", dname, cat, exc)
            raise

        if pois:
            save_raw(adcode, cat, {"adcode": adcode, "district": dname, "category": cat,
                                   "count": total, "collected": len(pois), "pois": pois})
            task_rows, task_dropped = normalize_many(pois, amap_to_wgs84, "amap")
            dropped += task_dropped
            rows.extend(task_rows)
            log.info("[完成] %s %s：声明 %s 条 / 实取 %d / 入库候选 %d / 丢弃 %d",
                     dname, cat, total, len(pois), len(task_rows), task_dropped)
            if not quota_hit:
                manifest.mark(key, count=total, got=len(pois), pages=pages, done=True)
                done_tasks += 1
            else:
                manifest.mark(key, count=total, got=len(pois), pages=pages, done=False)

        if quota_hit or client.used >= args.max_requests:
            if not quota_hit:
                log.warning("达到本轮请求上限 %d，提前停止（进度已保存）", args.max_requests)
            break

    return rows, dropped, done_tasks, quota_hit


def fetch_osm(tasks, args, manifest):
    from sources.osm import OsmClient
    client = OsmClient(max_requests=max(5, args.max_requests // 40), logger=log)
    rows, dropped = [], 0
    for cat in sorted({t[2] for t in tasks}):
        key = f"osm|{cat}"
        if args.resume and manifest.is_done(key):
            log.info("[跳过] osm %s（已完成）", cat)
            continue
        pois, total = client.collect(cat)
        DATA_RAW.joinpath("osm").mkdir(parents=True, exist_ok=True)
        (DATA_RAW / "osm" / f"{cat}.json").write_text(
            json.dumps({"category": cat, "count": total, "pois": pois},
                       ensure_ascii=False), encoding="utf-8")
        cat_rows, cat_dropped = normalize_many(pois, identity_location, "osm")
        rows.extend(cat_rows)
        dropped += cat_dropped
        manifest.mark(key, count=total, got=len(pois), done=True)
        log.info("[完成] osm %s：%d 条 / 入库候选 %d / 丢弃 %d",
                 cat, total, len(cat_rows), cat_dropped)
    return rows, dropped, len(rows)


# ── 重放与检查 ──────────────────────────────────────────────
def replay_raw(conn):
    files = sorted(DATA_RAW.glob("amap/*/*.json"))
    if not files:
        raise SystemExit(f"{DATA_RAW} 下没有可重放的 raw 文件")
    rows, dropped = [], 0
    for f in files:
        payload = json.loads(f.read_text(encoding="utf-8"))
        task_rows, task_dropped = normalize_many(payload["pois"], amap_to_wgs84, "amap")
        rows.extend(task_rows)
        dropped += task_dropped
        log.info("重放 %s：%d 条", f.name, len(task_rows))
    rows = dedupe(rows)
    n = loadmod.upsert(conn, rows)
    log.info("重放完成：候选 %d（去重后 %d）/ 实写 %d / 丢弃 %d", len(rows), len(rows), n, dropped)


def main():
    ap = argparse.ArgumentParser(description="POI 采集 → PostGIS（武汉 13 区）")
    ap.add_argument("--source", choices=["amap", "osm"], default="amap")
    ap.add_argument("--categories", default=",".join(CATEGORIES))
    ap.add_argument("--districts", default="", help="逗号分隔 adcode，留空=13 区")
    ap.add_argument("--max-requests", type=int, default=config.MAX_REQUESTS)
    ap.add_argument("--dry-run", action="store_true", help="只打印计划，不联网")
    ap.add_argument("--no-resume", action="store_true", help="忽略 manifest，全部重跑")
    ap.add_argument("--load-only", action="store_true", help="从 raw 重放入库（0 请求）")
    ap.add_argument("--truncate", action="store_true", help="入库前清空 poi")
    ap.add_argument("--check", action="store_true", help="只做体检")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args()
    args.resume = not args.no_resume

    logfile = setup_logging(args.verbose)
    log.info("日志：%s", logfile)

    if args.check:
        conn = loadmod.connect(config.PG)
        loadmod.print_check(loadmod.check(conn))
        return 0

    if args.load_only:
        conn = loadmod.connect(config.PG)
        loadmod.ensure_schema(conn)
        if args.truncate:
            loadmod.truncate(conn)
        replay_raw(conn)
        loadmod.print_check(loadmod.check(conn))
        return 0

    categories = parse_categories(args.categories)
    districts = parse_districts(args.districts)
    tasks = build_tasks(districts, categories)

    log.info("计划：%d 个区 × %d 类 = %d 个任务；请求上限 %d；源 %s",
             len({t[0] for t in tasks}), len(categories), len(tasks),
             args.max_requests, args.source)
    if args.dry_run:
        log.info("最低请求数 = %d（每个任务至少 1 次）；触顶翻页/细分会更多", len(tasks))
        for code, name, cat in tasks:
            log.info("  %s %s %s", code, name, cat)
        return 0

    if args.source == "amap" and not config.AMAP_KEY:
        log.error("缺少 AMAP_KEY（etl/.env）")
        return 3

    manifest = Manifest(DATA_RAW / args.source / "manifest.json")
    log.info("manifest：%s", manifest.summary())

    quota_hit = False
    try:
        if args.source == "amap":
            from sources.amap import AmapClient
            client = AmapClient(config.AMAP_KEY, args.max_requests, log)
            try:
                rows, dropped, n_tasks, quota_hit = fetch_amap(tasks, args, manifest, client)
            finally:
                log.info("本轮实际请求 %d 次", client.used)
                manifest.data["requests_used"] = manifest.data.get("requests_used", 0) + client.used
                manifest.save()
        else:
            rows, dropped, n_tasks = fetch_osm(tasks, args, manifest)
    except Exception as exc:
        log.exception("采集失败：%s", exc)
        manifest.save()
        return 3

    rows = dedupe(rows)
    log.info("采集结束：任务 %d，去重后候选 %d 条，丢弃 %d 条（分类未命中/无坐标）",
             n_tasks, len(rows), dropped)

    conn = loadmod.connect(config.PG)
    loadmod.ensure_schema(conn)
    if args.truncate:
        loadmod.truncate(conn)
    n = loadmod.upsert(conn, rows)
    log.info("入库完成：写入/更新 %d 条", n)
    loadmod.print_check(loadmod.check(conn))

    if quota_hit:
        log.warning("因配额/上限中断：进度已保存，重跑同一命令会接着跑")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
