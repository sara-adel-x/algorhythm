/**
 * Narration text, shared by the proxy (event descriptions), the browser
 * (Time Machine results) and pipeline/bake_narration.mjs (which records the
 * MP3s). A clip is only played when its recorded text equals the text the app
 * would say now, so a recording can never contradict live data.
 */

export const WELCOME =
  'Welcome to AlgoRythm, the Earth Information Jukebox. Every sound you will hear is computed live from real NASA satellite data. ' +
  'First, choose a dataset: use the up and down arrow keys, or press a number from one to seven, then press Enter. ' +
  'While you listen, the arrow keys move your listening point across the planet. Hold Shift to move faster. ' +
  'Higher on the map plays higher notes. Left and right follow your headphones. The stronger the measurement, the brighter and louder the sound, and sharp boundaries tap softly as you cross them. ' +
  'Press H to jump between places and events, and Enter to hear what is under the point. ' +
  'Press T for the Time Machine, B to hide the picture, L for the sound legend, M to mute, and Escape to go back. ' +
  'Press the question mark to see every key, and R to repeat the last thing I said.'

export const DATASET_INTROS = {
  'sea-ice':
    'Arctic sea ice. This is the floating ice at the top of the world, measured from orbit by passive microwave radiometers that see through cloud and polar night. ' +
    'Where the ocean is covered by ice, the sound is bright and loud. Open water is silence. ' +
    'Press T for the Time Machine. It plays the last day of August 1984, then the same day in 2026, and measures how much ice is gone.',
  'air-temp':
    'Global air temperature, two metres above the surface, averaged over a month by NASA’s MERRA-2 reanalysis. ' +
    'Warmer places sound brighter and louder. The coldest ice sheets fall almost silent. ' +
    'Press T for the Time Machine, from the same month in 1980 to the latest month, and hear the whole planet shift.',
  sst:
    'Sea surface temperature, from the daily GHRSST multi-sensor analysis. ' +
    'Warm water is brighter and louder, cold water is darker and quieter, and land is silent. ' +
    'Listen for soft taps along the sharp fronts where currents like the Gulf Stream and the Kuroshio carry tropical heat toward the poles.',
  precip:
    'Rain and snow from space, measured by the Global Precipitation Measurement constellation and combined by NASA’s IMERG algorithm. ' +
    'Silence means no rain. The heavier the rainfall, the louder and brighter the sound. ' +
    'Open tropical storms from NASA’s event tracker are marked as landmarks. Press H to visit them.',
  storms:
    'Severe storms, live from NASA’s Earth Observatory Natural Event Tracker. ' +
    'The picture is true colour from the VIIRS instrument on the day of the storm’s latest position. Bright cloud tops are loud, the spiral bands tap as you cross their edges. ' +
    'Use the event list to choose another storm, and press H to walk along its track.',
  wildfires:
    'Wildfires, live from NASA’s Earth Observatory Natural Event Tracker, with fire detections from the VIIRS instrument. ' +
    'Each red detection crackles as you pass it. Smoke and cloud are bright, burned and forested land is darker. ' +
    'Press H to move between the open fires inside the frame.',
  volcanoes:
    'Volcanoes, from NASA’s Earth Observatory Natural Event Tracker. ' +
    'No volcano event is open right now, so you are hearing eruptions from the past year, in true colour, with thermal detections where the satellite saw heat.',
}

/** Intros that depend on live state. Volcano wording follows whether EONET has open events. */
export const VOLCANO_INTRO_OPEN =
  'Volcanoes, live from NASA’s Earth Observatory Natural Event Tracker. ' +
  'You are hearing an open eruption in true colour, with thermal detections where the satellite saw heat. Use the event list or N and P to move between volcanoes.'

