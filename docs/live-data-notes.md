# Live NASA data — verified endpoints and facts (probed 2026-11-14)

## NASA GIBS WMS
- Geographic: `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi` (GetCapabilities ≈ 2.6 MB)
- Arctic polar stereographic: `https://gibs.earthdata.nasa.gov/wms/epsg3413/best/wms.cgi` (GetCapabilities ≈ 650 KB)
- GetMap returns RGBA PNG with ~150–220 discrete colours for data layers (decodable via colormap). An invalid layer/CRS returns HTTP 200 with `text/xml` (ServiceException) — must check content-type.
- Layers & time extents (from capabilities):
  - `GHRSST_L4_MUR_Sea_Ice_Concentration` — EPSG:4326 only (NOT in 3413); 2002-06-01 → 2026-11-12 (daily, gaps).
  - `AMSRUE_Sea_Ice_Concentration_12km` (3413 + 4326) 2002-06-01 → 2011-10-04; `AMSRU2_Sea_Ice_Concentration_12km` 2012-07-02 → 2025-09-01. (AMSR "unified" algorithm across AMSR-E/AMSR2.)
  - `GHRSST_L4_MUR_Sea_Surface_Temperature` (4326) → 2026-11-12. `GHRSST_L4_MUR25_Sea_Surface_Temperature_Anomalies` → 2026-11-12.
  - `IMERG_Precipitation_Rate` (daily, 4326) → 2026-11-12. `IMERG_Precipitation_Rate_30min` → 2026-11-14T00:30Z.
  - `MERRA2_2m_Air_Temperature_Assimilated_Monthly` (4326) 1980-01-01 → 2026-08-01 (P1M).
  - True colour: `MODIS_Terra_CorrectedReflectance_TrueColor`, `MODIS_Aqua_...`, `VIIRS_NOAA20_CorrectedReflectance_TrueColor` (→ 2026-11-14), `VIIRS_SNPP_...` (→ 2026-11-02). Available in 3413 too.
  - Fires: `VIIRS_NOAA21_Thermal_Anomalies_375m_All`, `VIIRS_SNPP_Thermal_Anomalies_375m_All` (no time dim shown in WMS caps parse).
  - Base map in 3413: `BlueMarble_ShadedRelief_Bathymetry` (JPEG works).
  - No GIBS sea-ice concentration exists for 1984; Landsat_WELD true colour starts 1983-12 but is not sea ice.
- Colormaps: `https://gibs.earthdata.nasa.gov/colormaps/v1.3/MERRA2_2m_Air_Temperature_Assimilated_Monthly.xml` = 200 (183 entries). `v1.3/<LayerName>.xml` = 404 for GHRSST MUR SST, MUR sea ice, IMERG — need the official colormap href from WMTS capabilities (`ows:Metadata` colormap role).

## NASA EONET v3
- `https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=400` → 400 open (396 wildfires, 2 severeStorms, 2 seaLakeIce, 0 volcanoes open).
- Examples: EONET_26158 Tropical Storm Pena, 2026-11-12T12:00Z, [-173.2, 9.8], 30 kts (JTWC); EONET_26157 Typhoon Cempaka, 2026-11-11T12:00Z, [154.1, 30.2], 65 kts (JTWC); EONET_26331 Wildfire Red Hill, Perry, Mississippi, 2026-11-12, [-89.06, 31.13], 519 acres (IRWIN).
- Geometry: list of {date, type: Point|Polygon, coordinates, magnitudeValue, magnitudeUnit}; sources [{id, url}].

## NASA Images & Video Library
- `https://images-api.nasa.gov/search?q=...&media_type=image&page_size=N` works, no key. Asset hosts: `images-assets.nasa.gov`. Details page: `https://images.nasa.gov/details/<nasa_id>`.
- e.g. GSFC_20171208_Archive_e000613 "Approaching the 2015 Arctic Sea Ice Minimum"; GSFC_20171208_Archive_e000204 "Hurricane Matthew from Space"; 201402230008HQ GPM mission.

## NASA SVS (EIC visualisations)
- `https://svs.gsfc.nasa.gov/api/<id>/` JSON; search `https://svs.gsfc.nasa.gov/api/search/?search=...`.
- Ocean currents: 5479 "Ocean Currents in equirectangular projection"; 3912 "Global Sea Surface Currents and Temperature" (challenge resource); 5425 "Perpetual Ocean 2: Western Boundary Currents"; 5529 polar views.
- Challenge resource IDs: 5313, 3912, 5669, 4950, 5196, 5011, 4960, 5425, 5533, 13786 (Caldwell 73 sonification).

