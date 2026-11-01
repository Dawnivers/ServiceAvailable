# BE · 武汉公共服务设施可达性分析平台（后端）

Spring Boot + PostGIS 的业务后端，为前端地图提供 GeoJSON 与统计接口。

- 技术栈：**Spring Boot 3.5.16 / JDK 17 / Maven / MyBatis 3.0.5 / PostgreSQL 18.4 + PostGIS**
- 端口：**8094**（前端 `FE` 通过 Vite proxy 把 `/api` 转发到这里）
- 数据来源：`etl` 离线采集入库（本仓库只读数据，不做写库）

---

## 1. 依赖环境

| 组件 | 版本 | 说明 |
|---|---|---|
| JDK | 17 | `java -version` 确认 |
| Maven | 3.9+ | 本地仓库需配镜像，否则首次构建很慢 |
| PostgreSQL | 18.4 | 需装 PostGIS 扩展 |
| 数据库 | 库名 `Spatial` | 表：`admin_area`(13 行)、`poi`(16016 行)，几何列为 `geom`，SRID 4326 |

Maven 镜像（`$MAVEN_HOME/conf/settings.xml` 的 `<mirrors>` 里加，注意要放在 `maven-default-http-blocker` **之前**）：

```xml
<mirror>
  <id>aliyun-public</id>
  <mirrorOf>central</mirrorOf>
  <url>https://maven.aliyun.com/repository/public</url>
</mirror>
```

---

## 2. 启动前必做（否则一定会失败）

数据库密码**不进仓库**，由 `application-local.properties` 提供，该文件在 `.gitignore` 里。clone 后必须先创建它：

```powershell
cd BE\src\main\resources
copy application-local.properties.example application-local.properties
```

然后编辑 `application-local.properties`，填入本机密码：

```properties
spring.datasource.password=你的密码
```

> 漏了这一步不会在启动时报错——Hikari 是懒启动，**第一次查库时才抛**
> `PSQLException: The server requested SCRAM-based authentication, but no password was provided`。

---

## 3. 启动

```powershell
cd BE
& 'D:\maven\bin\mvn.cmd' spring-boot:run
```

启动成功的日志（三行关键）：

```
The following 1 profile is active: "local"
Tomcat started on port 8094 (http) with context path '/'
Started BeApplication in ~1.2 seconds
```

验证：

```powershell
curl.exe -s http://localhost:8094/api/ping-db --max-time 20
# 期望：13
```

### Windows 上重启的两个坑

1. **改 Java / 改 properties / 改 pom 都必须重启**——本项目没装 devtools，没有热重载。
2. **Ctrl+C 常常只杀掉 mvn，fork 出来的 java 成孤儿继续占 8094**，表现为“代码改了还是旧行为（404 或旧数据）”。彻底重启：

```powershell
$c = Get-NetTCPConnection -LocalPort 8094 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($c) { Stop-Process -Id $c.OwningProcess -Force }
Start-Sleep -Seconds 2
"8094 -> " + (Get-NetTCPConnection -LocalPort 8094 -State Listen -ErrorAction SilentlyContinue | Measure-Object).Count
# 必须看到 8094 -> 0 再启动
```

**判断服务是否加载了新代码**：比对进程启动时间与源码修改时间。

```powershell
(Get-CimInstance Win32_Process -Filter "ProcessId=<PID>").CreationDate
(Get-Item src\main\java\com\dawnivers\be\controller\AreaController.java).LastWriteTime
```

---

## 4. 接口清单

| 方法 | 路径 | 说明 | 实测 |
|---|---|---|---|
| GET | `/api/hello` | Web 层探针，返回服务名/端口/时间 | 200, 88 bytes |
| GET | `/api/ping-db` | 数据库探针，返回 `admin_area` 行数 | 200, `13` |
| GET | `/api/areas` | 武汉 13 区边界 GeoJSON（WGS84） | 200, 85166 bytes |

### `GET /api/areas` 契约

```jsonc
{
  "type": "FeatureCollection",
  "features": [{
    "type": "Feature",
    "properties": {
      "adcode": 420107,                    // integer，行政区码
      "name": "青山区",
      "level": "district",
      "center": [114.3915169, 30.6364754]  // [lon, lat]
    },
    "geometry": {                          // 对象，不是字符串
      "type": "MultiPolygon",
      "coordinates": [/* 环 → 点 → [lon, lat] */]
    }
  }]
}
```

前端消费（注意投影转换）：