export function datasetIntro(id, eventScope) {
  if (id === 'volcanoes' && eventScope === 'open') return VOLCANO_INTRO_OPEN
  return DATASET_INTROS[id]
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function spokenDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function spokenMonth(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`
}

export function spokenLat(lat) {
  const v = Math.abs(lat).toFixed(1)
  return `${v} degrees ${lat >= 0 ? 'north' : 'south'}`
}

export function spokenLon(lon) {
  const v = Math.abs(lon).toFixed(1)
  return `${v} degrees ${lon >= 0 ? 'east' : 'west'}`
}

const SOURCE_NAMES = {
  JTWC: 'the Joint Typhoon Warning Center',
  NHC: 'the National Hurricane Center',
  IRWIN: 'IRWIN, the Integrated Reporting of Wildland-Fire Information system',
  InciWeb: 'InciWeb',
  SIVolcano: 'the Smithsonian Global Volcanism Program',
  GDACS: 'the Global Disaster Alert and Coordination System',
  EO: 'NASA Earth Observatory',
  NASA_DISP: 'NASA Disasters',
  CALFIRE: 'CAL FIRE',
  BYU_ICE: 'Brigham Young University',
}

function magnitudeText(value, unit, category) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return ''
  const n = Number(value)
  if (unit === 'kts') return ` Winds of ${Math.round(n)} knots.`
  if (unit === 'acres') return ` About ${Math.round(n).toLocaleString('en-US')} acres.`
  if (unit === 'hectares' || unit === 'ha') return ` About ${Math.round(n).toLocaleString('en-US')} hectares.`
  if (category === 'volcanoes') return ''
  return ` Magnitude ${n} ${unit ?? ''}.`
}

/** One sentence group per EONET event. Kept deterministic for recording. */
export function eventNarration(e) {
  const where = e.lat === null || e.lat === undefined ? '' : ` at ${spokenLat(e.lat)}, ${spokenLon(e.lon)}`
  const when = spokenDate(e.date)
  const verb = e.category === 'severeStorms' ? 'Last position' : e.category === 'volcanoes' ? 'Reported' : 'Reported'
  const status = e.closed ? ` This event was closed on ${spokenDate(e.closed)}.` : ''
  const src = (e.sources ?? []).map((s) => SOURCE_NAMES[s.id] ?? s.id).filter(Boolean)
  const source = src.length ? ` Source: ${src.join(' and ')}.` : ''
  return `${e.title}. ${verb}${when ? ` on ${when}` : ''}${where}.${magnitudeText(e.magnitudeValue, e.magnitudeUnit, e.category)}${status}${source}`
}

/** Time Machine results, spoken after the morph. Numbers are rounded the same way the UI shows them. */
export function iceSummary(thenDate, nowDate, thenExtent, nowExtent) {
  const pct = Math.round(((nowExtent - thenExtent) / thenExtent) * 100)
  return (
    `On ${spokenDate(thenDate)}, sea ice covered about ${thenExtent.toFixed(1)} million square kilometres of the Arctic. ` +
    `On ${spokenDate(nowDate)}, it covered about ${nowExtent.toFixed(1)} million. ` +
    `That is ${Math.abs(pct)} percent ${pct < 0 ? 'less' : 'more'} ice, measured from these two satellite frames. What you just heard thin out is that loss.`
  )
}

export function temperatureSummary(thenDate, nowDate, thenMeanC, nowMeanC) {
  const d = nowMeanC - thenMeanC
  return (
    `In ${spokenMonth(thenDate)}, the area-weighted mean air temperature of these frames was ${thenMeanC.toFixed(1)} degrees Celsius. ` +
    `In ${spokenMonth(nowDate)}, it was ${nowMeanC.toFixed(1)} degrees. ` +
    `A difference of ${Math.abs(d).toFixed(1)} degrees ${d >= 0 ? 'warmer' : 'cooler'}, for the whole planet, in one month of the year.`
  )
}

export const TIME_MACHINE_INTRO = {
  'sea-ice':
    'Time Machine. First, the Arctic on the last day of August 1984. Over eight seconds, it becomes the same day in 2026. Keep listening to how much of the sound remains.',
  'air-temp':
    'Time Machine. First, the planet in the same month of 1980. Over eight seconds, it becomes the latest month NASA has published. Listen to the brightness rise.',
}

export const BLINDFOLD =
  'Blindfold mode. The picture is hidden. Move around and listen, and try to build the map in your head. Press V to reveal it, or B to come back.'

export const NO_TIME_MACHINE = 'This dataset has no Time Machine. Try Arctic sea ice or global air temperature.'
