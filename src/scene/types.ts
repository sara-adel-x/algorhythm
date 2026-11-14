export interface Cell {
  /** hue, degrees 0–360 */
  h: number
  /** saturation 0–1 */
  s: number
  /** lightness 0–1 */
  l: number
  /** Sobel edge strength 0–1 */
  e: number
}

export interface Hotspot {
  id: string
  x: number
  y: number
  name: string
  text: string
  cue: 'swell' | 'chime' | 'bloom'
  sourced: 'nasa' | 'image'
  verified: boolean
  cv_agreement: number | null
}

export interface SceneSource {
  agency: string
  telescope?: string
  nasa_id: string
  url: string
  page?: string
  date: string
  wavelength?: string
}

export interface SceneSound {
  root: string
  scale: 'lydian' | 'major' | 'dorian' | 'majorPentatonic' | 'minorPentatonic'
  drone: string
  lead: string
  reverbDecay: number
  feeling: string
}

export interface Scene {
  id: string
  title: string
  subtitle: string
  source: SceneSource
  image: { src: string; w: number; h: number; alt: string }
  sound: SceneSound
  grid: { cols: number; rows: number; cells: Cell[] }
  histogram: {
    brightness: number
    brightest: number
    dark_fraction: number
    edge_density: number
    hue: number
    warmth: number
  }
  hotspots: Hotspot[]
  journey: string[]
  facts: string
}

export interface Readout {
  note: string
  pan: number
  gainDb: number
  cutoff: number
  cell: Cell
}
