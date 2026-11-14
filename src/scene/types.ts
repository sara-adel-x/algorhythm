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
  /** pre-generated narration, falls back to the browser voice when missing */
  audio: string
  cue: string
  /** "nasa": paraphrases NASA's own description. "image": describes the frame. */
  sourced: 'nasa' | 'image'
  verified: boolean
  cv_agreement: number | null
}

export interface SceneSource {
  agency: string
  id: string
  date: string
  url: string
}

export interface SceneSound {
  root: string
  scale: string
  /** which of the four fixed voices this scene uses, in priority order */
  lead: string[]
  drone: string
  reverbDecay: number
  noise?: { level: number; cutoff: number }
}

export interface TimeMachine {
  from: string
  to: string
  labels: [string, string]
  caption: string
}

export interface Scene {
  id: string
  title: string
  subtitle: string
  eyebrow: string
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
  journeyIntro: string
  facts: string
  timeMachine?: TimeMachine
}

export interface Readout {
  note: string
  pan: number
  gainDb: number
  cutoff: number
  cell: Cell
}

export type Mode = 'explore' | 'journey' | 'time' | 'blind'
