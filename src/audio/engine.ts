import * as Tone from 'tone'
import { scaleNotes } from './scales'
import { accentFor, cellAt, cutoffFor, gainFor, hueWeights, panFor, pitchIndex } from './mapping'
import type { Cell, Readout, Scene } from '../scene/types'

/**
 * One scene, one audio graph.
 *
 *   drone + noise ─────┐
 *   4 fixed lead voices ┼─► lowpass ─► Panner3D ─► duck ─┬─► compressor ─► limiter(−3 dB) ─► master ─► out
 *   accent bell ───────┘                                └─► reverb send ─► compressor
 *
 * Design rules this file is responsible for:
 *  - timbre never changes by switching an oscillator type; four fixed voices are
 *    crossfaded by hue instead, so there are no clicks;
 *  - pitch is always a note of the scene's scale, reached by portamento;
 *  - every parameter moves with a ramp, never a jump;
 *  - the limiter is always last, and the master sits before it so it can never clip.
 */

type LeadSynth = Tone.MonoSynth | Tone.FMSynth

interface Lead {
  synth: LeadSynth
  gain: Tone.Gain
}

interface PreviewVoice {
  synth: LeadSynth
  gain: Tone.Gain
}

const RAMP = 0.09

/** One place to set the overall loudness. The limiter sits after this, so raising
 * it only asks the limiter to work harder — it can never push the output past 0 dBFS. */
const MASTER_GAIN = 3.0

/** Canonical order. `hueWeights` is indexed by this order. */
const CANON = ['warm', 'hollow', 'glass', 'shimmer'] as const

/** The four fixed voices. A scene chooses their order, never their shape. */
const VOICES: Record<string, () => LeadSynth> = {
  warm: () =>
    new Tone.MonoSynth({
      oscillator: { type: 'fatsawtooth', count: 3, spread: 12 },
      filter: { Q: 0.6, type: 'lowpass', rolloff: -24 },
      envelope: { attack: 1.2, decay: 0.4, sustain: 0.95, release: 3.5 },
      filterEnvelope: { attack: 1.2, decay: 0.6, sustain: 0.5, release: 2, baseFrequency: 240, octaves: 2 },
      portamento: 0.14,
      volume: -4,
    }),
  hollow: () =>
    new Tone.MonoSynth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.9, decay: 0.5, sustain: 0.8, release: 3 },
      filterEnvelope: { attack: 0.9, decay: 0.5, sustain: 0.6, release: 2, baseFrequency: 500, octaves: 3 },
      portamento: 0.12,
      volume: -3,
    }),
  glass: () =>
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
  shimmer: () =>
    new Tone.MonoSynth({
      oscillator: { type: 'sine' },
      envelope: { attack: 1.4, decay: 0.5, sustain: 0.9, release: 4 },
      filterEnvelope: { attack: 1.4, decay: 0.6, sustain: 0.7, release: 2, baseFrequency: 900, octaves: 2 },
      portamento: 0.16,
      volume: -5,
    }),
}

export const VOICE_LABELS: Record<string, { name: string; blurb: string }> = {
  warm: { name: 'Warm', blurb: 'a rounded pad — reds, oranges, dust' },
  hollow: { name: 'Hollow', blurb: 'a triangle, harp-like — greens and blues' },
  glass: { name: 'Glass', blurb: 'FM bells — cyans and bright whites' },
  shimmer: { name: 'Shimmer', blurb: 'a pure sine with vibrato — violets and magentas' },
}

