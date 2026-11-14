import { useEffect, useRef } from 'react'
import { Wordmark } from './Wordmark'

interface Props {
  srMode: boolean
  onSrMode: (on: boolean) => void
  onEnter: () => void
}

/**
 * The first screen: one full-screen button. Activating it is the user gesture
 * that unlocks Web Audio (Tone.start()) and starts the spoken onboarding.
 * Nothing makes a sound before it. No imagery: the only pictures in
 * AlgoRythm are the NASA frames being sonified.
 */
export function Gate({ srMode, onSrMode, onEnter }: Props) {
  const button = useRef<HTMLButtonElement>(null)
  useEffect(() => button.current?.focus(), [])

  return (
    <main className="gate">
      <div className="gate-sky" aria-hidden="true">
        <span className="ring r1" />
        <span className="ring r2" />
        <span className="ring r3" />
        <span className="limb" />
      </div>

      <button ref={button} type="button" className="gate-start" onClick={onEnter} aria-describedby="gate-desc gate-keys">
        <Wordmark />
        <span className="gate-title">Enter Earth Jukebox</span>
        <span id="gate-desc" className="gate-desc">
          Hear our changing planet. Every sound is computed live from real NASA satellite data — sea ice, temperature, oceans, rain,
          storms, fires and volcanoes.
        </span>
        <span className="gate-cta" aria-hidden="true">
          <span className="gate-play">
            <svg viewBox="0 0 24 24" width="22" height="22">
              <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
            </svg>
          </span>
          Press Enter, Space, or tap anywhere
        </span>
        <span id="gate-keys" className="gate-keys">
          Headphones recommended. A voice will explain the keyboard controls.
        </span>
      </button>

      <div className="gate-options">
        <label className="switch">
          <input type="checkbox" checked={srMode} onChange={(e) => onSrMode(e.target.checked)} />
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          <span>
            I use a screen reader <span className="switch-note">— narration goes to your screen reader as text</span>
          </span>
        </label>
      </div>

      <footer className="gate-foot">NASA Space Apps Challenge 2026 · The Earth Information Jukebox</footer>
    </main>
  )
}
