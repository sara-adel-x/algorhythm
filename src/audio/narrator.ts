/**
 * The narrator.
 *
 * Only real, pre-generated MP3 recordings are ever played (see
 * public/narration/manifest.json and pipeline/bake_narration.mjs). A clip is
 * chosen by exact text match, so a recording can never say something the live
 * data does not. When no recording exists — a new EONET event, a description
 * of an arbitrary point — the sentence is published as text only: in the
 * visible transcript and the aria-live="polite" region. There is no
 * SpeechSynthesis voice anywhere in the app.
 *
 * In screen-reader mode nothing is played: the user's own screen reader reads
 * the aria-live region.
 */

export interface Clip {
  id: string
  text: string
  src: string
  seconds?: number
}

export interface NarratorState {
  /** a line is in progress (recording playing, or text-only line being shown) */
  speaking: boolean
  /** a recording is actually playing */
  voiced: boolean
  text: string
  clip: string | null
}

type Listener = (s: NarratorState) => void

export class Narrator {
  private clips = new Map<string, Clip>()
  private listeners = new Set<Listener>()
  private state: NarratorState = { speaking: false, voiced: false, text: '', clip: null }
  private audio: HTMLAudioElement | null = null
  private token = 0
  private settle: (() => void) | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private selfVoicing = true
  private loaded: Promise<void> | null = null
  last = ''

  load() {
    this.loaded ??= fetch('/narration/manifest.json')
      .then((r) => (r.ok ? r.json() : { clips: [] }))
      .then((m: { clips: Clip[] }) => {
        for (const c of m.clips ?? []) this.clips.set(norm(c.text), c)
      })
      .catch(() => {})
    return this.loaded
  }

  get clipCount() {
    return this.clips.size
  }

  hasClip(text: string) {
    return this.clips.has(norm(text))
  }

  on(fn: Listener) {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private emit(next: NarratorState) {
    this.state = next
    this.listeners.forEach((fn) => fn({ ...next }))
  }

  setSelfVoicing(on: boolean) {
    this.selfVoicing = on
    if (!on) this.stop()
  }

  get isSelfVoicing() {
    return this.selfVoicing
  }

  get speaking() {
    return this.state.speaking
  }

  /** Say a line. Resolves when it has finished or been interrupted. */
  async say(text: string): Promise<boolean> {
    await this.load()
    this.cancel()
    const token = ++this.token
    this.last = text
    const clip = this.selfVoicing ? this.clips.get(norm(text)) ?? null : null
    this.emit({ speaking: true, voiced: !!clip, text, clip: clip?.src ?? null })
    let completed = false
    try {
      completed = clip ? await this.play(clip, token) : await this.hold(text, token)
    } catch {
      // A blocked or missing recording falls back to text only — never a robot voice.
      if (token === this.token) {
        this.emit({ speaking: true, voiced: false, text, clip: null })
        completed = await this.hold(text, token)
      }
    }
    if (token === this.token) this.emit({ speaking: false, voiced: false, text, clip: null })
    return completed
  }

  repeat() {
    return this.last ? this.say(this.last) : Promise.resolve(false)
  }

  private play(clip: Clip, token: number): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const el = new Audio(clip.src)
      el.preload = 'auto'
      this.audio = el
      const done = (ok: boolean) => {
        el.onended = null
        el.onerror = null
        if (this.audio === el) this.audio = null
        this.settle = null
        resolve(ok)
      }
      el.onended = () => done(true)
      el.onerror = () => {
        el.onended = null
        el.onerror = null
        this.settle = null
        if (token === this.token) reject(new Error('clip failed'))
        else resolve(false)
      }
      this.settle = () => {
        try {
          el.pause()
        } catch {
          /* ignore */
        }
        done(false)
      }
      el.play().catch((e) => {
        if (token !== this.token) return resolve(false)
        el.onended = null
        el.onerror = null
        this.settle = null
        reject(e)
      })
    })
  }

  /** Text-only line: keep it "current" for roughly its reading time. */
  private hold(text: string, token: number): Promise<boolean> {
    const ms = Math.min(14000, 1200 + text.split(/\s+/).length * 330)
    return new Promise((resolve) => {
      if (token !== this.token) return resolve(false)
      this.timer = setTimeout(() => {
        this.timer = null
        this.settle = null
        resolve(true)
      }, ms)
      this.settle = () => {
        if (this.timer) clearTimeout(this.timer)
        this.timer = null
        this.settle = null
        resolve(false)
      }
    })
  }

  private cancel() {
    this.token++
    const s = this.settle
    this.settle = null
    s?.()
  }

  stop() {
    this.cancel()
    if (this.state.speaking) this.emit({ speaking: false, voiced: false, text: this.state.text, clip: null })
  }
}

const norm = (t: string) => t.replace(/\s+/g, ' ').trim()
