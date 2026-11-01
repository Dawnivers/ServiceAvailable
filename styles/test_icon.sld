<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.0.0" xmlns="http://www.opengis.net/sld" xmlns:ogc="http://www.opengis.net/ogc" xmlns:xlink="http://www.w3.org/1999/xlink">
  <NamedLayer><Name>test_icon</Name>
    <UserStyle><Name>test_icon</Name><Title>t</Title>
      <FeatureTypeStyle>
        <Rule>
          <Name>all</Name>
          <PointSymbolizer><Graphic>
            <ExternalGraphic>
              <OnlineResource xlink:type="simple" xlink:href="http://localhost:8080/geoserver/www/icons/school.png"/>
              <Format>image/png</Format>
            </ExternalGraphic>
            <Size>40</Size>
          </Graphic></PointSymbolizer>
        </Rule>
      </FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>