/**
 * The AlgoRythm dataset catalog — the single source of truth for which NASA
 * layers the proxy is allowed to fetch. The browser never sends a layer name,
 * bounding box or upstream URL; it sends a dataset id (and, for events, an
 * EONET id) and the server derives the request from this file.
 *
 * Every layer name, date and colormap below was checked against the live GIBS
 * capabilities documents on 2026-11-14 (see docs/live-data-notes.md).
 */

export const GIBS = {
  'EPSG:4326': 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi',
  'EPSG:3413': 'https://gibs.earthdata.nasa.gov/wms/epsg3413/best/wms.cgi',
}

export const COLORMAP_BASE = 'https://gibs.earthdata.nasa.gov/colormaps/v1.3/'

/** Colormaps the proxy may fetch (official GIBS v1.3 XML). */
export const COLORMAPS = new Set([
  'SSMIS_Sea_Ice_Concentration',
  'GHRSST_Sea_Ice_Concentration',
  'GHRSST_Sea_Surface_Temperature',
  'GPM_Precipitation_Rate',
  'MERRA2_2m_Air_Temperature_Assimilated_Monthly',
])

const ARCTIC_BBOX = [-3500000, -3500000, 3500000, 3500000]
const WORLD_BBOX = [-180, -90, 180, 90] // lon/lat order; the server converts for WMS 1.3

