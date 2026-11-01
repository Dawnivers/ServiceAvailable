# ETL 实现契约（高德 / OSM POI 采集 → PostGIS）

> 状态：**草案 v0.1**（2026-10-25）
> 位置：`openlayers服务平台开发\etl\spec.md`（与 `FE`、`Project`、`data` 平级）
> 归属：本程序是**离线数据工具**，不参与任何在线请求。GeoServer 与 Java 后端只读它写出来的表。

---

## 1. 目的与非目标

**目的**：把高德（或 OSM）的 POI 拉下来，规范化后写入 `Spatial.poi`，一次采集、长期复用、可断点续跑、可离线重放。

**非目标（明确不做）**：
- ❌ 不做常驻服务、不做 REST 接口、不用 Flask/FastAPI 包一层
- ❌ 不在运行时供前端调用（前端只跟 GeoServer / 自己的后端说话）
- ❌ 不做数据镜像对外分发（合规红线）
- ❌ 不追求"绝对全量"（高德 200 条/查询上限决定了它做不到，见 §6）

---

## 2. 数据流

```
  ┌─────────────── 采集（联网，花配额）───────────────┐
  │  高德 REST API / Overpass API                      │
  │        ↓                                           │
  │  data/raw/{source}/{adcode}/{category}/{page}.json │  ← 真相层，永不删
  └────────────────────────────────────────────────────┘
                          ↓
  ┌─────────────── 规范化（离线，0 请求）──────────────┐
  │  normalize：typecode → category、GCJ→WGS84        │
  └────────────────────────────────────────────────────┘
                          ↓
  ┌─────────────── 入库（离线，0 请求）────────────────┐
  │  load：UPSERT 到 Spatial.poi                       │
  └────────────────────────────────────────────────────┘
                          ↓
        GeoServer 发布 poi 图层 / Spring Boot 查询 / 前端渲染
```

**关键性质**：`raw` 是真相层。**改分类映射、改表结构、改字段 = 从 raw 重放（`--load-only`），不联网、不花配额。**

---

## 3. 字段清单（采集什么）

### 3.1 字段来源对照

| 字段 | 来源 | 说明 |
|---|---|---|
| `id` | 列表搜索结果 | 高德 POI ID，**就是"设施编码"** |
| `name` | 列表搜索结果 | 名称 |
| `typecode` / `type` | 列表搜索结果 | 高德原始分类码 + 中文类型 |
| `location` | 列表搜索结果 | `"lon,lat"` 字符串，**GCJ-02** |
| `address` | 列表搜索结果 | 详细地址（可能为空） |
| `adcode` / `pname` / `cityname` / `adname` | 列表搜索结果 | 行政区归属（省/市/区） |
| `tel` | 列表搜索结果 | 电话，**大量为空**，详情页须做降级 |
| `business_area` / `biz_type` / `tag` | 列表搜索结果 | 商圈 / 行业类型 / 标签 |
| `photos` | 列表搜索结果 | 图片 URL 数组，**可能失效**，仅存档 |
| `category` | **本地计算** | `normalize` 按 `typecode` 归一（见 §5） |
| `lon` / `lat`（WGS84） | **本地计算** | `transform` 做 GCJ-02 → WGS84 |
| `geom` | **本地计算** | `ST_SetSRID(ST_MakePoint(lon, lat), 4326)` |
| `fetched_at` / `source` | **本地生成** | 采集时间 / 数据源 |
| `raw` | 整条 POI 原始 JSON | **兜底层**：以后想到要什么字段，重放即得 |

> ⚠️ **不确定项（落地时用一条真实响应核对，别照抄本文）**：
> - 列表接口到底返回哪些字段、哪些字段为空 —— 以你拿到的第一条真实 JSON 为准
> - 高德"搜索 POI 2.0"支持 **ID 搜索**（按 POI ID 查），它是否比列表返回更多字段（评分、营业时间等），需实测
> - 如果 ID 搜索确实更全，可作为**可选补抓模式**（`--enrich`），但默认不开（花配额）

### 3.2 最小必采集 vs 选配

```
必采（详情页离不开）：
  id, name, typecode, location, address, adcode, raw, fetched_at
选配（按需勾选）：
  tel, business_area, biz_type, tag, photos, pname/cityname/adname
```

---

### 3.3 按 ID 查详情（`--enrich`，可选模式）

