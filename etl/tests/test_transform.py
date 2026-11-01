"""transform.py 的自检。运行：python -m unittest discover -s tests -v （在 etl 目录下）"""
import math
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from transform import (  # noqa: E402
    amap_to_wgs84,
    gcj02_to_wgs84,
    gcj_offset,
    out_of_china,
    wgs84_to_gcj02,
)

# 武汉主城区范围（用于随机采样）
WUHAN = (113.70, 30.30, 114.65, 30.90)


def rand_wuhan(n=200, seed=42):
    random.seed(seed)
    xmin, ymin, xmax, ymax = WUHAN
    return [(random.uniform(xmin, xmax), random.uniform(ymin, ymax)) for _ in range(n)]


class TestOutOfChina(unittest.TestCase):
    def test_foreign_points_untouched(self):
        for lon, lat in [(0, 0), (-74.0, 40.7), (139.7, 35.7), (2.35, 48.85)]:
            self.assertEqual(wgs84_to_gcj02(lon, lat), (lon, lat))
            self.assertEqual(gcj02_to_wgs84(lon, lat), (lon, lat))

    def test_china_points_shifted(self):
        self.assertFalse(out_of_china(114.30, 30.55))
        wlon, wlat = 114.30, 30.55
        glon, glat = wgs84_to_gcj02(wlon, wlat)
        self.assertNotAlmostEqual(glon, wlon, places=6)
        self.assertNotAlmostEqual(glat, wlat, places=6)


class TestRoundTrip(unittest.TestCase):
    """核心断言：转过去再转回来，必须回到原点（否则说明迭代写错）。"""

    def test_wgs_to_gcj_and_back(self):
        for lon, lat in rand_wuhan():
            glon, glat = wgs84_to_gcj02(lon, lat)
            back_lon, back_lat = gcj02_to_wgs84(glon, glat)
            self.assertLess(abs(back_lon - lon), 1e-9, f"lon 漂移 {lon}")
            self.assertLess(abs(back_lat - lat), 1e-9, f"lat 漂移 {lat}")

    def test_three_iterations_enough(self):
        """3 次迭代后，把结果再正向加密应几乎回到原始 GCJ 点。

        阈值取 1e-9 度（≈0.1 mm）：3 次迭代的残差约 2e-10，已是双精度浮点极限；
        再收紧就是在测浮点误差，不是在测算法。
        """
        for lon, lat in rand_wuhan(50):
            glon, glat = wgs84_to_gcj02(lon, lat)   # 造一个合法的 GCJ 点
            wlon, wlat = gcj02_to_wgs84(glon, glat, iterations=3)
            rlon, rlat = wgs84_to_gcj02(wlon, wlat)
            self.assertLess(abs(rlon - glon), 1e-9)
            self.assertLess(abs(rlat - glat), 1e-9)

    def test_one_iteration_is_worse(self):
        """证明"迭代"确实在收敛，而不是随便转一次就完事。"""
        lon, lat = 114.30, 30.55
        glon, glat = wgs84_to_gcj02(lon, lat)
        e3 = math.dist(gcj02_to_wgs84(glon, glat, 3), (lon, lat))
        e1 = math.dist(gcj02_to_wgs84(glon, glat, 1), (lon, lat))
        self.assertLess(e3, e1)


class TestMagnitude(unittest.TestCase):
    """量级断言：抓单位错乱（写成度/米混淆）、符号错（写成常数平移）。"""

    def test_wuhan_offset_range(self):
        for lon, lat in rand_wuhan(30):
            dlon, dlat = gcj_offset(lon, lat)
            # 武汉：GCJ 相对 WGS 约 东移 0.004~0.006 度、北移/南移 0.001~0.003 度
            self.assertTrue(0.002 < dlon < 0.008, f"经度偏移异常 {dlon}")
            self.assertTrue(0.0005 < abs(dlat) < 0.005, f"纬度偏移异常 {dlat}")

    def test_offset_varies_with_position(self):
        """偏移量必须随位置变化（若恒定 = 写成了常数平移，错误实现）。"""
        d1 = gcj_offset(114.30, 30.55)
        d2 = gcj_offset(114.60, 30.80)
        self.assertNotAlmostEqual(d1[0], d2[0], places=6)

    def test_offset_distance_under_1km(self):
        """偏移折成米应在 300~800 m 量级（1 度经度 ≈ 96 km @30.5°N）。"""
        for lon, lat in rand_wuhan(20):
            dlon, dlat = gcj_offset(lon, lat)
            meters = math.hypot(dlon * 96000, dlat * 111000)
            self.assertTrue(200 < meters < 1000, f"偏移 {meters:.0f} m 不合理")


class TestAmapLocation(unittest.TestCase):
    def test_parse_ok(self):
        lon, lat = amap_to_wgs84("114.306600,30.546100")
        self.assertAlmostEqual(lon, 114.3021, places=2)   # 转完应回到 ~114.30
        self.assertAlmostEqual(lat, 30.5478, places=2)

    def test_parse_bad(self):
        for bad in ("", "abc", "0,0", "114.3", None):
            self.assertIsNone(amap_to_wgs84(bad))


if __name__ == "__main__":
    unittest.main(verbosity=2)
