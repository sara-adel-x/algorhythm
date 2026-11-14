import { forwardRef, useCallback, useMemo, useRef } from 'react'
import type { Jukebox } from '../app/useJukebox'

const frameSrc = (f: { displayUrl: string | null; info: { images: { data: string } } }) => f.displayUrl ?? f.info.images.data

/** Greedy label culling: the current landmark first, then any label that does not collide with one already shown. */
function visibleLabels(marks: { x: number; y: number; kind: string }[], current: number) {
  const order = marks.map((_, i) => i).sort((a, b) => (a === current ? -1 : b === current ? 1 : a - b))
  const shown: { x: number; y: number }[] = []
  const out = new Set<number>()
  for (const i of order) {
    const m = marks[i]
    if (m.kind === 'track') continue
    if (shown.some((s) => Math.abs(s.y - m.y) < 0.045 && m.x > s.x - 0.24 && m.x < s.x + 0.3)) continue
    shown.push(m)
    out.add(i)
  }
  return out
}

/**
 * The listening surface. Pointer, touch and the keyboard all move one
 * listening point; the sound is computed from the analysed frame under it.
 */
export const Stage = forwardRef<HTMLDivElement, { j: Jukebox }>(function Stage({ j }, ref) {
  const box = useRef<HTMLDivElement | null>(null)
  const ds = j.dataset
  const main = j.mainFrame
  const tm = ds?.timeMachine
  const thenFrame = tm ? j.frames[tm.then] : undefined
  const inTime = j.mode === 'time' && !!thenFrame
  const hidden = j.mode === 'blind' && !j.revealed
  const size = main?.info.size ?? ds?.size ?? [1024, 768]
  const ar = size[0] / size[1]
  const labelled = useMemo(() => visibleLabels(j.landmarks, j.landmarkIdx), [j.landmarks, j.landmarkIdx])

  const toXY = useCallback((e: React.PointerEvent) => {
    const r = box.current?.getBoundingClientRect()
    if (!r) return null
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
  }, [])

  const onMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse' && e.buttons === 0) return
    const p = toXY(e)
    if (p) j.moveTo(p.x, p.y)
  }
  const onDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'mouse') (e.target as Element).setPointerCapture?.(e.pointerId)
    const p = toXY(e)
    if (p) j.moveTo(p.x, p.y)
  }

  const label = ds
    ? `${ds.title} sound map${main ? `, ${main.info.title}, ${main.info.date}` : ', loading'}. ` +
      'Arrow keys move the listening point, Shift moves faster. H jumps to the next place or event, Enter describes the point.'
    : 'Sound map'

  return (
    <div className="stage-wrap" style={{ ['--ar' as string]: String(ar) }}>
      <div
        ref={(el) => {
          box.current = el
          if (typeof ref === 'function') ref(el)
          else if (ref) ref.current = el
        }}
        className={`stage${hidden ? ' is-hidden' : ''}${inTime ? ' is-time' : ''}`}
        tabIndex={0}
        role="application"
        aria-roledescription="sound map"
        aria-label={label}
        onPointerMove={onMove}
        onPointerDown={onDown}
      >
        <div className="stage-layers" aria-hidden="true">
          {main?.info.images.base && <img className="layer base" src={main.info.images.base} alt="" draggable={false} />}
          {inTime && thenFrame && <img className="layer data" src={frameSrc(thenFrame)} alt="" draggable={false} />}
          {main && (
            <img
              className="layer data"
              src={frameSrc(main)}
              alt=""
              draggable={false}
              style={inTime ? { opacity: j.time.t } : undefined}
            />
          )}
          {main?.info.images.overlay && <img className="layer overlay" src={main.info.images.overlay} alt="" draggable={false} />}
        </div>

        {hidden && (
          <div className="blindfold" aria-hidden="true">
            <span>Blindfold</span>
            <small>Listen and build the map in your head · V reveals</small>
          </div>
        )}

        {!hidden &&
          j.landmarks.map((l, i) => (
            <span
              key={l.id}
              className={`mark mark-${l.kind}${i === j.landmarkIdx ? ' is-current' : ''}${l.x > 0.62 ? ' label-left' : ''}`}
              style={{ left: `${l.x * 100}%`, top: `${l.y * 100}%` }}
              aria-hidden="true"
            >
              {labelled.has(i) && <span className="mark-label">{l.name}</span>}
            </span>
          ))}

        {main && (
          <span className="reticle" style={{ left: `${j.cursor.x * 100}%`, top: `${j.cursor.y * 100}%` }} aria-hidden="true">
            <span className="reticle-ring" />
          </span>
        )}

        {j.status.busy && (
          <div className="stage-status" role="status">
            <span className="spinner" aria-hidden="true" /> {j.status.message}
          </div>
        )}
        {!j.status.busy && j.status.error && !main && (
          <div className="stage-status error" role="alert">
            {j.status.message}
          </div>
        )}

        {inTime && tm && thenFrame && main && (
          <div className="time-stamp" aria-hidden="true">
            <span className={j.time.t < 0.5 ? 'on' : ''}>{thenFrame.info.date.slice(0, ds?.id === 'air-temp' ? 7 : 10)}</span>
            <span className="time-bar">
              <span style={{ width: `${j.time.t * 100}%` }} />
            </span>
            <span className={j.time.t >= 0.5 ? 'on' : ''}>{main.info.date.slice(0, ds?.id === 'air-temp' ? 7 : 10)}</span>
          </div>
        )}
      </div>
    </div>
  )
})
