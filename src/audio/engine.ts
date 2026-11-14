import * as Tone from 'tone'
import { scaleNotes } from './scales'
import { accentFor, cellAt, cutoffFor, gainFor, hueWeights, panFor, pitchIndex } from './mapping'
import type { Readout, Scene } from '../scene/types'

/**
 * One scene, one audio graph.
 *
 *   drone ─────────────┐
 *   4 fixed lead voices ┼─► lowpass ─► Panner3D ─► duck ─┬─► compressor ─► limiter(−3 dB) ─► out
 *   accent bell ───────┘                                └─► reverb send ─► compressor
 *
 * Design rules that this file is responsible for:
 *  - timbre never changes by switching an oscillator type; four fixed voices are
 *    crossfaded by hue instead, so there are no clicks;
 *  - pitch is always a note of the scene's scale, reached by portamento;
 *  - every parameter moves with a ramp, never a jump;
 *  - the limiter is always last and the master starts quiet.
 */

type LeadSynth = Tone.MonoSynth | Tone.FMSynth

interface Lead {
  synth: LeadSynth
  gain: Tone.Gain
}

const RAMP = 0.09

export class AudioEngine {
  private scene: Scene | null = null
  private notes: string[] = []
  private leads: Lead[] = []
  private drone: { a: Tone.FatOscillator; b: Tone.FatOscillator; filter: Tone.Filter; gain: Tone.Gain } | null = null
  private accent: Tone.FMSynth | null = null
  private leadFilter: Tone.Filter | null = null
  private panner: Tone.Panner3D | null = null
  private duckGain: Tone.Gain | null = null
  private wetSend: Tone.Gain | null = null
  private reverb: Tone.Reverb | null = null
  private analyser: Tone.Analyser | null = null
  private limiter: Tone.Limiter | null = null
  private vibratos: Tone.Vibrato[] = []
  private droneLfo: Tone.LFO | null = null

  private started = false
  private muted = false
  private lastNoteIndex = -1
  private lastAccentAt = 0

  get running() {
    return this.started
  }

