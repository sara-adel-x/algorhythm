import { useEffect, useState } from 'react'
import { VOICE_LABELS } from './audio/engine'
import { HelpDialog, HowItSounds } from './components/Overlays'
import { ModeBar } from './components/ModeBar'
import { SceneRail } from './components/SceneRail'
import { SceneStage } from './components/SceneStage'
import { StartGate } from './components/StartGate'
import { Visualizer } from './components/Visualizer'
import { sceneNumber } from './scene/registry'
import { useExperience } from './scene/useExperience'
import './styles/experience.css'

const VOICES = ['warm', 'hollow', 'glass', 'shimmer']

export default function App() {
  const e = useExperience()
  const [showHelp, setShowHelp] = useState(false)
  const [showHow, setShowHow] = useState(false)
  const [showTranscript, setShowTranscript] = useState(false)

  useEffect(() => {
    if (!e.home) document.querySelector<HTMLElement>('.stage')?.focus()
  }, [e.home])

  useEffect(() => {
    if (e.home) return
    const key = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey || showHelp || showHow || e.loading) return
      // Buttons keep native Enter/Space, sliders keep arrows, links keep activation.
      const target = event.target as HTMLElement
      if (target.closest('button, a, input, select, textarea, [contenteditable="true"]')) return
      if (event.repeat && !event.key.startsWith('Arrow')) return
      const xStep = (event.shiftKey ? 4 : 1) / (e.scene?.grid.cols || 16)
      const yStep = (event.shiftKey ? 4 : 1) / (e.scene?.grid.rows || 12)
      const c = e.cursor
      switch (event.key.toLowerCase()) {
        case 'arrowleft': event.preventDefault(); e.manualMove(c.x - xStep, c.y); break
        case 'arrowright': event.preventDefault(); e.manualMove(c.x + xStep, c.y); break
        case 'arrowup': event.preventDefault(); e.manualMove(c.x, c.y - yStep); break
        case 'arrowdown': event.preventDefault(); e.manualMove(c.x, c.y + yStep); break
        case 'h': {
          event.preventDefault()
          const list = e.scene?.hotspots || []
          if (!list.length) break
          const index = e.activeHotspot ? list.findIndex((h) => h.id === e.activeHotspot?.id) : -1
          e.jump(list[event.shiftKey ? (index <= 0 ? list.length - 1 : index - 1) : (index + 1) % list.length])
          break
        }
        case ' ': event.preventDefault(); if (e.journey.running) e.pauseJourney(); else void e.runJourney(e.journey.paused ? Math.max(0, e.journey.index) : 0, e.journey.paused); break
        case 'n': e.nextScene(1); break
        case 'p': e.nextScene(-1); break
        case 't': void e.runTime(); break
        case 'b': e.selectMode(e.mode === 'blind' ? 'explore' : 'blind'); break
        case 'l': void e.runLegend(); break
        case 'r': if (e.mode === 'blind' && !e.revealed) e.reveal(); else e.repeat(); break
        case 'm': e.toggleMute(); break
        case '?': event.preventDefault(); setShowHelp(true); break
        case 'escape': e.stopEverything(); break
        case 'enter': event.preventDefault(); e.describe(); break
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [e, showHelp, showHow])

  if (e.home) return <StartGate onBegin={(id, guided) => void e.enter(id, guided)} busy={e.loading} error={e.error} screenReaderMode={e.screenReaderMode} onScreenReaderMode={e.toggleScreenReader} />

  const { scene, readout } = e
  const stageScene = e.mode === 'time' && e.timeFrames ? { ...e.timeFrames[0], title: scene?.title || e.timeFrames[0].title, hotspots: [] } : scene
  const stopName = scene && e.journey.index >= 0 ? scene.hotspots.find((h) => h.id === scene.journey[e.journey.index])?.name : ''
  const toggleJourney = () => { if (e.journey.running) e.pauseJourney(); else void e.runJourney(e.journey.paused ? Math.max(0, e.journey.index) : 0, e.journey.paused) }

  return (
    <div className={`app mode-${e.mode}`}>
      <a className="skip" href="#panel">Skip to the description</a>
      <header className="topbar">
        <button className="brand brand-home" onClick={e.goHome} aria-label="AlgoRythm — return to introduction"><span className="brand-mark" aria-hidden="true" /><span className="brand-name">Algo<span>Rythm</span></span></button>
        <p className="topbar-mid">NASA Space Apps 2026 <span aria-hidden="true">·</span> The Earth Information Jukebox</p>
        <div className="topbar-actions">
          <button className="link" onClick={() => setShowHow(true)}>How it sounds</button>
          <button className={`link${e.screenReaderMode ? ' link-on' : ''}`} onClick={e.toggleScreenReader} aria-pressed={e.screenReaderMode} title="Disable app narration so it does not talk over your screen reader">Screen reader mode</button>
          <button className="link" onClick={() => setShowHelp(true)}>Keys</button>
        </div>
      </header>
      <main className="layout" aria-busy={e.loading}>
        <section className="left" aria-label="Listening experience">
          {stageScene && <SceneStage scene={stageScene} morphScene={e.mode === 'time' ? e.timeFrames?.[1] ?? null : null} morph={e.morph} blind={e.mode === 'blind'} revealed={e.revealed} cursor={e.cursor} activeHotspot={e.activeHotspot} onMove={e.manualMove} onReveal={e.reveal} onKeyDown={() => {}} />}
          {e.loading && <p className="experience-notice" role="status">Preparing the next scene…</p>}
          {e.error && <p className="experience-notice entry-error" role="alert">{e.error}</p>}
          <ModeBar mode={e.mode} hasTimeMachine={!!scene?.timeMachine} onMode={e.selectMode} onLegend={() => void e.runLegend()} legendOn={e.legendStep !== null} />
          <div className="transport">
            <div className="transport-left">
              <button className="btn btn-solid" onClick={toggleJourney} disabled={e.loading}>{e.journey.running ? 'Pause journey' : e.journey.paused ? 'Resume journey' : 'Start the journey'}</button>
              {(e.journey.running || e.journey.paused) && <span className="journey-state"><span className="journey-bar"><i style={{ width: `${Math.max(0, e.journey.index + 1) / (scene?.journey.length || 1) * 100}%` }} /></span><span className="journey-label">{e.journey.index < 0 ? 'Opening the story…' : `Stop ${e.journey.index + 1} of ${scene?.journey.length} · ${stopName}`}</span></span>}
              <button className="btn" onClick={e.describe} disabled={e.loading}>{e.activeHotspot ? `Describe: ${e.activeHotspot.name}` : 'Describe this point'}</button>
              {e.speaking && <button className="btn btn-quiet" onClick={e.repeat}>Repeat narration</button>}
            </div>
            <div className="transport-right">
              <button className="btn btn-quiet" onClick={() => void e.toggleMusic()} aria-label={e.playing ? 'Pause music' : 'Play music'}>{e.playing ? 'Pause music' : 'Play music'}</button>
              <button className={`btn btn-quiet${e.muted ? ' btn-on' : ''}`} onClick={e.toggleMute} aria-pressed={e.muted}>{e.muted ? 'Sound off' : 'Sound on'}</button>
              <Visualizer engine={e.engine} active={e.playing && !e.muted} />
            </div>
          </div>
          {e.mode === 'time' && scene?.timeMachine && <div className="timebar"><span className="timebar-label">{scene.timeMachine.labels[0]}</span><input type="range" min={0} max={1} step={.01} value={e.morph} aria-label="Time machine position" aria-valuetext={`${Math.round(e.morph * 100)} percent toward cleared fields`} onChange={(event) => e.scrubTime(Number(event.target.value))} /><span className="timebar-label">{scene.timeMachine.labels[1]}</span><p className="timebar-caption">Same coordinates in NASA's ASTER image pair. Earlier forest → later fields. Image-based comparison, not a numeric climate record.</p><button className="btn" onClick={() => void e.runTime()}>Replay change</button></div>}
          {e.legendStep !== null && <div className="legend" role="status"><p className="legend-title">Sound legend</p><p className="legend-body">{e.legendStep >= 0 ? <><strong>{VOICE_LABELS[VOICES[e.legendStep]]?.name}</strong> {VOICE_LABELS[VOICES[e.legendStep]]?.blurb}</> : 'Listen to each voice in turn…'}</p></div>}
        </section>
        <aside className="panel" id="panel" tabIndex={-1} aria-label="About this scene">
          {scene && <>
            <p className="panel-eyebrow"><span className="panel-num">{sceneNumber(scene.id)}</span>{scene.eyebrow}</p>
            <h1 className="panel-title">{scene.title}</h1><p className="panel-sub">{scene.subtitle}</p>
            <div className="readout"><div><span className="readout-k">Note</span><span className="readout-v">{readout?.note ?? '—'}</span></div><div><span className="readout-k">Pan</span><span className="readout-v">{readout ? readout.pan < -.1 ? 'left' : readout.pan > .1 ? 'right' : 'centre' : '—'}</span></div><div><span className="readout-k">Level</span><span className="readout-v">{readout ? `${Math.round(readout.gainDb)} dB` : '—'}</span></div><div><span className="readout-k">Tone</span><span className="readout-v">{readout ? `${readout.cutoff} Hz` : '—'}</span></div></div>
            <h2 className="panel-h2">Landmarks</h2><ol className="landmarks">{scene.hotspots.map((h) => <li key={h.id}><button className={`landmark${e.activeHotspot?.id === h.id ? ' landmark-on' : ''}`} onClick={() => e.jump(h)} disabled={e.loading}><span className="landmark-name">{h.name}</span><span className="landmark-tag">{h.sourced === 'nasa' ? 'NASA' : 'visible'}</span></button></li>)}</ol>
            <h2 className="panel-h2">Source</h2><p className="credit">{scene.source.agency}<br /><span className="credit-dim">{scene.source.id} · {scene.source.date}</span><br /><a href={scene.source.url} target="_blank" rel="noreferrer noopener">View on NASA</a></p><p className="facts">{scene.facts}</p>
            <p className="panel-guide">Your keys: arrows to explore · H for landmarks · Space for the journey. <button className="link" onClick={() => setShowHelp(true)}>All controls</button></p>
          </>}
        </aside>
      </main>
      <footer className={`foot${showTranscript ? ' foot-expanded' : ''}`}><p className="transcript" aria-live="polite" aria-atomic="true">{e.transcript || 'Move across the scene and listen to what changes.'}</p><button className="link transcript-toggle" aria-expanded={showTranscript} onClick={() => setShowTranscript((on) => !on)}>{showTranscript ? 'Collapse transcript' : 'Full transcript'}</button><p className="foot-keys" aria-hidden="true"><kbd>←↑↓→</kbd> move <kbd>H</kbd> landmark <kbd>Space</kbd> journey <kbd>B</kbd> blindfold <kbd>?</kbd> keys</p></footer>
      <div className="rail-wrap"><SceneRail current={scene} onPick={(id) => void e.openScene(id)} /></div>
      {showHelp && <HelpDialog onClose={() => setShowHelp(false)} />}
      {showHow && <HowItSounds scene={scene} onClose={() => { setShowHow(false); e.engine.cancelLegend() }} onPreviewVoice={(voice) => void e.runLegend(voice)} />}
    </div>
  )
}