**能力存在**：控制台「基础搜索服务」下有 `ID查询`（并发 3），与关键字搜索**共享 5000 次/月**配额。

| 版本 | 端点形态 | 限制 |
|---|---|---|
| v3 | `/v3/place/detail?id=<amap_id>` | 一次一个 ID，无批量 |
| v5 | 搜索 POI 2.0 的「ID 搜索」 | 同上，路径以官方文档为准 |

**详情相对列表的增量**（以实测为准，很多 POI 为空）：

| 字段 | 列表 | 详情 |
|---|---|---|
| `name/address/location/tel/typecode/adcode` | ✅ | ✅ 相同 |
| **`biz_ext`**（rating 评分 / cost 人均 / open_time 营业时间） | ❌ | ✅ **主要增量** |
| `photos` | 少量 | 更全 |

**成本算术（决定策略）**：

| 做法 | 请求数 | 折算 |
|---|---|---|
| 3 万条全量补详情 | 30,000 | **6 个月配额**（不可能） |
| 只补 Top 200 地标 | 200 | 占 4%，一次跑完 |
| 运行时按需 | 1/次点开 | 取决于访问量 |

**因此采用三层设计**：

```
① 采集层：列表搜索 → 全部可得字段 + raw jsonb 入库（0 额外请求）
② 补抓层（--enrich，可选）：传入 amap_id 清单（≤200）→ ID 查询 → 写回 detail jsonb
③ 运行层：前端 → 自己的后端 → 查库；仅当该 POI 无 detail 时才触发一次补抓并缓存
```

**纪律**：

- `--enrich` 默认**关闭**，必须显式传 `--enrich-ids ids.txt`（一行一个 amap_id），并受 `--max-requests` 约束
- 详情结果**必须落库**（写 `detail jsonb` 或合并进 `raw`），否则每次点开都重复扣配额
- **负缓存**：查过但结果为空的，也要写 `detail_fetched_at`（内容存 `'{}'::jsonb`）。判断"要不要查"用 `detail_fetched_at IS NULL`，**不能用 `detail IS NULL`**，否则空结果的点会被反复查询
- **失败不写缓存**：网络错误/超时不得写 `detail_fetched_at`，否则这次失败会被永久记住
- **并发去重**：同一 `amap_id` 同时只允许一个在飞请求（单机用进程内 `in-flight` 集合即可）
- 补详情是 `UPDATE`（POI 行已存在），不是 `INSERT`
- 前端**绝不直连高德**（key 泄露 + 配额被盗刷）
- 详情缺失是常态：详情页必须对 `biz_ext` 空值做降级；后端应返回固定 DTO，不透传高德原始 JSON

**边界澄清**：ID 查询只能拿到该 POI **自身属性**；「周边 800 m 有哪些设施」「到最近地铁站多远」「这个区有几个学校」**都不在详情接口里**，全部由本项目自己的 SQL（`ST_DWithin` / `GROUP BY`）计算——这正是"可达性分析"的价值所在。

---

## 4. 表结构（DDL 建议）

> 这张表是**三方合同**：ETL 写、GeoServer 读、Spring Boot 读。改动必须三方同步。

```sql
-- 在 Spatial 库执行（注意库名大写 S）
CREATE TABLE IF NOT EXISTS poi (
  gid         bigserial PRIMARY KEY,          -- 内部主键
  amap_id     text UNIQUE NOT NULL,           -- 高德 POI 编码（外部锚点，不可空）
  name        text        NOT NULL,
  category    text        NOT NULL,           -- 归一化分类：school/hospital/mall/park/...
  typecode    text,                           -- 高德原始码（细分筛选用）
  address     text,
  adcode      text,
  tel         text,
  lon         numeric(10,6) NOT NULL,         -- WGS84
  lat         numeric(10,6) NOT NULL,
  geom        geometry(Point,4326) NOT NULL,
  raw         jsonb,                          -- 原始 POI JSON
  detail      jsonb,                          -- ID 查询补抓结果；查过但为空时存 {}（负缓存）
  detail_fetched_at timestamptz,              -- NULL=没查过 / 非 NULL=查过（★判据用它，别用 detail IS NULL）
  source      text NOT NULL DEFAULT 'amap',
  fetched_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_poi_geom     ON poi USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_poi_category ON poi (category);
CREATE INDEX IF NOT EXISTS idx_poi_adcode   ON poi (adcode);
```

**三条硬约束**：

