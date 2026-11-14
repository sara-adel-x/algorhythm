import { useEffect, useRef } from 'react'
import { VOICE_LABELS } from '../audio/engine'
import type { Scene } from '../scene/types'

function useDialog(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
      if (e.key === 'Tab' && ref.current) {
        const nodes = ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (!nodes.length) return
        const first = nodes[0]
        const last = nodes[nodes.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey, true)
    const t = setTimeout(() => ref.current?.querySelector<HTMLElement>('button')?.focus(), 30)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      clearTimeout(t)
    }
  }, [onClose])
  return ref
}

const KEYS: [string, string][] = [
  ['Arrow keys', 'Move the listening point one cell'],
  ['Shift + arrow', 'Jump four cells'],
  ['H / Shift + H', 'Next / previous landmark'],
  ['Space', 'Start or pause the journey'],
  ['N / P', 'Next / previous scene'],
  ['T', 'Time machine'],
  ['B', 'Blindfold mode'],
  ['L', 'Sound legend'],
  ['R', 'Repeat the last narration'],
  ['M', 'Mute the music'],
  ['?', 'This list'],
  ['Esc', 'Stop everything'],
]

export function HelpDialog({ onClose }: { onClose: () => void }) {
  const ref = useDialog(onClose)
  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="sheet-eyebrow">Keyboard</p>
        <h2 id="help-title" className="sheet-title">
          Every control, without a mouse
        </h2>
        <dl className="keys">
          {KEYS.map(([k, v]) => (
            <div key={k} className="key-row">
              <dt>
                <kbd>{k}</kbd>
              </dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <div className="sheet-actions">
          <button className="btn btn-solid" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export function HowItSounds({
  scene,
  onClose,
  onPreviewVoice,
}: {
  scene: Scene | null
  onClose: () => void
  onPreviewVoice: (voice: string) => void
}) {
  const ref = useDialog(onClose)
  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="sheet sheet-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="how-title"
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <p className="sheet-eyebrow">Documentation</p>
        <h2 id="how-title" className="sheet-title">
          How it sounds
        </h2>
        <p className="sheet-lede">
          Every sound in AlgoRythm is derived from a pixel measurement. Nothing is decorative, and
          nothing is random. This page is the contract.
        </p>

        <table className="map-table">
          <thead>
            <tr>
              <th scope="col">What the image has</th>
              <th scope="col">What you hear</th>
              <th scope="col">Why</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Vertical position</td>
              <td>Pitch, quantised to the scene's scale</td>
              <td>Pitch is the most reliable axis for most listeners. Quantising guarantees no sour notes.</td>
            </tr>
            <tr>
              <td>Horizontal position</td>
              <td>Stereo / 3D position</td>
              <td>Headphones give a sense of left and right that survives without vision.</td>
            </tr>
            <tr>
              <td>Brightness (L)</td>
              <td>Loudness and filter cutoff, 180 Hz · 18<sup>L^0.6</sup></td>
              <td>Bright light reads as bright sound. The exponent opens the mid-tones so a thin filament is not muffled.</td>
            </tr>
            <tr>
              <td>Hue</td>
              <td>Which of four fixed voices is blended in</td>
              <td>Four voices, crossfaded. The oscillator type never changes while playing, which is what causes clicks.</td>
            </tr>
            <tr>
              <td>Edge strength</td>
              <td>A short soft accent, plus vibration on Android</td>
              <td>Edges are where the information is: coastlines, field boundaries, the eyewall.</td>
            </tr>
            <tr>
              <td>Near-black (L &lt; 0.06)</td>
              <td>Near silence, only the drone</td>
              <td>Darkness is meaningful. It should sound like darkness, not like a quiet note.</td>
            </tr>
            <tr>
              <td>Whole-image histogram</td>
              <td>The drone's character and filter range</td>
              <td>So each scene has its own atmosphere before you touch it.</td>
            </tr>
          </tbody>
        </table>

        <h3 className="sheet-sub">The four voices</h3>
        <ul className="voice-list">
          {Object.entries(VOICE_LABELS).map(([id, v]) => (
            <li key={id}>
              <button className="voice-chip" onClick={() => onPreviewVoice(id)}>
                <span className={`voice-dot voice-${id}`} aria-hidden="true" />
                <span>
                  <strong>{v.name}</strong>
                  <em>{v.blurb}</em>
                </span>
              </button>
            </li>
          ))}
        </ul>

        {scene && (
          <>
            <h3 className="sheet-sub">This scene</h3>
            <dl className="scene-facts">
              <div>
                <dt>Source</dt>
                <dd>
                  {scene.source.agency} · {scene.source.id} · {scene.source.date}
                </dd>
              </div>
              <div>
                <dt>Scale</dt>
                <dd>
                  {scene.sound.root} {scene.sound.scale}, drone: {scene.sound.drone}
                </dd>
              </div>
              <div>
                <dt>What NASA says</dt>
                <dd>{scene.facts}</dd>
              </div>
              <div>
                <dt>Link</dt>
                <dd>
                  <a href={scene.source.url} target="_blank" rel="noreferrer noopener">
                    {scene.source.url}
                  </a>
                </dd>
              </div>
            </dl>
          </>
        )}

        <h3 className="sheet-sub">What this is not</h3>
        <p className="sheet-note">
          AlgoRythm is not a replacement for an image description, and it is not a medical device. It is
          a way to hear structure — where things are, how bright they are, how they are arranged — that
          is genuinely hard to get from a paragraph. Sonification has a long history: NASA's own
          sonifications, Chandra's <em>A Universe of Sound</em>, STScI's Astronify, and the
          neuroscience-rooted work behind vOICe and EyeMusic. This project stands on that work.
        </p>

        <div className="sheet-actions">
          <button className="btn btn-solid" onClick={onClose}>
            Back to listening
          </button>
        </div>
      </div>
    </div>
  )
}
