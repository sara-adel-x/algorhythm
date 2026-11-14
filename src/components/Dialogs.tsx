import { useEffect, useRef } from 'react'
import type { Jukebox } from '../app/useJukebox'
import { VOICE_LABELS, VOICE_NAMES, cutoffFor } from '../audio/mapping'
import { DUCK_DB } from '../audio/engine'
import { analysisRuntime, GRID_COLS } from '../analysis/client'

function Dialog({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => prev?.focus?.()
  }, [])
  const trap = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !ref.current) return
    const f = Array.from(ref.current.querySelectorAll<HTMLElement>('button, a[href], input, select, [tabindex="0"]')).filter(
      (el) => !el.hasAttribute('disabled'),
    )
    if (!f.length) return
    const first = f[0]
    const last = f[f.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }
  return (
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby="dlg-title" onKeyDown={trap}>
        <header className="dialog-head">
          <h2 id="dlg-title">{title}</h2>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose} data-autofocus>
            Close <kbd>Esc</kbd>
          </button>
        </header>
        <div className="dialog-body">{children}</div>
      </div>
    </div>
  )
}

const KEYS: [string, string][] = [
  ['↑ ↓ ← →', 'Move the listening point (on the dataset list: choose)'],
  ['Shift + arrows', 'Move four times faster'],
  ['1 – 7', 'Open a dataset directly'],
  ['H / Shift + H', 'Next / previous place or event'],
  ['Enter', 'Describe the point: place, value'],
  ['N / P', 'Next / previous NASA event'],
  ['T', 'Time Machine: play the 8-second morph'],
  ['B', 'Blindfold: hide the picture'],
  ['V', 'Reveal the picture in Blindfold'],
  ['L', 'Sound Legend: hear the four voices'],
  ['Space', 'Pause or resume the sound'],
  ['M', 'Mute'],
  ['R', 'Repeat the last narration'],
  ['?', 'This list'],
  ['Esc', 'Close, leave a mode, or back to datasets'],
]

