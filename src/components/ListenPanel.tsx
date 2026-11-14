import { useEffect, useState } from 'react'
import type { Jukebox } from '../app/useJukebox'
import { placeText, valueText } from '../app/model'
import { VOICE_LABELS, VOICE_NAMES } from '../audio/mapping'
import { nasa } from '../nasa/api'
import type { LibraryItem, SvsItem } from '../nasa/types'

const fmtDate = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : '—'

const pct = (v: number) => `${Math.round(v * 100)} %`

function Section({ title, children, id }: { title: string; children: React.ReactNode; id: string }) {
  return (
    <section className="panel-sec" aria-labelledby={id}>
      <h2 id={id} className="panel-h">
        {title}
      </h2>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------

function Readout({ j }: { j: Jukebox }) {
  const ds = j.dataset
  const f = j.mainFrame
  const r = j.readout
  if (!ds || !f || !r) return <p className="muted">Waiting for the first NASA frame…</p>
  const place = placeText(f.info, j.cursor.x, j.cursor.y)
  const v = valueText(ds, r.sample)
  const s = r.sound
  const panText = Math.abs(s.pan) < 0.06 ? 'centre' : `${Math.round(Math.abs(s.pan) * 100)} % ${s.pan < 0 ? 'left' : 'right'}`
  return (
    <div className="readout">
      <div className="readout-main">
        <span className="readout-value">{v.short}</span>
        <span className="readout-place">{place.short}</span>
      </div>
      <dl className="readout-grid">
        <div>
          <dt>Pitch · y</dt>
          <dd>{s.note || '—'}</dd>
        </div>
        <div>
          <dt>Pan · x</dt>
          <dd>{panText}</dd>
        </div>
        <div>
          <dt>Intensity L</dt>
          <dd>{r.sample.l.toFixed(2)}</dd>
        </div>
        <div>
          <dt>Cutoff 180·18^L</dt>
          <dd>{Math.round(s.cutoff).toLocaleString('en-US')} Hz</dd>
        </div>
        <div>
          <dt>Gain</dt>
          <dd>{Number.isFinite(s.gainDb) ? `${s.gainDb.toFixed(1)} dB` : '−∞'}</dd>
        </div>
        <div>
          <dt>Sobel edge</dt>
          <dd>{r.sample.edge.toFixed(2)}</dd>
        </div>
      </dl>
      <div className="voices" aria-label="Timbre mix from the hue spectrum">
        {VOICE_NAMES.map((name, k) => (
          <div key={name} className={`voice voice-${name}`}>
            <span className="voice-name">{VOICE_LABELS[name].name}</span>
            <span className="voice-bar">
              <span style={{ width: `${Math.round(s.weights[k] * 1000) / 10}%` }} />
            </span>
            <span className="voice-val">{Math.round(s.weights[k] * 100)}</span>
          </div>
        ))}
      </div>
      <button type="button" className="btn btn-ghost btn-sm" onClick={j.describeHere}>
        Describe this point <kbd>Enter</kbd>
      </button>
    </div>
  )
}

function FrameStats({ j }: { j: Jukebox }) {
  const f = j.mainFrame
  if (!f) return null
  const st = f.analysis.stats
  const g = f.analysis.grid
  return (
    <dl className="stats">
      <div>
        <dt>Pixels analysed</dt>
        <dd>{(f.analysis.width * f.analysis.height).toLocaleString('en-US')}</dd>
      </div>
      <div>
        <dt>Analysis time</dt>
        <dd>{st.ms} ms</dd>
      </div>
      <div>
        <dt>Feature grid</dt>
        <dd>
          {g.cols} × {g.rows}
        </dd>
      </div>
      <div>
        <dt>Data coverage</dt>
        <dd>{pct(st.coverage)}</dd>
      </div>
      <div>
        <dt>Mean intensity</dt>
        <dd>{st.meanL.toFixed(3)}</dd>
      </div>
      <div>
        <dt>Edge density</dt>
        <dd>{st.edgeDensity.toFixed(3)}</dd>
      </div>
      {f.info.colormap && (
        <div>
          <dt>Decoded via colormap</dt>
          <dd>
            {st.decoded.toLocaleString('en-US')} px{st.unmatched ? ` · ${st.unmatched} unmatched` : ''}
          </dd>
        </div>
      )}
      {st.extent !== null && (
        <div>
          <dt>Ice extent ≥ 15 %</dt>
          <dd>{st.extent.toFixed(2)} M km²</dd>
        </div>
      )}
      {st.firePixels > 0 && (
        <div>
          <dt>Fire-detection pixels</dt>
          <dd>{st.firePixels.toLocaleString('en-US')}</dd>
        </div>
      )}
      <div className="stats-spectrum">
        <dt>Hue spectrum</dt>
        <dd>
          <span className="spectrum" aria-label={VOICE_NAMES.map((n, k) => `${VOICE_LABELS[n].name} ${pct(st.spectrum[k])}`).join(', ')}>
            {VOICE_NAMES.map((n, k) => (
              <span key={n} className={`spec spec-${n}`} style={{ flexGrow: Math.max(0.001, st.spectrum[k]) }} />
            ))}
          </span>
        </dd>
      </div>
    </dl>
  )
}

// ---------------------------------------------------------------------------

function TimePanel({ j }: { j: Jukebox }) {
  const ds = j.dataset
  const tm = ds?.timeMachine
  if (!ds || !tm) return null
  const then = ds.frames[tm.then]
  const now = ds.frames[tm.now]
  const month = ds.id === 'air-temp'
  const label = (iso: string | null) =>
    iso ? (month ? new Date(iso).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }) : fmtDate(iso)) : '—'
  const v = j.time.values
  const t = j.mode === 'time' ? j.time.t : 1
  const yearThen = then?.date ? Number(then.date.slice(0, 4)) : 0
  const yearNow = now?.date ? Number(now.date.slice(0, 4)) : 0
  return (
    <Section title="Time Machine" id="sec-time">
      <p className="muted small">
        {then?.instrument} {label(then?.date ?? null)} → {now?.instrument} {label(now?.date ?? null)}
      </p>
      <div className="time-controls">
        <button type="button" className="btn btn-primary" onClick={() => void j.runTime()} disabled={!j.timeReady || j.time.running}>
          {j.time.running ? 'Morphing…' : j.timeReady ? 'Play 8-second morph' : 'Fetching earlier frame…'} <kbd>T</kbd>
        </button>
        {j.mode === 'time' && (
          <button type="button" className="btn btn-ghost" onClick={() => j.setMode('explore')}>
            Back to {yearNow}
          </button>
        )}
      </div>
      <label className="scrub">
        <span className="scrub-ends">
          <span>{label(then?.date ?? null)}</span>
          <span>{label(now?.date ?? null)}</span>
        </span>
        <input
          type="range"
          min={0}
          max={1000}
          value={Math.round(t * 1000)}
          disabled={!j.timeReady}
          onChange={(e) => j.scrubTime(Number(e.target.value) / 1000)}
          aria-label="Time Machine position"
          aria-valuetext={`${Math.round(yearThen + (yearNow - yearThen) * t)}, ${Math.round(t * 100)} percent of the way from ${label(
            then?.date ?? null,
          )} to ${label(now?.date ?? null)}`}
        />
      </label>
      {v && (
        <div className="time-values">
          <p className="tv-label">{v.label}</p>
          <div className="tv-row">
            <span className="tv-then">
              <b>{v.then.toFixed(v.unit === '°C' ? 1 : 2)}</b> {v.unit}
              <small>{label(v.thenDate)}</small>
            </span>
            <span className="tv-arrow" aria-hidden="true">
              →
            </span>
            <span className="tv-now">
              <b>{v.now.toFixed(v.unit === '°C' ? 1 : 2)}</b> {v.unit}
              <small>{label(v.nowDate)}</small>
            </span>
          </div>
          <p className="tv-delta">
            {v.unit === '°C'
              ? `${v.now - v.then >= 0 ? '+' : '−'}${Math.abs(v.now - v.then).toFixed(1)} °C`
              : `${Math.round(((v.now - v.then) / v.then) * 100)} % change in extent`}
          </p>
        </div>
      )}
      {j.time.summary && <p className="time-summary">{j.time.summary}</p>}
    </Section>
  )
}

