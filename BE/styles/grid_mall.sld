<?xml version="1.0" encoding="UTF-8"?>
<!--
  grid_mall.sld —— 500 m 格网商场可达性热力图
  用于：wuhan:grid_500m

  字段 r_mall = 800m 圆内商场数 ÷ 全市平均（1.14 家/圆）。
  江汉路那格 r_mall=84.27，是全市商场密度最高的一格。

  ★ 两个渲染上必须避开的坑（都是实测踩出来的）：
    ① 想"不画"某档时：给一个 <PolygonSymbolizer>，Fill 里写 fill 色 +
       fill-opacity=0，并且**绝对不要写 <Stroke>**。
       不能干脆省略 symbolizer —— SLD 1.0.0 的 XSD 要求 Rule 至少含一个
       Symbolizer，空 Rule 虽然能渲染，但 GeoServer 的「验证」会报
       cvc-complex-type.2.4.b：Rule 内容不完整。
    ② 不要描边。写 <Stroke> 哪怕 stroke-width=0，渲染器仍按发丝线画；
       39,820 个格子一起描边就是一张黑网。**整个 <Stroke> 元素都不要写**。

  配色来源：ColorBrewer「YlOrBr」
-->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>grid_mall</Name>
    <UserStyle>
      <Name>grid_mall</Name>
      <Title>500m 格网商场可达性热力图</Title>
      <Abstract>每个 500m 格子的中心 800m 步行圈内商场数量（相对于全市平均的倍数）。</Abstract>

      <FeatureTypeStyle>

        <!-- 空值保护：格网重建后未刷新时字段为 NULL，不画 -->
        <Rule>
          <Name>no_data</Name>
          <Title>未统计</Title>
          <ogc:Filter>
            <ogc:PropertyIsNull>
              <ogc:PropertyName>r_mall</ogc:PropertyName>
            </ogc:PropertyIsNull>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#ffffff</CssParameter>
              <CssParameter name="fill-opacity">0</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

        <!-- 第 1 档：< 0.2 → 透明（800m 内一个都没有） -->
        <Rule>
          <Name>band1_none</Name>
          <Title>无覆盖</Title>
          <ogc:Filter>
            <ogc:PropertyIsLessThan>
              <ogc:PropertyName>r_mall</ogc:PropertyName>
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

        <!-- 第 2 档：[0.2, 1) → #fee391 -->
        <Rule>
          <Name>band2</Name>
          <Title>0.2–1 倍平均</Title>
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsGreaterThanOrEqualTo>
                <ogc:PropertyName>r_mall</ogc:PropertyName>
                <ogc:Literal>0.2</ogc:Literal>
              </ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyIsLessThan>
                <ogc:PropertyName>r_mall</ogc:PropertyName>
                <ogc:Literal>1</ogc:Literal>
              </ogc:PropertyIsLessThan>
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#fee391</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

        <!-- 第 3 档：[1, 3) → #fec44f -->
        <Rule>
          <Name>band3</Name>
          <Title>1–3 倍平均</Title>
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsGreaterThanOrEqualTo>
                <ogc:PropertyName>r_mall</ogc:PropertyName>
                <ogc:Literal>1</ogc:Literal>
              </ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyIsLessThan>
                <ogc:PropertyName>r_mall</ogc:PropertyName>
                <ogc:Literal>3</ogc:Literal>
              </ogc:PropertyIsLessThan>
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#fec44f</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

        <!-- 第 4 档：[3, 10) → #fe9929 -->
        <Rule>
          <Name>band4</Name>
          <Title>3–10 倍平均</Title>
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsGreaterThanOrEqualTo>
                <ogc:PropertyName>r_mall</ogc:PropertyName>
                <ogc:Literal>3</ogc:Literal>
              </ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyIsLessThan>
                <ogc:PropertyName>r_mall</ogc:PropertyName>
                <ogc:Literal>10</ogc:Literal>
              </ogc:PropertyIsLessThan>
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#fe9929</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

        <!-- 第 5 档：[10, 25) → #d95f0e -->
        <Rule>
          <Name>band5</Name>
          <Title>10–25 倍平均</Title>
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsGreaterThanOrEqualTo>
                <ogc:PropertyName>r_mall</ogc:PropertyName>
                <ogc:Literal>10</ogc:Literal>
              </ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyIsLessThan>
                <ogc:PropertyName>r_mall</ogc:PropertyName>
                <ogc:Literal>25</ogc:Literal>
              </ogc:PropertyIsLessThan>
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#d95f0e</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

        <!-- 第 6 档：≥ 25 → #993404（最高档） -->
        <Rule>
          <Name>band6</Name>
          <Title>≥ 25 倍平均</Title>
          <ogc:Filter>
            <ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyName>r_mall</ogc:PropertyName>
              <ogc:Literal>25</ogc:Literal>
            </ogc:PropertyIsGreaterThanOrEqualTo>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#993404</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
