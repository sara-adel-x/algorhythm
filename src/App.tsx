import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioEngine, VOICE_LABELS } from './audio/engine'
import { cellAt } from './audio/mapping'
import { Narrator } from './audio/narrator'
import { HelpDialog, HowItSounds } from './components/Overlays'
import { ModeBar } from './components/ModeBar'
import { SceneRail } from './components/SceneRail'
import { SceneStage } from './components/SceneStage'
import { StartGate } from './components/StartGate'
import { Visualizer } from './components/Visualizer'
import { loadScene, neighbour, SCENE_IDS } from './scene/registry'
import type { Cell, Hotspot, Mode, Readout, Scene } from './scene/types'

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpCell = (a: Cell, b: Cell, t: number): Cell => ({
  h: lerp(a.h, b.h, t),
  s: lerp(a.s, b.s, t),
  l: lerp(a.l, b.l, t),
  e: lerp(a.e, b.e, t),
})

const HOTSPOT_RADIUS = 0.055
const GLIDE_MS = 1700
const VOICE_ORDER = ['warm', 'hollow', 'glass', 'shimmer']

export default function App() {
  const engine = useRef<AudioEngine>(new AudioEngine())
  const narrator = useRef<Narrator>(new Narrator())

  const [scene, setScene] = useState<Scene | null>(null)
  const [morphScene, setMorphScene] = useState<Scene | null>(null)
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 })
  const [readout, setReadout] = useState<Readout | null>(null)
  const [mode, setMode] = useState<Mode>('explore')
  const [playing, setPlaying] = useState(false)
  const [starting, setStarting] = useState(false)
  const [muted, setMuted] = useState(false)
  const [srMode, setSrMode] = useState(false)
  const [activeHotspot, setActiveHotspot] = useState<Hotspot | null>(null)
  const [transcript, setTranscript] = useState('')
  const [journey, setJourney] = useState({ running: false, index: -1 })
  const [morph, setMorph] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [legendOn, setLegendOn] = useState(false)
  const [legendStep, setLegendStep] = useState(-1)
  const [showHelp, setShowHelp] = useState(false)
  const [showHow, setShowHow] = useState(false)

  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const modeRef = useRef(mode)
  modeRef.current = mode
  const morphRef = useRef(0)
  const morphSceneRef = useRef<Scene | null>(null)
  const sceneRef = useRef<Scene | null>(null)
  sceneRef.current = scene
  const playingRef = useRef(false)
  const runToken = useRef(0)
  const lastSpoken = useRef('')
  const dwellTimer = useRef<number | null>(null)

  useEffect(() => {
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__engine = engine.current
  }, [])

  // ---------------------------------------------------------------- narration
  const narrate = useCallback(async (text: string, src?: string, minDuck = 2) => {
    if (!text) return
    lastSpoken.current = text
    setTranscript(text)
    engine.current.duck(Math.max(minDuck, text.length * 0.055))
    await narrator.current.speak(text, src)
  }, [])

  // ---------------------------------------------------------------- scene load
  const openScene = useCallback(async (id: string) => {
    const next = await loadScene(id)
    runToken.current++
    setJourney({ running: false, index: -1 })
    setMode('explore')
    setMorph(0)
    morphRef.current = 0
    setRevealed(false)
    setActiveHotspot(null)
    setMorphScene(null)
    morphSceneRef.current = null
    engine.current.fadeOut(0.3)
    await new Promise((r) => setTimeout(r, 280))
    await engine.current.init(next)
    setScene(next)
    setCursor({ x: 0.5, y: 0.5 })
    setReadout(engine.current.update(0.5, 0.5))
    if (playingRef.current) {
      await engine.current.start()
      engine.current.fadeIn(1.0)
      setReadout(engine.current.update(0.5, 0.5))
    }
  }, [])

  useEffect(() => {
    void openScene(SCENE_IDS[0])
    // warm the other scenes in the background so N/P feels instant
    const t = window.setTimeout(() => {
      SCENE_IDS.slice(1).forEach((id) => void loadScene(id))
    }, 1200)
    return () => window.clearTimeout(t)
  }, [openScene])

  // ---------------------------------------------------------------- cursor
  const applyCursor = useCallback((x: number, y: number) => {
    const s = sceneRef.current
    const ms = morphSceneRef.current
    if (modeRef.current === 'time' && ms && s) {
      const a = cellAt(s.grid, x, y)
      const b = cellAt(ms.grid, x, y)
      setReadout(engine.current.apply(lerpCell(a, b, morphRef.current), x, y))
    } else {
      setReadout(engine.current.update(x, y))
    }
  }, [])

  const moveCursor = useCallback(
    (x: number, y: number) => {
      const nx = Math.min(1, Math.max(0, x))
      const ny = Math.min(1, Math.max(0, y))
      setCursor({ x: nx, y: ny })
      applyCursor(nx, ny)
    },
    [applyCursor],
  )

  // ---------------------------------------------------------------- hotspots
  useEffect(() => {
    if (!scene) return
    const near = scene.hotspots.find((h) => Math.hypot(h.x - cursor.x, h.y - cursor.y) < HOTSPOT_RADIUS)
    setActiveHotspot(near ?? null)
    if (!near) {
      lastSpoken.current = ''
      return
    }
    if (modeRef.current !== 'explore') return
    if (dwellTimer.current) window.clearTimeout(dwellTimer.current)
    dwellTimer.current = window.setTimeout(() => {
      if (lastSpoken.current === near.text) return
      engine.current.ping(0.7)
      void narrate(near.text, near.audio)
    }, 520)
  }, [cursor, scene, narrate])

  // ---------------------------------------------------------------- start
  const begin = useCallback(async () => {
    if (starting || playingRef.current) return
    setStarting(true)
    await engine.current.start()
    engine.current.fadeIn(1.2)
    playingRef.current = true
    setPlaying(true)
    setStarting(false)
    applyCursor(cursorRef.current.x, cursorRef.current.y)
    const s = sceneRef.current
    if (s) {
      await narrate(
        `Welcome to AlgoRythm. ${s.title}. Use the arrow keys to move the listening point, or drag your finger across the picture. Press H for the next landmark, Space for the guided journey, and question mark for every key.`,
        '/narration/welcome.mp3',
        10,
      )
    }
  }, [applyCursor, narrate, starting])

  // ---------------------------------------------------------------- journey
  const glideTo = useCallback(
    (x: number, y: number, ms: number, token: number) =>
      new Promise<void>((resolve) => {
        const start = performance.now()
        const from = { ...cursorRef.current }
        const step = () => {
          if (token !== runToken.current) return resolve()
          const t = Math.min(1, (performance.now() - start) / ms)
          const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
          moveCursor(lerp(from.x, x, e), lerp(from.y, y, e))
          if (t < 1) requestAnimationFrame(step)
          else resolve()
        }
        requestAnimationFrame(step)
      }),
    [moveCursor],
  )

  const runJourney = useCallback(
    async (from = 0) => {
      const s = sceneRef.current
      if (!s) return
      const token = ++runToken.current
      setMode('journey')
      setJourney({ running: true, index: from })
      if (from === 0) await narrate(s.journeyIntro, `/scenes/${s.id}/narration/intro.mp3`, 7)
      if (token !== runToken.current) return
      for (let i = from; i < s.journey.length; i++) {
        const stop = s.hotspots.find((h) => h.id === s.journey[i])
        if (!stop) continue
        setJourney({ running: true, index: i })
        await glideTo(stop.x, stop.y, GLIDE_MS, token)
        if (token !== runToken.current) return
        engine.current.ping(0.8)
        await narrate(stop.text, stop.audio, 5)
        if (token !== runToken.current) return
        await new Promise((r) => setTimeout(r, 450))
      }
      if (token === runToken.current) {
        setJourney({ running: false, index: -1 })
        setMode('explore')
      }
    },
    [glideTo, narrate],
  )

  const stopJourney = useCallback(() => {
    runToken.current++
    setJourney({ running: false, index: -1 })
    narrator.current.stop()
  }, [])

  // ---------------------------------------------------------------- time machine
  const runTime = useCallback(async () => {
    const s = sceneRef.current
    if (!s?.timeMachine) return
    const token = ++runToken.current
    setMode('time')
    if (!morphSceneRef.current) {
      const now = await loadScene(s.timeMachine.to)
      setMorphScene(now)
      morphSceneRef.current = now
    }
    setMorph(0)
    morphRef.current = 0
    applyCursor(cursorRef.current.x, cursorRef.current.y)
    await narrate(
      'Listen to the same patch of ground, twice. The first frame is closed forest. The second is the same land after it was cleared. Here it comes, over eight seconds.',
      `/scenes/${s.id}/narration/time.mp3`,
      9,
    )
    if (token !== runToken.current) return
    const start = performance.now()
    await new Promise<void>((resolve) => {
      const step = () => {
        if (token !== runToken.current) return resolve()
        const t = Math.min(1, (performance.now() - start) / 8000)
        setMorph(t)
        morphRef.current = t
        applyCursor(cursorRef.current.x, cursorRef.current.y)
        if (t < 1) requestAnimationFrame(step)
        else resolve()
      }
      requestAnimationFrame(step)
    })
    if (token === runToken.current) {
      await narrate(
        'That is what clearing sounds like when it is played as pitch and brightness instead of shown as a picture.',
        `/scenes/${s.id}/narration/time-end.mp3`,
        6,
      )
    }
  }, [applyCursor, narrate])

  // ---------------------------------------------------------------- legend
  const runLegend = useCallback(async () => {
    if (!playingRef.current) return
    setLegendOn(true)
    setLegendStep(-1)
    await engine.current.legend((i) => setLegendStep(i))
    setLegendOn(false)
    setLegendStep(-1)
  }, [])

  // ---------------------------------------------------------------- modes
  const setModeSafe = useCallback(
    (m: Mode) => {
      if (m === 'time') {
        if (sceneRef.current?.timeMachine) void runTime()
        return
      }
      runToken.current++
      narrator.current.stop()
      setJourney({ running: false, index: -1 })
      setMode(m)
      setRevealed(false)
      if (m === 'blind') {
        void narrate(
          'Blindfold mode. The picture is hidden. Move around and listen, then press R to reveal it, or B to come back.',
          '/narration/blindfold.mp3',
          7,
        )
      }
    },
    [narrate, runTime],
  )

  // ---------------------------------------------------------------- keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (showHelp || showHow) return
      const stepX = e.shiftKey ? 4 / 16 : 1 / 16
      const stepY = e.shiftKey ? 4 / 12 : 1 / 12
      const c = cursorRef.current
      const s = sceneRef.current
      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault()
          moveCursor(c.x - stepX, c.y)
          break
        case 'ArrowRight':
          e.preventDefault()
          moveCursor(c.x + stepX, c.y)
          break
        case 'ArrowUp':
          e.preventDefault()
          moveCursor(c.x, c.y - stepY)
          break
        case 'ArrowDown':
          e.preventDefault()
          moveCursor(c.x, c.y + stepY)
          break
        case 'h':
        case 'H': {
          e.preventDefault()
          if (!s) break
          const list = s.hotspots
          const idx = activeHotspot ? list.findIndex((h) => h.id === activeHotspot.id) : -1
          const nextIdx = e.shiftKey ? (idx <= 0 ? list.length - 1 : idx - 1) : (idx + 1) % list.length
          moveCursor(list[nextIdx].x, list[nextIdx].y)
          break
        }
        case ' ':
          e.preventDefault()
          if (journey.running) stopJourney()
          else void runJourney(0)
          break
        case 'n':
        case 'N':
          if (s) void openScene(neighbour(s.id, 1))
          break
        case 'p':
        case 'P':
          if (s) void openScene(neighbour(s.id, -1))
          break
        case 't':
        case 'T':
          void runTime()
          break
        case 'b':
        case 'B':
          setModeSafe(modeRef.current === 'blind' ? 'explore' : 'blind')
          break
        case 'l':
        case 'L':
          void runLegend()
          break
        case 'r':
        case 'R':
          if (modeRef.current === 'blind' && !revealed) setRevealed(true)
          else if (lastSpoken.current) void narrate(lastSpoken.current)
          break
        case 'm':
        case 'M':
          setMuted((m) => {
            engine.current.setMuted(!m)
            return !m
          })
          break
        case '?':
          e.preventDefault()
          setShowHelp(true)
          break
        case 'Escape':
          runToken.current++
          narrator.current.stop()
          setJourney({ running: false, index: -1 })
          setMode('explore')
          setLegendOn(false)
          break
        case 'Enter':
          if (activeHotspot) {
            e.preventDefault()
            void narrate(activeHotspot.text, activeHotspot.audio)
          }
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    activeHotspot,
    journey.running,
    moveCursor,
    narrate,
    openScene,
    revealed,
    runJourney,
    runLegend,
    runTime,
    setModeSafe,
    showHelp,
    showHow,
    stopJourney,
  ])

  // ---------------------------------------------------------------- render
  const number = useMemo(() => {
    const i = scene ? SCENE_IDS.indexOf(scene.id as (typeof SCENE_IDS)[number]) : 0
    return String(i + 1).padStart(2, '0')
  }, [scene])

  const stopName =
    journey.index >= 0 && scene
      ? (scene.hotspots.find((h) => h.id === scene.journey[journey.index])?.name ?? '')
      : ''

  return (
    <div className={`app mode-${mode}`}>
      <a className="skip" href="#panel">
        Skip to the description
      </a>

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-name">
            Algo<span>Rythm</span>
          </span>
        </div>
        <p className="topbar-mid">
          NASA Space Apps 2026 <span aria-hidden="true">·</span> The Earth Information Jukebox
        </p>
        <div className="topbar-actions">
          <button className="link" onClick={() => setShowHow(true)}>
            How it sounds
          </button>
          <button
            className={`link${srMode ? ' link-on' : ''}`}
            onClick={() => {
              const next = !srMode
              setSrMode(next)
              narrator.current.setSelfVoicing(!next)
              if (next) narrator.current.stop()
            }}
            aria-pressed={srMode}
            title="Stop the app from speaking, so it does not talk over your screen reader"
          >
            Screen reader mode
          </button>
          <button className="link" onClick={() => setShowHelp(true)}>
            Keys
          </button>
        </div>
      </header>

      <main className="layout">
        <section className="left">
          {scene ? (
            <SceneStage
              scene={scene}
              morphScene={morphScene}
              morph={morph}
              blind={mode === 'blind'}
              revealed={revealed}
              cursor={cursor}
              activeHotspot={activeHotspot}
              onMove={moveCursor}
              onReveal={() => setRevealed(true)}
              onKeyDown={(e) => {
                if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault()
              }}
            />
          ) : (
            <div className="stage stage-loading">
              <p>Loading the collection…</p>
            </div>
          )}

          <ModeBar
            mode={mode}
            hasTimeMachine={!!scene?.timeMachine}
            onMode={setModeSafe}
            onLegend={() => void runLegend()}
            legendOn={legendOn}
          />

          <div className="transport">
            <div className="transport-left">
              {journey.running ? (
                <>
                  <button className="btn btn-solid" onClick={stopJourney}>
                    Pause journey
                  </button>
                  <span className="journey-state">
                    <span className="journey-bar">
                      <i
                        style={{
                          width: `${((journey.index + 1) / (scene?.journey.length || 1)) * 100}%`,
                        }}
                      />
                    </span>
                    <span className="journey-label">
                      Stop {journey.index + 1} of {scene?.journey.length} · {stopName}
                    </span>
                  </span>
                </>
              ) : (
                <button className="btn btn-solid" onClick={() => void runJourney(0)}>
                  Start the journey
                </button>
              )}
              <button
                className="btn"
                onClick={() => activeHotspot && void narrate(activeHotspot.text, activeHotspot.audio)}
                disabled={!activeHotspot}
              >
                {activeHotspot ? `Describe: ${activeHotspot.name}` : 'Describe this point'}
              </button>
            </div>
            <div className="transport-right">
              <button
                className={`btn btn-quiet${muted ? ' btn-on' : ''}`}
                onClick={() =>
                  setMuted((m) => {
                    engine.current.setMuted(!m)
                    return !m
                  })
                }
                aria-pressed={muted}
              >
                {muted ? 'Sound off' : 'Sound on'}
              </button>
              <Visualizer engine={engine.current} active={playing && !muted} />
            </div>
          </div>

          {mode === 'time' && scene?.timeMachine && (
            <div className="timebar">
              <span className="timebar-label">{scene.timeMachine.labels[0]}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={morph}
                aria-label="Time machine position"
                onChange={(e) => {
                  const t = Number(e.target.value)
                  setMorph(t)
                  morphRef.current = t
                  applyCursor(cursorRef.current.x, cursorRef.current.y)
                }}
              />
              <span className="timebar-label">{scene.timeMachine.labels[1]}</span>
              <p className="timebar-caption">{scene.timeMachine.caption}</p>
            </div>
          )}

          {legendOn && (
            <div className="legend" role="status">
              <p className="legend-title">Sound legend</p>
              {legendStep >= 0 ? (
                <p className="legend-body">
                  <strong>{VOICE_LABELS[VOICE_ORDER[legendStep]]?.name}</strong>{' '}
                  {VOICE_LABELS[VOICE_ORDER[legendStep]]?.blurb}
                </p>
              ) : (
                <p className="legend-body">Listen to each voice in turn…</p>
              )}
            </div>
          )}
        </section>

        <aside className="panel" id="panel" aria-label="About this scene">
          {scene && (
            <>
              <p className="panel-eyebrow">
                <span className="panel-num">{number}</span>
                {scene.eyebrow}
              </p>
              <h1 className="panel-title">{scene.title}</h1>
              <p className="panel-sub">{scene.subtitle}</p>

              <div className="readout">
                <div>
                  <span className="readout-k">Note</span>
                  <span className="readout-v">{readout?.note ?? '—'}</span>
                </div>
                <div>
                  <span className="readout-k">Pan</span>
                  <span className="readout-v">
                    {readout
                      ? readout.pan < -0.1
                        ? 'left'
                        : readout.pan > 0.1
                          ? 'right'
                          : 'centre'
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="readout-k">Level</span>
                  <span className="readout-v">{readout ? `${Math.round(readout.gainDb)} dB` : '—'}</span>
                </div>
                <div>
                  <span className="readout-k">Tone</span>
                  <span className="readout-v">{readout ? `${readout.cutoff} Hz` : '—'}</span>
                </div>
              </div>

              <h2 className="panel-h2">Landmarks</h2>
              <ol className="landmarks">
                {scene.hotspots.map((h) => (
                  <li key={h.id}>
                    <button
                      className={`landmark${activeHotspot?.id === h.id ? ' landmark-on' : ''}`}
                      onClick={() => {
                        moveCursor(h.x, h.y)
                        void narrate(h.text, h.audio)
                      }}
                    >
                      <span className="landmark-name">{h.name}</span>
                      <span className="landmark-tag">{h.sourced === 'nasa' ? 'NASA' : 'visible'}</span>
                    </button>
                  </li>
                ))}
              </ol>

              <h2 className="panel-h2">Source</h2>
              <p className="credit">
                {scene.source.agency}
                <br />
                <span className="credit-dim">
                  {scene.source.id} · {scene.source.date}
                </span>
                <br />
                <a href={scene.source.url} target="_blank" rel="noreferrer noopener">
                  View on NASA
                </a>
              </p>

              <p className="facts">{scene.facts}</p>
            </>
          )}
        </aside>
      </main>

      <footer className="foot">
        <p className="transcript" aria-live="polite">
          {transcript || 'Nothing is being narrated right now.'}
        </p>
        <p className="foot-keys" aria-hidden="true">
          <kbd>←↑↓→</kbd> move <kbd>H</kbd> landmark <kbd>Space</kbd> journey <kbd>T</kbd> time{' '}
          <kbd>B</kbd> blindfold <kbd>L</kbd> legend <kbd>?</kbd> keys
        </p>
      </footer>

      <div className="rail-wrap">
        <SceneRail current={scene} onPick={(id) => void openScene(id)} />
      </div>

      {!playing && <StartGate onBegin={() => void begin()} sceneTitle={scene?.title} busy={starting} />}

      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
      {showHow && (
        <HowItSounds
          scene={scene}
          onClose={() => setShowHow(false)}
          onPreviewVoice={(voice) => {
            const idx = VOICE_ORDER.indexOf(voice)
            setLegendOn(true)
            setLegendStep(idx)
            window.setTimeout(() => {
              setLegendOn(false)
              setLegendStep(-1)
            }, 1600)
          }}
        />
      )}
    </div>
  )
}
