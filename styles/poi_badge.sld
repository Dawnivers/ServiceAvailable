<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc">
  <NamedLayer><Name>poi_badge</Name>
    <UserStyle>
      <Name>poi_badge</Name>
      <Title>POI 徽章样式</Title>
      <Abstract>白环彩色圆 + 内嵌白色字形 + 柔光底；拉远自动收成小点，放大显示名称</Abstract>
      <FeatureTypeStyle>

        <Rule>
          <Name>overview</Name>
          <MinScaleDenominator>50000</MinScaleDenominator>
          <PointSymbolizer><Graphic>
            <Mark><WellKnownName>circle</WellKnownName>
              <Fill><CssParameter name="fill">#37474F</CssParameter></Fill>
              <Stroke><CssParameter name="stroke">#FFFFFF</CssParameter><CssParameter name="stroke-width">0.5</CssParameter></Stroke>
            </Mark><Opacity>0.5</Opacity><Size>4</Size>
          </Graphic></PointSymbolizer>
        </Rule>

        <Rule><Name>school</Name>
          <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>category</ogc:PropertyName><ogc:Literal>school</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
          <MaxScaleDenominator>50000</MaxScaleDenominator>
          <PointSymbolizer><Graphic>
            <Mark><WellKnownName>circle</WellKnownName><Fill><CssParameter name="fill">#FFFFFF</CssParameter></Fill></Mark>
            <Opacity>0.40</Opacity><Size>26</Size>
          </Graphic></PointSymbolizer>
          <PointSymbolizer><Graphic>
            <Mark><WellKnownName>circle</WellKnownName>
              <Fill><CssParameter name="fill">#1565C0</CssParameter></Fill>
              <Stroke><CssParameter name="stroke">#FFFFFF</CssParameter><CssParameter name="stroke-width">2.5</CssParameter></Stroke>
            </Mark><Size>17</Size>
          </Graphic></PointSymbolizer>
          <PointSymbolizer><Graphic>
            <Mark><WellKnownName>circle</WellKnownName><Fill><CssParameter name="fill">#FFFFFF</CssParameter></Fill></Mark>
            <Size>9</Size>
          </Graphic></PointSymbolizer>
        </Rule>

        <Rule><Name>hospital</Name>
          <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>category</ogc:PropertyName><ogc:Literal>hospital</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
          <MaxScaleDenominator>50000</MaxScaleDenominator>
          <PointSymbolizer><Graphic>
            <Mark><WellKnownName>circle</WellKnownName><Fill><CssParameter name="fill">#FFFFFF</CssParameter></Fill></Mark>
            <Opacity>0.40</Opacity><Size>26</Size>
          </Graphic></PointSymbolizer>
          <PointSymbolizer><Graphic>
            <Mark><WellKnownName>circle</WellKnownName>
              <Fill><CssParameter name="fill">#C62828</CssParameter></Fill>
              <Stroke><CssParameter name="stroke">#FFFFFF</CssParameter><CssParameter name="stroke-width">2.5</CssParameter></Stroke>
            </Mark><Size>17</Size>
          </Graphic></PointSymbolizer>
          <PointSymbolizer><Graphic>
            <Mark><WellKnownName>cross</WellKnownName><Fill><CssParameter name="fill">#FFFFFF</CssParameter></Fill></Mark>
            <Size>10</Size>
          </Graphic></PointSymbolizer>
        </Rule>

        <Rule><Name>mall</Name>
          <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>category</ogc:PropertyName><ogc:Literal>mall</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
          <MaxScaleDenominator>50000</MaxScaleDenominator>
          <PointSymbolizer><Graphic>
            <Mark><WellKnownName>circle</WellKnownName><Fill><CssParameter name="fill">#FFFFFF</CssParameter></Fill></Mark>
            <Opacity>0.40</Opacity><Size>26</Size>
          </Graphic></PointSymbolizer>
          <PointSymbolizer><Graphic>
            <Mark><WellKnownName>circle</WellKnownName>
              <Fill><CssParameter name="fill">#EF6C00</CssParameter></Fill>
              <Stroke><CssParameter name="stroke">#FFFFFF</CssParameter><CssParameter name="stroke-width">2.5</CssParameter></Stroke>
            </Mark><Size>17</Size>
          </Graphic></PointSymbolizer>
          <PointSymbolizer><Graphic>
            <Mark><WellKnownName>square</WellKnownName><Fill><CssParameter name="fill">#FFFFFF</CssParameter></Fill></Mark>
            <Size>9</Size>
          </Graphic></PointSymbolizer>
        </Rule>

        <Rule><Name>park</Name>
          <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>category</ogc:PropertyName><ogc:Literal>park</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
          <MaxScaleDenominator>50000</MaxScaleDenominator>
          <PointSymbolizer><Graphic>
            <Mark><WellKnownName>circle</WellKnownName><Fill><CssParameter name="fill">#FFFFFF</CssParameter></Fill></Mark>
            <Opacity>0.40</Opacity><Size>26</Size>
          </Graphic></PointSymbolizer>
          <PointSymbolizer><Graphic>
            <Mark><WellKnownName>circle</WellKnownName>
              <Fill><CssParameter name="fill">#2E7D32</CssParameter></Fill>
              <Stroke><CssParameter name="stroke">#FFFFFF</CssParameter><CssParameter name="stroke-width">2.5</CssParameter></Stroke>
            </Mark><Size>17</Size>
          </Graphic></PointSymbolizer>
          <PointSymbolizer><Graphic>
            <Mark><WellKnownName>triangle</WellKnownName><Fill><CssParameter name="fill">#FFFFFF</CssParameter></Fill></Mark>
            <Size>9</Size>
          </Graphic></PointSymbolizer>
        </Rule>

        <Rule><Name>label</Name>
          <MaxScaleDenominator>12000</MaxScaleDenominator>
          <TextSymbolizer>
            <Label><ogc:PropertyName>name</ogc:PropertyName></Label>
            <Font>
              <CssParameter name="font-family">Microsoft YaHei</CssParameter>
              <CssParameter name="font-size">11</CssParameter>
              <CssParameter name="font-weight">bold</CssParameter>
            </Font>
            <LabelPlacement><PointPlacement><AnchorPoint>
              <AnchorPointX>0.5</AnchorPointX><AnchorPointY>-0.8</AnchorPointY>
            </AnchorPoint></PointPlacement></LabelPlacement>
            <Halo><Radius>2</Radius><Fill><CssParameter name="fill">#FFFFFF</CssParameter></Fill></Halo>
            <Fill><CssParameter name="fill">#263238</CssParameter></Fill>
          </TextSymbolizer>
        </Rule>

      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>