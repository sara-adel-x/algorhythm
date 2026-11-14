import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioEngine } from './audio/engine'
import { cellAt, hueWeights } from './audio/mapping'
import type { Hotspot, Readout, Scene } from './scene/types'
import { StartGate } from './components/StartGate'
import { SceneStage } from './components/SceneStage'
import { Visualizer } from './components/Visualizer'

type Phase = 'loading' | 'gate' | 'explore'

const SCENE_URL = '/scenes/m74/scene.json'

const LAYER_NAMES = ['warm', 'hollow', 'glass', 'shimmer']

function describeAt(scene: Scene, x: number, y: number, readout: Readout | null): string {
  const near = scene.hotspots
    .map((h) => ({ h, d: Math.hypot(h.x - x, h.y - y) }))
    .sort((a, b) => a.d - b.d)[0]
  if (near && near.d < 0.1) return `${near.h.name}. ${near.h.text}`

  const cell = readout?.cell ?? cellAt(scene.grid, x, y)
  const w = hueWeights(cell.h)
  const layer = LAYER_NAMES[w.indexOf(Math.max(...w))]
  const side = x < 0.38 ? 'left of centre' : x > 0.62 ? 'right of centre' : 'near the centre'
  const vert = y < 0.34 ? 'upper' : y > 0.66 ? 'lower' : 'middle'
  const bright =
    cell.l < 0.06 ? 'almost black, nearly silent' : cell.l < 0.25 ? 'faint' : cell.l < 0.55 ? 'lit' : 'bright'

  return `${side}, ${vert} of the frame. ${bright}. The note is ${readout?.note ?? 'held'}, in the ${layer} voice.`
}

