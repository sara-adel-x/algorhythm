import * as Tone from 'tone'
import { scaleNotes } from './scales'
import { accentFor, cutoffFor, gainFor, panFor, pitchIndex, toDb, VOICE_NAMES, voiceWeights, type VoiceName } from './mapping'
import type { Sample } from '../analysis/analyze'

/**
 * One audio graph per dataset, driven entirely by analysed NASA pixels.
 *
 *   4 fixed lead voices ─► lowpass (180·18^L) ─► Panner3D (HRTF) ─┐
 *   edge taps, fire crackle ──────────────────────► Panner3D ─────┤
 *   additive drone (6 partials, sculpted by the frame) ───────────┼─► duck ─┬─► master ─► compressor ─► limiter ─► out
 *   pink-noise bed (level/colour from the frame) ─────────────────┘         └─► Convolver (real room IR) ─► master
 *
 * Rules: timbre changes only by crossfading fixed voices; pitch only on scale
 * notes with portamento; every parameter ramps; the limiter is last.
 */

export interface SoundProfile {
  root: string
  scale: string
  ir: string
}

export interface Ambience {
  partials: number[] // 6 relative amplitudes
  droneLevel: number
  droneCutoff: number
  noiseLevel: number
  noiseHz: number
}

export interface Readout {
  note: string
  pan: number
  cutoff: number
  gainDb: number
  weights: [number, number, number, number]
}

const RAMP = 0.08
const MASTER_GAIN = 3.0
/** Narration ducking: −12 dB. */
export const DUCK_DB = -12
const DUCK_GAIN = Math.pow(10, DUCK_DB / 20)

type LeadSynth = Tone.MonoSynth | Tone.FMSynth

const VOICES: Record<VoiceName, () => LeadSynth> = {
  warm: () =>
    new Tone.MonoSynth({
      oscillator: { type: 'fatsawtooth', count: 3, spread: 14 },
      filter: { Q: 0.6, type: 'lowpass', rolloff: -24 },
      envelope: { attack: 1.0, decay: 0.4, sustain: 0.95, release: 3 },
      filterEnvelope: { attack: 1.0, decay: 0.6, sustain: 0.5, release: 2, baseFrequency: 260, octaves: 2 },
      portamento: 0.14,
      volume: -5,
    }),
  hollow: () =>
    new Tone.MonoSynth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.8, decay: 0.5, sustain: 0.8, release: 3 },
      filterEnvelope: { attack: 0.8, decay: 0.5, sustain: 0.6, release: 2, baseFrequency: 500, octaves: 3 },
      portamento: 0.12,
      volume: -3,
    }),
  glass: () =>
    new Tone.FMSynth({
      harmonicity: 3.01,
      modulationIndex: 5,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.6, decay: 0.6, sustain: 0.75, release: 3 },
      modulationEnvelope: { attack: 0.7, decay: 0.4, sustain: 0.4, release: 2 },
      portamento: 0.12,
      volume: -6,
    }),
  shimmer: () =>
    new Tone.MonoSynth({
      oscillator: { type: 'sine' },
      envelope: { attack: 1.2, decay: 0.5, sustain: 0.9, release: 3.5 },
      filterEnvelope: { attack: 1.2, decay: 0.6, sustain: 0.7, release: 2, baseFrequency: 900, octaves: 2 },
      portamento: 0.16,
      volume: -5,
    }),
}

export class AudioEngine {
  private profile: SoundProfile | null = null
  private notes: string[] = []
  private nodes: { dispose(): unknown }[] = []
  private leads: { synth: LeadSynth; gain: Tone.Gain }[] = []
  private leadFilter: Tone.Filter | null = null
  private panner: Tone.Panner3D | null = null
  private drone: { oscs: Tone.Oscillator[]; gains: Tone.Gain[]; filter: Tone.Filter; out: Tone.Gain } | null = null
  private noise: { filter: Tone.Filter; gain: Tone.Gain } | null = null
  private tap: Tone.MembraneSynth | null = null
  private tick: Tone.MetalSynth | null = null
  private crackle: Tone.NoiseSynth | null = null
  private duck: Tone.Gain | null = null
  private master: Tone.Gain | null = null
  private analyser: Tone.Analyser | null = null
  private ambience: Ambience | null = null

