# etl/ · POI 采集 → PostGIS

离线的数据工具，**不参与任何在线请求**。契约文档：[spec.md](spec.md)。

## 环境

- Python **3.10.10**（`D:\python\python.exe`），已自带 `psycopg2` 与 `requests` → **无需安装**
- 换机器时：先设 `$env:PIP_CACHE_DIR='D:\pip-cache'` 再 `pip install -r requirements.txt`（用户要求缓存必须落 D 盘）
- 数据库 `Spatial`（大写 S），表 `poi`

## 配置

```powershell
copy .env.example .env
```
在 `.env` 里填 `AMAP_KEY` 与 `PGPASSWORD`（`.env` 已被 `.gitignore` 排除，永不提交）。

## 常用命令

```powershell
cd D:\WebGIS\web二维开发\openlayers服务平台开发\etl
```

```powershell
# 0. 看计划（不联网、不花配额）
python main.py --dry-run
```

```powershell
# 1. 小样试探：1 个区 1 类，最多 20 次请求
python main.py --categories school --districts 420102 --max-requests 20 -v
```

```powershell
# 2. 体检
python main.py --check
```

```powershell
# 3. 全量 13 区 × 4 类（可随时 Ctrl+C，下次自动接着跑）
python main.py --categories school,hospital,mall,park --max-requests 500
```

```powershell
# 4. 只重放入库（改分类映射/改表结构后用，0 次 API 请求）
python main.py --load-only --truncate
```

```powershell
# 5. OSM（零配额，WGS84 原生）
python main.py --source osm --categories school,hospital --max-requests 40
```

## 断点续跑

进度写在 `data/raw/{source}/manifest.json`：每个任务记 `count / got / done / truncated`。
- 中断后重跑同一条命令即可跳过已完成任务
- 想全部重来：加 `--no-resume` 或删掉 manifest

## 目录

```
etl/
├── spec.md            契约（字段/DDL/切分/验收/展示）
├── main.py            CLI 编排
├── config.py          区域、分类、限流、PG
├── transform.py       GCJ-02 ⇄ WGS84（含测试）
├── normalize.py       typecode → category
├── manifest.py        断点续跑
├── load.py            建表 / UPSERT / 体检
├── sources/           amap.py（搜索+翻页）、osm.py（Overpass）
├── tests/             python -m unittest discover -s tests -v
├── data/raw/          ← 不提交（原始响应，可重放）
└── logs/              ← 不提交（每次运行的日志）
```

## 自检

```powershell
python -m unittest discover -s tests -v
```

覆盖：境外不偏移、往返误差 <1e-9°、迭代确实收敛、武汉偏移量级（300–800 m）、location 解析异常。

## 红线

- `AMAP_KEY` 只在 `.env`，不进代码、不进文档、不进 git
- `data/raw/`、`*.sql` 不提交（高德数据再分发受限）
- 前端**绝不直连高德**（key 会泄露）；详情走自己的后端