export default function App() {
  const [scene, setScene] = useState<Scene | null>(null)
  const [phase, setPhase] = useState<Phase>('loading')
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 })
  const [readout, setReadout] = useState<Readout | null>(null)
  const [live, setLive] = useState('')
  const [muted, setMuted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [busy, setBusy] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const [visited, setVisited] = useState<string[]>([])

  const engine = useRef<AudioEngine>(new AudioEngine())
  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__engine = engine.current
  }, [])
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor

  useEffect(() => {
    fetch(SCENE_URL)
      .then((r) => r.json())
      .then((s: Scene) => {
        setScene(s)
        setPhase('gate')
      })
      .catch(() => setLive('The scene could not be loaded.'))
  }, [])

  // ---------------------------------------------------------------- speech
  const speak = useCallback((text: string) => {
    setLive(text)
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 0.97
    u.pitch = 0.94
    const words = text.split(/\s+/).length
    engine.current.duck(Math.max(1.4, words / 2.5))
    u.onend = () => engine.current.duck(0.3)
    window.speechSynthesis.speak(u)
  }, [])

  // ---------------------------------------------------------------- begin
  const begin = useCallback(async () => {
    if (!scene || busy) return
    setBusy(true)
    await engine.current.init(scene)
    await engine.current.start()
    setBusy(false)
    setPhase('explore')
    setPlaying(true)
    speak(
      'AlgoRythm. You are listening to the galaxy M74, thirty million light-years away. ' +
        'Move across the picture with your finger or the arrow keys. Higher is a higher note, ' +
        'brighter is louder. Press H to jump between landmarks, and question mark for all the keys.',
    )
  }, [scene, busy, speak])

  // ---------------------------------------------------------------- move
  const move = useCallback(
    (x: number, y: number) => {
      setCursor({ x, y })
      const r = engine.current.update(x, y)
      if (r) {
        setReadout(r)
        engine.current.maybeAccent(r.cell)
      }
    },
    [],
  )

  const nudge = useCallback(
    (dx: number, dy: number) => {
      if (!scene) return
      const stepX = 1 / scene.grid.cols
      const stepY = 1 / scene.grid.rows
      const next = {
        x: Math.min(1, Math.max(0, cursorRef.current.x + dx * stepX)),
        y: Math.min(1, Math.max(0, cursorRef.current.y + dy * stepY)),
      }
      move(next.x, next.y)
    },
    [scene, move],
  )

  const jumpTo = useCallback(
    (hs: Hotspot, announce = true) => {
      move(hs.x, hs.y)
      engine.current.ping(0.8)
      setVisited((v) => (v.includes(hs.id) ? v : [...v, hs.id]))
      if (announce) speak(`${hs.name}. ${hs.text}`)
    },
    [move, speak],
  )

  const nextHotspot = useCallback(() => {
    if (!scene) return
    const i = scene.hotspots.findIndex(
      (h) => Math.hypot(h.x - cursorRef.current.x, h.y - cursorRef.current.y) < 0.06,
    )
    jumpTo(scene.hotspots[(i + 1) % scene.hotspots.length])
  }, [scene, jumpTo])

  const describe = useCallback(() => {
    if (!scene) return
    speak(describeAt(scene, cursorRef.current.x, cursorRef.current.y, readout))
  }, [scene, readout, speak])

  const togglePlay = useCallback(async () => {
    if (playing) {
      engine.current.stop()
      setPlaying(false)
      setLive('Paused.')
    } else {
      await engine.current.start()
      engine.current.update(cursorRef.current.x, cursorRef.current.y)
      setPlaying(true)
      setLive('Playing.')
    }
  }, [playing])

  const toggleMute = useCallback(() => {
    const next = !muted
    engine.current.setMuted(next)
    setMuted(next)
    setLive(next ? 'Sound muted.' : 'Sound on.')
  }, [muted])

  // ---------------------------------------------------------------- keys
  useEffect(() => {
    if (phase !== 'explore') return
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const step = e.shiftKey ? 4 : 1
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          nudge(-step, 0)
          break
        case 'ArrowRight':
          e.preventDefault()
          nudge(step, 0)
          break
        case 'ArrowUp':
          e.preventDefault()
          nudge(0, -step)
          break
        case 'ArrowDown':
          e.preventDefault()
          nudge(0, step)
          break
        case 'h':
        case 'H':
          e.preventDefault()
          nextHotspot()
          break
        case 'Enter':
          e.preventDefault()
          describe()
          break
        case ' ':
          e.preventDefault()
          void togglePlay()
          break
        case 'm':
        case 'M':
          toggleMute()
          break
        case '?':
          e.preventDefault()
          setHelpOpen((v) => !v)
          break
        case 'Escape':
          setHelpOpen(false)
          break
        default:
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, nudge, nextHotspot, describe, togglePlay, toggleMute])

  // ---------------------------------------------------------------- derived
  const soundChips = useMemo(() => {
    if (!scene) return []
    return [
      { k: 'Root', v: scene.sound.root },
      { k: 'Scale', v: scene.sound.scale },
      { k: 'Voice', v: scene.sound.lead },
      { k: 'Reverb', v: `${scene.sound.reverbDecay}s` },
    ]
  }, [scene])

  if (phase === 'loading' || !scene) {
    return <div className="boot">Loading the room…</div>
  }

  if (phase === 'gate') {
    return (
      <>
        <StartGate onBegin={begin} busy={busy} sceneTitle={scene.title} />
        <div className="sr-only" aria-live="polite">
          {live}
        </div>
      </>
    )
  }

  const layerWeights = readout ? hueWeights(readout.cell.h) : [0, 0, 0, 0]

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">
          Algo<span>Rythm</span>
        </span>
        <span className="crumb">
          <span className="crumb-num">01</span> {scene.title}
        </span>
        <span className="topbar-right">NASA Space Apps 2026</span>
      </header>

      <main className="layout">
        <section className="left" aria-label="Listening stage">
          <SceneStage
            scene={scene}
            cursor={cursor}
            onMove={move}
            onHotspot={(hs) => jumpTo(hs)}
            showImage
          />

          <div className="transport">
            <button className="btn btn-solid" onClick={() => void togglePlay()}>
              {playing ? 'Pause' : 'Play'} <kbd>Space</kbd>
            </button>
            <button className="btn btn-line" onClick={toggleMute} aria-pressed={muted}>
              {muted ? 'Unmute' : 'Mute'} <kbd>M</kbd>
            </button>
            <button className="btn btn-line" onClick={describe}>
              Describe this point <kbd>Enter</kbd>
            </button>
            <button className="btn btn-line" onClick={() => setHelpOpen(true)}>
              Keys <kbd>?</kbd>
            </button>
            <div className="transport-wave">
              <Visualizer engine={engine.current} active={playing && !muted} />
            </div>
          </div>
        </section>

        <aside className="panel" aria-label="Scene information">
          <p className="panel-eyebrow">
            {scene.source.telescope} · {scene.source.wavelength}
          </p>
          <h1 className="panel-title">{scene.title}</h1>
          <p className="panel-sub">{scene.subtitle}</p>

          <p className="credit">
            {scene.source.agency} ·{' '}
            <a href={scene.source.url} target="_blank" rel="noreferrer">
              {scene.source.nasa_id}
            </a>{' '}
            · {scene.source.date}
          </p>

          <div className="chips">
            {soundChips.map((c) => (
              <span key={c.k} className="chip">
                <b>{c.k}</b> {c.v}
              </span>
            ))}
          </div>

          <div className="readout" aria-hidden="true">
            <div>
              <dt>Note</dt>
              <dd>{readout?.note ?? '—'}</dd>
            </div>
            <div>
              <dt>Pan</dt>
              <dd>{readout ? readout.pan.toFixed(2) : '—'}</dd>
            </div>
            <div>
              <dt>Level</dt>
              <dd>{readout && readout.gainDb > -60 ? `${readout.gainDb} dB` : 'silent'}</dd>
            </div>
            <div>
              <dt>Cutoff</dt>
              <dd>{readout ? `${readout.cutoff} Hz` : '—'}</dd>
            </div>
          </div>

          <div className="layers" aria-hidden="true">
            {LAYER_NAMES.map((n, i) => (
              <span key={n} className="layer">
                <span className="layer-bar">
                  <i style={{ height: `${Math.round(layerWeights[i] * 100)}%` }} />
                </span>
                {n}
              </span>
            ))}
          </div>

          <h2 className="panel-h2">Landmarks</h2>
          <ul className="hotspots">
            {scene.hotspots.map((hs) => (
              <li key={hs.id}>
                <button className="hotspot-btn" onClick={() => jumpTo(hs)}>
                  <span className="hotspot-name">{hs.name}</span>
                  <span className="hotspot-src">{hs.sourced === 'nasa' ? 'NASA text' : 'image'}</span>
                  {visited.includes(hs.id) && <span className="hotspot-seen">heard</span>}
                </button>
              </li>
            ))}
          </ul>

          <div className="soon">
            <p className="soon-label">Next steps</p>
            <div className="soon-row">
              <button disabled>Journey</button>
              <button disabled>Time machine</button>
              <button disabled>Blindfold</button>
              <button disabled>Sound legend</button>
            </div>
          </div>
        </aside>
      </main>

      <footer className="foot">
        <p className="foot-live" aria-live="polite">
          {live || 'Ready. Drag across the image, or use the arrow keys.'}
        </p>
        <p className="foot-keys">
          <kbd>↑↓←→</kbd> move · <kbd>Shift</kbd> jump · <kbd>H</kbd> next landmark · <kbd>Enter</kbd>{' '}
          describe · <kbd>Space</kbd> play · <kbd>M</kbd> mute · <kbd>?</kbd> help
        </p>
      </footer>

      {helpOpen && (
        <div className="help" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">
          <div className="help-card">
            <h2>Keys</h2>
            <dl>
              <dt>Arrow keys</dt>
              <dd>Move the listening point one cell</dd>
              <dt>Shift + arrows</dt>
              <dd>Move four cells</dd>
              <dt>H</dt>
              <dd>Jump to the next landmark</dd>
              <dt>Enter</dt>
              <dd>Describe what is under the point</dd>
              <dt>Space</dt>
              <dd>Play or pause the sound field</dd>
              <dt>M</dt>
              <dd>Mute or unmute</dd>
              <dt>?</dt>
              <dd>This panel</dd>
              <dt>Esc</dt>
              <dd>Close this panel</dd>
            </dl>
            <button className="btn btn-solid" onClick={() => setHelpOpen(false)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
