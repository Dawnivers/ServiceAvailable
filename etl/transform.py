"""GCJ-02（高德/腾讯/火星坐标） ⇄ WGS84（GPS/天地图/OSM）互转。

为什么要自己实现：
    高德官方「坐标转换」接口只做 `非高德坐标 → 高德坐标` 单向（coordsys=gps/baidu/mapbar），
    不提供 GCJ-02 → WGS84 的反向能力。而本项目底图是天地图（WGS84），数据必须纠偏。

为什么反向必须迭代：
    GCJ-02 的偏移量 **随经纬度变化**（正弦多项式），不是常数平移。
    所以「gcj - 固定偏移」这种写法误差可达几十~几百米；
    正确做法是把正向变换当作 f，用不动点迭代求 f⁻¹。

精度：3 次迭代后往返误差 < 1e-9 度（约 0.1 mm 级），远超需求。
"""
import math

# 克拉索夫斯基椭球参数（公开标准算法的固定常数，不是行业秘密，属查表性质）
A = 6378245.0
EE = 0.00669342162296594323
PI = math.pi


def out_of_china(lon: float, lat: float) -> bool:
    """境外不偏移（粗矩形判定，与主流实现一致）。"""
    return not (73.66 < lon < 135.05 and 3.86 < lat < 53.55)


def _transform_lat(x: float, y: float) -> float:
    """纬度方向偏移多项式。x/y 是「经度-105, 纬度-35」后的值。"""
    ret = (-100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y
           + 0.2 * math.sqrt(abs(x)))
    ret += (20.0 * math.sin(6.0 * x * PI) + 20.0 * math.sin(2.0 * x * PI)) * 2.0 / 3.0
    ret += (20.0 * math.sin(y * PI) + 40.0 * math.sin(y / 3.0 * PI)) * 2.0 / 3.0
    ret += (160.0 * math.sin(y / 12.0 * PI) + 320.0 * math.sin(y * PI / 30.0)) * 2.0 / 3.0
    return ret


def _transform_lon(x: float, y: float) -> float:
    """经度方向偏移多项式。"""
    ret = (300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y
           + 0.1 * math.sqrt(abs(x)))
    ret += (20.0 * math.sin(6.0 * x * PI) + 20.0 * math.sin(2.0 * x * PI)) * 2.0 / 3.0
    ret += (20.0 * math.sin(x * PI) + 40.0 * math.sin(x / 3.0 * PI)) * 2.0 / 3.0
    ret += (150.0 * math.sin(x / 12.0 * PI) + 300.0 * math.sin(x / 30.0 * PI)) * 2.0 / 3.0
    return ret


def _delta(lon: float, lat: float):
    """返回该点的 (经度偏移, 纬度偏移)，单位：度。"""
    dlat = _transform_lat(lon - 105.0, lat - 35.0)
    dlon = _transform_lon(lon - 105.0, lat - 35.0)
    radlat = lat / 180.0 * PI
    magic = math.sin(radlat)
    magic = 1 - EE * magic * magic
    sqrtmagic = math.sqrt(magic)
    dlat = (dlat * 180.0) / ((A * (1 - EE)) / (magic * sqrtmagic) * PI)
    dlon = (dlon * 180.0) / (A / sqrtmagic * math.cos(radlat) * PI)
    return dlon, dlat


def wgs84_to_gcj02(lon: float, lat: float):
    """WGS84 → GCJ-02（正向，有解析式）。"""
    if out_of_china(lon, lat):
        return lon, lat
    dlon, dlat = _delta(lon, lat)
    return lon + dlon, lat + dlat


def gcj02_to_wgs84(lon: float, lat: float, iterations: int = 3):
    """GCJ-02 → WGS84（反向，迭代逼近）。

    思路：
        wgs0 = gcj                      # 初值直接取目标点，误差约 500 m
        for _ in range(iterations):     # 3 次足够到 1e-9 度
            wgs += gcj - f(wgs)         # 用正向加密后的残差修正猜测
    """
    if out_of_china(lon, lat):
        return lon, lat
    wlon, wlat = lon, lat
    for _ in range(iterations):
        glon, glat = wgs84_to_gcj02(wlon, wlat)
        wlon += lon - glon
        wlat += lat - glat
    return wlon, wlat


def gcj_offset(lon: float, lat: float):
    """返回 GCJ 相对 WGS 的偏移量（度），用于自检与日志（武汉约 +0.004~0.006 / -0.001~-0.003）。"""
    return _delta(lon, lat)


# ── BD-09（百度）辅助，暂未在流程中使用，留给以后换底图 ──────────────
def bd09_to_gcj02(lon: float, lat: float):
    x_pi = PI * 3000.0 / 180.0
    x = lon - 0.0065
    y = lat - 0.006
    z = math.sqrt(x * x + y * y) - 0.00002 * math.sin(y * x_pi)
    theta = math.atan2(y, x) - 0.000003 * math.cos(x * x_pi)
    return z * math.cos(theta), z * math.sin(theta)


def gcj02_to_bd09(lon: float, lat: float):
    x_pi = PI * 3000.0 / 180.0
    z = math.sqrt(lon * lon + lat * lat) + 0.00002 * math.sin(lat * x_pi)
    theta = math.atan2(lat, lon) + 0.000003 * math.cos(lon * x_pi)
    return z * math.cos(theta) + 0.0065, z * math.sin(theta) + 0.006


def amap_to_wgs84(location: str):
    """高德 location 字符串 "lon,lat"（GCJ-02）→ (lon, lat) WGS84 浮点。

    返回 None 表示字段异常（高德可能给空串或 "0,0"）。
    """
    if not location or "," not in location:
        return None
    try:
        glon, glat = (float(v) for v in location.split(",", 1))
    except ValueError:
        return None
    if glon == 0 or glat == 0:
        return None
    return gcj02_to_wgs84(glon, glat)
