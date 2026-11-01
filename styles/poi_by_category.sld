<?xml version="1.0" encoding="UTF-8"?>
<!--
  POI 按类别分色 + 缩放级别过滤
  用于：wuhan:poi（category 取值：school / hospital / mall / park）

  可调的三处（都在 <Rule> 里）：
    MaxScaleDenominator  该规则生效的最大比例尺分母。50000 = 放大地图到 1:5万 以后才画点。
                         想在城市级（1:50万）就看见点，把它改成 500000。
    <Size>               点的直径（像素）
    <CssParameter name="fill">  填充色
-->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>poi_by_category</Name>
    <UserStyle>
      <Name>poi_by_category</Name>
      <Title>POI 按类别分色</Title>
      <Abstract>学校=蓝 医院=红 商场=橙 公园=绿；缩放到 1:5万 以内才显示，避免全市 1.6 万个点糊成一团</Abstract>

      <FeatureTypeStyle>
        <!-- ① 学校：蓝色圆 -->
        <Rule>
          <Name>school</Name>
          <Title>学校</Title>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>category</ogc:PropertyName>
              <ogc:Literal>school</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <MaxScaleDenominator>50000</MaxScaleDenominator>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>circle</WellKnownName>
                <Fill><CssParameter name="fill">#1E88E5</CssParameter></Fill>
                <Stroke>
                  <CssParameter name="stroke">#0D47A1</CssParameter>
                  <CssParameter name="stroke-width">1</CssParameter>
                </Stroke>
              </Mark>
              <Size>7</Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>

        <!-- ② 医院：红十字（用方形+红填充近似，SLD 1.0 没有内置十字） -->
        <Rule>
          <Name>hospital</Name>
          <Title>医院</Title>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>category</ogc:PropertyName>
              <ogc:Literal>hospital</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <MaxScaleDenominator>50000</MaxScaleDenominator>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>square</WellKnownName>
                <Fill><CssParameter name="fill">#E53935</CssParameter></Fill>
                <Stroke>
                  <CssParameter name="stroke">#B71C1C</CssParameter>
                  <CssParameter name="stroke-width">1</CssParameter>
                </Stroke>
              </Mark>
              <Size>7</Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>

        <!-- ③ 商场/超市：橙色菱形 -->
        <Rule>
          <Name>mall</Name>
          <Title>商场超市</Title>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>category</ogc:PropertyName>
              <ogc:Literal>mall</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <MaxScaleDenominator>50000</MaxScaleDenominator>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>triangle</WellKnownName>
                <Fill><CssParameter name="fill">#FB8C00</CssParameter></Fill>
                <Stroke>
                  <CssParameter name="stroke">#E65100</CssParameter>
                  <CssParameter name="stroke-width">1</CssParameter>
                </Stroke>
              </Mark>
              <Size>7</Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>

        <!-- ④ 公园：绿色圆，稍大 -->
        <Rule>
          <Name>park</Name>
          <Title>公园</Title>
          <ogc:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>category</ogc:PropertyName>
              <ogc:Literal>park</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </ogc:Filter>
          <MaxScaleDenominator>50000</MaxScaleDenominator>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>circle</WellKnownName>
                <Fill><CssParameter name="fill">#43A047</CssParameter></Fill>
                <Stroke>
                  <CssParameter name="stroke">#1B5E20</CssParameter>
                  <CssParameter name="stroke-width">1</CssParameter>
                </Stroke>
              </Mark>
              <Size>8</Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>

        <!-- ⑤ 兜底：category 不在上面四类时，灰色小点（防止数据漏画） -->
        <Rule>
          <Name>other</Name>
          <Title>其它</Title>
          <ogc:Filter>
            <ogc:PropertyIsNull>
              <ogc:PropertyName>category</ogc:PropertyName>
            </ogc:PropertyIsNull>
          </ogc:Filter>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>circle</WellKnownName>
                <Fill><CssParameter name="fill">#9E9E9E</CssParameter></Fill>
              </Mark>
              <Size>5</Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