1. `amap_id UNIQUE` —— 幂等的基础（`ON CONFLICT (amap_id)`）
2. `geom` 必须是 `Point,4326` —— 与 `admin_area` 同坐标系，才能叠在一起
3. `category` 的取值域要固定（前端图例、GeoServer 的 SLD 都依赖它）

**编码的双层设计**：对外用 `gid`（你的 API `/api/poi/{gid}`），跨系统对齐用 `amap_id`。
高德的 POI 会合并/拆分/下线，`amap_id` 可能变 —— **它不是永久主键**，重跑采集时允许它对应到新的 `gid`。

> ⚠️ **实测坑（2026-10-25）**：`admin_area.adcode` 是 **integer**，本表 `adcode` 是 **text**。
> 跨表 JOIN 必须显式转型 `a.adcode::text = p.adcode`，否则报 `操作符不存在: integer = text`。

---

## 5. 分类映射（normalize 的唯一职责）

### 5.1 category 取值域（固定，不多不少）

```
school     学校（大/中/小/幼儿园/职校）
hospital   医院（综合/专科/诊所）
mall       商场（购物中心/超市/便利店）
park       公园（公园/广场/景点）
```

> 新增分类必须先改这里 + 前端图例 + SLD 样式，三处同步。

### 5.2 映射方式：用 `typecode` 前缀，不用关键词

```python
# 结构示意（值以官方码表为准，不要照抄我这里的数字）
TYPECODE_PREFIX = {
    "1412": "school",     # 学校（科教文化服务 → 学校）
    "0901": "hospital",   # 综合医院
    "0902": "hospital",   # 专科医院
    "0601": "mall",       # 购物中心
    "1101": "park",       # 公园
}
```

**官方码表**：https://lbs.amap.com/api/webservice/download （POI 分类编码 xlsx，2023-10-13 版）
→ 下载后按"一级/二级/三级"对照填前缀。**不要用 `keywords="学校"` 文本搜索**，那会混进"学校用品店"。

---

## 6. 取数策略（200 条上限的正解）

### 6.1 判据

```python
resp = call_api(area, category)
truncated = len(resp["pois"]) >= 200      # ★ 真正的触顶信号：取满了 API 硬上限
if not truncated:
    return resp["pois"]                   # ✅ 已经取全（即使 count 比实取多一两条）
# 否则：细分 typecode 重查
```

**两条实测教训（2026-10-25）**：

1. **不要用 `count > len(pois)` 判触顶**。高德的 `count` 与实际可返回条数常差 1–2 条（计数口径/失效 POI），
   曾因「江岸区 park：声明 93 / 实取 92」误触细分，白花 6 次请求。
   **判据只看是否取满 200**。
2. `count` 与实取的差值仍然记日志（`注：count=93 实取 92（差异 1，非触顶）`），它是数据质量信号，值得留痕。
3. **`count` 在 600 处封顶**（2026-10-25 实测）：江岸区 hospital、武昌区 school、武昌区 hospital 三个不同查询的 `count` 全部是 `600`，说明高德对 `count` 的返回有上限，**真实数量可能远大于 600**。
   推论：这类高密度分类（学校/医院）**永远拿不到"全量"**，只能拿到"细分码 + 200/页 能覆盖的部分"。若某类需要覆盖度评估，用 `got / 真实下界(600)` 记录覆盖率，别声称"全量"。

### 6.2 递归顺序（先粗后细）

```
第 1 层：13 个区 × N 类          （adcode 精确到区）
第 2 层：截断的区 → 2 km 网格     （polygon 或 bbox）
第 3 层：仍截断的格 → 细分 typecode（如 医院 → 综合/专科/诊所）
终止：count ≤ 200  或  网格 < MIN_SIZE(500m)
```

**终止时记日志**：哪些格子没取全（`truncated: true`），这决定热力图可信度，也是面试时的数据边界说明。

### 6.3 请求预算估算

```
请求数 ≈ 区数 × 类数 + Σ(截断格子数 × 每格页数)
示例：13 × 4 = 52（第 1 层）
      若 30% 触顶 → 约 16 个区×类 需要切 → 每切 4 格 → +64
      第 2 层仍触顶的再切 → 估算总计 150 ~ 400 次
```

**`--dry-run` 必须先能打印这个估算**，且与 `--max-requests` 比较，超了直接拒绝启动。

### 6.4 配额保护（必须实现）

