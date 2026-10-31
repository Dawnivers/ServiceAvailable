package com.dawnivers.be;

import com.dawnivers.be.dto.CoverageDto;
import com.dawnivers.be.dto.NearbyDto;
import com.dawnivers.be.dto.PoiDto;
import com.dawnivers.be.dto.WithinDto;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.client.TestRestTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

/**
 * 三个业务接口的 HTTP 层集成测试。
 * 期望值全部来自 psql 独立查询（见各方法注释），不从实现反推。
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class PoiApiTest {

    @Autowired
    private TestRestTemplate rest;

    // ── 信源：select count(*)...ST_DWithin(...800) → 124 / school 109 / park 3
    //          order by d limit 5 → 首行 武汉大学-教1楼, 53.0
    @Test
    void 学校周边800米_总数与分类分布对得上() {
        NearbyDto r = rest.getForObject(
                "/api/poi/nearby?lon=114.36&lat=30.54&radius=800",
                NearbyDto.class);

        assertThat(r).isNotNull();
        assertThat(r.count()).isEqualTo(124);
        assertThat(r.byCategory()).containsEntry("school", 109L);
        assertThat(r.byCategory()).containsEntry("park", 3L);

        // 自洽性：四类之和 == 总数（这条不依赖外部数值，纯内部一致性）
        long sum = r.byCategory().values().stream().mapToLong(Long::longValue).sum();
        assertThat(sum).isEqualTo(r.count());

        assertThat(r.nearest()).hasSize(5);
        assertThat(r.nearest().get(0).name()).isEqualTo("武汉大学-教1楼");
        assertThat(r.nearest().get(0).distanceM()).isCloseTo(53.0, within(0.5));
    }

    // ── 信源：420106 → total 1681, area_km2 100.06, park 119
    @Test
    void 覆盖统计_武昌区_密度与分类对得上() {
        CoverageDto r = rest.getForObject(
                "/api/stats/coverage?adcode=420106",
                CoverageDto.class);

        assertThat(r).isNotNull();
        assertThat(r.total()).isEqualTo(1681);
        assertThat(r.areaKm2()).isCloseTo(100.06, within(0.01));
        assertThat(r.perKm2()).isCloseTo(16.8, within(0.05));
        assertThat(r.byCategory()).containsEntry("park", 119L);
    }

    // ── 信源：gid=1 → 解放公园, tel 027-82421760, photos 3 张
    @Test
    void poi详情_解放公园_名字与照片数对得上() {
        PoiDto r = rest.getForObject("/api/poi/1", PoiDto.class);

        assertThat(r).isNotNull();
        assertThat(r.name()).isEqualTo("解放公园");
        assertThat(r.tel()).isEqualTo("027-82421760");
        assertThat(r.photos()).hasSize(3);
    }

    // ── 多边形范围统计 ──────────────────────────────────────────
    // 信源（psql 独立查询，同一个三角形）：
    //   select count(*) ... ST_Within(geom, 三角形)        → 125
    //   group by category                                  → school 98 / mall 14 / hospital 10 / park 3
    //   ST_Area(g::geography)/1e6                          → 5.8517 km²
    //   形心                                                → 114.366667, 30.536667
    //   距形心最近 3 条（order by "distanceM", gid）         → gid 2745, 106 m
    private static final String TRIANGLE =
            "POLYGON((114.35 30.53,114.38 30.52,114.37 30.56,114.35 30.53))";

    @Test
    void 多边形范围内_总数与分类分布对得上() {
        // ★ 不要把已经编码过的 URL 交给 TestRestTemplate：它会把 %20 再编码成 %2520。
        //   用模板变量 {wkt}，由它自己按 EncodingMode.TEMPLATE_AND_VALUES 编码一次。
        WithinDto r = rest.getForObject(
                "/api/poi/within?wkt={wkt}&limit={limit}",
                WithinDto.class,
                TRIANGLE, 3);

        assertThat(r).isNotNull();
        assertThat(r.count()).isEqualTo(125);
        assertThat(r.byCategory()).containsEntry("school", 98L);
        assertThat(r.byCategory()).containsEntry("mall", 14L);
        assertThat(r.byCategory()).containsEntry("hospital", 10L);
        assertThat(r.byCategory()).containsEntry("park", 3L);

        // 自洽性：四类之和 == 总数
        long sum = r.byCategory().values().stream().mapToLong(Long::longValue).sum();
        assertThat(sum).isEqualTo(r.count());

        assertThat(r.areaKm2()).isCloseTo(5.85, within(0.01));
        assertThat(r.centroid().lon()).isCloseTo(114.366667, within(0.0001));
        assertThat(r.centroid().lat()).isCloseTo(30.536667, within(0.0001));

        assertThat(r.items()).hasSize(3);
        assertThat(r.items().get(0).gid()).isEqualTo(2745L);
        assertThat(r.items().get(0).distanceM()).isCloseTo(106.0, within(1.0));
    }

    // 自相交多边形：ST_IsValid 判 false，必须 400 而不是"返回 0 条"
    @Test
    void 无效多边形_返回400而不是空结果() {
        String bad = "POLYGON((114.30 30.50,114.40 30.60,114.40 30.50,114.30 30.60,114.30 30.50))";

        ResponseEntity<String> resp = rest.getForEntity(
                "/api/poi/within?wkt={wkt}", String.class, bad);
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }

    // 非面类型（点）：不该走这个接口，直接 400
    @Test
    void 非多边形WKT_返回400() {
        ResponseEntity<String> resp = rest.getForEntity(
                "/api/poi/within?wkt={wkt}", String.class, "POINT(114.36 30.54)");
        assertThat(resp.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
    }
}