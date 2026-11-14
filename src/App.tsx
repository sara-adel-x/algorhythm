import { useEffect, useRef, useState } from 'react'
import { useJukebox, type Jukebox } from './app/useJukebox'
import { Gate } from './components/Gate'
import { DatasetSelector } from './components/DatasetSelector'
import { Stage } from './components/Stage'
import { ListenPanel } from './components/ListenPanel'
import { HelpDialog, HowDialog, LegendDialog } from './components/Dialogs'
import { Visualizer } from './components/Visualizer'
import { Wordmark } from './components/Wordmark'

function TopBar({ j }: { j: Jukebox }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <Wordmark compact />
        {j.phase === 'listen' && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={j.backToSelect}>
            ← Datasets <kbd>Esc</kbd>
          </button>
        )}
      </div>
      {j.phase === 'listen' && j.dataset && (
        <p className="topbar-title">
          <span className="topbar-num">{j.dataset.number}</span> {j.dataset.title}
          {j.mainFrame && <span className="topbar-date">{j.mainFrame.info.date}</span>}
        </p>
      )}
      <nav className="topbar-right" aria-label="Help and sound">
        {j.phase === 'listen' && (
          <>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void j.openLegend()}>
              Legend <kbd>L</kbd>
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => j.setOverlay('how')}>
              How it works
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void j.togglePause()} aria-pressed={j.paused}>
              {j.paused ? 'Resume' : 'Pause'} <kbd>Space</kbd>
            </button>
          </>
        )}
        <button type="button" className="btn btn-ghost btn-sm" onClick={j.toggleMute} aria-pressed={j.muted}>
          {j.muted ? 'Unmute' : 'Mute'} <kbd>M</kbd>
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => j.setOverlay('help')}>
          Keys <kbd>?</kbd>
        </button>
        <label className="switch switch-sm">
          <input type="checkbox" checked={j.srMode} onChange={(e) => j.setSrMode(e.target.checked)} />
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          <span>Screen reader</span>
        </label>
      </nav>
    </header>
  )
}

/** Visible captions plus the polite live region. */
function Captions({ j }: { j: Jukebox }) {
  const [open, setOpen] = useState(false)
  const last = j.transcript[j.transcript.length - 1]
  const listRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    if (open) listRef.current?.lastElementChild?.scrollIntoView({ block: 'end' })
  }, [open, j.transcript.length])
  return (
    <footer className="captions">
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {last && <p key={last.id}>{last.text}</p>}
      </div>
      <div className="caption-line" aria-hidden="true">
        <span className={`caption-badge${j.speech.speaking ? ' on' : ''}`}>
          {j.speech.speaking && !j.speech.voiced ? 'Text' : 'Narrator'}
        </span>
        <span className={`caption-text${j.speech.speaking ? '' : ' idle'}`}>{last?.text ?? 'Narration will appear here.'}</span>
      </div>
      <div className="caption-actions">
        <Visualizer engine={j.engine} active={j.phase === 'listen' && !j.paused} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => void j.narrator.repeat()} disabled={!last}>
          Repeat <kbd>R</kbd>
        </button>
        <button type="button" className="btn btn-ghost btn-sm" aria-expanded={open} aria-controls="transcript" onClick={() => setOpen(!open)}>
          Transcript
        </button>
      </div>
      {open && (
        <ol id="transcript" ref={listRef} className="transcript" aria-label="Narration transcript">
          {j.transcript.map((l) => (
            <li key={l.id}>
              <span className="tr-kind">{l.voiced ? 'voice' : 'text'}</span> {l.text}
            </li>
          ))}
        </ol>
      )}
    </footer>
  )
}

export default function App() {
  const j = useJukebox()
  const stageRef = useRef<HTMLDivElement>(null)

  // Land on the map when a dataset opens, so the arrow keys work immediately.
  useEffect(() => {
    window.scrollTo(0, 0)
    if (j.phase === 'listen') requestAnimationFrame(() => stageRef.current?.focus({ preventScroll: true }))
  }, [j.phase, j.dataset?.id])

  if (j.phase === 'gate') return <Gate srMode={j.srMode} onSrMode={j.setSrMode} onEnter={() => void j.enter()} />

  return (
    <div className={`shell phase-${j.phase} mode-${j.mode}`}>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <TopBar j={j} />
      <main id="main" className="main">
        {j.phase === 'select' && <DatasetSelector catalog={j.catalog} error={j.catalogError} onOpen={(ds) => void j.openDataset(ds)} />}
        {j.phase === 'listen' && j.dataset && (
          <div className="listen">
            <div className="listen-stage">
              <Stage ref={stageRef} j={j} />
              <p className="stage-hint" aria-hidden="true">
                Move with the mouse, a finger, or the arrow keys · <kbd>H</kbd> places · <kbd>Enter</kbd> describe
              </p>
            </div>
            <ListenPanel j={j} />
          </div>
        )}
      </main>
      <Captions j={j} />
      {j.overlay === 'help' && <HelpDialog j={j} />}
      {j.overlay === 'legend' && <LegendDialog j={j} />}
      {j.overlay === 'how' && <HowDialog j={j} />}
    </div>
  )
}
