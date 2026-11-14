/**
 * The narrator.
 *
 * Pre-generated MP3s are the primary voice (a warm studio recording beats the
 * browser's robot every time). When a clip is missing — a scene we have not
 * recorded yet, a browser that blocks audio — we fall back to SpeechSynthesis,
 * and when the user turns on Screen reader mode we say nothing at all and only
 * publish the text into the aria-live region.
 */

export type NarratorState = {
  speaking: boolean
  /** the sentence currently being said, for the transcript region */
  text: string
}

type Listener = (state: NarratorState) => void

const PREFERRED_VOICES = [
  'Google UK English Female',
  'Samantha',
  'Microsoft Sonia',
  'Microsoft Libby',
  'Karen',
  'Moira',
]

export class Narrator {
  private audio: HTMLAudioElement | null = null
  private listeners = new Set<Listener>()
  private state: NarratorState = { speaking: false, text: '' }
  private selfVoicing = true
  private volume = 0.95
  private cache = new Map<string, HTMLAudioElement>()

  on(fn: Listener) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  private emit() {
    this.listeners.forEach((fn) => fn({ ...this.state }))
  }

  setSelfVoicing(on: boolean) {
    this.selfVoicing = on
    if (!on) this.stop()
  }

  get isSelfVoicing() {
    return this.selfVoicing
  }

  setVolume(v: number) {
    this.volume = v
    if (this.audio) this.audio.volume = v
  }

  /** Speak a line. `src` is the pre-recorded clip, if we have one. */
  async speak(text: string, src?: string): Promise<void> {
    this.stop()
    this.state = { speaking: true, text }
    this.emit()
    if (!this.selfVoicing) {
      await new Promise((r) => setTimeout(r, Math.min(9000, 900 + text.length * 55)))
      this.state = { speaking: false, text }
      this.emit()
      return
    }
    try {
      if (src) await this.playClip(src)
      else await this.speakBrowser(text)
    } catch {
      /* a blocked or missing clip should never break the app */
    }
    this.state = { speaking: false, text }
    this.emit()
  }

  private playClip(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      let el = this.cache.get(src)
      if (!el) {
        el = new Audio(src)
        el.preload = 'auto'
        this.cache.set(src, el)
      }
      this.audio = el
      el.currentTime = 0
      el.volume = this.volume
      const done = () => {
        el!.onended = null
        el!.onerror = null
        resolve()
      }
      el.onended = done
      el.onerror = () => {
        // no clip on disk → fall back to the browser voice with the same text
        this.speakBrowser(this.state.text).then(resolve).catch(reject)
      }
      el.play().catch(() => {
        el!.onerror = null
        this.speakBrowser(this.state.text).then(resolve).catch(reject)
      })
    })
  }

  private speakBrowser(text: string): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        resolve()
        return
      }
      const u = new SpeechSynthesisUtterance(text)
      const voices = window.speechSynthesis.getVoices()
      const preferred =
        PREFERRED_VOICES.map((n) => voices.find((v) => v.name === n)).find(Boolean) ??
        voices.find((v) => v.lang.startsWith('en') && /female|Samantha|Karen|Serena/i.test(v.name)) ??
        voices.find((v) => v.lang.startsWith('en'))
      if (preferred) u.voice = preferred
      u.rate = 0.94
      u.pitch = 1
      u.volume = this.volume
      u.onend = () => resolve()
      u.onerror = () => resolve()
      window.speechSynthesis.speak(u)
      // Safari sometimes never fires onend; cap the wait.
      setTimeout(resolve, Math.min(20000, 1500 + text.length * 90))
    })
  }

  stop() {
    if (this.audio) {
      this.audio.pause()
      this.audio.onended = null
      this.audio = null
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
    if (this.state.speaking) {
      this.state = { speaking: false, text: this.state.text }
      this.emit()
    }
  }
}
