import { useEffect, useRef, useState } from 'react'
import type { Catalog, Dataset } from '../nasa/types'

interface Props {
  catalog: Catalog | null
  error: string | null
  onOpen: (ds: Dataset) => void
}

const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
}
const fmtMonth = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : ''

/** What is actually in this dataset right now, from the live catalog. */
function provenance(ds: Dataset): { when: string; what: string } {
  const frames = Object.values(ds.frames)
  const what = Array.from(new Set(frames.map((f) => f.instrument))).join(' · ')
  if (ds.kind === 'event') {
    const e = ds.events
    const when = e
      ? `${e.total.toLocaleString('en-US')} ${e.scope === 'open' ? 'open' : ''} event${e.total === 1 ? '' : 's'}${
          e.scope !== 'open' ? `, ${e.scope}` : ''
        }${e.latest ? ` · latest ${fmtDate(e.latest)}` : ''}`
      : 'Live from NASA EONET'
    return { when, what: `NASA EONET · ${what}` }
  }
  if (ds.timeMachine) {
    const a = ds.frames[ds.timeMachine.then]?.date
    const b = ds.frames[ds.timeMachine.now]?.date
    const f = ds.id === 'air-temp' ? fmtMonth : fmtDate
    return { when: `${f(a)} → ${f(b)}`, what }
  }
  return { when: fmtDate(ds.frames[ds.defaultFrame]?.date), what }
}

const ICONS: Record<string, string> = {
  'sea-ice': 'M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9 4.5l3 2 3-2M9 19.5l3-2 3 2',
  'air-temp': 'M10 13.5V5a2 2 0 1 1 4 0v8.5a4 4 0 1 1-4 0zM12 9v7',
  sst: 'M3 9c2 0 2-1.5 4.5-1.5S9.5 9 12 9s2-1.5 4.5-1.5S18.5 9 21 9M3 14c2 0 2-1.5 4.5-1.5S9.5 14 12 14s2-1.5 4.5-1.5S18.5 14 21 14',
  precip: 'M7 15a4 4 0 0 1 .5-8 5.5 5.5 0 0 1 10.5 2 3.5 3.5 0 0 1-1 6.9M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5',
  storms: 'M12 12m-2 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M12 4a8 8 0 0 1 7.5 5.2M12 20a8 8 0 0 1-7.5-5.2M4.5 9.2A8 8 0 0 1 9 4.6M19.5 14.8A8 8 0 0 1 15 19.4',
  wildfires: 'M12 21c-3.5 0-6-2.4-6-5.6 0-3.4 3-5.2 3.4-8.9 2 1.3 3.3 3.3 3.3 5.4 1-.6 1.6-1.6 1.8-2.8 1.6 1.6 3.5 3.7 3.5 6.3 0 3.2-2.5 5.6-6 5.6z',
  volcanoes: 'M3 20l6-9h6l6 9zM9.5 11l1-3h3l1 3M11 5l-1-2M13 5l1-2M12 5V2.5',
}

export function DatasetSelector({ catalog, error, onOpen }: Props) {
  const [active, setActive] = useState(0)
  const items = useRef<(HTMLLIElement | null)[]>([])
  const datasets = catalog?.datasets ?? []

  useEffect(() => {
    if (datasets.length) items.current[0]?.focus()
  }, [datasets.length])

  const focus = (i: number) => {
    const n = datasets.length
    const k = ((i % n) + n) % n
    setActive(k)
    items.current[k]?.focus()
  }

  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      focus(i + 1)
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      focus(i - 1)
    } else if (e.key === 'Home') {
      e.preventDefault()
      focus(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      focus(datasets.length - 1)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(datasets[i])
    }
  }

  return (
    <section className="select" aria-labelledby="select-title">
      <header className="select-head">
        <p className="kicker">NASA Earth Information Center · live data</p>
        <h1 id="select-title">Choose what to listen to</h1>
        <p className="select-lede">
          Seven views of our changing planet, fetched from NASA right now. Use the arrow keys or a number, then Enter.
        </p>
      </header>

      {error && (
        <p className="notice error" role="alert">
          NASA’s catalog could not be reached: {error}. Check your connection and reload.
        </p>
      )}
      {!catalog && !error && (
        <p className="notice" role="status">
          <span className="spinner" aria-hidden="true" /> Asking NASA which frames are newest…
        </p>
      )}

      {catalog && (
        <ul className="datasets" role="listbox" aria-labelledby="select-title" aria-orientation="vertical">
          {datasets.map((ds, i) => {
            const p = provenance(ds)
            return (
              <li
                key={ds.id}
                ref={(el) => {
                  items.current[i] = el
                }}
                role="option"
                aria-selected={i === active}
                tabIndex={i === active ? 0 : -1}
                className={`dataset theme-${ds.id}${ds.status.ok ? '' : ' unavailable'}`}
                onClick={() => onOpen(ds)}
                onFocus={() => setActive(i)}
                onKeyDown={(e) => onKey(e, i)}
                aria-describedby={`ds-${ds.id}-p`}
              >
                <span className="ds-num" aria-hidden="true">
                  {ds.number}
                </span>
                <svg className="ds-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d={ICONS[ds.id] ?? ICONS.sst} />
                </svg>
                <span className="ds-body">
                  <span className="ds-theme">{ds.theme}</span>
                  <span className="ds-title">{ds.title}</span>
                  <span className="ds-sub">{ds.subtitle}</span>
                  <span id={`ds-${ds.id}-p`} className="ds-prov">
                    <span className="ds-when">{p.when}</span>
                    <span className="ds-what">{p.what}</span>
                    {!ds.status.ok && <span className="ds-warn">{ds.status.message}</span>}
                  </span>
                </span>
                <span className="ds-tags" aria-hidden="true">
                  {ds.timeMachine && <span className="tag tag-time">Time Machine</span>}
                  {ds.kind === 'event' && <span className="tag tag-live">Live events</span>}
                  {ds.eventOverlay && <span className="tag tag-live">+ storms</span>}
                </span>
              </li>
            )
          })}
        </ul>
      )}

      <aside className="select-foot">
        <p>
          Imagery from NASA GIBS, events from NASA EONET, context from NASA’s Scientific Visualization Studio and Image Library — all
          requested through this site’s own <code>/api/nasa</code> proxy and analysed in your browser.
        </p>
      </aside>
    </section>
  )
}