- `--max-requests N`：硬上限，到点**立即停**并写 manifest（不是跑完再报错）
- 限速：默认 3 req/s，间隔 `time.sleep(0.35)`
- 重试：超时/5xx 重试 2 次，指数退避；`infocode` 表示配额耗尽 → **不重试，直接停**（并标记为可恢复）

### 6.5 本账号实测配额（2026-10-25 控制台）

| 组 | 月配额 | 当月已用 | 并发上限 | 结论 |
|---|---|---|---|---|
| **基础搜索服务**（关键字/周边/多边形/ID/输入提示） | **5000** | 62（关键字 33 + 输入提示 29） | **3 次/秒** | 剩余 ≈ 4938 |
| 基础 LBS（路径规划等） | 150000 | 6（公交 103、逆地理 240、坐标转换 17 已单列） | 3 | 与本程序无关 |
| JS 地图图面初始化 | 1500000 | 59 | 10 | 与本程序无关 |
| 天气预报 | 5000 | 1410 | 3 | ⚠️ 说明该账号还有别的项目在跑 |

**预算结论（13 区 × 4 类）**：第 1 层 52 次 + 触顶细分约 80 次 + 重试约 13 次 ≈ **150–300 次**，占剩余配额 3%~6%。
时间：300 次 @ 3 QPS ≈ **3 分钟**。

**参数定死**：

- `--max-requests 500`（第一轮；跑通后再放开）
- `sleep(0.35)`，顺序执行，**不开线程池**（3 QPS 的池子开并发只会互相触发限流）
- 配额耗尽 → 停 + 写 manifest，下次 `--resume`

**两条待验证（影响预算口径，用 1 次请求即可确认）**：

1. 5000 是**整组共享**还是**每服务各 5000**？发一条 `place/text`，看控制台是整体 -1 还是只有关键字那行 -1
2. 同一 key 是否与 `Translation_BE` 等共用（天气预报已用 1410 说明有别的项目）→ 若共用，建议给 ETL 单独建应用/key，避免跑到一半被抽干

---

## 7. 断点续跑与幂等

### 7.1 manifest

```jsonc
// data/raw/amap/manifest.json
{
  "started_at": "2026-10-25T10:00:00+08:00",
  "max_requests": 1500,
  "requests_used": 137,
  "tasks": {
    "420102|school|L1":   { "count": 87,  "got": 87,  "done": true },
    "420102|school|2km#3":{ "count": 214, "got": 200, "done": false, "subdivided": true }
  }
}
```

启动时先读 `manifest`，`done: true` 直接跳过。**"第二次不用继续"靠这个文件，不靠记忆。**

### 7.2 幂等入库

```sql
INSERT INTO poi (amap_id, name, category, typecode, address, adcode, tel,
                 lon, lat, geom, raw, source, fetched_at)
VALUES (%(amap_id)s, %(name)s, ...,
        ST_SetSRID(ST_MakePoint(%(lon)s, %(lat)s), 4326), %(raw)s, 'amap', now())
ON CONFLICT (amap_id) DO UPDATE SET
  name = EXCLUDED.name, category = EXCLUDED.category,
  geom = EXCLUDED.geom, lon = EXCLUDED.lon, lat = EXCLUDED.lat,
  raw  = EXCLUDED.raw,  fetched_at = EXCLUDED.fetched_at;
```

**重跑两次不产生重复行，也不报错** —— 这是能放心"接着跑"的前提。

---

## 8. CLI 契约

| 命令 | 作用 |
|---|---|
| `python main.py --source amap --dry-run --max-requests 1500` | 只算预算，不联网（或只打 1 次探活） |
| `python main.py --source amap --categories school,hospital --resume` | 采集（可中断，下次接着跑） |
| `python main.py --load-only --truncate` | **从 raw 重放入库，0 次请求** |
| `python main.py --check` | 跑体检 SQL（总数/分类分布/越界/重复） |
| `python main.py --source osm --categories school,hospital` | 换源，其余不变 |

---

## 9. 目录结构

```
etl/
├── spec.md               ← 本文
├── main.py               ← CLI 编排
├── config.py             ← 库连接、路径、分类映射、限速参数
├── manifest.py           ← 断点续跑
├── sources/
│   ├── amap.py           ← 请求 + 递归切分
│   └── osm.py            ← Overpass + (out center)
├── transform.py          ← GCJ-02 ↔ WGS84（★ 建议你自己写，我给测试）
├── normalize.py          ← typecode → category
├── load.py               ← DDL + UPSERT + 体检 SQL
├── requirements.txt      ← requests, psycopg2-binary（本机已有 psycopg2，先确认版本）
├── .env                  ← AMAP_KEY / PG 连接（.gitignore）
├── .env.example          ← 键名 + 占位符（可提交）
└── .gitignore            ← 排除 .env、data/raw/、*.sql、.venv/
```

