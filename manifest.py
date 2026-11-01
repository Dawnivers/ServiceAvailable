"""断点续跑：把"哪些任务已完成"落到磁盘，而不是靠人记。

结构（data/raw/amap/manifest.json）：
{
  "started_at": "...",
  "requests_used": 12,
  "tasks": {
    "420102|school": {"count": 87, "got": 87, "pages": 4, "done": true, "ts": "..."},
    "420111|school": {"count": 431, "got": 200, "done": false, "truncated": true}
  }
}
"""
import json
import time
from pathlib import Path


class Manifest:
    def __init__(self, path):
        self.path = Path(path)
        self.data = {"started_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                     "requests_used": 0, "tasks": {}}
        if self.path.exists():
            try:
                self.data.update(json.loads(self.path.read_text(encoding="utf-8")))
            except json.JSONDecodeError:
                # 损坏就备份后重建，别让一次写坏导致全量重跑
                bak = self.path.with_suffix(".json.bak")
                self.path.replace(bak)

    # ── 查询
    def is_done(self, key: str) -> bool:
        return bool(self.data["tasks"].get(key, {}).get("done"))

    def get(self, key: str) -> dict:
        return self.data["tasks"].get(key, {})

    # ── 写入
    def mark(self, key: str, **fields):
        task = self.data["tasks"].setdefault(key, {})
        task.update(fields)
        task["ts"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
        self.save()

    def add_requests(self, n: int):
        self.data["requests_used"] += n
        self.save()

    def save(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(self.data, ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(self.path)      # 原子替换，避免写一半断电

    def summary(self) -> str:
        tasks = self.data["tasks"]
        done = sum(1 for t in tasks.values() if t.get("done"))
        trunc = sum(1 for t in tasks.values() if t.get("truncated"))
        return f"任务 {len(tasks)} 个（完成 {done}，触顶 {trunc}），已花请求 {self.data['requests_used']} 次"
