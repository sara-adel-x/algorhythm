import type { Ambience } from '../audio/engine'
import type { FrameStats, Sample } from '../analysis/analyze'
import { formatLatLon, projection } from '../analysis/geo'
import type { Dataset, EonetEvent, FrameInfo } from '../nasa/types'
import { spokenDate, spokenLat, spokenLon } from '../../shared/narration.mjs'

// ---------------------------------------------------------------------------
// whole-frame sound
// ---------------------------------------------------------------------------

/**
 * Harmonic sculpting: the frame's own intensity histogram sets the drone's
 * partials (bright frames lift the upper harmonics), its mean intensity sets
 * level and brightness, and a dataset-specific statistic drives the noise bed.
 */
export function ambienceFor(ds: Dataset, s: FrameStats): Ambience {
  const h = s.hist
  const partials = [0.55 + h[0] + h[1], h[2] + h[3] * 0.5, h[3] * 0.5 + h[4], h[5], h[6], h[7]].map((v) => Math.max(0.02, v))
  const droneLevel = 0.025 + 0.06 * s.meanL
  const droneCutoff = 140 + 1500 * s.meanL
  let noiseLevel = 0.012
  let noiseHz = 800
  switch (ds.id) {
    case 'sea-ice': {
      // open-water wash grows as the ice goes
      const ice = Math.min(1, (s.extent ?? 0) / 8)
      noiseLevel = 0.012 + 0.07 * (1 - ice)
      noiseHz = 420 + 600 * ice
      break
    }
    case 'air-temp':
      noiseLevel = 0.01 + 0.04 * s.meanL
      noiseHz = 500 + 1400 * s.meanL
      break
    case 'sst':
      noiseLevel = 0.02 + 0.03 * s.coverage
      noiseHz = 380
      break
    case 'precip':
      noiseLevel = 0.01 + 0.25 * Math.min(1, s.coverage * 3)
      noiseHz = 3600
      break
    case 'storms':
      noiseLevel = 0.03 + 0.05 * s.meanL
      noiseHz = 650
      break
    case 'wildfires':
      noiseLevel = 0.02
      noiseHz = 2400
      break
    case 'volcanoes':
      noiseLevel = 0.02
      noiseHz = 260
      break
  }
  return { partials, droneLevel, droneCutoff, noiseLevel, noiseHz }
}

// ---------------------------------------------------------------------------
// values under the cursor
// ---------------------------------------------------------------------------

export interface ValueText {
  short: string
  spoken: string
}

export function valueText(ds: Dataset, s: Sample): ValueText {
  const v = s.value
  if (/pole/i.test(s.cls)) return { short: 'polar data gap', spoken: 'the polar data gap: not observed, counted as ice' }
  if (/land/i.test(s.cls)) return { short: 'land', spoken: 'land' }
  switch (ds.id) {
    case 'sea-ice':
      if (!Number.isFinite(v) || v < 15) return { short: 'open water', spoken: 'open water' }
      return { short: `${Math.round(v)} % ice`, spoken: `ice concentration ${Math.round(v)} percent` }
    case 'air-temp':
      if (!Number.isFinite(v)) return { short: 'no data', spoken: 'no data' }
      return { short: `${(v - 273.15).toFixed(1)} °C`, spoken: `air temperature ${(v - 273.15).toFixed(1)} degrees Celsius` }
    case 'sst':
      if (!Number.isFinite(v)) return { short: 'land or ice', spoken: 'land or sea ice, no sea surface temperature' }
      return { short: `${v.toFixed(1)} °C`, spoken: `sea surface ${v.toFixed(1)} degrees Celsius` }
    case 'precip':
      if (!Number.isFinite(v)) return { short: 'no rain', spoken: 'no measurable rain' }
      return { short: `${v.toFixed(1)} mm/hr`, spoken: `${v.toFixed(1)} millimetres per hour` }
    default: {
      const b = Math.round(s.luma * 100)
      const fire = s.fire > 0.0005 ? ', fire detections' : ''
      return { short: `brightness ${b} %${s.fire > 0.0005 ? ' · fire' : ''}`, spoken: `brightness ${b} percent${fire}` }
    }
  }
}

// ---------------------------------------------------------------------------
// landmarks
// ---------------------------------------------------------------------------

export interface Landmark {
  id: string
  name: string
  kind: 'place' | 'event' | 'track'
  x: number
  y: number
  lat: number
  lon: number
  event?: EonetEvent
}

export function landmarksFor(ds: Dataset, info: FrameInfo, overlayEvents: EonetEvent[] = []): Landmark[] {
  const proj = projection(info.crs, info.bbox)
  const out: Landmark[] = []
  const push = (l: Omit<Landmark, 'x' | 'y'>) => {
    const p = proj.toXY(l.lat, l.lon)
    if (p) out.push({ ...l, x: p.x, y: p.y })
  }
  if (info.event) {
    const e = info.event
    push({ id: e.id, name: e.title, kind: 'event', lat: e.lat, lon: e.lon, event: e })
    const track = e.track.slice(0, -1).reverse().slice(0, 8)
    track.forEach((t, i) => push({ id: `${e.id}-t${i}`, name: `${e.title}, ${spokenDate(t.date)}`, kind: 'track', lat: t.lat, lon: t.lon }))
    info.nearby.slice(0, 10).forEach((n) => push({ id: n.id, name: n.title, kind: 'event', lat: n.lat, lon: n.lon, event: n }))
  }
  ds.landmarks.forEach((l, i) => push({ id: `p${i}`, name: l.name, kind: 'place', lat: l.lat, lon: l.lon }))
  overlayEvents.forEach((e) => push({ id: e.id, name: e.title, kind: 'event', lat: e.lat, lon: e.lon, event: e }))
  return out
}

export function nearestLandmark(list: Landmark[], x: number, y: number, radius = 0.06): Landmark | null {
  let best: Landmark | null = null
  let bestD = radius
  for (const l of list) {
    const d = Math.hypot(l.x - x, l.y - y)
    if (d < bestD) {
      best = l
      bestD = d
    }
  }
  return best
}

export function placeText(info: FrameInfo, x: number, y: number) {
  const { lat, lon } = projection(info.crs, info.bbox).toLatLon(x, y)
  return { lat, lon, short: formatLatLon(lat, lon), spoken: `${spokenLat(lat)}, ${spokenLon(lon)}` }
}

// ---------------------------------------------------------------------------
// Time Machine sweep
// ---------------------------------------------------------------------------

/** Where the listening point travels while the frames morph. */
export function sweepPoint(ds: Dataset, u: number): { x: number; y: number } {
  if (ds.crs === 'EPSG:3413') {
    // two loops around the pole at ~78°N: ice in 1984, much of it water now
    const a = u * Math.PI * 4 - Math.PI / 2
    return { x: 0.5 + 0.19 * Math.cos(a), y: 0.5 + 0.19 * Math.sin(a) }
  }
  return { x: 0.06 + 0.88 * u, y: 0.5 - 0.3 * Math.sin(u * Math.PI * 3) }
}