export const DATASETS = [
  {
    id: 'sea-ice',
    number: 1,
    theme: 'Sea ice',
    title: 'Arctic sea ice',
    subtitle: 'Sea-ice concentration on 31 August, 1984 and 2026',
    kind: 'gibs',
    crs: 'EPSG:3413',
    bbox: ARCTIC_BBOX,
    size: [1024, 1024],
    base: { layer: 'BlueMarble_ShadedRelief_Bathymetry', format: 'image/jpeg', title: 'Blue Marble Shaded Relief and Bathymetry (MODIS)' },
    frames: {
      then: {
        layer: 'SSMIS_Sea_Ice_Concentration',
        title: 'Sea Ice Concentration (Nimbus-7 SMMR → DMSP SSM/I-SSMIS record)',
        instrument: 'Nimbus-7 SMMR passive microwave',
        date: '1984-08-31',
        colormap: 'SSMIS_Sea_Ice_Concentration',
      },
      now: {
        layer: 'GHRSST_L4_MUR_Sea_Ice_Concentration',
        title: 'Sea Ice Concentration (L4, MUR, GHRSST)',
        instrument: 'GHRSST MUR L4 analysis, sea-ice fraction field',
        date: '2026-08-31',
        colormap: 'GHRSST_Sea_Ice_Concentration',
        // Only published on the global grid, so we fetch 40–90°N and the
        // browser reprojects it onto the same polar grid as the 1984 frame.
        source: { crs: 'EPSG:4326', bbox: [-180, 40, 180, 90], size: [4096, 800] },
      },
    },
    defaultFrame: 'now',
    value: { name: 'Ice concentration', units: '%', min: 0, max: 100, decimals: 0 },
    recolor: 'ice',
    timeMachine: { metric: 'ice-extent', then: 'then', now: 'now' },
    sound: { root: 'D3', scale: 'dorian', ir: 'st_nicolaes_church' },
    svs: 5583,
    library: 'Arctic sea ice minimum',
    note:
      'Two products, one quantity. 1984 is the Nimbus-7 SMMR passive-microwave record; 2026 is the sea-ice field of the GHRSST MUR analysis, reprojected here onto the same polar grid. Both are decoded to concentration with NASA’s published colour keys and re-coloured with one key, so the sound follows the ice, not a palette. Extent counts every pixel with at least 15 % ice; the 1984 polar data gap around the pole is counted as ice, the standard convention.',
    landmarks: [
      { name: 'North Pole', lat: 90, lon: 0 },
      { name: 'Beaufort Sea', lat: 74, lon: -140 },
      { name: 'Chukchi Sea', lat: 71, lon: -170 },
      { name: 'East Siberian Sea', lat: 74, lon: 165 },
      { name: 'Laptev Sea', lat: 76, lon: 126 },
      { name: 'Kara Sea', lat: 77, lon: 70 },
      { name: 'Barents Sea', lat: 75, lon: 40 },
      { name: 'Fram Strait', lat: 79, lon: -3 },
      { name: 'Canadian Arctic Archipelago', lat: 75, lon: -100 },
      { name: 'Greenland ice sheet', lat: 72, lon: -40 },
      { name: 'Hudson Bay', lat: 60, lon: -85 },
    ],
  },
  {
    id: 'air-temp',
    number: 2,
    theme: 'Global temperature',
    title: 'Global air temperature',
    subtitle: 'Monthly 2 m air temperature, MERRA-2 — same month in 1980 and now',
    kind: 'gibs',
    crs: 'EPSG:4326',
    bbox: WORLD_BBOX,
    size: [1280, 640],
    base: null,
    frames: {
      then: {
        layer: 'MERRA2_2m_Air_Temperature_Assimilated_Monthly',
        title: '2-meter Air Temperature, Assimilated (Monthly, MERRA2)',
        instrument: 'NASA GMAO MERRA-2 reanalysis',
        date: { sameMonthAs: 'now', year: 1980 },
        colormap: 'MERRA2_2m_Air_Temperature_Assimilated_Monthly',
      },
      now: {
        layer: 'MERRA2_2m_Air_Temperature_Assimilated_Monthly',
        title: '2-meter Air Temperature, Assimilated (Monthly, MERRA2)',
        instrument: 'NASA GMAO MERRA-2 reanalysis',
        date: { latest: 'month', maxBack: 8 },
        colormap: 'MERRA2_2m_Air_Temperature_Assimilated_Monthly',
      },
    },
    defaultFrame: 'now',
    value: { name: 'Air temperature', units: 'K', display: 'C', min: 220, max: 310, decimals: 1 },
    timeMachine: { metric: 'area-mean', then: 'then', now: 'now' },
    sound: { root: 'C3', scale: 'lydian', ir: 'musikvereinsaal' },
    svs: 5603,
    library: 'global temperature',
    note: 'MERRA-2 is a reanalysis: satellite and ground observations combined in a weather model. The mean shown is area-weighted by the cosine of latitude.',
    landmarks: [
      { name: 'Sahara', lat: 23, lon: 13 },
      { name: 'Arabian Peninsula', lat: 23, lon: 47 },
      { name: 'Siberia', lat: 63, lon: 105 },
      { name: 'Greenland', lat: 72, lon: -40 },
      { name: 'Antarctic Plateau', lat: -80, lon: 60 },
      { name: 'Amazon Basin', lat: -4, lon: -62 },
      { name: 'Tibetan Plateau', lat: 33, lon: 88 },
      { name: 'Australian outback', lat: -25, lon: 133 },
    ],
  },
  {
    id: 'sst',
    number: 3,
    theme: 'Oceans',
    title: 'Sea surface temperature',
    subtitle: 'Daily GHRSST MUR sea surface temperature — where the currents carry heat',
    kind: 'gibs',
    crs: 'EPSG:4326',
    bbox: WORLD_BBOX,
    size: [1280, 640],
    base: { layer: 'BlueMarble_ShadedRelief', format: 'image/jpeg', title: 'Blue Marble Shaded Relief (MODIS)' },
    frames: {
      now: {
        layer: 'GHRSST_L4_MUR_Sea_Surface_Temperature',
        title: 'Sea Surface Temperature (L4, MUR, GHRSST)',
        instrument: 'GHRSST MUR L4 (MODIS, AMSR2, VIIRS and in-situ blend)',
        date: { latest: 'day', maxBack: 10 },
        colormap: 'GHRSST_Sea_Surface_Temperature',
      },
    },
    defaultFrame: 'now',
    value: { name: 'Sea surface temperature', units: '°C', min: 0, max: 32, decimals: 1 },
    sound: { root: 'A2', scale: 'majorPentatonic', ir: 'musikvereinsaal' },
    svs: 3912,
    library: 'sea surface temperature ocean currents',
    note: 'Sharp temperature fronts — the Gulf Stream, the Kuroshio — are where the edge detector fires. Land is shown from Blue Marble and is silent.',
    landmarks: [
      { name: 'Gulf Stream', lat: 38, lon: -65 },
      { name: 'Kuroshio Current', lat: 35, lon: 145 },
      { name: 'Western Pacific Warm Pool', lat: 2, lon: 150 },
      { name: 'Equatorial Pacific cold tongue', lat: -1, lon: -105 },
      { name: 'Agulhas Current', lat: -37, lon: 24 },
      { name: 'Antarctic Circumpolar Current', lat: -57, lon: 10 },
      { name: 'Arabian Sea', lat: 15, lon: 64 },
      { name: 'California Current', lat: 34, lon: -124 },
    ],
  },
  {
    id: 'precip',
    number: 4,
    theme: 'Precipitation',
    title: 'Rain and snow from space',
    subtitle: 'Daily IMERG precipitation rate from the GPM constellation',
    kind: 'gibs',
    crs: 'EPSG:4326',
    bbox: WORLD_BBOX,
    size: [1280, 640],
    base: { layer: 'BlueMarble_ShadedRelief_Bathymetry', format: 'image/jpeg', title: 'Blue Marble Shaded Relief and Bathymetry (MODIS)' },
    frames: {
      now: {
        layer: 'IMERG_Precipitation_Rate',
        title: 'Precipitation Rate (IMERG)',
        instrument: 'GPM IMERG (multi-satellite)',
        date: { latest: 'day', maxBack: 10 },
        colormap: 'GPM_Precipitation_Rate',
      },
    },
    defaultFrame: 'now',
    value: { name: 'Precipitation rate', units: 'mm/hr', min: 0.1, max: 30, log: true, decimals: 1 },
    sound: { root: 'E3', scale: 'minorPentatonic', ir: 'musikvereinsaal' },
    svs: 5650,
    library: 'GPM precipitation',
    eventOverlay: 'severeStorms',
    note: 'Rates below 0.1 mm/hr are transparent in the NASA layer and are silent here. Open tropical storms from EONET are marked as landmarks.',
    landmarks: [
      { name: 'Intertropical Convergence Zone, Pacific', lat: 7, lon: -140 },
      { name: 'Bay of Bengal', lat: 15, lon: 89 },
      { name: 'Maritime Continent', lat: 0, lon: 115 },
      { name: 'North Atlantic storm track', lat: 52, lon: -30 },
      { name: 'Southern Ocean storm track', lat: -52, lon: 60 },
    ],
  },
  {
    id: 'storms',
    number: 5,
    theme: 'Severe storms',
    title: 'Severe storms, live',
    subtitle: 'Open storms tracked by NASA EONET, seen in VIIRS true colour',
    kind: 'event',
    category: 'severeStorms',
    crs: 'EPSG:4326',
    span: [24, 18],
    size: [1024, 768],
    frames: {
      now: {
        layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
        title: 'Corrected Reflectance (True Color, VIIRS, NOAA-20)',
        instrument: 'VIIRS on NOAA-20',
        format: 'image/jpeg',
        date: { fromEvent: true },
      },
    },
    defaultFrame: 'now',
    value: null,
    sound: { root: 'G2', scale: 'dorian', ir: 'french_18th_century_salon' },
    svs: 5680,
    library: 'hurricane from space',
    note: 'The frame is centred on the storm’s latest EONET position and shows that day’s daytime VIIRS pass. Earlier positions on the track are landmarks.',
  },
  {
    id: 'wildfires',
    number: 6,
    theme: 'Wildfires',
    title: 'Wildfires, live',
    subtitle: 'Open fires from EONET with VIIRS 375 m thermal detections',
    kind: 'event',
    category: 'wildfires',
    crs: 'EPSG:4326',
    span: [4, 3],
    size: [1024, 768],
    frames: {
      now: {
        layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
        title: 'Corrected Reflectance (True Color, VIIRS, NOAA-20)',
        instrument: 'VIIRS on NOAA-20',
        format: 'image/jpeg',
        date: { fromEvent: true },
        overlay: {
          layer: 'VIIRS_NOAA21_Thermal_Anomalies_375m_All',
          title: 'Thermal Anomalies and Fires (375m, All, VIIRS, NOAA-21)',
        },
      },
    },
    defaultFrame: 'now',
    value: null,
    sound: { root: 'F2', scale: 'minorPentatonic', ir: 'musikvereinsaal' },
    svs: 5668,
    library: 'wildfire satellite',
    note: 'Red points are VIIRS thermal detections on the event date; each one triggers a crackle as you pass it. Other open fires inside the frame are landmarks.',
  },
  {
    id: 'volcanoes',
    number: 7,
    theme: 'Volcanoes',
    title: 'Volcanoes',
    subtitle: 'Eruptions tracked by EONET over the past year, VIIRS true colour',
    kind: 'event',
    category: 'volcanoes',
    days: 365,
    status: 'all',
    crs: 'EPSG:4326',
    span: [3, 2.25],
    size: [1024, 768],
    frames: {
      now: {
        layer: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
        title: 'Corrected Reflectance (True Color, VIIRS, NOAA-20)',
        instrument: 'VIIRS on NOAA-20',
        format: 'image/jpeg',
        date: { fromEvent: true },
        overlay: {
          layer: 'VIIRS_NOAA21_Thermal_Anomalies_375m_All',
          title: 'Thermal Anomalies and Fires (375m, All, VIIRS, NOAA-21)',
        },
      },
    },
    defaultFrame: 'now',
    value: null,
    sound: { root: 'C2', scale: 'dorian', ir: 'st_nicolaes_church' },
    svs: null,
    library: 'volcano eruption satellite',
    note: 'EONET currently lists no open volcano events, so this view lists eruptions from the past 365 days and says so.',
  },
]

export function findDataset(id) {
  return DATASETS.find((d) => d.id === id) ?? null
}