// ---------------------------------------------------------------------------

function EventsPanel({ j }: { j: Jukebox }) {
  const ds = j.dataset
  const list = j.events
  if (!ds || !list || ds.kind !== 'event') return null
  const current = j.mainFrame?.info.event ?? list.events.find((e) => e.id === j.eventId) ?? null
  return (
    <Section title={`${ds.theme} · NASA EONET`} id="sec-events">
      <p className="muted small">
        {list.total.toLocaleString('en-US')} {list.scope} · fetched {new Date(list.fetchedAt).toLocaleTimeString('en-GB')}
      </p>
      <label className="field">
        <span className="field-label">Event</span>
        <select value={j.eventId ?? ''} onChange={(e) => j.selectEvent(e.target.value)}>
          {list.events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.title} — {fmtDate(e.date)}
            </option>
          ))}
        </select>
      </label>
      <div className="event-step">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => j.selectEvent(prevId(list.events, j.eventId))}>
          ← Previous <kbd>P</kbd>
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => j.selectEvent(nextId(list.events, j.eventId))}>
          Next <kbd>N</kbd> →
        </button>
      </div>
      {current && (
        <div className="event-card">
          <p className="event-title">{current.title}</p>
          <dl className="event-meta">
            <div>
              <dt>Date</dt>
              <dd>{fmtDate(current.date)}</dd>
            </div>
            <div>
              <dt>Position</dt>
              <dd>
                {current.lat.toFixed(2)}°, {current.lon.toFixed(2)}°
              </dd>
            </div>
            {current.magnitudeValue !== null && (
              <div>
                <dt>Magnitude</dt>
                <dd>
                  {current.magnitudeValue.toLocaleString('en-US')} {current.magnitudeUnit}
                </dd>
              </div>
            )}
            <div>
              <dt>Status</dt>
              <dd>{current.closed ? `closed ${fmtDate(current.closed)}` : 'open'}</dd>
            </div>
            {current.track.length > 1 && (
              <div>
                <dt>Track points</dt>
                <dd>{current.track.length}</dd>
              </div>
            )}
          </dl>
          <p className="event-links">
            <a href={current.link} target="_blank" rel="noreferrer">
              EONET record
            </a>
            {current.sources.map((s) => (
              <a key={s.id + s.url} href={s.url} target="_blank" rel="noreferrer">
                {s.id}
              </a>
            ))}
          </p>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void j.say(current.narration)}>
            Hear this event
          </button>
        </div>
      )}
    </Section>
  )
}