  async init(scene: Scene) {
    if (this.scene?.id === scene.id) return
    this.dispose()
    this.scene = scene
    this.notes = scaleNotes(scene.sound.root, scene.sound.scale, 3)

    const limiter = new Tone.Limiter(-3).toDestination()
    const comp = new Tone.Compressor({ threshold: -20, ratio: 3, attack: 0.008, release: 0.25 }).connect(limiter)
    const duck = new Tone.Gain(1).connect(comp)
    const reverb = new Tone.Reverb({ decay: scene.sound.reverbDecay, preDelay: 0.02, wet: 1 })
    const wet = new Tone.Gain(0.42).connect(reverb)
    reverb.connect(comp)
    const panner = new Tone.Panner3D({
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      positionX: 0,
      positionY: 0,
      positionZ: 0.9,
      refDistance: 1,
      rolloffFactor: 0.4,
    }).connect(duck)
    panner.connect(wet)

    const leadFilter = new Tone.Filter({ type: 'lowpass', frequency: 1800, rolloff: -24, Q: 0.4 }).connect(panner)

    // ---- four fixed timbres, crossfaded by hue -----------------------------
    const vibratos: Tone.Vibrato[] = []
    const specs: Array<{ make: () => LeadSynth; gain: number }> = [
      {
        // warm: a rounded saw pad, cello-ish
        make: () =>
          new Tone.MonoSynth({
            oscillator: { type: 'fatsawtooth', count: 3, spread: 12 },
            filter: { Q: 0.6, type: 'lowpass', rolloff: -24 },
            envelope: { attack: 1.2, decay: 0.4, sustain: 0.95, release: 3.5 },
            filterEnvelope: { attack: 1.2, decay: 0.6, sustain: 0.5, release: 2, baseFrequency: 240, octaves: 2 },
            portamento: 0.14,
            volume: -4,
          }),
        gain: 0,
      },
      {
        // hollow: a triangle, harp-like
        make: () =>
          new Tone.MonoSynth({
            oscillator: { type: 'triangle' },
            envelope: { attack: 0.9, decay: 0.5, sustain: 0.8, release: 3 },
            filterEnvelope: { attack: 0.9, decay: 0.5, sustain: 0.6, release: 2, baseFrequency: 500, octaves: 3 },
            portamento: 0.12,
            volume: -3,
          }),
        gain: 0,
      },
      {
        // glass: FM bells
        make: () =>
          new Tone.FMSynth({
            harmonicity: 3.01,
            modulationIndex: 6,
            oscillator: { type: 'sine' },
            modulation: { type: 'sine' },
            envelope: { attack: 0.6, decay: 0.6, sustain: 0.7, release: 3.5 },
            modulationEnvelope: { attack: 0.7, decay: 0.4, sustain: 0.4, release: 2 },
            portamento: 0.12,
            volume: -6,
          }),
        gain: 0,
      },
      {
        // shimmer: a sine with slow vibrato
        make: () => {
          const s = new Tone.MonoSynth({
            oscillator: { type: 'sine' },
            envelope: { attack: 1.4, decay: 0.5, sustain: 0.9, release: 4 },
            filterEnvelope: { attack: 1.4, decay: 0.6, sustain: 0.7, release: 2, baseFrequency: 900, octaves: 2 },
            portamento: 0.16,
            volume: -5,
          })
          const vib = new Tone.Vibrato({ frequency: 4.2, depth: 0.08 })
          s.connect(vib)
          vibratos.push(vib)
          return s
        },
        gain: 0,
      },
    ]

    this.leads = specs.map((spec) => {
      const synth = spec.make()
      const gain = new Tone.Gain(0)
      synth.connect(gain)
      gain.connect(leadFilter)
      return { synth, gain }
    })

    // ---- drone -------------------------------------------------------------
    const droneFilter = new Tone.Filter({ frequency: 260, type: 'lowpass', rolloff: -24, Q: 0.7 })
    const droneGain = new Tone.Gain(0)
    const rootHz = Tone.Frequency(scene.sound.root).toFrequency()
    const a = new Tone.FatOscillator({ frequency: rootHz, type: 'sine', count: 3, spread: 8 })
    const b = new Tone.FatOscillator({ frequency: rootHz * 1.5, type: 'sine', count: 2, spread: 5 })
    a.connect(droneFilter)
    b.connect(droneFilter)
    droneFilter.connect(droneGain)
    droneGain.connect(duck)
    // The drone's filter is driven by a slow LFO, so its own automation is
    // overridden — we move the LFO's bounds instead of ramping the filter.
    const lfoMin = 150 + scene.histogram.brightness * 260
    const lfoMax = 320 + scene.histogram.brightness * 900
    const lfo = new Tone.LFO({ frequency: 0.045, min: lfoMin, max: lfoMax }).start()
    lfo.connect(droneFilter.frequency)

    // ---- accent ------------------------------------------------------------
    const accent = new Tone.FMSynth({
      harmonicity: 2.5,
      modulationIndex: 9,
      envelope: { attack: 0.005, decay: 1.1, sustain: 0, release: 1.4 },
      modulationEnvelope: { attack: 0.005, decay: 0.5, sustain: 0, release: 0.8 },
      volume: -20,
    })
    const accentGain = new Tone.Gain(1)
    accent.connect(accentGain)
    accentGain.connect(leadFilter)

    const analyser = new Tone.Analyser('waveform', 2048)
    limiter.connect(analyser)

    this.limiter = limiter
    this.vibratos = vibratos
    this.reverb = reverb
    this.wetSend = wet
    this.duckGain = duck
    this.panner = panner
    this.leadFilter = leadFilter
    this.drone = { a, b, filter: droneFilter, gain: droneGain }
    this.droneLfo = lfo
    this.accent = accent
    this.analyser = analyser

    try {
      await reverb.ready
    } catch {
      /* older Tone builds generate synchronously */
    }
  }