**环境**：独立 venv 在 `etl/.venv`（D 盘），不碰系统 Python。

---

## 10. 验收标准（交付即按此验收）

| # | 判据 | 类型 |
|---|---|---|
| 1 | `--dry-run` 打印预计请求数，且 ≤ `--max-requests` | 机器 |
| 2 | 小样本（3 区 × 2 类）跑通，`SELECT category,count(*)` 与 `count` 对得上 | 机器 |
| 3 | `Ctrl+C` 后 `--resume` 接着跑，**不重复请求已完成任务** | 机器 |
| 4 | 连跑两次，`amap_id` 无重复行（幂等） | 机器 |
| 5 | 体检全绿：全在武汉 bbox 内、`SRID=4326`、无空坐标 | 机器 |
| 6 | **QGIS 叠天地图，随机 5 个 POI 落在正确建筑上** | 👁 人工 |
| 7 | `raw/` 能重放出同一批数据（断网 `--load-only` 可重建表） | 机器 |

第 6 条是纠偏正确性的**唯一硬证据**，其余是机器验收。

---

## 11. 合规与安全

| 项 | 要求 |
|---|---|
| API key | 只在 `etl/.env`，代码从 `os.environ` 读；**不进对话、不进 git** |
| 数据库密码 | 同上 |
| `data/raw/`、`*.sql` | `.gitignore`，**不随仓库公开**（高德数据再分发受限） |
| 对外表述 | README 写明「POI 数据仅本地学习演示，来源高德开放平台，不随代码分发」 |
| 采集量 | 控制在个人学习范围；不写通用采集工具、不公开数据包 |

---

## 12. 待你确认（填空表，回答后开工）

```
1  范围：      武汉 13 区（默认）／中心城区 4 区／含周边
2  分类：      学校/医院/商场/公园（默认）／再加 ____
3  口径：      typecode 前缀（默认）／keywords（不推荐）
4  字段：      amap_id,name,category,typecode,address,adcode,tel,lon,lat,geom,raw,fetched_at
               （删减：____）
5  量级：      几千／几万／十几万
6  坐标：      WGS84（默认）／同时保留 GCJ-02 原值
7  输出：      raw JSON + PostGIS（默认）／只要 JSON
8  表结构：    按 §4（默认）／改 ____
9  配额上限：  500 次/轮（建议值；账号剩余约 4938，3 QPS）
10 形态：      CLI（默认）／配置文件驱动
11 自己写哪块：transform.py（建议）／全都你写
```

---

## 13. 风险与假设

| 风险 | 影响 | 对策 |
|---|---|---|
| 高德配额不足以跑全域 | 数据有洞 | 先 `--dry-run` 估预算；只跑中心城区 |
| `count` 字段缺失或口径不同 | 无法判断是否截断 | 落地首条响应核对；退化为"等于 200 即视为截断" |
| GCJ→WGS84 写反 | 图上整体偏 500 m | 用测试用例 + 黄鹤楼人工核对 |
| 高德 POI ID 变动 | 重跑后 `gid` 变化 | 对外用 `amap_id`，内部 `gid` 不承诺稳定 |
| 与 `admin_area` 坐标系不一致 | 叠图错位 | 强制 4326，入库前断言行内 |
| `tel`/`photos` 大面积为空 | 详情页残缺 | 前端做降级，不当必有字段 |

---

## 14. 展示契约（前端怎么用这些数据）

> 这一节约束的是 **FE 与后端接口**，不是 ETL。但它和字段清单是同一份合同的两端，写在一起才好对照。

### 14.1 两条铁律

> **要对比 → 列固定；要阅读 → 缺就藏。**

| UI 类型 | 缺失字段怎么处理 | 原因 |
|---|---|---|
| **多行表格**（列表、统计） | **列固定**，缺值显示 `—` | 表格的价值是对齐；缺列会让行与行无法对比 |
| **详情面板**（看单个 POI） | **整行/整块不渲染** | 阅读型 UI，少一行不会造成理解困难，反而更干净 |