## Impulse responses
- Voxengo IRs mirrored at `https://oramics.github.io/sampled/IR/Voxengo/` — "Permission is granted to anyone to use these impulse files royalty-free for any purpose, including commercial usage." Original: https://www.voxengo.com/impulses/
- EMT-140 plate (Greg Hopkins): https://oramics.github.io/sampled/IR/EMT140-Plate/

## Verified 2026-11-14 (second probe)

### Colormaps (official GIBS, v1.3 XML; parse `<ColorMap>` blocks, NOT `<ColorMaps>`; title attr optional)
| GIBS layer | colormap URL | units / range |
|---|---|---|
| SSMIS_Sea_Ice_Concentration (3413) | https://gibs.earthdata.nasa.gov/colormaps/v1.3/SSMIS_Sea_Ice_Concentration.xml | % (0.6–99.8 bins); classes: Ocean rgb(0,5,133) transparent; **Pole Mask rgb(0,0,1) opaque**; Land Mask 119,119,119; No Data 1,0,0 |
| AMSRU2/AMSRUE_Sea_Ice_Concentration_12km | https://gibs.earthdata.nasa.gov/colormaps/v1.3/AMSR_Sea_Ice_Concentration.xml | % 0–100 (value 0 = transparent) |
| GHRSST_L4_MUR_Sea_Surface_Temperature | https://gibs.earthdata.nasa.gov/colormaps/v1.3/GHRSST_Sea_Surface_Temperature.xml | °C 0–32 (intervals) |
| IMERG_Precipitation_Rate | https://gibs.earthdata.nasa.gov/colormaps/v1.3/GPM_Precipitation_Rate.xml | mm/hr 0.1–53 (below 0.1 transparent) |
| MERRA2_2m_Air_Temperature_Assimilated_Monthly | https://gibs.earthdata.nasa.gov/colormaps/v1.3/MERRA2_2m_Air_Temperature_Assimilated_Monthly.xml | K 220–310 |
WMTS caps metadata uses single-quoted `xlink:href='...colormaps/v1.3/<Name>.xml'`.

### Arctic sea-ice extent from GIBS pixels (EPSG:3413, bbox ±3,500,000 m, 1024², area-corrected for polar-stereographic scale k(φ), ≥15 % concentration)
- SSMIS 1984-09-15: 5.38 M km² + pole hole (24,208 px ≈ 1.1 M km²) ≈ 6.5 (NSIDC 1984 min ≈ 6.4) ✔
- SSMIS 2020-09-15: 3.80 (+ tiny pole mask) vs NSIDC 2020 min 3.74 ✔
- AMSRU2 2012-09-15: 3.13 (NSIDC 3.39; AMSR higher-res reads lower)
- **AMSRU2 2025-09-01 is a partial day (opaque 0.048 vs 0.092 on 08-31) — do not use.** Use 2025-08-31.
- SSMIS record: 1978-10-26 → 2021-08-22, every 2 days until 1987-08 (1984-08-31 is on the grid; 1984-09-01 is not → WMS snaps). AMSRU2: 2012-07-02 → 2025-09-01. No polar concentration product after 2025-09-01 in GIBS 3413 (MUR sea-ice is 4326 only).
- Chosen Time Machine pair: SSMIS 1984-08-31 vs AMSRU2 2025-08-31 (same calendar day, 41 years; different sensors, disclosed). Colormaps differ → re-render both from decoded concentration with one unified palette.
- Base map in 3413: BlueMarble_ShadedRelief_Bathymetry (JPEG).

### Thermal anomalies
- VIIRS_NOAA21_Thermal_Anomalies_375m_All: WMS PNG works with TIME=2026-11-12 (red dots ~ rgb(239,39,39)); WMTS is vector-tile only. Time range 2024-01-17 → 2026-11-14.

### EONET (2026-11-14)
- Open: 396 wildfires (IRWIN, mostly US SE, 500–700 acres), severe storms: EONET_26157 Typhoon Cempaka (2026-11-11T12Z, 154.1E 30.2N, 65 kts, JTWC), EONET_26158 Tropical Storm Pena (2026-11-12T12Z, -173.2 9.8, 30 kts, JTWC). Recently closed: EONET_26159 TC 03S, EONET_25964 TC Murasu (65 kts), EONET_25728 Super Typhoon In-fa. No volcano events in last 120 days.

