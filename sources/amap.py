"""高德 Web 服务（搜索类）客户端：限速 / 重试 / 配额识别 / 翻页。

设计要点：
  * 官方限制「同一请求参数翻页最多 200 条」→ offset=25 时最多 8 页；
    count > 已取条数 即为「触顶」，由调用方决定是否细分 typecode 重查。
  * 并发上限实测 3 次/秒 → 每次请求前固定 sleep（不要试探 0.33）。
  * 配额耗尽（10003/10044）不重试，直接抛 QuotaExhausted，让主流程停并写 manifest。
"""
import logging
import time

import requests

from config import MAX_PAGES, OFFSET, RETRIES, SLEEP, TIMEOUT

TEXT_URL = "https://restapi.amap.com/v3/place/text"

RETRYABLE = {"10004", "10021"}            # 访问过频 / 并发超限（可重试）
QUOTA = {"10003", "10044", "10045"}       # 配额耗尽（不可重试）
BADKEY = {"10001", "10005", "10006", "10007", "10009", "10012", "10013"}


class QuotaExhausted(RuntimeError):
    """配额或本轮上限用尽 —— 主流程应停止并保存进度。"""


class AmapError(RuntimeError):
    pass


class AmapClient:
    def __init__(self, key: str, max_requests: int = 500, logger=None):
        self.key = key
        self.max_requests = max_requests
        self.used = 0
        self.session = requests.Session()
        self.log = logger or logging.getLogger("amap")

    # ── 单次调用
    def _get(self, params: dict) -> dict:
        if not self.key:
            raise AmapError("缺少 AMAP_KEY（检查 etl/.env）")
        last_err = None
        for attempt in range(RETRIES + 1):
            if self.used >= self.max_requests:
                raise QuotaExhausted(f"已达本轮上限 {self.max_requests} 次")
            time.sleep(SLEEP)                       # 限速：固定节奏，别超 3 QPS
            self.used += 1
            try:
                resp = self.session.get(
                    TEXT_URL, params={**params, "key": self.key}, timeout=TIMEOUT
                )
                data = resp.json()
            except Exception as exc:                # 网络层
                last_err = exc
                if attempt < RETRIES:
                    time.sleep(1.5 * (attempt + 1))
                    continue
                raise AmapError(f"网络错误（第 {self.used} 次请求）: {exc}")

            if str(data.get("status", "")) == "1":
                return data

            code = str(data.get("infocode", ""))
            info = data.get("info", "")
            if code in QUOTA:
                raise QuotaExhausted(f"配额耗尽 {code} {info}")
            if code in RETRYABLE and attempt < RETRIES:
                self.log.warning("限流 %s %s，重试第 %d 次", code, info, attempt + 1)
                time.sleep(1.5 * (attempt + 1))
                continue
            if code in BADKEY:
                raise AmapError(f"KEY 无效/平台不匹配 {code} {info}（需 Web服务 类型 key）")
            raise AmapError(f"接口错误 {code} {info}")

        raise AmapError(f"重试仍失败: {last_err}")

    # ── 翻页取一个 (区, 类型串)
    def collect(self, adcode: str, types: str, max_pages: int = MAX_PAGES):
        """返回 (pois, count, pages)。count 是接口声明的真实总数。"""
        collected, total, pages = [], None, 0
        for page in range(1, max_pages + 1):
            data = self._get({
                "city": adcode,
                "citylimit": "true",
                "types": types,
                "offset": OFFSET,
                "page": page,
                "extensions": "all",
                "output": "JSON",
            })
            pages += 1
            if total is None:
                try:
                    total = int(data.get("count") or 0)
                except (TypeError, ValueError):
                    total = 0
            pois = data.get("pois") or []
            collected.extend(pois)
            self.log.info("  第 %d 页 +%d 条（累计 %d / 声明 %s）",
                          page, len(pois), len(collected), total)
            if len(pois) < OFFSET or len(collected) >= 200:
                break
        return collected, (total or 0), pages
