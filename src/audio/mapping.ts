/**
 * The sonification contract, as pure functions. Every number shown in the
 * "How it works" panel is the number these functions return.
 *
 *   y (top = 0)        → pitch, quantised to the dataset's scale
 *   x (left = 0)       → HRTF position, left … right
 *   intensity L (0..1) → lowpass cutoff 180·18^L Hz, and gain
 *   hue spectrum       → crossfade of four fixed timbres
 *   Sobel edge         → soft percussive accent
 *   no data / L≈0      → near silence
 */

export const VOICE_NAMES = ['warm', 'hollow', 'glass', 'shimmer'] as const
export type VoiceName = (typeof VOICE_NAMES)[number]

export const VOICE_LABELS: Record<VoiceName, { name: string; hue: string; blurb: string }> = {
  warm: { name: 'Warm', hue: 'reds and oranges', blurb: 'a rounded, detuned pad' },
  hollow: { name: 'Hollow', hue: 'yellows and greens', blurb: 'a soft triangle, harp-like' },
  glass: { name: 'Glass', hue: 'cyans, blues, whites and greys', blurb: 'FM bells' },
  shimmer: { name: 'Shimmer', hue: 'violets and magentas', blurb: 'a pure sine with vibrato' },
}

/** Pitch index for a vertical position. y = 0 is the top of the frame (highest note). */
export function pitchIndex(y: number, count: number): number {
  const c = Math.min(1, Math.max(0, y))
  return Math.round((1 - c) * (count - 1))
}

/** Stereo position, −1 (left) … +1 (right). */
export function panFor(x: number): number {
  return Math.min(1, Math.max(0, x)) * 2 - 1
}

/** Lowpass cutoff in Hz: 180 at L = 0, 3,240 at L = 1. */
export function cutoffFor(l: number): number {
  const c = Math.min(1, Math.max(0, l))
  return 180 * Math.pow(18, c)
}

/** Below this intensity the lead is held at a whisper: "no data is near silence". */
export const SILENCE_FLOOR = 0.04

/** Lead gain (linear), perceptually shaped, ≈ 0 for no data. */
export function gainFor(l: number): number {
  const c = Math.min(1, Math.max(0, l))
  if (c < SILENCE_FLOOR) return 0.012
  return 0.55 * Math.pow(c, 1.2)
}

/** Timbre weights from a cell's hue-spectrum density; sums to 1. */
export function voiceWeights(spec: ArrayLike<number>): [number, number, number, number] {
  const total = spec[0] + spec[1] + spec[2] + spec[3]
  if (total < 1e-6) return [0, 0, 1, 0]
  return [spec[0] / total, spec[1] / total, spec[2] / total, spec[3] / total]
}

/** Accent strength for an edge value; 0 below the threshold. */
export function accentFor(edge: number, threshold = 0.35): number {
  if (edge < threshold) return 0
  return Math.min(1, (edge - threshold) / (1 - threshold))
}

export const toDb = (g: number) => (g > 0 ? 20 * Math.log10(g) : -Infinity)