  async start() {
    if (!this.scene || this.started) return
    await Tone.start()
    Tone.getDestination().volume.value = 0
    const startNote = this.notes[Math.floor(this.notes.length * 0.6)]
    this.leads.forEach(({ synth }) => synth.triggerAttack(startNote))
    this.drone?.a.start()
    this.drone?.b.start()
    this.drone?.gain.gain.rampTo(0.02, 3)
    this.started = true
    this.lastNoteIndex = Math.floor(this.notes.length * 0.6)
  }

  stop() {
    if (!this.started) return
    this.leads.forEach(({ synth, gain }) => {
      gain.gain.rampTo(0, 0.4)
      synth.triggerRelease()
    })
    this.drone?.gain.gain.rampTo(0, 0.6)
    this.started = false
  }

  /** Move the cursor. Called on every pointer move / key press. */
  update(x: number, y: number): Readout | null {
    if (!this.scene || !this.started) return null
    const cell = cellAt(this.scene.grid, x, y)
    const idx = pitchIndex(y, this.notes.length)
    const weights = hueWeights(cell.h)
    const loud = gainFor(cell.l)
    const cutoff = cutoffFor(cell.l)

    if (idx !== this.lastNoteIndex) {
      const note = this.notes[idx]
      this.leads.forEach(({ synth }) => synth.setNote(note, Tone.now()))
      this.lastNoteIndex = idx
    }

    const level = cell.l < 0.06 ? 0.015 : 0.55 * loud
    this.leads.forEach(({ gain }, i) => gain.gain.rampTo(weights[i] * level, RAMP))

    this.leadFilter?.frequency.rampTo(cutoff, 0.12)
    this.panner?.positionX.rampTo(panFor(x) * 1.6, RAMP)
    this.panner?.positionY.rampTo((0.5 - y) * 0.9, RAMP)

    const gainDb = level > 0 ? Math.round(20 * Math.log10(level + 1e-6)) : -Infinity
    return { note: this.notes[idx], pan: panFor(x), gainDb, cutoff: Math.round(cutoff), cell }
  }

  /** A short soft accent when crossing an edge or entering a hotspot. */
  ping(strength = 0.6, note?: string) {
    if (!this.started || !this.accent) return
    const now = performance.now()
    if (now - this.lastAccentAt < 140) return
    this.lastAccentAt = now
    const n = note ?? this.notes[Math.min(this.notes.length - 1, this.lastNoteIndex + 2)]
    this.accent.triggerAttackRelease(n, '8n', Tone.now(), 0.35 + strength * 0.5)
  }

  /** Edge ticks, driven by the grid. */
  maybeAccent(cell: { e: number }) {
    const s = accentFor(cell.e, 0.3)
    if (s > 0) this.ping(s)
  }

  duck(seconds = 1.2) {
    if (!this.duckGain) return
    const now = Tone.now()
    this.duckGain.gain.cancelScheduledValues(now)
    this.duckGain.gain.rampTo(0.25, 0.15)
    this.duckGain.gain.rampTo(1, 0.4, now + seconds)
  }

  setMuted(muted: boolean) {
    this.muted = muted
    this.duckGain?.gain.rampTo(muted ? 0 : 1, 0.25)
  }

  get isMuted() {
    return this.muted
  }

  waveform(): Float32Array | null {
    const v = this.analyser?.getValue()
    return v instanceof Float32Array ? v : null
  }

  dispose() {
    this.leads.forEach(({ synth, gain }) => {
      try {
        synth.dispose()
        gain.dispose()
      } catch {
        /* already gone */
      }
    })
    this.leads = []
    try {
      this.vibratos.forEach((v) => v.dispose())
      this.droneLfo?.dispose()
      this.drone?.a.dispose()
      this.drone?.b.dispose()
      this.drone?.filter.dispose()
      this.drone?.gain.dispose()
      this.accent?.dispose()
      this.leadFilter?.dispose()
      this.panner?.dispose()
      this.duckGain?.dispose()
      this.wetSend?.dispose()
      this.reverb?.dispose()
      this.analyser?.dispose()
      this.limiter?.dispose()
    } catch {
      /* noop */
    }
    this.drone = null
    this.accent = null
    this.analyser = null
    this.started = false
    this.scene = null
    this.lastNoteIndex = -1
  }
}
