import { useEffect, useRef, useState } from 'react'
import type { Hotspot, Scene } from '../scene/types'

interface Props {
  scene: Scene
  /** the "now" frame — only present in Time Machine mode */
  morphScene: Scene | null
  /** 0 = the earlier frame, 1 = the later frame */
  morph: number
  blind: boolean
  revealed: boolean
  cursor: { x: number; y: number }
  activeHotspot: Hotspot | null
  onMove: (x: number, y: number) => void
  onReveal: () => void
  onKeyDown: (e: React.KeyboardEvent) => void
}

interface Ripple {
  x: number
  y: number
  born: number
  strength: number
}

const RIPPLE_MS = 1600

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))

export function SceneStage({
  scene,
  morphScene,
  morph,
  blind,
  revealed,
  cursor,
  activeHotspot,
  onMove,
  onReveal,
  onKeyDown,
}: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ripples = useRef<Ripple[]>([])
  const lastRing = useRef(0)
  const lastPos = useRef({ x: cursor.x, y: cursor.y })
  const cursorRef = useRef(cursor)
  cursorRef.current = cursor
  const [dragging, setDragging] = useState(false)

  const hideImage = blind && !revealed

  // --- ripples -------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return
    const ctx = canvas.getContext('2d')!
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = stage.clientWidth * dpr
      canvas.height = stage.clientHeight * dpr
      canvas.style.width = `${stage.clientWidth}px`
      canvas.style.height = `${stage.clientHeight}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(stage)

    const draw = () => {
      const w = stage.clientWidth
      const h = stage.clientHeight
      const now = performance.now()
      ctx.clearRect(0, 0, w, h)

      const c = cursorRef.current
      const cx = c.x * w
      const cy = c.y * h

      // soft halo so the point of listening is always visible on a bright image
      const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 84)
      halo.addColorStop(0, 'rgba(255,255,255,0.20)')
      halo.addColorStop(0.4, 'rgba(180,230,210,0.07)')
      halo.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = halo
      ctx.beginPath()
      ctx.arc(cx, cy, 84, 0, Math.PI * 2)
      ctx.fill()

      // emit a ring when the cursor has travelled far enough
      const moved = Math.hypot((c.x - lastPos.current.x) * w, (c.y - lastPos.current.y) * h)
      if (!reduce && moved > 24 && now - lastRing.current > 110) {
        ripples.current.push({ x: c.x, y: c.y, born: now, strength: Math.min(1, moved / 80) })
        lastRing.current = now
        lastPos.current = { x: c.x, y: c.y }
      }

      ripples.current = ripples.current.filter((r) => now - r.born < RIPPLE_MS)
      for (const r of ripples.current) {
        const t = (now - r.born) / RIPPLE_MS
        const rad = 10 + t * 118
        ctx.beginPath()
        ctx.arc(r.x * w, r.y * h, rad, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(214, 240, 226, ${0.5 * (1 - t) * r.strength})`
        ctx.lineWidth = 1.2
        ctx.stroke()
      }
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  const handle = (clientX: number, clientY: number) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    onMove(clamp01((clientX - rect.left) / rect.width), clamp01((clientY - rect.top) / rect.height))
  }

  return (
    <div className="stage-wrap">
      <div
        className="stage-halo"
        aria-hidden="true"
        style={{ backgroundImage: `url(${(morphScene ?? scene).image.src})` }}
      />
      <div
      ref={stageRef}
      className={`stage${hideImage ? ' stage-blind' : ''}`}
      style={{ ['--ar' as string]: `${(morphScene ?? scene).image.w} / ${(morphScene ?? scene).image.h}` }}
      role="application"
      aria-label={`${scene.title}. Listening stage. Arrow keys move the point; H jumps between landmarks.`}
      aria-describedby="stage-help"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={(e) => {
        setDragging(true)
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        handle(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        if (dragging) handle(e.clientX, e.clientY)
      }}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onPointerLeave={() => setDragging(false)}
    >
      <img className="stage-img" src={scene.image.src} alt={scene.image.alt} draggable={false} />
      {morphScene && (
        <img
          className="stage-img stage-img-morph"
          src={morphScene.image.src}
          alt=""
          aria-hidden="true"
          style={{ opacity: morph }}
          draggable={false}
        />
      )}

      <canvas ref={canvasRef} className="stage-ripples" aria-hidden="true" />

      <div className="stage-frame" aria-hidden="true">
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner bl" />
        <span className="corner br" />
      </div>

      {!hideImage &&
        scene.hotspots.map((hs) => (
          <span
            key={hs.id}
            className={`hotspot${activeHotspot?.id === hs.id ? ' hotspot-on' : ''}`}
            style={{ left: `${hs.x * 100}%`, top: `${hs.y * 100}%` }}
            aria-hidden="true"
          />
        ))}

      <div className="cursor" style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }} aria-hidden="true">
        <span className="cursor-ring" />
        <span className="cursor-dot" />
      </div>

      {hideImage && (
        <div className="blind-note">
          <p className="blind-title">Blindfold mode</p>
          <p className="blind-sub">
            Nothing to look at — only sound. Move around and listen, then decide whether to peek.
          </p>
          <button className="btn btn-solid" onClick={onReveal}>
            Reveal the picture
          </button>
        </div>
      )}

      <p id="stage-help" className="sr-only">
        Use the arrow keys to move the listening point. Press Enter to hear what is under it. Press H to
        jump to the next landmark. Press question mark for the full list of keys.
      </p>
      </div>
    </div>
  )
}