export function HelpDialog({ j }: { j: Jukebox }) {
  return (
    <Dialog title="Keyboard" onClose={j.closeOverlay}>
      <table className="keys">
        <tbody>
          {KEYS.map(([k, d]) => (
            <tr key={k}>
              <th scope="row">
                <kbd>{k}</kbd>
              </th>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">
        Touch: drag a finger across the map. Screen readers: the map is an application region, so arrow keys reach it directly; every
        narration line is also sent to a polite live region.
      </p>
    </Dialog>
  )
}

export function LegendDialog({ j }: { j: Jukebox }) {
  return (
    <Dialog title="Sound Legend" onClose={j.closeOverlay}>
      <p className="muted">
        Four fixed voices. The colours under the listening point decide how much of each you hear — they crossfade, they never switch.
      </p>
      <ol className="legend">
        {VOICE_NAMES.map((n, k) => (
          <li key={n} className={`legend-item voice-${n}${j.legendStep === k ? ' is-playing' : ''}`}>
            <span className="legend-swatch" aria-hidden="true" />
            <span className="legend-text">
              <b>{VOICE_LABELS[n].name}</b> — {VOICE_LABELS[n].hue}
              <small>{VOICE_LABELS[n].blurb}</small>
            </span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void j.engine.previewVoice(k)}>
              Play
            </button>
          </li>
        ))}
      </ol>
      <ul className="legend-rules">
        <li>
          <b>Higher on the map</b> → higher note, always on the dataset’s scale.
        </li>
        <li>
          <b>Left / right</b> → follows your headphones (HRTF).
        </li>
        <li>
          <b>Stronger measurement</b> → louder and brighter (lowpass 180 → 3,240 Hz).
        </li>
        <li>
          <b>Sharp boundary</b> → a soft tap as you cross it. Fire detections crackle.
        </li>
        <li>
          <b>No data</b> → near silence.
        </li>
      </ul>
      <button type="button" className="btn btn-primary" onClick={() => void j.openLegend()}>
        Play all four <kbd>L</kbd>
      </button>
    </Dialog>
  )
}

export function HowDialog({ j }: { j: Jukebox }) {
  const ds = j.dataset
  const r = j.readout
  const L = r?.sample.l ?? 0
  return (
    <Dialog title="How AlgoRythm turns NASA data into sound" onClose={j.closeOverlay} wide>
      <ol className="how-steps">
        <li>
          <b>Fetch.</b> The browser asks this site’s <code>/api/nasa</code> proxy for a frame. The proxy requests it from NASA GIBS (or EONET,
          the SVS, the Image Library), caches it, and serves it from our own origin — so there are no CORS errors and the canvas is never
          tainted.
        </li>
        <li>
          <b>Analyse.</b> The frame is drawn onto an OffscreenCanvas ({analysisRuntime() === 'worker' ? 'in a Web Worker' : 'on the main thread'})
          and every pixel is read: RGB → HSL, Rec.709 luminance, the colour’s position in NASA’s published colour key (which recovers the
          measured value), a 3 × 3 Sobel gradient, and the area that pixel covers on Earth. These are reduced to a {GRID_COLS}-column grid
          and sampled smoothly under the listening point.
        </li>
        <li>
          <b>Map.</b> Each sample sets the Tone.js graph directly:
          <table className="how-map">
            <thead>
              <tr>
                <th scope="col">Data</th>
                <th scope="col">Sound</th>
                <th scope="col">Right now</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Vertical position y</td>
                <td>Pitch, quantised to {ds ? `${ds.sound.root} ${ds.sound.scale}` : 'the scale'}</td>
                <td>{r?.sound.note ?? '—'}</td>
              </tr>
              <tr>
                <td>Horizontal position x</td>
                <td>HRTF position</td>
                <td>{r ? r.sound.pan.toFixed(2) : '—'}</td>
              </tr>
              <tr>
                <td>Intensity L</td>
                <td>Lowpass cutoff 180·18^L Hz, and gain</td>
                <td>
                  L = {L.toFixed(2)} → {Math.round(cutoffFor(L))} Hz
                </td>
              </tr>
              <tr>
                <td>Hue-spectrum density</td>
                <td>Crossfade of four fixed timbres</td>
                <td>{r ? r.sound.weights.map((w) => Math.round(w * 100)).join(' / ') : '—'}</td>
              </tr>
              <tr>
                <td>Sobel edge strength</td>
                <td>Soft percussive accent</td>
                <td>{r ? r.sample.edge.toFixed(2) : '—'}</td>
              </tr>
              <tr>
                <td>Whole-frame histogram</td>
                <td>Drone partials, noise bed</td>
                <td>{j.mainFrame ? `mean L ${j.mainFrame.analysis.stats.meanL.toFixed(3)}` : '—'}</td>
              </tr>
            </tbody>
          </table>
          For colour-coded layers (ice, temperature, rain) intensity is the decoded value scaled to the layer’s range, because on those maps the
          number is carried by colour, not brightness. For true-colour imagery it is luminance.
        </li>
        <li>
          <b>Time Machine.</b> Both dated frames are analysed the same way and every parameter is interpolated between them over eight
          seconds; the result you hear is the real per-cell difference. The extent or mean you are told afterwards is computed from the same
          pixels, with each pixel weighted by its true area on the globe.
        </li>
        <li>
          <b>Room and voice.</b> The reverb is a real acoustic impulse response (Voxengo, royalty-free) through a convolver. Narration is
          recorded speech; whenever it plays, everything else drops by {Math.abs(DUCK_DB)} dB. Lines with no recording — a brand-new event,
          a point you asked about — appear as text and in the live region, never as a synthetic voice.
        </li>
      </ol>
      {ds && <p className="note">{ds.note}</p>}
    </Dialog>
  )
}