### Impulse responses downloaded to /tmp/ir
- musikvereinsaal.wav (44.1k stereo 2.0 s, 530 KB), st_nicolaes_church.wav (3.0 s), french_18th_century_salon.wav (8 s). Voxengo licence: royalty-free for any purpose.

### Third probe (proxy test, 2026-11-14 09:03)
- Empty GIBS day = 207-byte transparent PNG (used to resolve latest dates). Latest: GHRSST MUR SST 2026-11-12, IMERG daily 2026-11-12, MERRA-2 monthly 2026-08-01 (2026-09 empty), VIIRS NOAA-20 true colour 2026-11-13.
- SVS ids: 5583 Arctic Sea Ice Minimum 2025; 5603 Global Temperature Anomalies 1880–2025; 3912 Global Sea Surface Currents and Temperature (image http:// → upgrade https); 5650 Near Real-Time Global Precipitation (GPM); 5680 2026 Hurricane Season; 5668 Unprecedented Wildfires in the Pacific Northwest (smoke); 5425 Perpetual Ocean 2.
- EONET at 09:03: storms open 2 (EONET_26158 Tropical Storm Pena 2026-11-12T12Z 9.8N 173.2W 30 kts JTWC; EONET_26157 Typhoon Cempaka 2026-11-11T12Z), wildfires open ≥500 (EONET_26331 Wildfire Red Hill, Perry, Mississippi 519 acres; EONET_26332 Prescribed Fire Bienville CPT 29 Sub 2 RX 660 acres; EONET_26333 Prescribed Fire Compartment 170 RX, Greene, Georgia 643 acres), volcanoes past 365 days 24 (latest 2026-06-15).
- Precip colormap GPM_Precipitation_Rate has two numeric maps: "Rain Rate" and "Snow Rate" (mm/hr).
- NASA Images "Arctic sea ice minimum" → GSFC_20171208_Archive_e000613 "Approaching the 2015 Arctic Sea Ice Minimum".

### Fourth probe (2026-11-14 09:08) — a real 2026 Arctic frame
- `GHRSST_L4_MUR_Sea_Ice_Concentration` (EPSG:4326 only, title "Sea Ice Concentration (L4, MUR, GHRSST)", default date 2026-11-12) returns data for TIME=2026-08-31 and 2025-08-31 with BBOX lat 50–90 (WMS 1.3 axis order `50,-180,90,180`), 4096×512 PNG ≈ 115 KB, 71 distinct colours, 0 unmatched.
- Colormap: https://gibs.earthdata.nasa.gov/colormaps/v1.3/GHRSST_Sea_Ice_Concentration.xml — "No Data" rgb 0,0,0 transparent; "Sea Ice Concentration" units % with 101 entries, e.g. rgb 17,17,17 `[0,1)`, … rgb 255,255,255 `[100]` (single-value bracket → must parse as 100, not a range).
- Extent ≥15 % (spherical pixel areas, 50–90°N): 2025-08-31 = 4.33 M km²; **2026-08-31 = 4.18 M km²**.
- Decision: Time Machine = SSMIS (Nimbus-7 SMMR) 1984-08-31 in EPSG:3413 vs MUR 2026-08-31 fetched in 4326 (40–90°N, 4096×800) and reprojected in the browser onto the 3413 grid.
- Voxengo IRs used: musikvereinsaal.wav (2 ch, 44.1 kHz, 3.0 s), st_nicolaes_church.wav (7.99 s), french_18th_century_salon.wav (2.0 s) from https://oramics.github.io/sampled/IR/Voxengo/ (Voxengo free IR, royalty-free).

## End-to-end measurements (pipeline/e2e.py, 14 Nov 2026, dev proxy)
- Sea ice extent (>=15 %, area-corrected): 31 Aug 1984 7.14 M km² -> 31 Aug 2026 4.21 M km² (-41 %).
- MERRA-2 2 m air temperature, area-weighted mean: Aug 1980 16.1 °C -> Aug 2026 17.0 °C (+0.9 °C).
- EONET at run time: storms 2 open (Tropical Storm Pena EONET_26158, Typhoon Cempaka EONET_26157); wildfires 500 open; volcanoes 0 open -> past 365 days (24, latest Nevados del Chillan 15 Jun 2026).
- No console errors, no failed requests, zero direct third-party requests from the browser (everything via /api/nasa).
- Narration voice chosen: studio voice "Sulafat" (female, warm), en-US.
