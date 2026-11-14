/**
 * Scales and note maths. Deliberately free of any Tone.js import so the mapping
 * can be unit-tested in isolation (see src/audio/mapping.test.ts).
 */

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']

const DEGREES: Record<string, number[]> = {
  lydian: [0, 2, 4, 6, 7, 9, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
}

export type ScaleName = keyof typeof DEGREES

/** "D3" → 50. A bare name ("D") is read as octave 3, which is what scene.json uses. */
export function noteToMidi(note: string): number {
  const m = /^([A-G]#?)(-?\d+)?$/.exec(note.trim())
  if (!m) throw new Error(`Unparseable note: ${note}`)
  const octave = m[2] === undefined ? 3 : Number(m[2])
  return NAMES.indexOf(m[1]) + (octave + 1) * 12
}

/** 50 → "D3" */
export function midiToNote(midi: number): string {
  return `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`
}

/**
 * Every degree of the scale, ascending from the root, across `octaves` octaves.
 * This is the only set of pitches the scene will ever play: the mapping can
 * never produce a sour note.
 */
export function scaleNotes(root: string, scale: string, octaves = 3): string[] {
  const steps = DEGREES[scale] ?? DEGREES.major
  const base = noteToMidi(root)
  const out: number[] = []
  for (let o = 0; o < octaves; o++) {
    for (const s of steps) out.push(base + o * 12 + s)
  }
  return out.map(midiToNote)
}
