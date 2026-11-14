import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioEngine, type Readout } from '../audio/engine'
import { Narrator, type NarratorState } from '../audio/narrator'
import { analyzeFrame } from '../analysis/client'
import { mixSamples, mixStats, sampleGrid, type AnalysisResult, type Sample } from '../analysis/analyze'
import { nasa } from '../nasa/api'
import type { Catalog, Dataset, EventList, FrameInfo } from '../nasa/types'
import { ambienceFor, landmarksFor, nearestLandmark, placeText, sweepPoint, valueText, type Landmark } from './model'
import {
  BLINDFOLD,
  NO_TIME_MACHINE,
  datasetIntro,
  TIME_MACHINE_INTRO,
  WELCOME,
  iceSummary,
  temperatureSummary,
} from '../../shared/narration.mjs'

export type Phase = 'gate' | 'select' | 'listen'
export type Mode = 'explore' | 'time' | 'blind'
export type Overlay = 'help' | 'legend' | 'how' | null

export interface Frame {
  info: FrameInfo
  analysis: AnalysisResult
  /** object URL of the recoloured / reprojected frame, if any */
  displayUrl: string | null
}

export interface TimeState {
  t: number
  running: boolean
  summary: string | null
  values: { then: number; now: number; unit: string; label: string; thenDate: string; nowDate: string } | null
}

export interface Line {
  id: number
  text: string
  voiced: boolean
}

const TM_SECONDS = 8
const PREF_KEY = 'algorhythm:screen-reader'

const readPref = () => {
  try {
    return localStorage.getItem(PREF_KEY) === '1'
  } catch {
    return false
  }
}

async function rgbaToUrl(rgba: Uint8ClampedArray, w: number, h: number): Promise<string> {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas unavailable')
  ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba), w, h), 0, 0)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'))
  if (!blob) throw new Error('Could not encode frame')
  return URL.createObjectURL(blob)
}

async function loadFrame(ds: Dataset, key: string, eventId: string | null): Promise<Frame> {
  const info = await nasa.frameInfo(ds.id, key, eventId)
  const analysis = await analyzeFrame(ds, info)
  const displayUrl = analysis.display ? await rgbaToUrl(analysis.display, analysis.width, analysis.height) : null
  return { info, analysis, displayUrl }
}

function summarize(ds: Dataset, then: Frame, now: Frame) {
  const a = then.analysis.stats
  const b = now.analysis.stats
  if (ds.timeMachine?.metric === 'ice-extent' && a.extent !== null && b.extent !== null) {
    return {
      text: iceSummary(then.info.date, now.info.date, a.extent, b.extent),
      values: { then: a.extent, now: b.extent, unit: 'million km²', label: 'Sea-ice extent (≥ 15 %)', thenDate: then.info.date, nowDate: now.info.date },
    }
  }
  const tc = a.areaMean - 273.15
  const nc = b.areaMean - 273.15
  return {
    text: temperatureSummary(then.info.date, now.info.date, tc, nc),
    values: { then: tc, now: nc, unit: '°C', label: 'Area-weighted mean 2 m air temperature', thenDate: then.info.date, nowDate: now.info.date },
  }
}

