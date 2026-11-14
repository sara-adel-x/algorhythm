# Scene sources (verified)

Every image in the collection is a real NASA product, downloaded and self-hosted in
`pipeline/source/`, then baked into `public/scenes/<id>/`.

| id | Scene | NASA product | Where it came from | Credit |
|---|---|---|---|---|
| m74 | M74, the Phantom Galaxy | `PIA08533`, 2006-06-09 | https://images.nasa.gov/details/PIA08533 | NASA/JPL-Caltech/STScI |
| pillars | Pillars of Creation (near-infrared) | `GSFC_20171208_Archive_e000842` | https://images.nasa.gov/details/GSFC_20171208_Archive_e000842 | NASA/ESA/Hubble Heritage Team (STScI/AURA) |
| irma | Hurricane Irma, 6 Sept 2017 | `MODIS_Terra_CorrectedReflectance_TrueColor`, TIME=2017-09-06 | GIBS WMS: `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&LAYERS=MODIS_Terra_CorrectedReflectance_TrueColor&CRS=EPSG:4326&FORMAT=image/jpeg&BBOX=13,-72,26,-50&WIDTH=2000&HEIGHT=1180&TIME=2017-09-06` | NASA Worldview / GIBS, MODIS Terra |
| night | Earth at Night (Black Marble) | `VIIRS_Black_Marble` | GIBS WMS, same endpoint, `BBOX=-60,-180,75,180`, 2400×1350 | NASA Earth Observatory / VIIRS Black Marble |
| amazon | Mato Grosso, Brazil (before/after) | `PIA11420`, 2008-10-16 | https://images.nasa.gov/details/PIA11420 | NASA/GSFC/METI/ERSDAC/JAROS, and U.S./Japan ASTER Science Team |

`amazon-then` and `amazon-now` are the two halves of `PIA11420`, split at the divider
NASA printed between them and cropped to the same window. The river is continuous
across both halves, which is how a viewer can confirm it is the same ground.

## Things tried and rejected

- **Arctic sea ice from GIBS** (`AMSRE_Sea_Ice_Concentration_12km`,
  `AMSRU2_Sea_Ice_Concentration_12km`): the 12 km concentration product renders as a
  saturated false-colour map with black gaps — accurate, but not a scene you would want
  to sit inside. Dropped as the Time Machine in favour of the Amazon pair, which is a
  true before/after of the same coordinates.
- **True-colour Arctic** (`MODIS_Terra_CorrectedReflectance_TrueColor`, bbox 68–90 N):
  the EPSG:4326 projection stretches the pole into a smear. Would need a polar
  stereographic render.
- **Jupiter** `PIA22965`: a composite with a polar-projection diagram overlaid. Not a
  clean scene.
- **SVS Earth-at-Night stills** in `data/svs/`: 1024×288 with inset boxes and a colour
  bar. Too small and too diagrammatic; replaced with a 2400×1350 GIBS render.

## Narration audio

Pre-generated clips live at:

```
public/narration/welcome.mp3          the spoken welcome
public/narration/blindfold.mp3        blindfold mode intro
public/scenes/<id>/narration/intro.mp3
public/scenes/<id>/narration/<hotspot-id>.mp3
public/scenes/<id>/narration/time.mp3       (amazon only)
public/scenes/<id>/narration/time-end.mp3   (amazon only)
```

Any clip that is missing falls back to the browser voice with the same text, so the
app is never silent because of a missing file.
