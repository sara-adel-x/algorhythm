import type { Mode } from '../scene/types'

interface Props {
  mode: Mode
  hasTimeMachine: boolean
  onMode: (m: Mode) => void
  onLegend: () => void
  legendOn: boolean
}

const MODES: { id: Mode; label: string; key: string }[] = [
  { id: 'explore', label: 'Explore', key: 'E' },
  { id: 'journey', label: 'Journey', key: 'Space' },
  { id: 'time', label: 'Time machine', key: 'T' },
  { id: 'blind', label: 'Blindfold', key: 'B' },
]

export function ModeBar({ mode, hasTimeMachine, onMode, onLegend, legendOn }: Props) {
  return (
    <div className="modes" role="group" aria-label="Listening modes">
      {MODES.map((m) => {
        const disabled = m.id === 'time' && !hasTimeMachine
        return (
          <button
            key={m.id}
            className={`mode${mode === m.id ? ' mode-on' : ''}`}
            onClick={() => onMode(m.id)}
            disabled={disabled}
            aria-pressed={mode === m.id}
            title={disabled ? 'This scene has no second frame to travel between' : `${m.label} (${m.key})`}
          >
            <span className="mode-dot" aria-hidden="true" />
            {m.label}
          </button>
        )
      })}
      <span className="modes-rule" aria-hidden="true" />
      <button
        className={`mode mode-ghost${legendOn ? ' mode-on' : ''}`}
        onClick={onLegend}
        aria-pressed={legendOn}
        title="Sound legend (L)"
      >
        Sound legend
      </button>
    </div>
  )
}
