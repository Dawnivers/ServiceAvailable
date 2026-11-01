<?xml version="1.0" encoding="UTF-8"?>
<StyledLayerDescriptor version="1.1.0"
  xmlns="http://www.opengis.net/sld"
  xmlns:se="http://www.opengis.net/se"
  xmlns:ogc="http://www.opengis.net/ogc"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <NamedLayer>
    <se:Name>poi_icons_v2</se:Name>
    <UserStyle>
      <se:Name>poi_icons_v2</se:Name>
      <se:Title>POI 图钉（内嵌 PNG 图标）</se:Title>
      <se:Abstract>拉远小点 / 街区图钉 / 更近显名字；图标以 base64 内嵌，不依赖外部 URL</se:Abstract>
      <se:FeatureTypeStyle>

        <se:Rule>
          <se:Name>overview</se:Name>
          <se:MinScaleDenominator>50000</se:MinScaleDenominator>
          <se:PointSymbolizer>
            <se:Graphic>
              <se:Mark>
                <se:WellKnownName>circle</se:WellKnownName>
                <se:Fill><se:SvgParameter name="fill">#37474F</se:SvgParameter></se:Fill>
                <se:Stroke>
                  <se:SvgParameter name="stroke">#FFFFFF</se:SvgParameter>
                  <se:SvgParameter name="stroke-width">0.4</se:SvgParameter>
                </se:Stroke>
              </se:Mark>
              <se:Opacity>0.45</se:Opacity>
              <se:Size>3</se:Size>
            </se:Graphic>
          </se:PointSymbolizer>
        </se:Rule>

        <se:Rule>
          <se:Name>school</se:Name>
          <se:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>category</ogc:PropertyName>
              <ogc:Literal>school</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </se:Filter>
          <se:MaxScaleDenominator>50000</se:MaxScaleDenominator>
          <se:PointSymbolizer>
            <se:Graphic>
              <se:ExternalGraphic>
                <se:InlineContent encoding="base64">iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAFNklEQVR4nKxXDUyUZRz/ve8dn4eCl6KeIAIzv2CZ+F1L50fWNDc/SlfmR1aTBNua1bQZ06VOVxspqLPVrJiuWB8rpxYSZGtLRGUJsgWC3Z1oBMc4ORAO7un3nAe7g/fgDvptf/4Pz/95/r/f+3z83/f0CAJCiFC6xbR5tDjaaE/oH5qV9jvtF0VRnIHmVAIZROJEuv1CYJWiIJweNoezq87W7p5vMoYJoyFExxjHoo3+K3ZnUYh5SAJIHEl3gD7D3tYljl6w6C9XN+P6bTs6OoXP2DC9iukThmHuxGjseCa+MypcBwrIZmgP/YOgBZA0rcsl8nWqkvjFpbvY900N7G2dCAQxkXrseyFZrJ8/RmGOauZ4niLKAhZA8nm0Ij5laPqnlcrZaw0YDFamjULuK5NFWIjazn8XUETJgAJInExX0trhillx6LpabmnBUJA6Pgpn35kuwkNUGwXMotV6x9W+AnCayzZiXfafQyaXuGFuwcu5FdwKGJn7TO+46ksu1vMEz84+Z1bkYesPwyP02LkiwW2y3R8uVTbhWIGVD4855FjjHVN6CbjS5HA+Pv3dP3RtHS7NZIYwHbYtjcO2JXGIjnxI3NzaiRMXrThRYIWjvUtznrwVZYfmdlFsCZXM7yOA5PF05o/Pm7H/u1pN4i0LTdi+LB6PRIVokjS2OJFzwYJTv9ZpCslam4TtT0sajKWIe7LhvQUvyj/ny3xPPA8PMkhaenAO3l+T5JdcQsYkiRwrieRcb1woa/ThkvDevDRZ4a7V3u+TWAgEDUXjgl+ttfdwaQkwNtx3ynXTeU964HQh92cLim/a8AafalGKsd8tKK6w4Qi3ofKOo0+8s0uAZ8w1whBi7O7zXqPIxpYOFX6waYEJq2ePxsxdl3Hoh9vug9cN2ZZ9MraKYzY+ZfKXBnxIuTZR0FgBS5wxfK6/iSynNLgP10dn/8YnhXfw+uJx7thJtrvLNIeBryV/aZAwMlwGLVoCqnlVlNjoUNQ3d2AgSMIPKSQYmEaEIVTvXuSq7j7vJb8o/yxOMWpO7q4LEaF+d6kn1uqnFixJNfpw9RZQzBJsTl8apzlZHkKJN58dD3/YuWKC2xdV2DTjry0aB3LIkvhbd1/PFrCTtUicnGwyfDAzaThKa+w+ky/esLkLzFvLE7DhybEotzpQddcBHfc7cVQEHksYhpHDQvBZcR2Kbjb1IZffCZNMBtnM8e7vXYpjXAK3rtbYY5bzTQgNrJ4dy8I0HinxBp/+cosDOT+Z8W1JfZ85siYU7J4hpsVHNfAwJ/FhWzQFeES8RJeXlX8Lxwus+D8gt+29VfKrDutI/rWPOK0JLpco6nSJBQv3lipV91oxFEwdZ0DhnjTB61mgquqy3nHNZeaSbeVtceZlpLjkW2ywkG/LvMxUF8mdfPKtWmP8CFBqaBsSYyOUvIxU6HUBfTz7IFSv4HRmKuKMYYrMRbMGLMAjIp8uc/6j0Ti6eTKCxfFXp2JW8nDZzPTkQlACPCJy6Q6vmROL7E2TECiOUPBzM0bK5n5PDv8cCAC8GYfp3v7+yr/gV7IsJprj5Fad2DoFK2eOkv8eJPnugXIHvLkUsYvuQGG5TWw6Vq70/mEiPz7O7EgVT0yKkTnlsucEkjeo00UR6XS58l2/+XiFUlvf5u6fOCYSp9KniYlj5Q8pbCH554HmDPp4U8RKlxCn+XERmZVfo6g8RXvXJst77lBVRRaac8HkC/5+PRQxhe5HWrKnq5q2nOR/IUgMSoBHRDTdlzT5nt5IcjsGgf8AAAD//7kay+oAAAAGSURBVAMAjCjzpb6ekKwAAAAASUVORK5CYII=</se:InlineContent>
                <se:Format>image/png</se:Format>
              </se:ExternalGraphic>
              <se:Size>26</se:Size>
            </se:Graphic>
          </se:PointSymbolizer>
        </se:Rule>

        <se:Rule>
          <se:Name>hospital</se:Name>
          <se:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>category</ogc:PropertyName>
              <ogc:Literal>hospital</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </se:Filter>
          <se:MaxScaleDenominator>50000</se:MaxScaleDenominator>
          <se:PointSymbolizer>
            <se:Graphic>
              <se:ExternalGraphic>
                <se:InlineContent encoding="base64">iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAEZklEQVR4nLSXXUwUVxTHz51ddmGXLguUFBAp8mHB1qpZoPXBj6SJmNQ0YtO0gUqsUZMKmmgDpk2avqjE1ZgmalQ0MbXVpmyiDzU82FpJSGOi0RS0YIFSF1BDaLcUWFm7O3P7v5uh2Y9ZdpaPf3I4Z+bOPed3Z+6eGYyUgDjnJri3YKthebCX1KER2DDsZ9hPjDG/3pxMz0UovATuEIJqYiwZnvxjY/K/T58G55tycniS3W7AmLh4Cv47nP4CIINzAkBhC9xh+AZ5YoI/OX/eOH73Lk3ev0/cH75IZjJR6vLlZHM4aNHOnQHJagUH+xJDn8P7EgZAUQeXZRczGJaMtLaS+9gxAgTpkTEtjQoOHOBZ1dUMOfqR4z1A/KIbAMVXw25ilaa+xkbmuX6dZqPMqioqdjq5ZDI9x+E6QNyOC4DCRXC3lakp+4PaWsnb00NzkXXZMnrt0iXOzGYPACpgf4SOSxRNcBm3Lb17x445FxfydnfTw927GclyBnJ/GzkuhdfmH2DnVD4+e5ZN3Ls3Y+LkggJa3NAQNBHPpH9u3aInFy4w5H4DNd6NCQB9EsDP6/G5cxRPKSiaV18ftJQ4AEJYlNjEsqihCQCyxXDl2PEGxeej+Zbs9dKIy2VAKDZ4dhQAVCP+eG7coIVSSO6a6cAYMu4QHW6yq4sWSiG5HVoAGX6PRzwjg9bkVy9eDDs22u3/x/n791Pu9u1h47/W1UXl4IEAYY8pmJuhBWABQPTPUpWtoiLWEFlKSkivUIMBIFULYMicm/tmrInjd+6EHYs7MF34WV+fWBnpkTkvTzS/IS2AfoPVypKyssg/Oho1MfKWpq9fT6WnTwfjwePH6e/2doonU3Y2oS2LsG/6XOgt/zGYeM0aWiilr10bVisSoB3tcjBn2zZaKGVv3Upo88N4H3REAeAkJ4OhRTzX1JUrab5lKy8nS3Ex4dV8MvR82NsQHcpOivL7RGen/UFNjTRTQtH/szZtCsaj166R79Gj2BfjS+l1l4tbSkv/BEAhFjupCaBC1MJ943Y6xQuE5kOLdu2i/H37RPg+ireGsWlN4IpyE01jXefmzWxqYIDmIsvSpbTiyhXOJekHSZKqIsdjfREVwnqeDw0Zu7ZskcSLZDYy2Gy04upVBR+tAay8CDYceY3mc8aFA7APk/PzmfitM6OREhVLSqKyM2cIzY2JXFrFYwKoEC64PaIFFzc3U6IqwUfsC6tWiXCPmosSAlAhTsE5X8RuLzp4kPRKAGdu2CDCQ2qO2DVIh7AfnHCNf7W1UW9TE74uZO1keFQlR49S5saN4rAZxT+Ll1sXgArxKdzhsY4O/rC+nkX+YyKZzVTW0sJtlZUip7jtJ/Xk1Q2gQnwMd+pZby/9tncv87ndwfMphYX0yokTXHjoIxT/Sm/OhABUiHfQLS8rsmxxHznCmCTRy01NnCTJi1g0mrZE8iUMoEKUwX0PK1JP9cPeRvFeSlCzAlAh0uC+himwOhQfp1noPwAAAP//q0natgAAAAZJREFUAwDTSJ2M3OuaPQAAAABJRU5ErkJggg==</se:InlineContent>
                <se:Format>image/png</se:Format>
              </se:ExternalGraphic>
              <se:Size>26</se:Size>
            </se:Graphic>
          </se:PointSymbolizer>
        </se:Rule>

        <se:Rule>
          <se:Name>mall</se:Name>
          <se:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>category</ogc:PropertyName>
              <ogc:Literal>mall</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </se:Filter>
          <se:MaxScaleDenominator>50000</se:MaxScaleDenominator>
          <se:PointSymbolizer>
            <se:Graphic>
              <se:ExternalGraphic>
                <se:InlineContent encoding="base64">iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAEjUlEQVR4nLRXa2wUVRQ+d2a2+2opLcZSw4pl1SAkRMora5AStDFIUqGk0VQUTfxDUpooqQoJMSGhaOVhIv0hVUNDiqlEgZgQgyvF2GosCQLxbUVt1xeVyra73efM9bvbXbrb3ZnOtvRLzp4799w535d775x7V6E8wDkvgHsI5oHNg5UlQ//AfLAe2DnGWMxsTmZmEIgr4PaisYkYs8ETD15Xtf8GEu9LJS7OnHNkxMTgEHwnul+BkP5pCQCxA64ZvoFCfh72vqbEf+kmtf8CUTySOVixkTJ/BSnuB8la/VKcWYuQnb2ByG4ICectAKTLSFNPkCRXRHraKHz6ReKhG2QGzFFK9tqDvGDVVoYcfchRBxGXTAsAuQfWRfFowWj7kyx2+QOaCixL68jx1DHOLFYxXVUQ0TupABC74XopOjp75NBqSfV9TdOBPK+SCp/vhgjbEJZkBUT8mh6XKFvBcUxbyUjrI9MmF1B9Fyl4pEYsRSlyvzcxLmVy8yegcmX4bDNTr3YbJpbvWELWNQ0JE20jxH/0UuTcAYbcq8CxOT3GJgi4wINDS/27XTLFRnUT2h9rIevDTRl9Ee/rFMJG1YVtFhXv6VeZvbgXy/BAqltKI3fBLY/0vGVILna4IOchP4VONSWMwsOJPhHTBcZEv2iT0RIbfG6WAKBe/MSunCYjSLe5Ex7JKPLp/jH78t2MmB6i47nrUw0lLb5MVDj1917DJMzqTHht+O+bfZr/j4yYHtTfvhrnSuVLNTAtXj5yba1/V5msl8C6bgdZlmwEUSHxWGi8GipWYhY78UiAYpdPUqTroF4KKn71usacpWexD9YnXk2LObTAoEQGkG+/F6V2tdEQ0v761jDOA9cYBBSmntMJB6SSO2mmweYsELM+kEtAH7MVMTarnGYKbLaLmCJOdPo5lwCv+LEsWk8zBcviRzO4Jgo4j3LZb133As0UrFWN2CSqDxvw8ywB6OQ4No/I5YtJvstDtxqKew3J5YvAKB9O75+461uJa0OO2gOaycuSOTCJ7JsPca6pgwkOPQGYhRsY3ChXeKRbuRS26pdJdlUyJskN4AjoCkiK6EBVOm+v2celsvsyYlEUmckQvXIq41mclLYNe3CJ5KL4vJ/FlysJquIC2Pf836vKcEulJA6SmwnnryTLwmo0LJkvqTGK/fBJRiln9hIq2nlJw+cXB7kb5jMlICmiDq4z3vcZC7wJQs30TXsMKM+FjV2kVHg4nh4H+Ylcw3RLb/KF7crdVbjXHaV84dzaIchFc7seuaGApAixY1sKlteTo/4dMvdlMHJsOUqW+xMXn73JHAajTQDL0QLXFLvYScH2LViOeO6BkoWcz3QkbsPAPpDvmiy36Y8dInbCNce++5gH2zayrD8mOI4Lt53hyj1rRU4x7YfN5M2r2kDENrhW9c9vKPh2LdMGx84U8bk6n/uQy3MXisdnQd5uNmfe5Q4ialAtj3M17gif3MFQWsm+aT9HAQvCxG4/k0++KdVbiBAV6iNY6hLYB9sA8p8oT0y54ENEMdwxGM4NehrkwzQF/A8AAP///SlptwAAAAZJREFUAwDt26nWA95YGwAAAABJRU5ErkJggg==</se:InlineContent>
                <se:Format>image/png</se:Format>
              </se:ExternalGraphic>
              <se:Size>26</se:Size>
            </se:Graphic>
          </se:PointSymbolizer>
        </se:Rule>

        <se:Rule>
          <se:Name>park</se:Name>
          <se:Filter>
            <ogc:PropertyIsEqualTo>
              <ogc:PropertyName>category</ogc:PropertyName>
              <ogc:Literal>park</ogc:Literal>
            </ogc:PropertyIsEqualTo>
          </se:Filter>
          <se:MaxScaleDenominator>50000</se:MaxScaleDenominator>
          <se:PointSymbolizer>
            <se:Graphic>
              <se:ExternalGraphic>
                <se:InlineContent encoding="base64">iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAE70lEQVR4nKxXDUyUZRz/v+8dB3cqxxh6QFACYqFGEWBCIFtKYCnLAkk6ST5WY0nYKVtiH2wEGrkg8cjMiNaSMYS1Gs4ZAmK2yfCjaaXC0oAWrDg+8gR33L39ntvR7uO97g79sT//9/n6/X/P+zzv839OSh5AEAQZ3DpYAiwEprI0jcKGYedgnRzHGdzllLrTCYHD4CrhN4PcB54mpieMI5OjHGsPVKoEP7mfBG2s7zSsGdXvoTzoiptzEVgBVwW/45+Z28IXPzRKL/1+ma7+8TMZjLaTlElltOqBlfTEQzGUl/TK7ALvBQQBtWh6B37GYwEIGms0GVskvCTseF8b1Z76mCCC3IGv3JdK0zVCRswmDhwD4MiCiMtuC0DwBFgXZinbc3wv1/FLJ80HqSvXU9WLFQLezl0UUyCi16UABI6A6502zPhtP5rPX/vzOt0LooIeocbCzwVvqbcOAuJhN/9XgMlkOm8STPEFDa9ylwZF3xrFLY2l19cVUaRqmbncPzpA2tOfUN+tC6L9nwxfTfW5dYKEk/TyPL/GqQDM/iW4pk+7P6P6zsMORHIvH3ozrYS2xGexDUZ2Y6m5t8W8V/D2HMaWpBZTfvJ29piJsa1z9bxdv12TdyaNDWcbSQy+ciVlPL7JIbh5JqjLiNlISoWf6NijPQ1sExtZDOt63moGoXBxLX2tkhmD+Fez9uEkksvk5AwKmYKSlz8l2qa/q6e2C20SPLINHuggAMhh/7qvnREl3rvxLdKk7SRXYH1KN+wyj7FH169nbGLZC4hl63hl+KrDwKKnX6Mtq7NEScXEqhNyqDAl36HNijtWTID/+J1xoxgp28WeIinScSlmTbOEPWZiscQEKHT6cV6MLNgvmDyFszE6vY7t4IViAoaClIGig871/+hQJ+BP7HkOPdd7SAwh/iFMwJCYgAEkEC5gYYDDIO3pehq7PWZTt7+9msb0OrN90P6hTdvI5Agd7jriwKPyVZGXxIs99s/VWafjDlhZ0vJE+ubitzYDB3VDlKnNpvDF4eby5PQUTr9+KlxbYC43nW/GKXiRlEhCDDfQNoU+9rD6RDvEBHQjcw1uS1Q/aC+AAfsDJn7Umqc02k+ukLNmKyHGsFQiPTtX998S4CQTkDaPLFsSQdGhj9L9BrsnRCwJJ8Q4ZF1vv+u1SES63ekaE91HsGMah5OA2f/FYjgVgI4TPMe/8VhoNJ+bqHZJ3P7TCbO5QkFyHq0IjuIw+x2IYXOrEb2QICV3zZqMKVnabO7m37foXhCpiqTmoq8FTOx7pOI0+3bRgwcqC6S8xFCnrjWxu918schnEdWpa0wIbmCcYn2cCfgNpg71D+UOvlxDUt6ty7MN2Peu3XaQgpRBHOOCDbstwCKiBa6Y3X4qXignT7E/q5Kwl9hjsYWLPBJgEcF2bPWz0Ruo/Pl3yV1UbC6n9SvY7xeqtHA4j0FuAGm6Gq705JVTVNb6NjtMRPuxpdqX+T49syqVFfcheJkrbrcEWETsgatCYhJKjmk4+x8muPWyNRfiw+IYJ3vth9zhdVuARUQRnJbdgjVNuzmWIxjCApZSzdYDQthi9guO8hD8S3c5PRJgEZGB0/IYlkFx4ORHHK7apEnfyb5zPSwbwU+QB/BYgEVEFNx3sAhL1QDsOQS/QR5iXgIsIpRwX8FY3shF8Kl50NC/AAAA//+YwswHAAAABklEQVQDAADMzNdRL9t/AAAAAElFTkSuQmCC</se:InlineContent>
                <se:Format>image/png</se:Format>
              </se:ExternalGraphic>
              <se:Size>28</se:Size>
            </se:Graphic>
          </se:PointSymbolizer>
        </se:Rule>

        <se:Rule>
          <se:Name>label</se:Name>
          <se:MaxScaleDenominator>12000</se:MaxScaleDenominator>
          <se:TextSymbolizer>
            <se:Label><ogc:PropertyName>name</ogc:PropertyName></se:Label>
            <se:Font>
              <se:SvgParameter name="font-family">Microsoft YaHei</se:SvgParameter>
              <se:SvgParameter name="font-size">11</se:SvgParameter>
              <se:SvgParameter name="font-weight">bold</se:SvgParameter>
            </se:Font>
            <se:LabelPlacement>
              <se:PointPlacement>
                <se:AnchorPoint>
                  <se:AnchorPointX>0.5</se:AnchorPointX>
                  <se:AnchorPointY>1.5</se:AnchorPointY>
                </se:AnchorPoint>
              </se:PointPlacement>
            </se:LabelPlacement>
            <se:Halo>
              <se:Radius>2</se:Radius>
              <se:Fill><se:SvgParameter name="fill">#FFFFFF</se:SvgParameter></se:Fill>
            </se:Halo>
            <se:Fill><se:SvgParameter name="fill">#263238</se:SvgParameter></se:Fill>
          </se:TextSymbolizer>
        </se:Rule>

      </se:FeatureTypeStyle>
    </UserStyle>
  </NamedLayer>
</StyledLayerDescriptor>