**禁止**：按“这一行有没有这个字段”动态增删表格列。

### 14.2 表格固定列（POI 列表）

```js
// 前端常量：列集合写死，永不按数据变化
const COLUMNS = [
  { key: 'name',     label: '名称',   width: 180 },
  { key: 'address',  label: '地址',   width: 260, empty: '—' },
  { key: 'category', label: '类别',   width: 90  },
  { key: 'adname',   label: '所属区', width: 100 },
  { key: 'tel',      label: '电话',   width: 130, empty: '—' },
]
```

渲染规则只有一句：`v-for="col in COLUMNS"`，值为 `null`/`undefined`/`''` 时输出 `col.empty ?? '—'`。

### 14.3 后端 DTO 契约（关键）

**键永远存在，缺值给 `null`；不要“省略这个键”。**

```json
{
  "gid": 10231,
  "amap_id": "B0FFH...",
  "name": "武汉大学",
  "category": "school",
  "typecode": "141201",
  "address": "武昌区珞珈山街道八一路299号",
  "adname": "武昌区",
  "tel": null,
  "lon": 114.3622,
  "lat": 30.5386,
  "photos": [],
  "biz_ext": null,
  "detail_fetched": false
}
```

三个必须遵守的点：

1. **固定键**：前端不需要判断 `'tel' in row`，只需要判断 `row.tel == null`
2. **`detail_fetched: boolean`**：让前端知道“是这个 POI 没有详情”还是“还没查过”，决定要不要显示“加载详情”按钮
3. **不透传高德原始 JSON**：`raw`/`detail` 留在库和服务端，接口只返回挑选过的字段（否则字段随高德版本漂移，前端天天崩）

### 14.4 三级降级

| 级别 | 范围 | 做法 | 例子 |
|---|---|---|---|
| 1 | **单元格** | 显示占位符 `—` / `暂无` | `tel`、`address` 缺失 |
| 2 | **区块** | 整块不渲染（不是列，是卡片里的一段） | 照片墙、评分/营业时间、团购信息 |
| 3 | **行** | 数据层就该过滤，不进库 | 无坐标、无名称的 POI |

### 14.5 详情面板骨架

```
┌─ 标题区 ────────────────┐   name + category 徽标（必有）
├─ 基本信息 ──────────────┤   address / tel / adname（缺则整行隐藏）
├─ 扩展信息 ──────────────┐   biz_ext.rating / open_time（有才渲染整块）
├─ 图片区 ────────────────┘   photos.length > 0 才渲染
└─ 空间信息 ──────────────┘   "本区 POI 数"、"800m 内设施数"（自己算，非高德字段）
```

Vue 里的形状（示意，代码你自己写）：

```vue
<!-- 区块级：有才渲染 -->
<div v-if="poi.biz_ext?.rating" class="block">评分 {{ poi.biz_ext.rating }}</div>

<!-- 行级：缺则隐藏 -->
<dl>
  <template v-if="poi.tel"><dt>电话</dt><dd>{{ poi.tel }}</dd></template>
</dl>
```

**注意区别**：`v-if` 用在**区块**和**行**上（阅读型），**不要**用它控制**表格列**。

### 14.6 什么时候才允许“动态列”

必须同时满足三条，才考虑从数据里推导列集合：

1. 列集合本身由**数据源/schema** 决定（不是由“这一行有没有值”决定）
2. 且**必须白名单固化**（扫描一次 → 人工确认 → 写死），不允许运行时每次重算
3. 且接受“数据更新列可能漂移”的代价，有版本化方案

**本项目不满足**：数据源固定两种（amap/osm）、字段集合固定 → 用不到动态列。

### 14.7 反例清单（明确不要做）

| ❌ 反例 | 为什么错 |
|---|---|
| 每行按自身字段增删列 | 锯齿状表格、无法对比、布局跳动 |
| `v-if` 控制表格列显隐 | 跟上面等价，只是写法更隐蔽 |
| 把一个 POI 的所有字段平铺成 20 列 | 信息过载；稀疏字段全是 `—` |
| 把 `raw`/`detail` 整包返给前端再“挑字段” | 字段漂移、体积浪费、DTO 契约失效 |
| 为了“电话列不空”去补抓全量详情 | 3 万条 = 6 个月配额（见 §3.3） |
| 详情缺失时显示“加载中”无限等待 | 要有超时与降级（返回列表字段先看） |
