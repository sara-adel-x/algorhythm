/**
 * Map geometry for the two GIBS projections we use. Pure maths, shared by the
 * worker (pixel areas) and the UI (landmark positions, lat/lon readouts).
 *
 * EPSG:3413 is NSIDC's polar stereographic north: WGS84, true scale at 70°N,
 * central meridian −45°. Formulas from Snyder, "Map Projections — A Working
 * Manual" (USGS PP 1395), §21.
 */

export type Crs = 'EPSG:4326' | 'EPSG:3413'
export type BBox = [number, number, number, number]

const A = 6378137.0
const E = 0.0818191908426
const PHI_C = (70 * Math.PI) / 180
const LON0 = (-45 * Math.PI) / 180
const R_EARTH_KM = 6371.0088

const tFn = (phi: number) =>
  Math.tan(Math.PI / 4 - phi / 2) / Math.pow((1 - E * Math.sin(phi)) / (1 + E * Math.sin(phi)), E / 2)
const mFn = (phi: number) => Math.cos(phi) / Math.sqrt(1 - E * E * Math.sin(phi) ** 2)
const MC = mFn(PHI_C)
const TC = tFn(PHI_C)

export function polarForward(latDeg: number, lonDeg: number): [number, number] {
  const phi = (latDeg * Math.PI) / 180
  const lam = (lonDeg * Math.PI) / 180
  const rho = (A * MC * tFn(phi)) / TC
  return [rho * Math.sin(lam - LON0), -rho * Math.cos(lam - LON0)]
}

export function polarInverse(x: number, y: number): [number, number] {
  const rho = Math.hypot(x, y)
  const t = (rho * TC) / (A * MC)
  const chi = Math.PI / 2 - 2 * Math.atan(t)
  const e2 = E * E
  const e4 = e2 * e2
  const e6 = e4 * e2
  const phi =
    chi +
    (e2 / 2 + (5 * e4) / 24 + e6 / 12) * Math.sin(2 * chi) +
    ((7 * e4) / 48 + (29 * e6) / 240) * Math.sin(4 * chi) +
    ((7 * e6) / 120) * Math.sin(6 * chi)
  const lam = LON0 + Math.atan2(x, -y)
  let lon = (lam * 180) / Math.PI
  lon = ((lon + 540) % 360) - 180
  return [(phi * 180) / Math.PI, lon]
}

/** Scale factor k at latitude φ (areas scale by k²). */
export function polarScale(latDeg: number): number {
  const phi = (latDeg * Math.PI) / 180
  const m = mFn(phi)
  if (m < 1e-9) return (A * MC) / TC / A // at the pole; finite limit is not needed for our grid
  return (A * MC * tFn(phi)) / TC / (A * m)
}

export interface Projection {
  crs: Crs
  bbox: BBox
  /** lat/lon → normalised frame position (0..1), or null if outside. */
  toXY(lat: number, lon: number): { x: number; y: number } | null
  /** normalised frame position → lat/lon */
  toLatLon(x: number, y: number): { lat: number; lon: number }
  /** km² represented by pixel (i, j) of a w × h raster */
  pixelArea(i: number, j: number, w: number, h: number): number
}

export function projection(crs: Crs, bbox: BBox): Projection {
  const [x0, y0, x1, y1] = bbox
  if (crs === 'EPSG:3413') {
    return {
      crs,
      bbox,
      toXY(lat, lon) {
        const [x, y] = polarForward(lat, lon)
        const nx = (x - x0) / (x1 - x0)
        const ny = (y1 - y) / (y1 - y0)
        return nx < 0 || nx > 1 || ny < 0 || ny > 1 ? null : { x: nx, y: ny }
      },
      toLatLon(nx, ny) {
        const [lat, lon] = polarInverse(x0 + nx * (x1 - x0), y1 - ny * (y1 - y0))
        return { lat, lon }
      },
      pixelArea(i, j, w, h) {
        const px = (x1 - x0) / w / 1000
        const py = (y1 - y0) / h / 1000
        const [lat] = polarInverse(x0 + (i + 0.5) * ((x1 - x0) / w), y1 - (j + 0.5) * ((y1 - y0) / h))
        const k = polarScale(lat)
        return (px * py) / (k * k)
      },
    }
  }
  return {
    crs,
    bbox,
    toXY(lat, lon) {
      const nx = (lon - x0) / (x1 - x0)
      const ny = (y1 - lat) / (y1 - y0)
      return nx < 0 || nx > 1 || ny < 0 || ny > 1 ? null : { x: nx, y: ny }
    },
    toLatLon(nx, ny) {
      return { lon: x0 + nx * (x1 - x0), lat: y1 - ny * (y1 - y0) }
    },
    pixelArea(_i, j, w, h) {
      const dLon = (((x1 - x0) / w) * Math.PI) / 180
      const latTop = y1 - (j * (y1 - y0)) / h
      const latBot = y1 - ((j + 1) * (y1 - y0)) / h
      // exact spherical band area for one pixel column
      return R_EARTH_KM * R_EARTH_KM * dLon * Math.abs(Math.sin((latTop * Math.PI) / 180) - Math.sin((latBot * Math.PI) / 180))
    },
  }
}

export function formatLatLon(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S'
  const ew = lon >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(1)}°${ns} ${Math.abs(lon).toFixed(1)}°${ew}`
}