```js
const data = await (await fetch('/api/areas')).json();
new GeoJSON().readFeatures(data, {
  dataProjection: 'EPSG:4326',     // 后端是 WGS84
  featureProjection: 'EPSG:3857',  // 地图 View 是 3857，交给 OL 转换
});
```

---

## 5. 工程结构

```
src/main/java/com/dawnivers/be/
├── BeApplication.java          入口（@SpringBootApplication + @MapperScan）
├── controller/                 只管 HTTP：路径、方法、返回值
│   ├── HelloController.java
│   └── AreaController.java
├── service/                    业务与契约转换（String → JsonNode，将来 → DTO）
│   └── AreaService.java
└── mapper/                     MyBatis 接口，只跟数据库说话
    └── AreaMapper.java

src/main/resources/
├── application.properties      端口、数据源、profile、MyBatis 配置（进仓库）
├── application-local.properties        密码（不进仓库）
├── application-local.properties.example 模板（进仓库）
└── mapper/
    └── AreaMapper.xml          SQL 写在这里
```

**分层职责（改动时对照）**：

| 层 | 该出现 | 不该出现 |
|---|---|---|
| controller | `@GetMapping`、参数校验、返回 | SQL、Jackson、业务判断 |
| service | 编排、契约转换、业务规则 | `HttpServletRequest`、Mapper XML |
| mapper | SQL、参数占位 `?`、结果映射 | ObjectMapper、HTTP 任何东西 |

---

## 6. 配置说明

`application.properties`（进仓库，公共默认值）：

```properties
server.port=8094
spring.datasource.url=jdbc:postgresql://localhost:5432/Spatial
spring.datasource.username=postgres
spring.datasource.driver-class-name=org.postgresql.Driver
spring.profiles.active=local                                  # 加载 application-local.properties
mybatis.mapper-locations=classpath:mapper/**/*.xml
mybatis.configuration.map-underscore-to-camel-case=true
```

**profile 约定**：`spring.profiles.active=local` → 加载 `application-local.properties`（文件名模板 `application-{profile}.properties`）。后者优先级更高，同名键覆盖前者。

**生产部署**：不要往仓库或镜像里塞密码，用环境变量覆盖（优先级高于 properties）：

```powershell
$env:SPRING_DATASOURCE_PASSWORD='...'
```

---

## 7. 常见问题

| 现象 | 真因 | 处理 |
|---|---|---|
| 启动成功但接口 404，代码明明改了 | 旧 java 进程还在（孤儿） | 按 §3 彻底重启，比进程启动时间与源码时间 |
| `The server requested SCRAM-based authentication, but no password was provided` | 没建 `application-local.properties` | 按 §2 创建并填密码 |
| `FATAL: database "Spatial" does not exist` | 库名/实例不对 | 用 psql 直连确认 |
| `Invalid bound statement (not found): ...AreaMapper.countAreas` | XML 没加载 / namespace 不对 / id 不对 | 检查 `target\classes\mapper\` 有 XML；namespace = 接口全限定名；id = 方法名 |
| `required a bean of type '...AreaMapper' that could not be found` | 漏了 `@MapperScan` 或包名错 | 主类加 `@MapperScan("com.dawnivers.be.mapper")` |
| `mvn compile` 报 `BUILD SUCCESS` 但实际有错 | 增量编译按时间戳判断，被编辑器同秒编译骗过 | `mvn -B clean compile`，确认输出是 `Compiling N source files` 而非 `Nothing to compile` |
| 控制台中文显示乱码 | PowerShell 控制台编码 | 设 `$env:PYTHONIOENCODING='utf-8'`（python 输出）；Java 日志乱码不影响功能 |

---

## 8. 直接查库排查

```powershell
$env:PGCLIENTENCODING='UTF8'
$psql = 'D:\PostgreSQL18.4\data\18\bin\psql.exe'
& $psql -U postgres -h localhost -d Spatial -W -c "select count(*) from admin_area"
```

**排错的第一分叉点**：psql 通、Java 不通 → 配置/驱动问题；psql 也不通 → 数据库或网络问题。

---

## 9. 路线图

| 阶段 | 内容 | 状态 |
|---|---|---|
| D5 | 后端工程 + `/api/hello`、`/api/areas` | ✅ |
| D6 | 拆四层 + 接入 MyBatis | ✅ |
| D8–D9 | `/api/poi/{gid}`、`/api/poi/nearby`、`/api/stats` | 待做 |
| D10–D11 | `mvn test`（3 用例） | 待做 |

接口契约与前端配合细节见 `FE/docs/roadmap.md`。