  private started = false
  private muted = false
  private graph = 0
  private lastNote = -1
  private lastEdge = 0
  private lastTapAt = 0
  private fireDensity = 0
  private crackleTimer: ReturnType<typeof setInterval> | null = null
  private legendToken = 0
  private legendTimer: ReturnType<typeof setTimeout> | null = null
  private legendResolve: ((ok: boolean) => void) | null = null
  irStatus: 'none' | 'loading' | 'loaded' | 'failed' = 'none'

  get running() {
    return this.started
  }

  get scaleNotes() {
    return this.notes
  }

  async unlock() {
    await Tone.start()
  }

  /** Build (or rebuild) the graph for a dataset's sound profile. */
  async load(profile: SoundProfile) {
    if (
      this.profile &&
      this.profile.root === profile.root &&
      this.profile.scale === profile.scale &&
      this.profile.ir === profile.ir &&
      this.leadFilter
    )
      return
    const wasRunning = this.started
    this.dispose()
    const version = this.graph
    this.profile = profile
    this.notes = scaleNotes(profile.root, profile.scale, 3)
    const keep = <T extends { dispose(): unknown }>(n: T) => {
      this.nodes.push(n)
      return n
    }

    const limiter = keep(new Tone.Limiter(-3).toDestination())
    const comp = keep(new Tone.Compressor({ threshold: -20, ratio: 3, attack: 0.008, release: 0.25 })).connect(limiter)
    const master = keep(new Tone.Gain(this.muted ? 0 : MASTER_GAIN)).connect(comp)
    const duck = keep(new Tone.Gain(1)).connect(master)
    const send = keep(new Tone.Gain(0.38))
    duck.connect(send)
    const convolver = keep(new Tone.Convolver({ normalize: true }))
    send.connect(convolver)
    convolver.connect(master)

    const panner = keep(
      new Tone.Panner3D({
        panningModel: 'HRTF',
        distanceModel: 'inverse',
        positionX: 0,
        positionY: 0,
        positionZ: 0.9,
        refDistance: 1,
        rolloffFactor: 0.4,
      }),
    ).connect(duck)
    const leadFilter = keep(new Tone.Filter({ type: 'lowpass', frequency: 600, rolloff: -24, Q: 0.5 })).connect(panner)

    this.leads = VOICE_NAMES.map((name) => {
      const synth = keep(VOICES[name]())
      const gain = keep(new Tone.Gain(0))
      synth.connect(gain)
      if (name === 'shimmer') {
        const vib = keep(new Tone.Vibrato({ frequency: 4.2, depth: 0.08 }))
        gain.connect(vib)
        vib.connect(leadFilter)
      } else gain.connect(leadFilter)
      return { synth, gain }
    })

    // ---- additive drone: harmonics of the root, an octave down ---------------
    const rootHz = Tone.Frequency(this.notes[0]).toFrequency() / 2
    const droneFilter = keep(new Tone.Filter({ type: 'lowpass', frequency: 300, rolloff: -12, Q: 0.5 }))
    const droneOut = keep(new Tone.Gain(0)).connect(duck)
    droneFilter.connect(droneOut)
    const oscs: Tone.Oscillator[] = []
    const gains: Tone.Gain[] = []
    for (let k = 1; k <= 6; k++) {
      const g = keep(new Tone.Gain(0)).connect(droneFilter)
      const o = keep(new Tone.Oscillator({ frequency: rootHz * k, type: 'sine', detune: (k % 2 ? 1 : -1) * 3 * k })).connect(g)
      o.start()
      oscs.push(o)
      gains.push(g)
    }

    // ---- pink-noise bed ---------------------------------------------------------
    const noiseSrc = keep(new Tone.Noise('pink'))
    const noiseFilter = keep(new Tone.Filter({ type: 'bandpass', frequency: 800, Q: 0.7 }))
    const noiseGain = keep(new Tone.Gain(0)).connect(duck)
    noiseSrc.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseSrc.start()

    // ---- soft percussive accents -------------------------------------------------
    const tapGain = keep(new Tone.Gain(0.5)).connect(panner)
    const tap = keep(
      new Tone.MembraneSynth({
        pitchDecay: 0.03,
        octaves: 2.5,
        envelope: { attack: 0.002, decay: 0.28, sustain: 0, release: 0.2 },
        volume: -14,
      }),
    ).connect(tapGain)
    const tickFilter = keep(new Tone.Filter({ type: 'highpass', frequency: 2400 })).connect(tapGain)
    const tick = keep(
      new Tone.MetalSynth({
        envelope: { attack: 0.001, decay: 0.06, release: 0.05 },
        harmonicity: 5.1,
        modulationIndex: 16,
        resonance: 3200,
        octaves: 1,
        volume: -34,
      }),
    ).connect(tickFilter)
    const crackleFilter = keep(new Tone.Filter({ type: 'bandpass', frequency: 2600, Q: 1.4 })).connect(tapGain)
    const crackle = keep(
      new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.035, sustain: 0 }, volume: -20 }),
    ).connect(crackleFilter)

    const analyser = keep(new Tone.Analyser('waveform', 1024))
    limiter.connect(analyser)

    this.master = master
    this.duck = duck
    this.panner = panner
    this.leadFilter = leadFilter
    this.drone = { oscs, gains, filter: droneFilter, out: droneOut }
    this.noise = { filter: noiseFilter, gain: noiseGain }
    this.tap = tap
    this.tick = tick
    this.crackle = crackle
    this.analyser = analyser

    // A real acoustic impulse response (Voxengo, royalty-free) for the room.
    this.irStatus = 'loading'
    try {
      await convolver.load(`/ir/${profile.ir}.wav`)
      if (version === this.graph) this.irStatus = 'loaded'
    } catch {
      if (version === this.graph) this.irStatus = 'failed'
    }
    if (version !== this.graph) return
    if (wasRunning) await this.start()
  }

  async start() {
    if (!this.leadFilter || this.started) return
    const version = this.graph
    await this.unlock()
    if (version !== this.graph || this.started) return
    const idx = Math.floor(this.notes.length * 0.5)
    this.leads.forEach(({ synth }) => synth.triggerAttack(this.notes[idx]))
    this.drone?.out.gain.rampTo(1, 2.5)
    this.lastNote = idx
    this.started = true
    if (this.ambience) this.setAmbience(this.ambience, 2.5)
    this.crackleTimer = setInterval(() => this.crackleStep(), 45)
  }

  stop() {
    this.cancelLegend()
    if (this.crackleTimer) clearInterval(this.crackleTimer)
    this.crackleTimer = null
    if (!this.started) return
    this.leads.forEach(({ synth, gain }) => {
      gain.gain.rampTo(0, 0.4)
      synth.triggerRelease()
    })
    this.drone?.out.gain.rampTo(0, 0.6)
    this.noise?.gain.gain.rampTo(0, 0.6)
    this.started = false
  }

  /** Map one analysed sample (under the cursor) to the lead voices. */
  apply(s: Sample, x: number, y: number, moved = true): Readout {
    const idx = pitchIndex(y, this.notes.length || 1)
    const weights = voiceWeights(s.spec)
    const level = gainFor(s.l)
    const cutoff = cutoffFor(s.l)
    const out: Readout = { note: this.notes[idx] ?? '', pan: panFor(x), cutoff, gainDb: toDb(level), weights }
    if (!this.started) return out
    if (idx !== this.lastNote) {
      const note = this.notes[idx]
      this.leads.forEach(({ synth }) => synth.setNote(note, Tone.now()))
      this.lastNote = idx
    }
    this.leads.forEach(({ gain }, k) => gain.gain.rampTo(weights[k] * level, RAMP))
    this.leadFilter?.frequency.rampTo(cutoff, 0.1)
    this.panner?.positionX.rampTo(panFor(x) * 1.6, RAMP)
    this.panner?.positionY.rampTo((0.5 - y) * 0.9, RAMP)

    // Edge accents fire when the cursor moves onto a stronger gradient.
    const a = accentFor(s.edge)
    if (moved && a > 0 && s.edge > this.lastEdge + 0.05) this.accent(a)
    this.lastEdge = s.edge
    this.fireDensity = s.fire
    return out
  }

  /** A soft percussive tap (and a faint high tick) for an edge crossing. */
  accent(strength = 0.6) {
    if (!this.started || !this.tap || !this.tick) return
    const now = performance.now()
    if (now - this.lastTapAt < 110) return
    this.lastTapAt = now
    const n = this.notes[Math.max(0, Math.min(this.notes.length - 1, this.lastNote - 7))] ?? 'D2'
    const t = Tone.now()
    this.tap.triggerAttackRelease(n, 0.12, t, 0.25 + 0.55 * strength)
    this.tick.triggerAttackRelease(0.04, t, 0.2 + 0.5 * strength)
  }

  /** Fire detections under the cursor crackle, density ∝ detected fraction. */
  private crackleStep() {
    if (!this.started || !this.crackle || this.fireDensity <= 0.001) return
    const p = Math.min(0.85, this.fireDensity * 9)
    if (Math.random() < p) this.crackle.triggerAttackRelease(0.03, Tone.now(), 0.3 + Math.random() * 0.6)
  }

  /** Whole-frame sound: drone partials, brightness and noise bed. */
  setAmbience(a: Ambience, seconds = 1.5) {
    this.ambience = a
    if (!this.drone || !this.noise) return
    const total = a.partials.reduce((s, v) => s + v, 0) || 1
    this.drone.gains.forEach((g, k) => g.gain.rampTo((a.partials[k] / total) * a.droneLevel, seconds))
    this.drone.filter.frequency.rampTo(a.droneCutoff, seconds)
    this.noise.gain.gain.rampTo(this.started ? a.noiseLevel : 0, seconds)
    this.noise.filter.frequency.rampTo(a.noiseHz, seconds)
  }

  /** −12 dB on everything the engine makes (dry and reverb) while narration plays. */
  setNarrating(on: boolean) {
    if (!this.duck) return
    this.duck.gain.cancelScheduledValues(Tone.now())
    this.duck.gain.rampTo(on ? DUCK_GAIN : 1, on ? 0.15 : 0.5)
  }

  setMuted(m: boolean) {
    this.muted = m
    this.master?.gain.rampTo(m ? 0 : MASTER_GAIN, 0.2)
  }

  get isMuted() {
    return this.muted
  }

  waveform(): Float32Array | null {
    const v = this.analyser?.getValue()
    return v instanceof Float32Array ? v : null
  }

  // ---- Sound Legend --------------------------------------------------------------

  private wait(ms: number, token: number) {
    return new Promise<boolean>((resolve) => {
      if (token !== this.legendToken) return resolve(false)
      this.legendResolve = resolve
      this.legendTimer = setTimeout(() => {
        this.legendTimer = null
        this.legendResolve = null
        resolve(token === this.legendToken && this.started)
      }, ms)
    })
  }

  cancelLegend() {
    this.legendToken++
    if (this.legendTimer) clearTimeout(this.legendTimer)
    this.legendTimer = null
    const r = this.legendResolve
    this.legendResolve = null
    r?.(false)
  }

  /** Solo each voice in turn. Resolves when done or cancelled. */
  async legend(onStep?: (index: number) => void) {
    this.cancelLegend()
    const token = this.legendToken
    if (!this.started) return
    const note = this.notes[Math.floor(this.notes.length * 0.55)]
    for (let i = 0; i < this.leads.length; i++) {
      if (token !== this.legendToken) return
      onStep?.(i)
      this.leads.forEach(({ gain }, k) => gain.gain.rampTo(k === i ? 0.45 : 0, 0.25))
      this.leadFilter?.frequency.rampTo(1600, 0.3)
      this.leads.forEach(({ synth }) => synth.setNote(note, Tone.now()))
      if (!(await this.wait(1600, token))) return
    }
    onStep?.(-1)
    this.leads.forEach(({ gain }) => gain.gain.rampTo(0, 0.4))
  }

  async previewVoice(index: number) {
    this.cancelLegend()
    const token = this.legendToken
    if (!this.started) return
    const note = this.notes[Math.floor(this.notes.length * 0.55)]
    this.leads.forEach(({ gain }, k) => gain.gain.rampTo(k === index ? 0.45 : 0, 0.25))
    this.leadFilter?.frequency.rampTo(1600, 0.3)
    this.leads.forEach(({ synth }) => synth.setNote(note, Tone.now()))
    if (await this.wait(1500, token)) this.leads.forEach(({ gain }) => gain.gain.rampTo(0, 0.3))
  }

  dispose() {
    this.cancelLegend()
    if (this.crackleTimer) clearInterval(this.crackleTimer)
    this.crackleTimer = null
    this.graph++
    for (const n of this.nodes.reverse()) {
      try {
        n.dispose()
      } catch {
        /* already gone */
      }
    }
    this.nodes = []
    this.leads = []
    this.leadFilter = null
    this.panner = null
    this.drone = null
    this.noise = null
    this.tap = null
    this.tick = null
    this.crackle = null
    this.duck = null
    this.master = null
    this.analyser = null
    this.started = false
    this.profile = null
    this.lastNote = -1
    this.irStatus = 'none'
  }
}
