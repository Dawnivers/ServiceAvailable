<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" xmlns:xlink="http://www.w3.org/1999/xlink">
  <NamedLayer>
    <Name>poi_icons_png</Name>
    <UserStyle>
      <Name>poi_icons_png</Name>
      <Title>POI 图钉 PNG</Title>
      <FeatureTypeStyle>
        <Rule>
          <Name>overview</Name>
          <MinScaleDenominator>50000</MinScaleDenominator>
          <PointSymbolizer>
            <Graphic>
              <Mark><WellKnownName>circle</WellKnownName>
                <Fill><CssParameter name="fill">#37474F</CssParameter></Fill>
                <Stroke><CssParameter name="stroke">#FFFFFF</CssParameter><CssParameter name="stroke-width">0.4</CssParameter></Stroke>
              </Mark>
              <Opacity>0.45</Opacity><Size>3</Size>
            </Graphic>
          </PointSymbolizer>
        </Rule>
        <Rule>
          <Name>school</Name>
          <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>category</ogc:PropertyName><ogc:Literal>school</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
          <MaxScaleDenominator>50000</MaxScaleDenominator>
          <PointSymbolizer><Graphic>
            <ExternalGraphic><OnlineResource xlink:type="simple" xlink:href="http://localhost:8080/geoserver/www/icons/school.png?v=3"/><Format>image/png</Format></ExternalGraphic>
            <Size>26</Size>
          </Graphic></PointSymbolizer>
        </Rule>
        <Rule>
          <Name>hospital</Name>
          <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>category</ogc:PropertyName><ogc:Literal>hospital</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
          <MaxScaleDenominator>50000</MaxScaleDenominator>
          <PointSymbolizer><Graphic>
            <ExternalGraphic><OnlineResource xlink:type="simple" xlink:href="http://localhost:8080/geoserver/www/icons/hospital.png?v=3"/><Format>image/png</Format></ExternalGraphic>
            <Size>26</Size>
          </Graphic></PointSymbolizer>
        </Rule>
        <Rule>
          <Name>mall</Name>
          <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>category</ogc:PropertyName><ogc:Literal>mall</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
          <MaxScaleDenominator>50000</MaxScaleDenominator>
          <PointSymbolizer><Graphic>
            <ExternalGraphic><OnlineResource xlink:type="simple" xlink:href="http://localhost:8080/geoserver/www/icons/mall.png?v=3"/><Format>image/png</Format></ExternalGraphic>
            <Size>26</Size>
          </Graphic></PointSymbolizer>
        </Rule>
        <Rule>
          <Name>park</Name>
          <ogc:Filter><ogc:PropertyIsEqualTo><ogc:PropertyName>category</ogc:PropertyName><ogc:Literal>park</ogc:Literal></ogc:PropertyIsEqualTo></ogc:Filter>
          <MaxScaleDenominator>50000</MaxScaleDenominator>
          <PointSymbolizer><Graphic>
            <ExternalGraphic><OnlineResource xlink:type="simple" xlink:href="http://localhost:8080/geoserver/www/icons/park.png?v=3"/><Format>image/png</Format></ExternalGraphic>
            <Size>28</Size>
          </Graphic></PointSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>