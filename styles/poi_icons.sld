<?xml version="1.0" encoding="UTF-8"?>
<!--
  wuhan:poi 高级样式：SVG 图钉 + 两级缩放 + 标签
  依赖图标（放在 GeoServer 的 data_dir/styles/icons/）：
    school.svg  hospital.svg  mall.svg  park.svg
  SLD 里的相对路径是相对「SLD 文件所在目录」解析的，所以写 icons/xxx.svg。

  两级缩放设计：
    · 拉远（比例尺 > 1:5万）：画 3 px 半透明小点，看的是整体分布，不糊
    · 拉近（比例尺 < 1:5万）：画 26 px 图钉，看的是具体设施
    · 更近（< 1:1.2万）：额外显示名称标签（带白色描边，压底图上可读）
-->
<StyledLayerDescriptor version="1.0.0"
    xmlns="http://www.opengis.net/sld"
    xmlns:ogc="http://www.opengis.net/ogc"
    xmlns:xlink="http://www.w3.org/1999/xlink"
    xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
    xsi:schemaLocation="http://www.opengis.net/sld http://schemas.opengis.net/sld/1.0.0/StyledLayerDescriptor.xsd">
  <NamedLayer>
    <Name>poi_icons</Name>
    <UserStyle>
      <Name>poi_icons</Name>
      <Title>POI 图钉样式（两级缩放）</Title>
      <Abstract>全市小点 → 街区级图钉 → 更近显示名称</Abstract>

      <FeatureTypeStyle>

        <!-- ══════ 第一级：拉远时的小点（MinScaleDenominator = 只在比例尺大于 1:5万 时生效）══════ -->
        <Rule>
          <Name>overview</Name>
          <Title>概览小点</Title>
          <MinScaleDenominator>50000</MinScaleDenominator>
          <PointSymbolizer>
            <Graphic>
              <Mark>
                <WellKnownName>circle</WellKnownName>
                <Fill><CssParameter name="fill">#37474F</CssParameter></Fill>
                <Stroke>
                  <CssParameter name="stroke">#FFFFFF</CssParameter>
                  <CssParameter name="stroke-width">0.4</CssParameter>
                </Stroke>
              </Mark>
              <!-- 透明度：让密集处叠出深浅，而不是死黑一片 -->
              <Opacity>0.45</Opacity>
              <Size>3</Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>

        <!-- ══════ 第二级：街区级的四类图钉（MaxScaleDenominator = 比例尺小于 1:5万 才生效）══════ -->
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
              <ExternalGraphic>
                <OnlineResource xlink:type="simple" xlink:href="http://localhost:8080/geoserver/www/icons/school.svg?v=4"/>
                <Format>image/svg+xml</Format>
              </ExternalGraphic>
              <Size>36</Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>

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
              <ExternalGraphic>
                <OnlineResource xlink:type="simple" xlink:href="http://localhost:8080/geoserver/www/icons/hospital.svg?v=4"/>
                <Format>image/svg+xml</Format>
              </ExternalGraphic>
              <Size>36</Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>

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
              <ExternalGraphic>
                <OnlineResource xlink:type="simple" xlink:href="http://localhost:8080/geoserver/www/icons/mall.svg?v=4"/>
                <Format>image/svg+xml</Format>
              </ExternalGraphic>
              <Size>36</Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>

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
              <ExternalGraphic>
                <OnlineResource xlink:type="simple" xlink:href="http://localhost:8080/geoserver/www/icons/park.svg?v=4"/>
                <Format>image/svg+xml</Format>
              </ExternalGraphic>
              <Size>36</Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>

        <!-- ══════ 第三级：再放大到 1:1.2万 以内，显示名称（白色描边保证压底图可读）══════ -->
        <Rule>
          <Name>label</Name>
          <Title>名称标签</Title>
          <MaxScaleDenominator>12000</MaxScaleDenominator>
          <TextSymbolizer>
            <Label>
              <ogc:PropertyName>name</ogc:PropertyName>
            </Label>
            <Font>
              <CssParameter name="font-family">Microsoft YaHei</CssParameter>
              <CssParameter name="font-size">11</CssParameter>
              <CssParameter name="font-weight">bold</CssParameter>
            </Font>
            <LabelPlacement>
              <PointPlacement>
                <AnchorPoint>
                  <AnchorPointX>0.5</AnchorPointX>
                  <AnchorPointY>1.6</AnchorPointY>
                </AnchorPoint>
              </PointPlacement>
            </LabelPlacement>
            <Halo>
              <Radius>2</Radius>
              <Fill><CssParameter name="fill">#FFFFFF</CssParameter></Fill>
            </Halo>
            <Fill><CssParameter name="fill">#263238</CssParameter></Fill>
            <!-- 防止标签互相压死：同一像素位置只画一个 -->
            <VendorOption name="conflictResolution">true</VendorOption>
            <VendorOption name="spaceAround">4</VendorOption>
          </TextSymbolizer>
        </Rule>

      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