export class AudioEngine {
  private scene: Scene | null = null
  private notes: string[] = []
  private order: string[] = [...CANON]
  private leads: Lead[] = []
  private drone: { oscs: Tone.ToneAudioNode[]; filter: Tone.Filter; gain: Tone.Gain } | null = null
  private noise: { src: Tone.Noise; filter: Tone.Filter; gain: Tone.Gain } | null = null
  private accent: Tone.FMSynth | null = null
  private accentGain: Tone.Gain | null = null
  private leadFilter: Tone.Filter | null = null
  private panner: Tone.Panner3D | null = null
  private duckGain: Tone.Gain | null = null
  private wetSend: Tone.Gain | null = null
  private reverb: Tone.Reverb | null = null
  private analyser: Tone.Analyser | null = null
  private limiter: Tone.Limiter | null = null
  private comp: Tone.Compressor | null = null
  private droneLfo: Tone.LFO | null = null
  private master: Tone.Gain | null = null
  private extra: Tone.ToneAudioNode[] = []
  private previewNodes = new Set<PreviewVoice>()

  private started = false
  private muted = false
  private ducked = false
  private lastNoteIndex = -1
  private lastAccentAt = 0
  private noiseTarget = 0
  private graphVersion = 0
  private playbackVersion = 0
  private legendVersion = 0
  private legendTimer: ReturnType<typeof setTimeout> | null = null
  private legendWaitResolve: ((active: boolean) => void) | null = null
  private narrationTimer: ReturnType<typeof setTimeout> | null = null

  get running() {
    return this.started
  }

  get sceneId() {
    return this.scene?.id ?? null
  }

  async unlock() {
    await Tone.start()
  }

