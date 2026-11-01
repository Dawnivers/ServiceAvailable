"""把高德原始 POI 归一成中间格式（数据源无关）。

中间格式（load.py 只认这个形状）：
{
  "amap_id": "...", "name": "...", "category": "school",
  "typecode": "141201", "address": "...", "adcode": "420102",
  "tel": "", "lon": 114.3, "lat": 30.5, "raw": {...}, "source": "amap"
}

分类判定优先级：
  1. typecode 前缀（最稳，但码表要对）
  2. type 字符串的二级段（如 "科教文化服务;学校;高等院校" 里的 "学校"）
  3. 都不中 → None（该条丢弃并计数，便于发现码表错）
"""
from config import CATEGORIES


def _match_by_typecode(typecode: str):
    if not typecode:
        return None
    for cat, rule in CATEGORIES.items():
        for prefix in rule["coarse"] + rule["fine"]:
            # 高德码 6 位；用前缀匹配可以覆盖同族子类
            if typecode.startswith(prefix[:4]) and typecode[:6] == prefix:
                return cat
    return None


def _match_by_type(type_str: str):
    if not type_str:
        return None
    parts = [p.strip() for p in type_str.split(";") if p.strip()]
    for cat, rule in CATEGORIES.items():
        for seg in rule["segments"]:
            if any(seg in p for p in parts):
                return cat
    return None


def classify(poi: dict):
    return _match_by_typecode(poi.get("typecode", "")) or _match_by_type(poi.get("type", ""))


def normalize(poi: dict, amap_to_wgs84, source: str = "amap"):
    """单条高德 POI → 中间格式；坐标/分类不合法则返回 None。"""
    category = classify(poi)
    if category is None:
        return None

    loc = amap_to_wgs84(poi.get("location", ""))
    if loc is None:
        return None
    lon, lat = loc

    name = (poi.get("name") or "").strip()
    if not name:
        return None

    return {
        "amap_id": str(poi.get("id") or "").strip() or None,
        "name": name,
        "category": category,
        "typecode": (poi.get("typecode") or "").strip(),
        "address": (poi.get("address") or "").strip() or None,
        "adcode": (poi.get("adcode") or "").strip() or None,
        "tel": (poi.get("tel") or "").strip() or None,
        "lon": round(lon, 6),
        "lat": round(lat, 6),
        "raw": poi,
        "source": source,
    }


def normalize_many(pois, amap_to_wgs84, source="amap"):
    """返回 (rows, 丢弃数)。丢弃通常意味着分类码没覆盖到。"""
    rows, dropped = [], 0
    for p in pois:
        r = normalize(p, amap_to_wgs84, source)
        if r is None:
            dropped += 1
        else:
            rows.append(r)
    return rows, dropped
