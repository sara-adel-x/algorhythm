import { useEffect, useRef } from 'react'
import type { Hotspot, Scene } from '../scene/types'

interface Props {
  scene: Scene
  cursor: { x: number; y: number }
  onMove: (x: number, y: number) => void
  onHotspot?: (h: Hotspot) => void
  showImage: boolean
}

interface Ripple {
  x: number
  y: number
  born: number
}

const RIPPLE_MS = 2600

export function SceneStage({ scene, cursor, onMove, onHotspot, showImage }: Props) {
  const stageRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ripples = useRef<Ripple[]>([])
  const lastRing = useRef(0)
  const entered = useRef<string | null>(null)

  // --- ripples -------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current
    const stage = stageRef.current
    if (!canvas || !stage) return
    const ctx = canvas.getContext('2d')!
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
      ripples.current = ripples.current.filter((r) => now - r.born < RIPPLE_MS)
      for (const r of ripples.current) {
        const t = (now - r.born) / RIPPLE_MS
        const rad = 8 + t * 130
        ctx.beginPath()
        ctx.arc(r.x * w, r.y * h, rad, 0, Math.PI * 2)
        ctx.strokeStyle = `rgba(246, 241, 232, ${0.45 * (1 - t)})`
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

  // --- hotspot entry -------------------------------------------------------
  useEffect(() => {
    const near = scene.hotspots.find(
      (hs) => Math.hypot(hs.x - cursor.x, hs.y - cursor.y) < 0.055,
    )
    if (near && entered.current !== near.id) {
      entered.current = near.id
      onHotspot?.(near)
    } else if (!near) {
      entered.current = null
    }
  }, [cursor.x, cursor.y, scene.hotspots, onHotspot])

  const handle = (clientX: number, clientY: number) => {
    const stage = stageRef.current
    if (!stage) return
    const rect = stage.getBoundingClientRect()
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width))
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height))
    const now = performance.now()
    if (now - lastRing.current > 200) {
      lastRing.current = now
      ripples.current.push({ x, y, born: now })
    }
    onMove(x, y)
  }

  return (
    <div
      ref={stageRef}
      className={`stage${showImage ? '' : ' stage-blind'}`}
      style={{ ['--ar' as string]: `${scene.image.w} / ${scene.image.h}` }}
      role="application"
      aria-label={`${scene.title}. Explore the image with the arrow keys, or drag across it.`}
      aria-describedby="stage-help"
      tabIndex={0}
      onPointerMove={(e) => handle(e.clientX, e.clientY)}
      onPointerDown={(e) => {
        ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        handle(e.clientX, e.clientY)
      }}
      onKeyDown={(e) => {
        if (e.key.startsWith('Arrow')) e.preventDefault()
      }}
    >
      {showImage ? (
        <img className="stage-img" src={scene.image.src} alt={scene.image.alt} draggable={false} />
      ) : (
        <div className="stage-void" aria-hidden="true" />
      )}

      <canvas ref={canvasRef} className="stage-ripples" aria-hidden="true" />

      <div
        className="cursor"
        style={{ left: `${cursor.x * 100}%`, top: `${cursor.y * 100}%` }}
        aria-hidden="true"
      >
        <span className="cursor-dot" />
      </div>

      {showImage &&
        scene.hotspots.map((hs) => (
          <span
            key={hs.id}
            className="hotspot"
            style={{ left: `${hs.x * 100}%`, top: `${hs.y * 100}%` }}
            aria-hidden="true"
          />
        ))}

      <p id="stage-help" className="sr-only">
        Use the arrow keys to move the listening point. Press Enter to hear what is under it. Press H to
        jump to the next landmark. Press question mark for the full list of keys.
      </p>
    </div>
  )
}