  async init(scene: Scene) {
    if (this.scene?.id === scene.id && this.leadFilter) return

    this.dispose()
    const version = this.graphVersion
    this.scene = scene
    this.notes = scaleNotes(scene.sound.root, scene.sound.scale, 3)

    // The legend and hue mapping use the same canonical indices in every scene.
    // A scene's root, scale, drone and reverb provide its own sound identity.
    this.order = [...CANON]

    const limiter = new Tone.Limiter(-3).toDestination()
    const comp = new Tone.Compressor({ threshold: -20, ratio: 3, attack: 0.008, release: 0.25 }).connect(limiter)
    const master = new Tone.Gain(this.muted ? 0 : MASTER_GAIN).connect(comp)
    const duck = new Tone.Gain(1).connect(master)
    const reverb = new Tone.Reverb({ decay: scene.sound.reverbDecay, preDelay: 0.02, wet: 1 })
    const wet = new Tone.Gain(0.42).connect(reverb)
    reverb.connect(master)
    const panner = new Tone.Panner3D({
      panningModel: 'HRTF',
      distanceModel: 'inverse',
      positionX: 0,
      positionY: 0,
      positionZ: 0.9,
      refDistance: 1,
      rolloffFactor: 0.4,
    })
    panner.connect(duck)
    // Split after ducking so narration attenuates both dry and reverb paths.
    duck.connect(wet)

    const leadFilter = new Tone.Filter({ type: 'lowpass', frequency: 1800, rolloff: -24, Q: 0.4 }).connect(panner)

    // ---- four fixed timbres, crossfaded by hue -----------------------------
    const extra: Tone.ToneAudioNode[] = []
    this.leads = this.order.map((name) => {
      const synth = VOICES[name]()
      const gain = new Tone.Gain(0)
      synth.connect(gain)
      if (name === 'shimmer') {
        const vib = new Tone.Vibrato({ frequency: 4.2, depth: 0.08 })
        gain.connect(vib)
        vib.connect(leadFilter)
        extra.push(vib)
      } else {
        gain.connect(leadFilter)
      }
      return { synth, gain }
    })

    // ---- drone: character comes from the scene -----------------------------
    // a bare note name ('D') is not a frequency — anchor on the lowest scale note
    const rootHz = Tone.Frequency(this.notes[0]).toFrequency()
    const droneFilter = new Tone.Filter({ frequency: 260, type: 'lowpass', rolloff: -24, Q: 0.7 })
    const droneGain = new Tone.Gain(0)
    const oscs: Tone.ToneAudioNode[] = []
    const type = scene.sound.drone
    if (type === 'choir') {
      oscs.push(new Tone.Oscillator({ frequency: rootHz / 2, type: 'triangle' }).start())
      oscs.push(new Tone.Oscillator({ frequency: rootHz * 1.5, type: 'triangle', detune: 6 }).start())
      oscs.push(new Tone.Oscillator({ frequency: rootHz * 2, type: 'sine', detune: -8 }).start())
    } else if (type === 'wind' || type === 'organic') {
      oscs.push(new Tone.Oscillator({ frequency: rootHz, type: 'sine' }).start())
      oscs.push(new Tone.Oscillator({ frequency: rootHz * 2.02, type: 'sine' }).start())
    } else {
      oscs.push(new Tone.FatOscillator({ frequency: rootHz, type: 'sine', count: 3, spread: 8 }).start())
      oscs.push(new Tone.Oscillator({ frequency: rootHz * 1.5, type: 'sine' }).start())
    }
    oscs.forEach((o) => o.connect(droneFilter))
    droneFilter.connect(droneGain)
    droneGain.connect(duck)

    // The drone filter is driven by a slow LFO, so its own automation is
    // overridden — we move the LFO's bounds instead of ramping the filter.
    const lfoMin = 150 + scene.histogram.brightness * 260
    const lfoMax = 320 + scene.histogram.brightness * 900
    const lfo = new Tone.LFO({ frequency: type === 'wind' ? 0.08 : 0.045, min: lfoMin, max: lfoMax }).start()
    lfo.connect(droneFilter.frequency)

    // ---- optional noise bed (wind, forest) ---------------------------------
    let noise: { src: Tone.Noise; filter: Tone.Filter; gain: Tone.Gain } | null = null
    const noiseCfg = scene.sound.noise ?? (type === 'wind' ? { level: 0.05, cutoff: 900 } : null)
    if (noiseCfg) {
      const src = new Tone.Noise('pink').start()
      const filter = new Tone.Filter({ type: 'bandpass', frequency: noiseCfg.cutoff, Q: 0.6 })
      const gain = new Tone.Gain(0)
      src.connect(filter)
      filter.connect(gain)
      gain.connect(duck)
      noise = { src, filter, gain }
      this.noiseTarget = noiseCfg.level
    } else {
      this.noiseTarget = 0
    }

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

    // Assign the complete graph before awaiting Reverb generation. If init or
    // dispose is called again while it is pending, graphVersion makes the old
    // continuation inert and the next dispose owns these references.
    this.limiter = limiter
    this.comp = comp
    this.master = master
    this.reverb = reverb
    this.wetSend = wet
    this.duckGain = duck
    this.panner = panner
    this.leadFilter = leadFilter
    this.drone = { oscs, filter: droneFilter, gain: droneGain }
    this.noise = noise
    this.droneLfo = lfo
    this.accent = accent
    this.accentGain = accentGain
    this.analyser = analyser
    this.extra = extra
    this.started = false
    this.ducked = false

    try {
      await reverb.ready
    } catch {
      /* older Tone builds generate synchronously */
    }

    // A newer init/dispose may already own or have disposed the graph. Never
    // touch the current graph from this stale continuation.
    if (version !== this.graphVersion) return
  }

  async start() {
    if (!this.scene || this.started) return
    const version = this.graphVersion
    const playback = this.playbackVersion
    await this.unlock()
    if (version !== this.graphVersion || playback !== this.playbackVersion || !this.scene || this.started) return
    const startIdx = Math.floor(this.notes.length * 0.6)
    this.leads.forEach(({ synth }) => synth.triggerAttack(this.notes[startIdx]))
    this.drone?.gain.gain.rampTo(0.02, 3)
    this.noise?.gain.gain.rampTo(this.noiseTarget, 4)
    this.started = true
    this.lastNoteIndex = startIdx
  }

  cancelPendingStart() {
    this.playbackVersion++
  }