const nextId = (list: { id: string }[], id: string | null) => {
  const i = list.findIndex((e) => e.id === id)
  return list[(i + 1) % list.length].id
}
const prevId = (list: { id: string }[], id: string | null) => {
  const i = list.findIndex((e) => e.id === id)
  return list[(i - 1 + list.length) % list.length].id
}

// ---------------------------------------------------------------------------

function Landmarks({ j }: { j: Jukebox }) {
  if (!j.landmarks.length) return null
  const shown = j.landmarks.filter((l) => l.kind !== 'track').length
  return (
    <Section title={`Places & events · ${shown}`} id="sec-marks">
      <p className="muted small">
        <kbd>H</kbd> next · <kbd>Shift</kbd>+<kbd>H</kbd> previous
      </p>
      <ul className="marks">
        {j.landmarks.map((l, i) =>
          l.kind === 'track' ? null : (
            <li key={l.id}>
              <button
                type="button"
                className={`mark-btn mark-btn-${l.kind}${i === j.landmarkIdx ? ' is-current' : ''}`}
                onClick={() => j.gotoLandmark(i)}
                aria-current={i === j.landmarkIdx ? 'true' : undefined}
              >
                <span className="mark-dot" aria-hidden="true" />
                {l.name}
              </button>
            </li>
          ),
        )}
      </ul>
    </Section>
  )
}

// ---------------------------------------------------------------------------

