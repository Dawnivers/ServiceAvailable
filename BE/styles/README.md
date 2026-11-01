# BE/styles —— GeoServer 样式（SLD 源文件）

**这里是 SLD 的唯一真源。** GeoServer 里存的那份是「编译产物」：会丢注释、可能被错误编码，
排查问题时必须回到本目录的文件。

---

## 文件清单

### 格网热力图（D16，2026-11-01）

| 文件 | 判定字段 | 配色 | 阈值 | 说明 |
|---|---|---|---|---|
| `grid_total.sld` | `r_total` | YlOrRd | `.2 / 1 / 3 / 10 / 25` | 全部类别（图层默认样式） |
| `grid_school.sld` | `r_school` | Blues | `.2 / 1 / 3 / 10 / 25` | 学校 |
| `grid_hospital.sld` | `r_hospital` | Reds | `.2 / 1 / 3 / 10 / 25` | 医院 |
| `grid_mall.sld` | `r_mall` | YlOrBr | `.2 / 1 / 3 / 10 / 25` | 商场 |
| `grid_park.sld` | **`park`（个数）** | Greens | `1 / 2 / 3 / 4` | 公园，**唯一按绝对数量分档的** |

**为什么公园例外**：公园仅 1,163 条，基准分母 0.2727，「1 个公园」就等于 3.67 倍，
所以 0.2–3 这一段一个格子都没有（实测 0 个）。按倍数分档会出现两个空档，
图例写着区间却无对应格子。改按个数后：`1 / 2 / 3 / ≥4 个`，一眼能对上。

### POI 图层（D12 之前）

| 文件 | 用途 |
|---|---|
| `poi_icons.sld` | POI 图钉（图层当前默认样式） |
| `poi_badge.sld` | 带分类徽章的 POI |
| `poi_by_category.sld` | 按类别纯色圆点 + 缩放级别过滤 |
| `poi_icons_inline.sld` / `poi_icons_png.sld` | 内联 SVG / 外链 PNG 两种图标实现 |
| `test_icon.sld` | 图标调试用 |
| `ti_*.sld` | 天地图配色调试稿 |
| `png/school|hospital|mall|park.png` | POI 图标位图 |

---

## 发布到 GeoServer

```powershell
$b = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("admin:geoserver"))
$h = @{ Authorization = "Basic $b" }

# 新建（首次）
Invoke-WebRequest "http://localhost:8080/geoserver/rest/workspaces/wuhan/styles?name=grid_total" `
  -Method POST -Headers $h `
  -ContentType "application/vnd.ogc.sld+xml; charset=UTF-8" `
  -Body ([IO.File]::ReadAllBytes("BE/styles/grid_total.sld"))

# 覆盖（改样式）
Invoke-WebRequest "http://localhost:8080/geoserver/rest/workspaces/wuhan/styles/grid_total" `
  -Method PUT -Headers $h `
  -ContentType "application/vnd.ogc.sld+xml; charset=UTF-8" `
  -Body ([IO.File]::ReadAllBytes("BE/styles/grid_total.sld"))

# 绑定为图层默认样式
Invoke-WebRequest "http://localhost:8080/geoserver/rest/workspaces/wuhan/layers/grid_500m" `
  -Method PUT -Headers $h -ContentType "application/json" `
  -Body '{"layer":{"defaultStyle":{"name":"wuhan:grid_total"}}}'
```

---

## 三个必踩的坑

### ① `Content-Type` 必须带 `charset=UTF-8`

不带时 GeoServer 用**平台默认编码**解码请求体。中文 Windows = GBK，
于是 UTF-8 字节被当 GBK 读，中文全变成 `�`。

**隐蔽点**：渲染完全正常，看不出问题。但取回服务器上的文件检查会发现 U+FFFD 替换字符。

```powershell
$s = [Text.Encoding]::UTF8.GetString([IO.File]::ReadAllBytes("stored.sld"))
([regex]::Matches($s, [char]0xFFFD)).Count    # 必须为 0
```

「合法 UTF-8」≠「内容正确」，**必须查 U+FFFD**。

### ② 想「不画」某档时，Rule 里一个 symbolizer 都不要给

只写 `<Fill><CssParameter name="fill-opacity">0</CssParameter></Fill>` 会出问题；
写 `<Stroke><CssParameter name="stroke-width">0</CssParameter></Stroke>` 更糟——
宽度 0 被当成发丝线，39,820 个格子各描一圈，整片区变成一层灰网。

**正确做法：Rule 只有 `<ogc:Filter>`，没有 `<Fill>` / `<Stroke>` / `<PolygonSymbolizer>`。**

### ③ 注释会被 GeoServer 丢掉

SLD 里写得再详尽的说明，到服务器上都看不见。**想看设计意图只能回到本目录。**

---

## 验证

```
http://localhost:8080/geoserver/wuhan/wms?service=WMS&version=1.1.0&request=GetMap
  &layers=wuhan:grid_500m&styles=wuhan:grid_total
  &bbox=113.70,29.97,115.08,31.36&width=900&height=700
  &srs=EPSG:4326&format=image/png&transparent=true
```

或在 GeoServer 页面「图层预览」里看。

**前端切换样式不用换图层**：

```js
layer.getSource().updateParams({ STYLES: 'wuhan:grid_school' })
```
