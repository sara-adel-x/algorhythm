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

type ActiveOperation = {
  token: number
  cleanup: () => void
  settle: () => void
}

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
  private token = 0
  private operation: ActiveOperation | null = null

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

  get isSpeaking() {
    return this.state.speaking
  }

  setVolume(v: number) {
    this.volume = Math.min(1, Math.max(0, v))
    if (this.audio) this.audio.volume = this.volume
    this.cache.forEach((el) => {
      el.volume = this.volume
    })
  }

  private isCurrent(token: number) {
    return this.token === token
  }

  private cancelCurrent() {
    const active = this.operation
    this.operation = null
    this.token += 1
    if (active) {
      active.cleanup()
      active.settle()
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
  }

  private setOperation(token: number, cleanup: () => void, settle: () => void) {
    this.operation = { token, cleanup, settle }
  }

  /** Speak a line. `src` is the pre-recorded clip, if we have one. */
  async speak(text: string, src?: string): Promise<void> {
    this.cancelCurrent()
    const token = ++this.token
    this.state = { speaking: true, text }
    this.emit()

    try {
      if (!this.selfVoicing) {
        await this.waitWithoutVoice(text, token)
      } else if (src) {
        await this.playClip(src, text, token)
      } else {
        await this.speakBrowser(text, token)
      }
    } catch {
      // A blocked or missing clip should never break the app. Fallback is only
      // attempted while this sentence is still current, so stale clip errors
      // cannot start or interrupt a newer browser utterance.
      if (src && this.isCurrent(token)) {
        try {
          await this.speakBrowser(text, token)
        } catch {
          // SpeechSynthesis is best-effort too.
        }
      }
    } finally {
      if (this.isCurrent(token)) {
        const active = this.operation
        this.operation = null
        active?.cleanup()
        this.state = { speaking: false, text }
        this.emit()
      }
    }
  }

  private waitWithoutVoice(text: string, token: number): Promise<void> {
    const duration = Math.min(9000, 900 + text.length * 55)
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        timer = null
        if (this.isCurrent(token)) {
          this.operation = null
          resolve()
        }
      }, duration)
      const cleanup = () => {
        if (timer !== null) {
          clearTimeout(timer)
          timer = null
        }
      }
      this.setOperation(token, cleanup, () => {
        cleanup()
        resolve()
      })
    })
  }

  private playClip(src: string, text: string, token: number): Promise<void> {
    return new Promise((resolve, reject) => {
      let el: HTMLAudioElement
      try {
        let cached = this.cache.get(src)
        if (!cached) {
          cached = new Audio(src)
          cached.preload = 'auto'
          this.cache.set(src, cached)
        }
        el = cached
      } catch (error) {
        reject(error)
        return
      }

      let settled = false
      let fallingBack = false
      const cleanup = () => {
        el.onended = null
        el.onerror = null
        try {
          el.pause()
        } catch {
          // Some test doubles and partially constructed media elements throw.
        }
        if (this.audio === el) this.audio = null
      }
      const finish = () => {
        if (settled) return
        settled = true
        cleanup()
        resolve()
      }
      const fallback = () => {
        if (settled || fallingBack || !this.isCurrent(token)) return
        fallingBack = true
        cleanup()
        this.speakBrowser(text, token).then(resolve, reject)
      }

      this.audio = el
      el.currentTime = 0
      el.volume = this.volume
      el.onended = finish
      el.onerror = fallback
      this.setOperation(token, cleanup, () => {
        if (!settled) {
          settled = true
          cleanup()
          resolve()
        }
      })

      try {
        const result = el.play()
        result?.catch(() => fallback())
      } catch {
        fallback()
      }
    })
  }

  private speakBrowser(text: string, token: number): Promise<void> {
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

      let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        timer = null
        finish()
      }, Math.min(20000, 1500 + text.length * 90))
      let settled = false
      const cleanup = () => {
        u.onend = null
        u.onerror = null
        if (timer !== null) {
          clearTimeout(timer)
          timer = null
        }
      }
      const finish = () => {
        if (settled) return
        settled = true
        cleanup()
        resolve()
      }
      u.onend = finish
      u.onerror = finish
      this.setOperation(token, cleanup, finish)

      try {
        window.speechSynthesis.speak(u)
      } catch {
        finish()
      }
    })
  }

  stop() {
    this.cancelCurrent()
    if (this.audio) {
      this.audio.pause()
      this.audio.onended = null
      this.audio.onerror = null
      this.audio = null
    }
    if (this.state.speaking) {
      this.state = { speaking: false, text: this.state.text }
      this.emit()
    }
  }
}
