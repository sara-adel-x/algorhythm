/**
 * The sonification contract, as pure functions.
 *
 *   y (top = 0)      → pitch, quantised to the scene's scale
 *   x (left = 0)     → stereo / 3D position
 *   lightness        → loudness and filter cutoff
 *   hue              → which of four fixed timbres is blended in
 *   edge strength    → a short accent
 *   near-black       → near silence, only the drone
 *
 * Nothing here touches the audio graph, so every rule is testable and every
 * number in the "How it sounds" page is the number the engine actually uses.
 */

export const HUE_ANCHORS = [
  { at: 0, layer: 0, name: 'warm' },
  { at: 110, layer: 1, name: 'hollow' },
  { at: 215, layer: 2, name: 'glass' },
  { at: 300, layer: 3, name: 'shimmer' },
] as const

/** Pitch index for a vertical position. y = 0 is the top of the image (highest note). */
export function pitchIndex(y: number, count: number): number {
  const clamped = Math.min(1, Math.max(0, y))
  return Math.round((1 - clamped) * (count - 1))
}

/** Stereo position, -1 (left) … +1 (right). */
export function panFor(x: number): number {
  return Math.min(1, Math.max(0, x)) * 2 - 1
}

/** Loudness curve. Perceptual, capped, and always 0 for black space. */
export function gainFor(l: number): number {
  const clamped = Math.min(1, Math.max(0, l))
  if (clamped < 0.06) return 0
  return Math.min(1, Math.pow(clamped, 1.35))
}

/**
 * Filter cutoff in Hz: 180 Hz at black, ~3.2 kHz at white.
 *
 * The exponent is deliberately less than 1: a 16 x 12 block that is mostly black
 * space with one bright filament in it reads at L 0.25, and a faithful linear
 * cutoff would muffle it to 365 Hz — the listener hears a dim sound on the
 * brightest visible structure in the frame. Opening the mid-tones keeps the
 * picture legible without making black space bright.
 */
export function cutoffFor(l: number): number {
  const clamped = Math.min(1, Math.max(0, l))
  return Math.min(3500, Math.max(180, 180 * Math.pow(18, Math.pow(clamped, 0.6))))
}

/**
 * Crossfade weights for the four fixed timbres. At most two layers are audible
 * at any moment, which is why the texture never turns to mush.
 */
export function hueWeights(hue: number): [number, number, number, number] {
  const h = ((hue % 360) + 360) % 360
  const out: [number, number, number, number] = [0, 0, 0, 0]
  for (let i = 0; i < HUE_ANCHORS.length; i++) {
    const a = HUE_ANCHORS[i]
    const b = HUE_ANCHORS[(i + 1) % HUE_ANCHORS.length]
    const span = (b.at - a.at + 360) % 360 || 360
    const d = (h - a.at + 360) % 360
    if (d <= span) {
      const t = d / span
      out[a.layer] += 1 - t
      out[b.layer] += t
      break
    }
  }
  const total = out.reduce((s, v) => s + v, 0) || 1
  return out.map((v) => v / total) as [number, number, number, number]
}

/** Should this cell produce an accent? */
export function accentFor(edge: number, threshold = 0.35): number {
  if (edge < threshold) return 0
  return Math.min(1, (edge - threshold) / (1 - threshold))
}

/** Nearest cell for a normalised position. */
export function cellAt(
  grid: { cols: number; rows: number; cells: { h: number; s: number; l: number; e: number }[] },
  x: number,
  y: number,
) {
  const col = Math.min(grid.cols - 1, Math.max(0, Math.floor(x * grid.cols)))
  const row = Math.min(grid.rows - 1, Math.max(0, Math.floor(y * grid.rows)))
  return grid.cells[row * grid.cols + col]
}
