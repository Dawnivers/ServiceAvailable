"""集中配置：路径 / 数据库 / 分类 / 区域 / 限流。

约定：所有会变的值都在这里，业务模块不写死数字。
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA_RAW = ROOT / "data" / "raw"
LOGS = ROOT / "logs"

# ── 武汉 13 区（adcode, 名称）────────────────────────────────
DISTRICTS = [
    ("420102", "江岸区"),
    ("420103", "江汉区"),
    ("420104", "硚口区"),
    ("420105", "汉阳区"),
    ("420106", "武昌区"),
    ("420107", "青山区"),
    ("420111", "洪山区"),
    ("420112", "东西湖区"),
    ("420113", "汉南区"),
    ("420114", "蔡甸区"),
    ("420115", "江夏区"),
    ("420116", "黄陂区"),
    ("420117", "新洲区"),
]
DISTRICT_NAME = dict(DISTRICTS)

# ── 业务分类 → 高德 types ────────────────────────────────────
# 说明：
#   coarse 用于第一轮检索（大类/中类码）
#   fine   在 coarse 结果触顶（count > 200）时用于细分重查
# 码值以官方《POI 分类编码》为准（https://lbs.amap.com/api/webservice/download），
# 跑完后用 `--check` 看各类条数，若某类为 0 说明码填错，改这里即可（raw 可重放）。
CATEGORIES = {
    "school": {
        "coarse": ["141200"],                                  # 学校（中类）
        "fine": ["141201", "141202", "141203", "141204",
                 "141205", "141206", "141207", "141208"],     # 高等/中学/小学/幼儿园/职校…
        "segments": ["学校", "高等院校", "中学", "小学", "幼儿园", "职业技术学校"],
    },
    "hospital": {
        "coarse": ["090100", "090200", "090300"],              # 综合医院 / 专科医院 / 诊所
        "fine": ["090100", "090200", "090300", "090400"],
        "segments": ["医院", "诊所", "卫生院", "急救", "社区卫生"],
    },
    "mall": {
        "coarse": ["060100", "060400"],                         # 购物中心 / 超市
        "fine": ["060100", "060400", "060200"],                 # + 便利店
        "segments": ["购物中心", "超市", "便利店", "商场"],
    },
    "park": {
        "coarse": ["110100"],                                   # 公园广场
        "fine": ["110101", "110102", "110103", "110105"],
        "segments": ["公园", "动物园", "植物园", "广场"],
    },
}

# ── 限流（控制台实测：搜索类并发上限 3 次/秒）────────────────
QPS = 3.0
SLEEP = 1.0 / QPS + 0.02          # ≈0.353s，别去试探 0.33
MAX_REQUESTS = 500                # 单轮默认硬上限
RETRIES = 2
TIMEOUT = 15

# 高德翻页：offset 最大 25，官方「同一参数翻页最多 200 条」
OFFSET = 25
MAX_PAGES = 8


def load_env(path: Path = ROOT / ".env") -> dict:
    """极简 .env 解析（不引入 python-dotenv，减少依赖）。"""
    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        s = line.strip()
        if not s or s.startswith("#") or "=" not in s:
            continue
        k, v = s.split("=", 1)
        env[k.strip()] = v.strip().strip("'").strip('"')
    return env


ENV = load_env()

AMAP_KEY = ENV.get("AMAP_KEY", "")

PG = {
    "host": ENV.get("PGHOST", "localhost"),
    "port": int(ENV.get("PGPORT", "5432")),
    "user": ENV.get("PGUSER", "postgres"),
    "password": ENV.get("PGPASSWORD", ""),
    "dbname": ENV.get("PGDATABASE", "Spatial"),
}
