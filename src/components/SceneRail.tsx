import { SCENE_IDS } from '../scene/registry'
import type { Scene } from '../scene/types'

const TITLES: Record<string, { name: string; note: string }> = {
  m74: { name: 'M74', note: 'Galaxy' },
  pillars: { name: 'Pillars', note: 'Nebula' },
  irma: { name: 'Irma', note: 'Hurricane' },
  night: { name: 'At night', note: 'Earth' },
  amazon: { name: 'Mato Grosso', note: 'Forest' },
}

interface Props {
  current: Scene | null
  onPick: (id: string) => void
}

export function SceneRail({ current, onPick }: Props) {
  return (
    <nav className="rail" aria-label="Collection">
      <p className="rail-label">Collection</p>
      <ol className="rail-list">
        {SCENE_IDS.map((id, i) => {
          const meta = TITLES[id] ?? { name: id, note: '' }
          const active = current?.id === id
          return (
            <li key={id}>
              <button
                className={`rail-item${active ? ' rail-item-on' : ''}`}
                onClick={() => onPick(id)}
                aria-current={active ? 'true' : undefined}
              >
                <span className="rail-thumb">
                  <img src={`/scenes/${id}/image.webp`} alt="" loading="lazy" />
                </span>
                <span className="rail-text">
                  <span className="rail-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="rail-name">{meta.name}</span>
                  <span className="rail-note">{meta.note}</span>
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
