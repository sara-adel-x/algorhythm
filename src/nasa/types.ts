/** Types returned by /api/nasa (see server/nasa.mjs). */

export interface ValueSpec {
  name: string
  units: string
  display?: 'C'
  min: number
  max: number
  log?: boolean
  decimals: number
}

export interface Landmark {
  name: string
  lat: number
  lon: number
}

export interface FrameMeta {
  layer: string
  title: string
  instrument: string
  date: string | null
  colormap: string | null
}

export interface Dataset {
  id: string
  number: number
  theme: string
  title: string
  subtitle: string
  kind: 'gibs' | 'event'
  category: string | null
  crs: 'EPSG:4326' | 'EPSG:3413'
  bbox: [number, number, number, number] | null
  size: [number, number]
  value: ValueSpec | null
  recolor: 'ice' | null
  timeMachine: { metric: 'ice-extent' | 'area-mean'; then: string; now: string } | null
  defaultFrame: string
  sound: { root: string; scale: string; ir: string }
  svs: number | null
  library: string
  eventOverlay: string | null
  note: string
  landmarks: Landmark[]
  frames: Record<string, FrameMeta>
  events: { total: number; scope: string; latest: string | null } | null
  status: { ok: boolean; message: string }
}

export interface Catalog {
  generatedAt: string
  datasets: Dataset[]
}

export interface TrackPoint {
  date: string
  lon: number
  lat: number
  magnitudeValue: number | null
  magnitudeUnit: string | null
}

export interface EonetEvent {
  id: string
  title: string
  category: string
  closed: string | null
  link: string
  sources: { id: string; url: string }[]
  date: string
  lon: number
  lat: number
  magnitudeValue: number | null
  magnitudeUnit: string | null
  track: TrackPoint[]
  narration: string
}

export interface EventList {
  category: string
  scope: string
  source: string
  fetchedAt: string
  total: number
  events: EonetEvent[]
}

export interface FrameInfo {
  dataset: string
  frame: string
  crs: Dataset['crs']
  bbox: [number, number, number, number]
  size: [number, number]
  date: string
  layer: string
  title: string
  instrument: string
  colormap: string | null
  /** set when the data layer is fetched in another projection and resampled in the browser */
  source: { crs: Dataset['crs']; bbox: [number, number, number, number]; size: [number, number] } | null
  overlay: { layer: string; title: string } | null
  base: { layer: string; title: string } | null
  images: { data: string; base?: string; overlay?: string }
  upstream: { data: string; base?: string; overlay?: string }
  worldview: string
  event: EonetEvent | null
  nearby: EonetEvent[]
}

export interface ColormapEntry {
  rgb: [number, number, number]
  value: number | null
  lo: number | null
  hi: number | null
  transparent: boolean
  nodata: boolean
  label: string | null
}

export interface Colormap {
  name: string
  url: string
  maps: { title: string | null; units: string | null; entries: ColormapEntry[] }[]
}

export interface LibraryItem {
  nasaId: string
  title: string
  description: string
  date: string | null
  center: string | null
  thumb: string | null
  details: string
}

export interface SvsItem {
  id: number
  title: string
  description: string
  /** speakable summary built from SVS's own title and description */
  fact: string
  released: string | null
  url: string
  image: string | null
  source: string
}
