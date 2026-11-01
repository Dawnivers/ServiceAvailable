<?xml version="1.0" encoding="UTF-8"?>
<!--
  grid_total.sld —— 500 m 格网热力图（全部类别）
  用于：wuhan:grid_500m（字段 r_total = 相对全市平均的倍数）

  分级依据（roadmap §2.4.9）：
    r_total < 0.2      → 透明（实测恰好等于全部 26,786 个零值格，占 67.3%）
    0.2 ~ 1            → 浅黄  低于全市平均
    1 ~ 3              → 橙黄  略高于平均
    3 ~ 10             → 橙红  明显密集
    ≥ 10               → 深红  高度密集

  ★ 为什么第 1 档要透明而不是画灰色：
    39,820 格里 67.3% 是零值。如果画成灰块，地图有 2/3 被糊住，
    底图（天地图）完全看不见，信息全丢。透明后视觉焦点自动落在有覆盖的区块。

  ★ 为什么不画边框（stroke-width = 0）：
    39,820 个格子都描边会变成一张黑色网格，把颜色表达彻底压掉。
    去掉边框后，相邻同色格会连成一片，正好是热力图想要的效果。

  可调的三处：
    ① <CssParameter name="fill">  五个色值 —— 换配色方案只改这里
    ② <CssParameter name="fill-opacity">  0.78 —— 想让底图更清楚就调小
    ③ <ogc:Literal> 里的阈值 0.2 / 1 / 3 / 10 —— 改分档位置

  配色来源：ColorBrewer「YlOrRd」5 级，去掉最浅一级（留给"低于平均"之外的空值）
-->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>grid_total</Name>
    <UserStyle>
      <Name>grid_total</Name>
      <Title>500m 格网可达性热力图（全部类别）</Title>
      <Abstract>每个 500m 格子的中心 800m 步行圈内设施数，相对于全市平均的倍数。1 = 全市平均，10 = 平均的 10 倍。</Abstract>

      <FeatureTypeStyle>

        <!-- ① 空值保护：格网重建后未刷新时 r_total 为 NULL，不画 -->
        <!--
          ★★ 透明档的正确写法（2026-11-01 三组对照实验结论）★★

          正解 = 给一个 PolygonSymbolizer，但：
                  · Fill 里显式写 fill 色 + fill-opacity = 0
                  · 绝对不要写 <Stroke>

          两个反例（都踩过）：
            ① 只写 <Fill> 不写 symbolizer —— 渲染确实透明，但 GeoServer 的
               "验证"按钮会报 cvc-complex-type.2.4.b：Rule 内容不完整，
               SLD 1.0.0 的 XSD 要求 Rule 至少含一个 Symbolizer。存不下来。
            ② 写 <Stroke><CssParameter name="stroke-width">0</CssParameter> ——
               宽度 0 不等于"不描边"，渲染器把它当发丝线，
               39,820 个格子全描一圈，视觉上就是一张灰黑色网格，把整张图盖住。
               实测：一个 band1 格子的中心像素 alpha 仍是 0，
               但格子边缘全是线 —— 所以"看起来灰"不是填充的问题，是描边。

          结论：Fill + opacity 0 负责透明，不写 Stroke 负责不画线，两者缺一不可。
        -->
        <Rule>
          <Name>no_data</Name>
          <Title>未统计</Title>
          <ogc:Filter>
            <ogc:PropertyIsNull>
              <ogc:PropertyName>r_total</ogc:PropertyName>
            </ogc:PropertyIsNull>
          </ogc:Filter>

          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#ffffff</CssParameter>
              <CssParameter name="fill-opacity">0</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

        <!-- ② 第 1 档：< 0.2 → 透明（= 800m 内零设施，占 67.3%） -->
        <Rule>
          <Name>band1_none</Name>
          <Title>无覆盖（800m 内 0 个）</Title>
          <ogc:Filter>
            <ogc:PropertyIsLessThan>
              <ogc:PropertyName>r_total</ogc:PropertyName>
              <ogc:Literal>0.2</ogc:Literal>
            </ogc:PropertyIsLessThan>
          </ogc:Filter>

          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#ffffff</CssParameter>
              <CssParameter name="fill-opacity">0</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

        <!-- ③ 第 2 档：0.2 ≤ r < 1 → 浅黄（低于全市平均） -->
        <Rule>
          <Name>band2_low</Name>
          <Title>低于平均</Title>
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsGreaterThanOrEqualTo>
                <ogc:PropertyName>r_total</ogc:PropertyName>
                <ogc:Literal>0.2</ogc:Literal>
              </ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyIsLessThan>
                <ogc:PropertyName>r_total</ogc:PropertyName>
                <ogc:Literal>1</ogc:Literal>
              </ogc:PropertyIsLessThan>
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#fecc5c</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>

          </PolygonSymbolizer>
        </Rule>

        <!-- ④ 第 3 档：1 ≤ r < 3 → 橙黄（略高于平均） -->
        <Rule>
          <Name>band3_mid</Name>
          <Title>1–3 倍平均</Title>
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsGreaterThanOrEqualTo>
                <ogc:PropertyName>r_total</ogc:PropertyName>
                <ogc:Literal>1</ogc:Literal>
              </ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyIsLessThan>
                <ogc:PropertyName>r_total</ogc:PropertyName>
                <ogc:Literal>3</ogc:Literal>
              </ogc:PropertyIsLessThan>
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#fd8d3c</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>

          </PolygonSymbolizer>
        </Rule>

        <!-- ⑤ 第 4 档：3 ≤ r < 10 → 橙红（明显密集） -->
        <Rule>
          <Name>band4_high</Name>
          <Title>3–10 倍平均</Title>
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsGreaterThanOrEqualTo>
                <ogc:PropertyName>r_total</ogc:PropertyName>
                <ogc:Literal>3</ogc:Literal>
              </ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyIsLessThan>
                <ogc:PropertyName>r_total</ogc:PropertyName>
                <ogc:Literal>10</ogc:Literal>
              </ogc:PropertyIsLessThan>
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#f03b20</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>

          </PolygonSymbolizer>
        </Rule>

        <!-- ⑥ 第 5 档：10 ≤ r < 25 → 深红（高度密集） -->
        <!--   ★ 为什么从 10 再拆一刀到 25：
               不拆时市中心（江汉路一带）69% 的格子都落在 ≥10 这一档，
               渲染出来是一整片没有层次的深红。
               实测那些格子的 r_total 分布在 10.1–57.0、中位 19.7，
               说明内部确有梯度，拆在 25 能让"最核心"浮出来。 -->
        <Rule>
          <Name>band5_extreme</Name>
          <Title>10–25 倍平均</Title>
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsGreaterThanOrEqualTo>
                <ogc:PropertyName>r_total</ogc:PropertyName>
                <ogc:Literal>10</ogc:Literal>
              </ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyIsLessThan>
                <ogc:PropertyName>r_total</ogc:PropertyName>
                <ogc:Literal>25</ogc:Literal>
              </ogc:PropertyIsLessThan>
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#bd0026</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

        <!-- ⑦ 第 6 档：r ≥ 25 → 暗酒红（全市仅 118 格，最高 56.98） -->
        <Rule>
          <Name>band6_core</Name>
          <Title>≥ 25 倍平均</Title>
          <ogc:Filter>
            <ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyName>r_total</ogc:PropertyName>
              <ogc:Literal>25</ogc:Literal>
            </ogc:PropertyIsGreaterThanOrEqualTo>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#67000d</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