function Sources({ j }: { j: Jukebox }) {
  const ds = j.dataset
  const f = j.mainFrame
  const [svs, setSvs] = useState<SvsItem | null>(null)
  const [lib, setLib] = useState<LibraryItem[]>([])
  const [libSource, setLibSource] = useState('')

  useEffect(() => {
    setSvs(null)
    setLib([])
    if (!ds) return
    let alive = true
    if (ds.svs)
      nasa
        .svs(ds.svs)
        .then((s) => alive && setSvs(s))
        .catch(() => {})
    if (ds.library)
      nasa
        .library(ds.library)
        .then((r) => {
          if (!alive) return
          setLib(r.items.slice(0, 3))
          setLibSource(r.source)
        })
        .catch(() => {})
    return () => {
      alive = false
    }
  }, [ds])

  if (!ds) return null
  return (
    <>
      <Section title="Data on screen" id="sec-data">
        {f ? (
          <dl className="source-list">
            <div>
              <dt>Layer</dt>
              <dd>{f.info.title}</dd>
            </div>
            <div>
              <dt>Instrument</dt>
              <dd>{f.info.instrument}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{f.info.date}</dd>
            </div>
            <div>
              <dt>Projection</dt>
              <dd>
                {f.info.crs}
                {f.info.source ? ` (reprojected from ${f.info.source.crs})` : ''}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="muted">Loading…</p>
        )}
        {f && (
          <p className="links">
            <a href={f.info.upstream.data} target="_blank" rel="noreferrer">
              GIBS request
            </a>
            <a href={f.info.worldview} target="_blank" rel="noreferrer">
              Open in Worldview
            </a>
            {f.info.colormap && (
              <a href={`https://gibs.earthdata.nasa.gov/colormaps/v1.3/${f.info.colormap}.xml`} target="_blank" rel="noreferrer">
                Colour key (XML)
              </a>
            )}
          </p>
        )}
        <p className="note">{ds.note}</p>
      </Section>

      {(svs || lib.length > 0) && (
        <Section title="From NASA’s Earth Information Center" id="sec-context">
          {svs && (
            <article className="ctx">
              {svs.image && <img className="ctx-img" src={svs.image} alt="" loading="lazy" />}
              <div>
                <p className="ctx-kicker">Scientific Visualization Studio · {svs.released ? fmtDate(svs.released) : `#${svs.id}`}</p>
                <h3 className="ctx-title">
                  <a href={svs.url} target="_blank" rel="noreferrer">
                    {svs.title}
                  </a>
                </h3>
                <p className="ctx-desc">{svs.description}</p>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void j.say(svs.fact)}>
                  Hear this
                </button>
              </div>
            </article>
          )}
          {lib.length > 0 && (
            <ul className="lib">
              {lib.map((it) => (
                <li key={it.nasaId}>
                  <a href={it.details} target="_blank" rel="noreferrer" className="lib-item">
                    {it.thumb && <img src={it.thumb} alt="" loading="lazy" />}
                    <span>
                      <span className="lib-title">{it.title}</span>
                      <span className="lib-meta">
                        NASA Image Library{it.center ? ` · ${it.center}` : ''}
                        {it.date ? ` · ${new Date(it.date).getUTCFullYear()}` : ''}
                      </span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          )}
          {libSource && (
            <p className="links small">
              <a href={libSource} target="_blank" rel="noreferrer">
                images-api.nasa.gov query
              </a>
            </p>
          )}
        </Section>
      )}
    </>
  )
}

// ---------------------------------------------------------------------------

export function ListenPanel({ j }: { j: Jukebox }) {
  const ds = j.dataset
  if (!ds) return null
  return (
    <aside className="panel" aria-label="Listening controls and sources">
      <Section title="Under the listening point" id="sec-readout">
        <Readout j={j} />
      </Section>

      <div className="modes" role="group" aria-label="Modes">
        <button type="button" className={`mode-btn${j.mode === 'explore' ? ' on' : ''}`} aria-pressed={j.mode === 'explore'} onClick={() => j.setMode('explore')}>
          Explore
        </button>
        <button
          type="button"
          className={`mode-btn${j.mode === 'time' ? ' on' : ''}`}
          aria-pressed={j.mode === 'time'}
          onClick={j.toggleTime}
          disabled={!ds.timeMachine}
          title={ds.timeMachine ? undefined : 'Available for sea ice and air temperature'}
        >
          Time Machine <kbd>T</kbd>
        </button>
        <button type="button" className={`mode-btn${j.mode === 'blind' ? ' on' : ''}`} aria-pressed={j.mode === 'blind'} onClick={j.toggleBlind}>
          Blindfold <kbd>B</kbd>
        </button>
        {j.mode === 'blind' && (
          <button type="button" className="mode-btn" aria-pressed={j.revealed} onClick={() => j.setRevealed(!j.revealed)}>
            {j.revealed ? 'Hide' : 'Reveal'} <kbd>V</kbd>
          </button>
        )}
      </div>

      <TimePanel j={j} />
      <EventsPanel j={j} />
      <Landmarks j={j} />

      <Section title="This frame, analysed in your browser" id="sec-stats">
        <FrameStats j={j} />
      </Section>

      <Sources j={j} />
    </aside>
  )
}
