"""OSM（Overpass）数据源：WGS84 原生，零纠偏。

与 amap.py 的区别只有两处：
  1. 端点换成 Overpass，需要 User-Agent，超时要给足（实测武汉全域单类 40~50 s）
  2. 坐标已经是 WGS84 → normalize 时用「恒等变换」代替 gcj02_to_wgs84

用法：
    python main.py --source osm --categories school,hospital --max-requests 10
"""
import logging
import time

import requests

OVERPASS = "https://overpass-api.de/api/interpreter"
MIRRORS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# 业务分类 → OSM tag 过滤表达式
OSM_TAGS = {
    "school": '["amenity"~"^(school|university|college|kindergarten)$"]',
    "hospital": '["amenity"~"^(hospital|clinic|doctors|pharmacy)$"]',
    "mall": '["shop"~"^(supermarket|mall|department_store|convenience)$"]',
    "park": '["leisure"~"^(park|garden)$"]',
}

WUHAN_BBOX = "30.30,113.70,30.90,114.65"   # south,west,north,east（Overpass 顺序）


class OsmError(RuntimeError):
    pass


class OsmClient:
    def __init__(self, max_requests: int = 50, logger=None, timeout: int = 120):
        self.max_requests = max_requests
        self.used = 0
        self.log = logger or logging.getLogger("osm")
        self.timeout = timeout
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": "wuhan-accessibility-etl/0.1 (learning)"})

    def _query(self, ql: str) -> dict:
        if self.used >= self.max_requests:
            raise OsmError(f"已达本轮上限 {self.max_requests} 次")
        self.used += 1
        last = None
        for url in MIRRORS:
            try:
                t0 = time.time()
                resp = self.session.post(url, data={"data": ql}, timeout=self.timeout)
                resp.raise_for_status()
                self.log.info("  Overpass 返回 (%.1fs, %d bytes)", time.time() - t0, len(resp.content))
                return resp.json()
            except Exception as exc:
                last = exc
                self.log.warning("  端点失败 %s: %s", url, exc)
        raise OsmError(f"所有 Overpass 端点失败: {last}")

    def collect(self, category: str, bbox: str = WUHAN_BBOX):
        """取一类 POI；node 与 way 都取（学校/医院常是建筑面），way 用 center 取代表点。"""
        tag = OSM_TAGS[category]
        ql = (
            f'[out:json][timeout:{self.timeout - 10}];'
            f'(node{tag}({bbox});way{tag}({bbox});relation{tag}({bbox}););'
            "out center tags;"
        )
        data = self._query(ql)
        elements = data.get("elements") or []
        pois = []
        for el in elements:
            tags = el.get("tags") or {}
            name = tags.get("name") or tags.get("name:zh")
            # node 有 lat/lon；way/relation 的坐标在 center 里
            lat = el.get("lat") or (el.get("center") or {}).get("lat")
            lon = el.get("lon") or (el.get("center") or {}).get("lon")
            if not name or lat is None or lon is None:
                continue
            pois.append({
                "id": f"osm:{el.get('type')}/{el.get('id')}",
                "name": name,
                "typecode": (tags.get("amenity") or tags.get("shop")
                             or tags.get("leisure") or ""),
                "type": (tags.get("amenity") or tags.get("shop")
                         or tags.get("leisure") or ""),
                "address": " ".join(filter(None, [tags.get("addr:district"),
                                                  tags.get("addr:street"),
                                                  tags.get("addr:housenumber")])),
                "adcode": None,
                "tel": tags.get("phone"),
                "location": f"{lon},{lat}",   # 已是 WGS84
            })
        return pois, len(pois)
