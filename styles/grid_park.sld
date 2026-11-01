<?xml version="1.0" encoding="UTF-8"?>
<!--
  grid_park.sld —— 500 m 格网公园可达性热力图
  用于：wuhan:grid_500m

  ★ 这张图故意用「原始个数」而不是倍数：
  公园只有 1,163 条，1 个公园就等于全市平均的 3.67 倍，
  按倍数分档会让 0.2~3 这一段完全空掉（实测 0 个格子落在该区间）。
  按个数分档：1 / 2 / 3 / ≥4，读者一眼就能对上。
  实测分布：0 个 34,598 / 1 个 2,849 / 2 个 1,043 / 3 个 538 / ≥4 个 792。

  ★ 两个渲染上必须避开的坑（都是实测踩出来的）：
    ① 想"不画"某档时，<Rule> 里**一个 symbolizer 都不要给**。
       只写 <Fill><CssParameter name="fill-opacity">0</...> 会回退成默认灰填充，
       整片格子变成灰块，底图全被糊住。
    ② 不要描边。写 <Stroke> 哪怕 stroke-width=0，仍会画出细线；
       39,820 个格子一起描边就是一张黑网。**整个 <Stroke> 元素都不要写**。

  配色来源：ColorBrewer「Greens」
-->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>grid_park</Name>
    <UserStyle>
      <Name>grid_park</Name>
      <Title>500m 格网公园可达性热力图</Title>
      <Abstract>每个 500m 格子的中心 800m 步行圈内公园数量（原始个数）。</Abstract>

      <FeatureTypeStyle>

        <!-- 空值保护：格网重建后未刷新时字段为 NULL，不画 -->
        <Rule>
          <Name>no_data</Name>
          <Title>未统计</Title>
          <ogc:Filter>
            <ogc:PropertyIsNull>
              <ogc:PropertyName>park</ogc:PropertyName>
            </ogc:PropertyIsNull>
          </ogc:Filter>
        </Rule>

        <!-- 第 1 档：< 1 → 透明（800m 内一个都没有） -->
        <Rule>
          <Name>band1_none</Name>
          <Title>800m 内 0 个</Title>
          <ogc:Filter>
            <ogc:PropertyIsLessThan>
              <ogc:PropertyName>park</ogc:PropertyName>
              <ogc:Literal>1</ogc:Literal>
            </ogc:PropertyIsLessThan>
          </ogc:Filter>
        </Rule>

        <!-- 第 2 档：[1, 2) → #c7e9c0 -->
        <Rule>
          <Name>band2</Name>
          <Title>1 个</Title>
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsGreaterThanOrEqualTo>
                <ogc:PropertyName>park</ogc:PropertyName>
                <ogc:Literal>1</ogc:Literal>
              </ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyIsLessThan>
                <ogc:PropertyName>park</ogc:PropertyName>
                <ogc:Literal>2</ogc:Literal>
              </ogc:PropertyIsLessThan>
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#c7e9c0</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

        <!-- 第 3 档：[2, 3) → #74c476 -->
        <Rule>
          <Name>band3</Name>
          <Title>2 个</Title>
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsGreaterThanOrEqualTo>
                <ogc:PropertyName>park</ogc:PropertyName>
                <ogc:Literal>2</ogc:Literal>
              </ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyIsLessThan>
                <ogc:PropertyName>park</ogc:PropertyName>
                <ogc:Literal>3</ogc:Literal>
              </ogc:PropertyIsLessThan>
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#74c476</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

        <!-- 第 4 档：[3, 4) → #31a354 -->
        <Rule>
          <Name>band4</Name>
          <Title>3 个</Title>
          <ogc:Filter>
            <ogc:And>
              <ogc:PropertyIsGreaterThanOrEqualTo>
                <ogc:PropertyName>park</ogc:PropertyName>
                <ogc:Literal>3</ogc:Literal>
              </ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyIsLessThan>
                <ogc:PropertyName>park</ogc:PropertyName>
                <ogc:Literal>4</ogc:Literal>
              </ogc:PropertyIsLessThan>
            </ogc:And>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#31a354</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

        <!-- 第 5 档：≥ 4 → #006d2c（最高档） -->
        <Rule>
          <Name>band5</Name>
          <Title>≥ 4 个</Title>
          <ogc:Filter>
            <ogc:PropertyIsGreaterThanOrEqualTo>
              <ogc:PropertyName>park</ogc:PropertyName>
              <ogc:Literal>4</ogc:Literal>
            </ogc:PropertyIsGreaterThanOrEqualTo>
          </ogc:Filter>
          <PolygonSymbolizer>
            <Fill>
              <CssParameter name="fill">#006d2c</CssParameter>
              <CssParameter name="fill-opacity">0.78</CssParameter>
            </Fill>
          </PolygonSymbolizer>
        </Rule>

      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