export function useJukebox() {
  const engine = useMemo(() => new AudioEngine(), [])
  const narrator = useMemo(() => new Narrator(), [])

  const [phase, setPhase] = useState<Phase>('gate')
  const [srMode, setSrModeState] = useState(readPref)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [dataset, setDataset] = useState<Dataset | null>(null)
  const [events, setEvents] = useState<EventList | null>(null)
  const [eventId, setEventId] = useState<string | null>(null)
  const [frames, setFramesState] = useState<Record<string, Frame>>({})
  const [status, setStatus] = useState({ busy: false, message: '', error: false })
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 })
  const [readout, setReadout] = useState<{ sample: Sample; sound: Readout } | null>(null)
  const [mode, setModeState] = useState<Mode>('explore')
  const [revealed, setRevealed] = useState(false)
  const [time, setTime] = useState<TimeState>({ t: 1, running: false, summary: null, values: null })
  const [paused, setPaused] = useState(false)
  const [muted, setMuted] = useState(false)
  const [overlay, setOverlay] = useState<Overlay>(null)
  const [legendStep, setLegendStep] = useState(-1)
  const [speech, setSpeech] = useState<NarratorState>({ speaking: false, voiced: false, text: '', clip: null })
  const [transcript, setTranscript] = useState<Line[]>([])
  const [landmarkIdx, setLandmarkIdx] = useState(-1)

  // Mutable mirror for animation loops and key handlers (never stale).
  const live = useRef({
    dataset: null as Dataset | null,
    frames: {} as Record<string, Frame>,
    mode: 'explore' as Mode,
    t: 1,
    cursor: { x: 0.5, y: 0.5 },
    paused: false,
    srMode,
    userMoved: false,
  })
  const loadToken = useRef(0)
  const tmRun = useRef(0)
  const lineId = useRef(0)

  const setFrames = (f: Record<string, Frame>) => {
    live.current.frames = f
    setFramesState(f)
  }
  /** Release every decoded frame image held by the listening view. */
  const disposeFrames = () => {
    Object.values(live.current.frames).forEach((f) => f.displayUrl && URL.revokeObjectURL(f.displayUrl))
    setFrames({})
  }

  // ---- catalog ---------------------------------------------------------------
  useEffect(() => {
    nasa
      .catalog()
      .then(setCatalog)
      .catch((e: Error) => setCatalogError(e.message))
    void narrator.load()
  }, [narrator])

  // ---- narration → transcript, aria-live and −12 dB ducking ---------------------
  useEffect(() => {
    let lastText = ''
    return narrator.on((s) => {
      setSpeech(s)
      engine.setNarrating(s.speaking && (s.voiced || live.current.srMode))
      if (s.speaking && s.text !== lastText) {
        lastText = s.text
        const id = ++lineId.current
        setTranscript((t) => [...t.slice(-30), { id, text: s.text, voiced: s.voiced }])
      }
      if (!s.speaking) lastText = ''
    })
  }, [engine, narrator])

  useEffect(
    () => () => {
      engine.dispose()
      Object.values(live.current.frames).forEach((f) => f.displayUrl && URL.revokeObjectURL(f.displayUrl))
    },
    [engine],
  )

  const say = useCallback((text: string) => narrator.say(text), [narrator])

  // ---- sound under the cursor -----------------------------------------------------
  const nowKey = (ds: Dataset) => ds.timeMachine?.now ?? ds.defaultFrame

  const sound = useCallback(
    (x: number, y: number, moved: boolean) => {
      const L = live.current
      const ds = L.dataset
      if (!ds) return
      const now = L.frames[nowKey(ds)]
      if (!now) return
      let sample = sampleGrid(now.analysis.grid, x, y)
      const then = ds.timeMachine ? L.frames[ds.timeMachine.then] : undefined
      if (L.mode === 'time' && then) sample = mixSamples(sampleGrid(then.analysis.grid, x, y), sample, L.t)
      const r = engine.apply(sample, x, y, moved)
      setReadout({ sample, sound: r })
    },
    [engine],
  )

  const applyAmbience = useCallback(
    (seconds: number) => {
      const L = live.current
      const ds = L.dataset
      if (!ds) return
      const now = L.frames[nowKey(ds)]
      if (!now) return
      const then = ds.timeMachine ? L.frames[ds.timeMachine.then] : undefined
      const stats = L.mode === 'time' && then ? mixStats(then.analysis.stats, now.analysis.stats, L.t) : now.analysis.stats
      engine.setAmbience(ambienceFor(ds, stats), seconds)
    },
    [engine],
  )

  const moveTo = useCallback(
    (x: number, y: number, moved = true, bySweep = false) => {
      const c = { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) }
      if (!bySweep && moved) live.current.userMoved = true
      live.current.cursor = c
      setCursor(c)
      sound(c.x, c.y, moved)
    },
    [sound],
  )

  // ---- modes ---------------------------------------------------------------------
  const setMode = useCallback(
    (m: Mode) => {
      if (m !== 'time') tmRun.current++
      live.current.mode = m
      if (m !== 'time') live.current.t = 1
      setModeState(m)
      if (m !== 'blind') setRevealed(false)
      if (m !== 'time') setTime((s) => ({ ...s, t: 1, running: false }))
      sound(live.current.cursor.x, live.current.cursor.y, false)
      applyAmbience(0.8)
    },
    [applyAmbience, sound],
  )

  // ---- datasets -------------------------------------------------------------------
  const openDataset = useCallback(
    async (ds: Dataset, opts: { eventId?: string | null; intro?: boolean } = {}) => {
      const token = ++loadToken.current
      tmRun.current++
      engine.cancelLegend()
      disposeFrames()
      live.current.dataset = ds
      live.current.mode = 'explore'
      live.current.t = 1
      setPhase('listen')
      setDataset(ds)
      setModeState('explore')
      setRevealed(false)
      setOverlay(null)
      setFrames({})
      setReadout(null)
      setLandmarkIdx(-1)
      setTime({ t: 1, running: false, summary: null, values: null })
      setStatus({ busy: true, message: `Fetching ${ds.title.toLowerCase()} from NASA…`, error: false })
      const stale = () => token !== loadToken.current
      const intro = opts.intro !== false ? say(datasetIntro(ds.id, ds.events?.scope) ?? ds.subtitle) : Promise.resolve(true)
      try {
        await engine.load(ds.sound)
        if (stale()) return
        if (!live.current.paused) await engine.start()
        let ev = opts.eventId ?? null
        if (ds.kind === 'event') {
          const list = await nasa.events(ds.id, 40)
          if (stale()) return
          setEvents(list)
          ev = ev ?? list.events[0]?.id ?? null
          if (!ev) throw new Error(`NASA EONET lists no ${ds.theme.toLowerCase()} events right now.`)
        } else if (ds.eventOverlay) {
          nasa
            .events(ds.id, 40)
            .then((l) => !stale() && setEvents(l))
            .catch(() => {})
        } else setEvents(null)
        setEventId(ev)

        const main = await loadFrame(ds, nowKey(ds), ev)
        if (stale()) {
          if (main.displayUrl) URL.revokeObjectURL(main.displayUrl)
          return
        }
        setFrames({ [nowKey(ds)]: main })
        const st = main.analysis.stats
        setStatus({
          busy: false,
          error: false,
          message: `Analysed ${(main.info.size[0] * main.info.size[1]).toLocaleString('en-US')} pixels in ${st.ms} ms.`,
        })
        live.current.userMoved = false
        moveTo(0.5, 0.5, false)
        applyAmbience(2)

        if (ds.kind === 'event' && main.info.event) {
          const narration = main.info.event.narration
          void intro.then(() => {
            if (!stale()) void say(narration)
          })
        }
        for (const key of Object.keys(ds.frames)) {
          if (key === nowKey(ds)) continue
          loadFrame(ds, key, ev)
            .then((f) => {
              if (stale()) {
                if (f.displayUrl) URL.revokeObjectURL(f.displayUrl)
                return
              }
              setFrames({ ...live.current.frames, [key]: f })
            })
            .catch((e: Error) => !stale() && setStatus({ busy: false, error: true, message: `Earlier frame unavailable: ${e.message}` }))
        }
      } catch (e) {
        if (stale()) return
        const message = e instanceof Error ? e.message : String(e)
        setStatus({ busy: false, error: true, message })
        void say(`Sorry, NASA data is unavailable right now. ${message}`)
      }
    },
    [applyAmbience, engine, moveTo, say],
  )

  const openByNumber = useCallback(
    (n: number) => {
      const ds = catalog?.datasets.find((d) => d.number === n)
      if (ds) void openDataset(ds)
    },
    [catalog, openDataset],
  )

  const selectEvent = useCallback(
    (id: string) => {
      const ds = live.current.dataset
      if (ds) void openDataset(ds, { eventId: id, intro: false })
    },
    [openDataset],
  )

  const stepEvent = useCallback(
    (dir: number) => {
      if (!events?.events.length) return
      const i = events.events.findIndex((e) => e.id === eventId)
      const next = events.events[(i + dir + events.events.length) % events.events.length]
      selectEvent(next.id)
    },
    [eventId, events, selectEvent],
  )

  const backToSelect = useCallback(() => {
    loadToken.current++
    tmRun.current++
    engine.stop()
    narrator.stop()
    disposeFrames()
    live.current.dataset = null
    setDataset(null)
    setOverlay(null)
    setPhase('select')
  }, [engine, narrator])

  // ---- gate ------------------------------------------------------------------------
  const enter = useCallback(async () => {
    // Tone.start() must run inside the user's gesture.
    await engine.unlock()
    narrator.setSelfVoicing(!live.current.srMode)
    setPhase('select')
    void say(WELCOME)
  }, [engine, narrator, say])

  const setSrMode = useCallback(
    (on: boolean) => {
      live.current.srMode = on
      setSrModeState(on)
      narrator.setSelfVoicing(!on)
      try {
        localStorage.setItem(PREF_KEY, on ? '1' : '0')
      } catch {
        /* private mode */
      }
    },
    [narrator],
  )

  // ---- landmarks & descriptions -------------------------------------------------------
  const mainFrame = dataset ? frames[nowKey(dataset)] : undefined
  const landmarks: Landmark[] = useMemo(() => {
    if (!dataset || !mainFrame) return []
    const overlayEvents = dataset.eventOverlay && events ? events.events : []
    return landmarksFor(dataset, mainFrame.info, overlayEvents)
  }, [dataset, events, mainFrame])

  const describeAt = useCallback(
    (x: number, y: number, name?: string) => {
      const ds = live.current.dataset
      const f = ds ? live.current.frames[nowKey(ds)] : undefined
      if (!ds || !f) return
      let sample = sampleGrid(f.analysis.grid, x, y)
      const then = ds.timeMachine ? live.current.frames[ds.timeMachine.then] : undefined
      if (live.current.mode === 'time' && then) sample = mixSamples(sampleGrid(then.analysis.grid, x, y), sample, live.current.t)
      const place = placeText(f.info, x, y)
      const v = valueText(ds, sample)
      void say(`${name ? `${name}. ` : ''}${place.spoken}. ${v.spoken[0].toUpperCase()}${v.spoken.slice(1)}.`)
    },
    [say],
  )

  const describeHere = useCallback(() => {
    const { x, y } = live.current.cursor
    const near = nearestLandmark(landmarks, x, y)
    describeAt(x, y, near?.name)
  }, [describeAt, landmarks])

  const gotoLandmark = useCallback(
    (index: number) => {
      if (!landmarks.length) return
      const i = ((index % landmarks.length) + landmarks.length) % landmarks.length
      const l = landmarks[i]
      setLandmarkIdx(i)
      moveTo(l.x, l.y, true)
      if (l.event && l.kind === 'event') void say(l.event.narration)
      else describeAt(l.x, l.y, l.name)
    },
    [describeAt, landmarks, moveTo, say],
  )

  const stepLandmark = useCallback((dir: number) => gotoLandmark(landmarkIdx + dir), [gotoLandmark, landmarkIdx])

  // ---- Time Machine ---------------------------------------------------------------------
  const timeReady = !!(dataset?.timeMachine && frames[dataset.timeMachine.then] && frames[dataset.timeMachine.now])

  const runTime = useCallback(async () => {
    const ds = live.current.dataset
    if (!ds?.timeMachine) {
      void say(NO_TIME_MACHINE)
      return
    }
    const then = live.current.frames[ds.timeMachine.then]
    const now = live.current.frames[ds.timeMachine.now]
    if (!then || !now) {
      setStatus({ busy: true, error: false, message: 'Still fetching the earlier frame from NASA…' })
      return
    }
    const run = ++tmRun.current
    live.current.mode = 'time'
    live.current.t = 0
    setModeState('time')
    setTime({ t: 0, running: true, summary: null, values: null })
    sound(live.current.cursor.x, live.current.cursor.y, false)
    applyAmbience(0.6)
    await say(TIME_MACHINE_INTRO[ds.id] ?? 'Time Machine.')
    if (run !== tmRun.current) return
    live.current.userMoved = false
    const t0 = performance.now()
    await new Promise<void>((resolve) => {
      const step = () => {
        if (run !== tmRun.current) return resolve()
        const u = Math.min(1, (performance.now() - t0) / (TM_SECONDS * 1000))
        live.current.t = u
        if (!live.current.userMoved) {
          const p = sweepPoint(ds, u)
          moveTo(p.x, p.y, true, true)
        } else sound(live.current.cursor.x, live.current.cursor.y, false)
        applyAmbience(0.12)
        setTime((s) => ({ ...s, t: u }))
        if (u < 1) requestAnimationFrame(step)
        else resolve()
      }
      requestAnimationFrame(step)
    })
    if (run !== tmRun.current) return
    const s = summarize(ds, then, now)
    setTime({ t: 1, running: false, summary: s.text, values: s.values })
    void say(s.text)
  }, [applyAmbience, moveTo, say, sound])

  const scrubTime = useCallback(
    (t: number) => {
      const ds = live.current.dataset
      if (!ds?.timeMachine || !timeReady) return
      tmRun.current++
      live.current.mode = 'time'
      live.current.t = t
      setModeState('time')
      setTime((s) => ({ ...s, t, running: false }))
      sound(live.current.cursor.x, live.current.cursor.y, false)
      applyAmbience(0.25)
      const then = live.current.frames[ds.timeMachine.then]
      const now = live.current.frames[ds.timeMachine.now]
      if (then && now && !time.values) {
        const s = summarize(ds, then, now)
        setTime((p) => ({ ...p, values: s.values }))
      }
    },
    [applyAmbience, sound, time.values, timeReady],
  )

  const toggleTime = useCallback(() => {
    if (live.current.mode === 'time') setMode('explore')
    else void runTime()
  }, [runTime, setMode])

  const toggleBlind = useCallback(() => {
    if (live.current.mode === 'blind') setMode('explore')
    else {
      setMode('blind')
      void say(BLINDFOLD)
    }
  }, [say, setMode])

  // ---- transport -------------------------------------------------------------------------
  const togglePause = useCallback(async () => {
    const p = !live.current.paused
    live.current.paused = p
    setPaused(p)
    if (p) engine.stop()
    else {
      await engine.start()
      sound(live.current.cursor.x, live.current.cursor.y, false)
      applyAmbience(1)
    }
  }, [applyAmbience, engine, sound])

  const toggleMute = useCallback(() => {
    const m = !engine.isMuted
    engine.setMuted(m)
    setMuted(m)
  }, [engine])

  const openLegend = useCallback(async () => {
    setOverlay('legend')
    await engine.legend(setLegendStep)
    setLegendStep(-1)
    sound(live.current.cursor.x, live.current.cursor.y, false)
  }, [engine, sound])

  const closeOverlay = useCallback(() => {
    if (overlay === 'legend') {
      engine.cancelLegend()
      setLegendStep(-1)
      sound(live.current.cursor.x, live.current.cursor.y, false)
    }
    setOverlay(null)
  }, [engine, overlay, sound])

  // ---- keyboard ----------------------------------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
        if (e.key === 'Escape') (el as HTMLElement).blur()
        return
      }
      const onControl = tag === 'BUTTON' || tag === 'A' || el?.getAttribute('role') === 'option'
      if (onControl && (e.key === 'Enter' || e.key === ' ')) return
      const k = e.key
      if (phase === 'gate') return

      if (k === '?') {
        e.preventDefault()
        setOverlay((o) => (o === 'help' ? null : 'help'))
        return
      }
      if (k === 'Escape') {
        e.preventDefault()
        if (overlay) closeOverlay()
        else if (phase === 'listen' && live.current.mode !== 'explore') setMode('explore')
        else if (phase === 'listen') backToSelect()
        else narrator.stop()
        return
      }
      if (k === 'r' || k === 'R') {
        e.preventDefault()
        void narrator.repeat()
        return
      }
      if (k === 'm' || k === 'M') {
        e.preventDefault()
        toggleMute()
        return
      }
      if (/^[1-9]$/.test(k)) {
        e.preventDefault()
        openByNumber(Number(k))
        return
      }
      if (phase !== 'listen' || overlay === 'help' || overlay === 'how') return

      const step = e.shiftKey ? 1 / 12 : 1 / 48
      const c = live.current.cursor
      switch (k) {
        case 'ArrowLeft':
          e.preventDefault()
          moveTo(c.x - step, c.y)
          break
        case 'ArrowRight':
          e.preventDefault()
          moveTo(c.x + step, c.y)
          break
        case 'ArrowUp':
          e.preventDefault()
          moveTo(c.x, c.y - step)
          break
        case 'ArrowDown':
          e.preventDefault()
          moveTo(c.x, c.y + step)
          break
        case 'h':
        case 'H':
          e.preventDefault()
          stepLandmark(e.shiftKey ? -1 : 1)
          break
        case 'Enter':
          e.preventDefault()
          describeHere()
          break
        case ' ':
          e.preventDefault()
          void togglePause()
          break
        case 't':
        case 'T':
          e.preventDefault()
          toggleTime()
          break
        case 'b':
        case 'B':
          e.preventDefault()
          toggleBlind()
          break
        case 'v':
        case 'V':
          if (live.current.mode === 'blind') {
            e.preventDefault()
            setRevealed((r) => !r)
          }
          break
        case 'l':
        case 'L':
          e.preventDefault()
          if (overlay === 'legend') closeOverlay()
          else void openLegend()
          break
        case 'n':
        case 'N':
          e.preventDefault()
          stepEvent(1)
          break
        case 'p':
        case 'P':
          e.preventDefault()
          stepEvent(-1)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    backToSelect,
    closeOverlay,
    describeHere,
    moveTo,
    narrator,
    openByNumber,
    openLegend,
    overlay,
    phase,
    setMode,
    stepEvent,
    stepLandmark,
    toggleBlind,
    toggleMute,
    togglePause,
    toggleTime,
  ])

  return {
    engine,
    narrator,
    phase,
    srMode,
    setSrMode,
    enter,
    catalog,
    catalogError,
    dataset,
    openDataset,
    openByNumber,
    backToSelect,
    events,
    eventId,
    selectEvent,
    frames,
    mainFrame,
    status,
    cursor,
    moveTo,
    readout,
    landmarks,
    landmarkIdx,
    gotoLandmark,
    describeHere,
    describeAt,
    mode,
    setMode,
    revealed,
    setRevealed,
    time,
    timeReady,
    runTime,
    scrubTime,
    toggleTime,
    toggleBlind,
    paused,
    togglePause,
    muted,
    toggleMute,
    overlay,
    setOverlay,
    openLegend,
    closeOverlay,
    legendStep,
    speech,
    transcript,
    say,
  }
}

export type Jukebox = ReturnType<typeof useJukebox>
