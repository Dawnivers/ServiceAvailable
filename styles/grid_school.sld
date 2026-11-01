<?xml version="1.0" encoding="UTF-8"?>
<!--
  grid_school.sld —— 500 m 格网学校可达性热力图
  用于：wuhan:grid_500m

  字段 r_school = 800m 圆内学校数 ÷ 全市平均（1.09 所/圆）。
  阈值与其他类别一致，便于横向对比；全市 76.9% 的格子在 800m 内没有学校。

  ★ 两个渲染上必须避开的坑（都是实测踩出来的）：
    ① 想"不画"某档时，<Rule> 里**一个 symbolizer 都不要给**。
       只写 <Fill><CssParameter name="fill-opacity">0</...> 会回退成默认灰填充，
       整片格子变成灰块，底图全被糊住。
    ② 不要描边。写 <Stroke> 哪怕 stroke-width=0，仍会画出细线；
       39,820 个格子一起描边就是一张黑网。**整个 <Stroke> 元素都不要写**。

  配色来源：ColorBrewer「Blues」
-->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>grid_school</Name>
    <UserStyle>
      <Name>grid_school</Name>
      <Title>500m 格网学校可达性热力图</Title>
      <Abstract>每个 500m 格子的中心 800m 步行圈内学校数量（相对于全市平均的倍数）。</Abstract>

      <FeatureTypeStyle>

        <!-- 空值保护：格网重建后未刷新时字段为 NULL，不画 -->
        <Rule>
          <Name>no_data</Name>
          <Title>未统计</Title>
          <ogc:Filter>
            <ogc:PropertyIsNull>
              <ogc:PropertyName>r_school</ogc:PropertyName>
            </ogc:PropertyIsNull>
          </ogc:Filter>
        </Rule>

        <!-- 第 1 档：< 0.2 → 透明（800m 内一个都没有） -->
        <Rule>
          <Name>band1_none</Name>
          <Title>无覆盖</Title>
          <ogc:Filter>
            <ogc:PropertyIsLessThan>
              <ogc:PropertyName>r_school</ogc:PropertyName>
              <ogc:Literal>0.2</ogc:Literal>
            </ogc:PropertyIsLessThan>
          </ogc:Filter>
        </Rule>

        <!-- 第 2 档：[0.2, 1) → #c6dbef -->
        <Rule>
          <Name>band2</Name>
          <Title>0.2–1 倍平均</Title>
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsGreaterThanOrEqualTo>
                <ogc:PropertyName>r_school</ogc:PropertyName>
                <ogc:Literal>0.2</ogc:Literal>
              </ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyIsLessThan>
                <ogc:PropertyName>r_school</ogc:PropertyName>
                <ogc:Literal>1</ogc:Literal>
              </ogc:PropertyIsLessThan>
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#c6dbef</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

        <!-- 第 3 档：[1, 3) → #6baed6 -->
        <Rule>
          <Name>band3</Name>
          <Title>1–3 倍平均</Title>
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsGreaterThanOrEqualTo>
                <ogc:PropertyName>r_school</ogc:PropertyName>
                <ogc:Literal>1</ogc:Literal>
              </ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyIsLessThan>
                <ogc:PropertyName>r_school</ogc:PropertyName>
                <ogc:Literal>3</ogc:Literal>
              </ogc:PropertyIsLessThan>
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#6baed6</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

        <!-- 第 4 档：[3, 10) → #4292c6 -->
        <Rule>
          <Name>band4</Name>
          <Title>3–10 倍平均</Title>
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsGreaterThanOrEqualTo>
                <ogc:PropertyName>r_school</ogc:PropertyName>
                <ogc:Literal>3</ogc:Literal>
              </ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyIsLessThan>
                <ogc:PropertyName>r_school</ogc:PropertyName>
                <ogc:Literal>10</ogc:Literal>
              </ogc:PropertyIsLessThan>
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#4292c6</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

        <!-- 第 5 档：[10, 25) → #2171b5 -->
        <Rule>
          <Name>band5</Name>
          <Title>10–25 倍平均</Title>
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsGreaterThanOrEqualTo>
                <ogc:PropertyName>r_school</ogc:PropertyName>
                <ogc:Literal>10</ogc:Literal>
              </ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyIsLessThan>
                <ogc:PropertyName>r_school</ogc:PropertyName>
                <ogc:Literal>25</ogc:Literal>
              </ogc:PropertyIsLessThan>
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#2171b5</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

        <!-- 第 6 档：≥ 25 → #08306b（最高档） -->
        <Rule>
          <Name>band6</Name>
          <Title>≥ 25 倍平均</Title>
          <ogc:Filter>
            <ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyName>r_school</ogc:PropertyName>
              <ogc:Literal>25</ogc:Literal>
            </ogc:PropertyIsGreaterThanOrEqualTo>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#08306b</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