  stop() {
    this.cancelPendingStart()
    this.cancelLegend()
    if (!this.started) return
    this.leads.forEach(({ synth, gain }) => {
      gain.gain.rampTo(0, 0.4)
      synth.triggerRelease()
    })
    this.drone?.gain.gain.rampTo(0, 0.6)
    this.noise?.gain.gain.rampTo(0, 0.6)
    this.started = false
  }

  /** Move the cursor. Called on every pointer move / key press. */
  update(x: number, y: number): Readout | null {
    if (!this.scene) return null
    const cell = cellAt(this.scene.grid, x, y)
    return this.apply(cell, x, y)
  }

  /** Apply an explicit cell — used by the Time Machine, which hands us an
   *  interpolated cell rather than one read from the grid. */
  apply(cell: Cell, x: number, y: number): Readout | null {
    if (!this.scene || !this.started) return null
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
    this.leads.forEach(({ gain }, i) => {
      const w = weights[CANON.indexOf(this.order[i] as (typeof CANON)[number])] ?? 0.25
      gain.gain.rampTo(w * level, RAMP)
    })

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

  private isLegendCurrent(token: number, version: number) {
    return token === this.legendVersion && version === this.graphVersion && this.started && this.leads.length > 0
  }

  private waitForLegend(ms: number, token: number, version: number): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.isLegendCurrent(token, version)) {
        resolve(false)
        return
      }
      this.legendWaitResolve = resolve
      this.legendTimer = setTimeout(() => {
        this.legendTimer = null
        this.legendWaitResolve = null
        resolve(this.isLegendCurrent(token, version))
      }, ms)
    })
  }

  /** Cancel the current Sound Legend, including its pending wait. */
  cancelLegend() {
    this.legendVersion += 1
    if (this.legendTimer !== null) {
      clearTimeout(this.legendTimer)
      this.legendTimer = null
    }
    const resolve = this.legendWaitResolve
    this.legendWaitResolve = null
    resolve?.(false)
    if (this.leads.length) {
      this.leads.forEach(({ gain }) => gain.gain.rampTo(0, 0.15))
    }
  }

  /** Solo each voice in turn — the Sound Legend. Returns when it is done or canceled. */
  async legend(onStep?: (index: number) => void) {
    this.cancelLegend()
    const token = this.legendVersion
    const version = this.graphVersion
    if (!this.started || !this.leads.length) return

    const weights = [0, 0, 0, 0]
    const note = this.notes[Math.floor(this.notes.length * 0.55)]
    for (let i = 0; i < this.leads.length; i++) {
      if (!this.isLegendCurrent(token, version)) return
      onStep?.(i)
      weights.fill(0)
      const layer = CANON.indexOf(this.order[i] as (typeof CANON)[number])
      if (layer >= 0) weights[layer] = 1
      this.leads.forEach(({ gain }, k) => gain.gain.rampTo(weights[CANON.indexOf(this.order[k] as (typeof CANON)[number])] * 0.5, 0.25))
      this.leadFilter?.frequency.rampTo(1500, 0.3)
      this.leads[i].synth.setNote(note, Tone.now())
      if (!(await this.waitForLegend(1500, token, version))) return
    }
    if (!this.isLegendCurrent(token, version)) return
    onStep?.(-1)
    this.leads.forEach(({ gain }) => gain.gain.rampTo(0, 0.4))
  }

  /**
   * Preview one canonical voice using the same cancellable solo as the legend.
   * No temporary fifth voice is created and cancellation settles its wait.
   */
  async previewVoice(name: string, seconds = 1.5) {
    this.cancelLegend()
    const token = this.legendVersion
    const version = this.graphVersion
    const index = this.order.indexOf(name)
    if (index < 0 || !this.isLegendCurrent(token, version)) return
    const note = this.notes[Math.floor(this.notes.length * 0.55)]
    this.leads.forEach(({ gain }, i) => gain.gain.rampTo(i === index ? 0.5 : 0, 0.25))
    this.leadFilter?.frequency.rampTo(1500, 0.3)
    this.leads[index].synth.setNote(note, Tone.now())
    const duration = Number.isFinite(seconds) ? Math.max(0, seconds) * 1000 : 1500
    if (await this.waitForLegend(duration, token, version)) this.leads.forEach(({ gain }) => gain.gain.rampTo(0, .3))
  }

  /** Duck all engine output (dry and reverb share this point) for narration. */
  setNarrating(on: boolean) {
    if (this.narrationTimer !== null) {
      clearTimeout(this.narrationTimer)
      this.narrationTimer = null
    }
    if (!this.duckGain) {
      this.ducked = on
      return
    }
    const now = Tone.now()
    this.duckGain.gain.cancelScheduledValues(now)
    this.duckGain.gain.rampTo(on ? 0.25 : 1, on ? 0.15 : 0.4)
    this.ducked = on
  }

  duck(seconds = 1.2) {
    if (!this.duckGain || this.muted) return
    this.setNarrating(true)
    this.narrationTimer = setTimeout(() => {
      this.narrationTimer = null
      this.setNarrating(false)
    }, Math.max(0, seconds * 1000))
  }

  setMuted(muted: boolean) {
    this.muted = muted
    if (muted) {
      this.master?.gain.rampTo(0, 0.2)
    } else {
      this.master?.gain.rampTo(MASTER_GAIN, 0.2)
    }
  }

  get isMuted() {
    return this.muted
  }

  get isDucked() {
    return this.ducked
  }

  /** Fade the whole graph out before swapping scenes. */
  fadeOut(seconds = 0.6) {
    this.master?.gain.rampTo(0, seconds)
  }

  fadeIn(seconds = 1.2) {
    if (!this.muted) this.master?.gain.rampTo(MASTER_GAIN, seconds)
  }

  waveform(): Float32Array | null {
    const v = this.analyser?.getValue()
    return v instanceof Float32Array ? v : null
  }

  private disposeNode(node: { dispose(): unknown } | null | undefined) {
    try {
      node?.dispose()
    } catch {
      /* already gone */
    }
  }

  dispose() {
    this.cancelLegend()
    this.graphVersion += 1
    if (this.narrationTimer !== null) {
      clearTimeout(this.narrationTimer)
      this.narrationTimer = null
    }

    this.previewNodes.forEach(({ synth, gain }) => {
      this.disposeNode(synth)
      this.disposeNode(gain)
    })
    this.previewNodes.clear()

    this.leads.forEach(({ synth, gain }) => {
      this.disposeNode(synth)
      this.disposeNode(gain)
    })
    this.extra.forEach((node) => this.disposeNode(node))
    this.droneLfo && this.disposeNode(this.droneLfo)
    this.drone?.oscs.forEach((node) => this.disposeNode(node))
    this.disposeNode(this.drone?.filter)
    this.disposeNode(this.drone?.gain)
    this.disposeNode(this.noise?.src)
    this.disposeNode(this.noise?.filter)
    this.disposeNode(this.noise?.gain)
    this.disposeNode(this.accent)
    this.disposeNode(this.accentGain)
    this.disposeNode(this.leadFilter)
    this.disposeNode(this.panner)
    this.disposeNode(this.duckGain)
    this.disposeNode(this.wetSend)
    this.disposeNode(this.reverb)
    this.disposeNode(this.comp)
    this.disposeNode(this.analyser)
    this.disposeNode(this.limiter)
    this.disposeNode(this.master)

    this.leads = []
    this.extra = []
    this.drone = null
    this.noise = null
    this.accent = null
    this.accentGain = null
    this.leadFilter = null
    this.panner = null
    this.duckGain = null
    this.wetSend = null
    this.reverb = null
    this.comp = null
    this.analyser = null
    this.limiter = null
    this.droneLfo = null
    this.master = null
    this.started = false
    this.scene = null
    this.notes = []
    this.order = [...CANON]
    this.noiseTarget = 0
    this.ducked = false
    this.lastNoteIndex = -1
  }
}
