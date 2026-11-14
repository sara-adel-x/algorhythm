import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioEngine } from '../audio/engine'
import { cellAt, hueWeights } from '../audio/mapping'
import { Narrator } from '../audio/narrator'
import { loadScene, neighbour, SCENE_IDS } from './registry'
import type { Cell, Hotspot, Mode, Readout, Scene } from './types'

const VOICES = ['warm', 'hollow', 'glass', 'shimmer']
const WELCOME = 'Welcome to AlgoRythm. Nothing here is decoration. Every note you are about to hear is a measurement taken from a real NASA image. Move the point across the picture with your arrow keys, or drag your finger, and listen to what changes. Press H to jump to the next landmark. Press space to be taken through the whole picture, one stop at a time. And if you ever want the full map of what means what, press the question mark.'
const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
function blend(a: Cell, b: Cell, t: number): Cell {
  const dh = ((b.h - a.h + 540) % 360) - 180
  return { h: (a.h + dh * t + 360) % 360, s: lerp(a.s, b.s, t), l: lerp(a.l, b.l, t), e: lerp(a.e, b.e, t) }
}

export function useExperience() {
  const [engine] = useState(() => new AudioEngine())
  const [narrator] = useState(() => new Narrator())
  const [home, setHome] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [scene, setScene] = useState<Scene | null>(null)
  const [cursor, setCursor] = useState({ x: .5, y: .5 })
  const [readout, setReadout] = useState<Readout | null>(null)
  const [mode, setMode] = useState<Mode>('explore')
  const [playing, setPlaying] = useState(false)
  const [muted, setMuted] = useState(false)
  const [screenReaderMode, setScreenReaderMode] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [speaking, setSpeaking] = useState(false)
  const [journey, setJourney] = useState({ running: false, paused: false, index: -1 })
  const [timeFrames, setTimeFrames] = useState<[Scene, Scene] | null>(null)
  const [morph, setMorph] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [legendStep, setLegendStep] = useState<number | null>(null)
  const [interacted, setInteracted] = useState(false)

  const refs = useRef({ scene: null as Scene | null, cursor: { x: .5, y: .5 }, mode: 'explore' as Mode, frames: null as [Scene, Scene] | null, morph: 0, home: true, loading: false, interacted: false })
  const token = useRef(0)
  const loadOwner = useRef(0)
  const lastNarration = useRef({ text: '', src: undefined as string | undefined })
  const lastLandmark = useRef('')

  useEffect(() => {
    const off = narrator.on((s) => {
      setSpeaking(s.speaking)
      if (s.text) setTranscript(s.text)
      engine.setNarrating(s.speaking && narrator.isSelfVoicing)
    })
    if (import.meta.env.DEV) Object.assign(window, { __engine: engine, __narrator: narrator })
    return () => { off(); narrator.stop(); token.current++; engine.dispose() }
  }, [engine, narrator])

  useEffect(() => {
    const t = setTimeout(() => { SCENE_IDS.forEach((id) => void loadScene(id).catch(() => {})) }, 500)
    return () => clearTimeout(t)
  }, [])

  const changeMode = useCallback((next: Mode) => { refs.current.mode = next; setMode(next) }, [])
  const cancel = useCallback(() => {
    token.current++
    engine.cancelPendingStart()
    narrator.stop()
    engine.cancelLegend()
    setLegendStep(null)
    return token.current
  }, [engine, narrator])
  const narrate = useCallback(async (text: string, src?: string) => {
    lastNarration.current = { text, src }
    setTranscript(text)
    await narrator.speak(text, src)
  }, [narrator])

  const apply = useCallback((x = refs.current.cursor.x, y = refs.current.cursor.y) => {
    const r = refs.current
    const result = r.mode === 'time' && r.frames
      ? engine.apply(blend(cellAt(r.frames[0].grid, x, y), cellAt(r.frames[1].grid, x, y), r.morph), x, y)
      : engine.update(x, y)
    setReadout(result)
    return result
  }, [engine])
  const move = useCallback((x: number, y: number) => {
    const next = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
    refs.current.cursor = next
    setCursor(next)
    apply(next.x, next.y)
  }, [apply])
  const ensureMusic = useCallback(async (owner = token.current) => {
    if (owner !== token.current || refs.current.home) return
    await engine.start()
    if (owner !== token.current || refs.current.home) return
    setPlaying(engine.running); engine.fadeIn(.7); apply()
  }, [engine, apply])

  const activeHotspot = mode !== 'time' ? scene?.hotspots.find((h) => Math.hypot(h.x - cursor.x, h.y - cursor.y) < .055) ?? null : null
  useEffect(() => {
    if (home || !interacted || mode !== 'explore' || legendStep !== null || !activeHotspot) return
    const h = activeHotspot
    if (lastLandmark.current === h.id) return
    const t = setTimeout(() => {
      if (narrator.isSpeaking) return
      lastLandmark.current = h.id
      engine.ping(.65)
      void narrate(h.text, h.audio)
    }, 600)
    return () => clearTimeout(t)
  }, [activeHotspot, cursor, engine, home, interacted, legendStep, mode, narrate, narrator, speaking])
  useEffect(() => { if (!activeHotspot) lastLandmark.current = '' }, [activeHotspot])

  const openScene = useCallback(async (id: string) => {
    if (refs.current.loading) return
    refs.current.loading = true; setLoading(true); setError('')
    const currentToken = cancel()
    const owner = ++loadOwner.current
    setJourney({ running: false, paused: false, index: -1 })
    changeMode('explore'); setTimeFrames(null); refs.current.frames = null; setRevealed(false)
    refs.current.interacted = false; setInteracted(false); lastLandmark.current = ''
    try {
      const next = await loadScene(id)
      if (token.current !== currentToken) return
      engine.fadeOut(.25); await wait(250)
      if (token.current !== currentToken) return
      await engine.init(next)
      if (token.current !== currentToken) return
      refs.current.scene = next; setScene(next)
      move(.5, .5); await ensureMusic(currentToken)
      if (token.current !== currentToken) return
      setTranscript(`${next.title}. Drag to explore, press H for a landmark, or Space for the journey.`)
    } catch { if (owner === loadOwner.current) setError('This scene could not be loaded. Try another scene or return home.') }
    finally { if (owner === loadOwner.current) { refs.current.loading = false; setLoading(false) } }
  }, [cancel, changeMode, engine, ensureMusic, move])

  const runJourney = useCallback(async (from = 0, resume = false) => {
    if (!refs.current.scene || refs.current.loading || refs.current.home) return
    const s = refs.current.scene
    const currentToken = cancel()
    changeMode('journey'); setJourney({ running: true, paused: false, index: resume ? from : -1 })
    await ensureMusic(currentToken)
    if (token.current !== currentToken) return
    if (!resume) await narrate(s.journeyIntro, `/scenes/${s.id}/narration/intro.mp3`)
    if (token.current !== currentToken) return
    for (let i = from; i < s.journey.length; i++) {
      const stop = s.hotspots.find((h) => h.id === s.journey[i])
      if (!stop) continue
      setJourney({ running: true, paused: false, index: i })
      const origin = { ...refs.current.cursor }
      const start = performance.now()
      const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 1700
      await new Promise<void>((resolve) => {
        const tick = () => {
          if (token.current !== currentToken) { resolve(); return }
          const t = duration ? Math.min(1, (performance.now() - start) / duration) : 1
          const eased = t * t * (3 - 2 * t)
          move(lerp(origin.x, stop.x, eased), lerp(origin.y, stop.y, eased))
          if (t < 1) requestAnimationFrame(tick); else resolve()
        }
        requestAnimationFrame(tick)
      })
      if (token.current !== currentToken) return
      engine.ping(.7); await narrate(stop.text, stop.audio)
      if (token.current !== currentToken) return
      await wait(1100)
      if (token.current !== currentToken) return
    }
    setJourney({ running: false, paused: false, index: -1 }); changeMode('explore')
  }, [cancel, changeMode, engine, ensureMusic, move, narrate])
  const pauseJourney = useCallback(() => { cancel(); apply(); setJourney((j) => ({ ...j, running: false, paused: true })) }, [apply, cancel])

  const runTime = useCallback(async () => {
    const s = refs.current.scene
    if (!s?.timeMachine || refs.current.loading) return
    const currentToken = cancel()
    setJourney({ running: false, paused: false, index: -1 }); changeMode('time')
    try {
      const frames = await Promise.all([loadScene(s.timeMachine.from), loadScene(s.timeMachine.to)]) as [Scene, Scene]
      if (token.current !== currentToken) return
      refs.current.frames = frames; setTimeFrames(frames); refs.current.morph = 0; setMorph(0)
      await ensureMusic(currentToken)
      if (token.current !== currentToken) return
      apply()
      await narrate('Listen to the same patch of ground, twice. The first frame is closed forest. The second is the same land after it was cleared. Here it comes, over eight seconds.', `/scenes/${s.id}/narration/time.mp3`)
      if (token.current !== currentToken) return
      const start = performance.now()
      await new Promise<void>((resolve) => {
        const tick = () => {
          if (token.current !== currentToken) { resolve(); return }
          const t = Math.min(1, (performance.now() - start) / 8000)
          refs.current.morph = t; setMorph(t); apply()
          if (t < 1) requestAnimationFrame(tick); else resolve()
        }
        requestAnimationFrame(tick)
      })
      if (token.current === currentToken) await narrate('That is what clearing sounds like when it is played as pitch and brightness, instead of shown as a picture.', `/scenes/${s.id}/narration/time-end.mp3`)
    } catch { setError('The comparison frames could not be loaded.'); changeMode('explore') }
  }, [apply, cancel, changeMode, ensureMusic, narrate])
  const scrubTime = useCallback((t: number) => { cancel(); refs.current.morph = t; setMorph(t); apply() }, [apply, cancel])

  const runLegend = useCallback(async (voice?: string) => {
    if (refs.current.home || refs.current.loading) return
    const currentToken = cancel(); changeMode('explore'); setJourney({ running: false, paused: false, index: -1 })
    await ensureMusic(currentToken)
    if (token.current !== currentToken) return
    setLegendStep(voice ? VOICES.indexOf(voice) : -1)
    if (voice) await engine.previewVoice(voice)
    else await engine.legend(setLegendStep)
    if (token.current === currentToken) { setLegendStep(null); apply() }
  }, [apply, cancel, changeMode, engine, ensureMusic])

  const selectMode = useCallback((next: Mode) => {
    if (next === 'journey') { void runJourney(); return }
    if (next === 'time') { void runTime(); return }
    cancel(); setJourney({ running: false, paused: false, index: -1 }); changeMode(next); setRevealed(false); apply()
    if (next === 'blind') void narrate('Blindfold mode. The picture is hidden. Move around and listen, and try to build the shape of it in your head. When you are ready, press R to reveal it, or B to come back.', '/narration/blindfold.mp3')
  }, [apply, cancel, changeMode, narrate, runJourney, runTime])

  const enter = useCallback(async (id = 'm74', guided = false) => {
    if (refs.current.loading) return
    refs.current.loading = true; setLoading(true); setError('')
    const currentToken = cancel()
    const owner = ++loadOwner.current
    try {
      // Called directly by click/key activation, before fetching/initializing the graph.
      await engine.unlock()
      if (token.current !== currentToken) return
      const next = await loadScene(id)
      if (token.current !== currentToken) return
      await engine.init(next)
      if (token.current !== currentToken) return
      refs.current.scene = next; setScene(next); refs.current.home = false; setHome(false)
      refs.current.interacted = false; setInteracted(false); changeMode('explore'); move(.5, .5)
      setTimeFrames(null); refs.current.frames = null; setRevealed(false)
      await ensureMusic(currentToken)
      if (token.current !== currentToken) return
      refs.current.loading = false; setLoading(false)
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.stage')?.focus())
      if (guided) void runJourney()
      else void narrate(WELCOME, '/narration/welcome.mp3')
    } catch {
      if (owner === loadOwner.current) {
        setError('We could not start the audio. Check your browser audio permissions.')
        engine.stop(); refs.current.home = true; setHome(true); setPlaying(false)
      }
    }
    finally { if (owner === loadOwner.current) { refs.current.loading = false; setLoading(false) } }
  }, [cancel, changeMode, engine, ensureMusic, move, narrate, runJourney])
  const goHome = useCallback(() => {
    loadOwner.current++; refs.current.loading = false; setLoading(false)
    cancel(); engine.fadeOut(.15); engine.stop(); setPlaying(false); refs.current.home = true; setHome(true); changeMode('explore')
    setJourney({ running: false, paused: false, index: -1 }); setTranscript('')
    requestAnimationFrame(() => { document.querySelector<HTMLElement>('#landing-main')?.focus(); document.querySelector('.landing')?.scrollTo(0, 0) })
  }, [cancel, changeMode, engine])
  const toggleScreenReader = useCallback(() => {
    setScreenReaderMode((on) => { narrator.setSelfVoicing(on); return !on })
  }, [narrator])
  const toggleMute = useCallback(() => { setMuted((m) => { engine.setMuted(!m); return !m }) }, [engine])
  const toggleMusic = useCallback(async () => { if (engine.running) { engine.stop(); setPlaying(false) } else await ensureMusic() }, [engine, ensureMusic])
  const stopEverything = useCallback(() => {
    cancel(); engine.stop(); setPlaying(false); setJourney({ running: false, paused: false, index: -1 }); changeMode('explore'); setTranscript('Stopped. Press Play music to listen again.')
  }, [cancel, changeMode, engine])
  const manualMove = useCallback((x: number, y: number) => {
    if (refs.current.loading) return
    if (refs.current.mode === 'journey') { cancel(); changeMode('explore'); setJourney({ running: false, paused: false, index: -1 }) }
    if (legendStep !== null) { engine.cancelLegend(); setLegendStep(null) }
    refs.current.interacted = true; setInteracted(true)
    move(x, y)
    const r = apply(x, y); if (r) engine.maybeAccent(r.cell)
  }, [apply, cancel, changeMode, engine, legendStep, move])
  const jump = useCallback((h: Hotspot) => { cancel(); changeMode('explore'); setJourney({ running: false, paused: false, index: -1 }); move(h.x, h.y); lastLandmark.current = h.id; engine.ping(.7); void narrate(h.text, h.audio) }, [cancel, changeMode, engine, move, narrate])
  const describe = useCallback(() => {
    if (activeHotspot) { jump(activeHotspot); return }
    if (!scene) return
    const cell = cellAt(scene.grid, cursor.x, cursor.y)
    const weights = hueWeights(cell.h); const voice = VOICES[weights.indexOf(Math.max(...weights))]
    void narrate(`${cursor.x < .35 ? 'Left' : cursor.x > .65 ? 'Right' : 'Centre'} of the frame, ${cursor.y < .35 ? 'upper' : cursor.y > .65 ? 'lower' : 'middle'} region. ${cell.l < .06 ? 'Nearly dark and quiet' : cell.l < .3 ? 'Faint light' : 'A bright region'}. ${voice} voice, note ${readout?.note ?? 'held'}.`)
  }, [activeHotspot, cursor, jump, narrate, readout, scene])
  const repeat = useCallback(() => { const { text, src } = lastNarration.current; if (text) void narrate(text, src) }, [narrate])
  const nextScene = useCallback((step: number) => { if (scene) void openScene(neighbour(scene.id, step)) }, [openScene, scene])

  return { home, loading, error, scene, cursor, readout, mode, playing, muted, screenReaderMode, transcript, speaking, journey, timeFrames, morph, revealed, legendStep, activeHotspot, engine, enter, goHome, openScene, manualMove, jump, describe, repeat, runJourney, pauseJourney, runTime, scrubTime, runLegend, selectMode, toggleScreenReader, toggleMute, toggleMusic, stopEverything, nextScene, reveal: () => setRevealed(true) }
}
