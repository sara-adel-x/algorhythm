import { useEffect, useRef } from 'react'
import type { AudioEngine } from '../audio/engine'

/**
 * A thin waveform strip. It is the only part of the interface that is purely for
 * sighted users, so it is aria-hidden and carries no information that is not
 * already available as sound or text.
 */
export function Visualizer({ engine, active }: { engine: AudioEngine; active: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')!
    let raf = 0
    const dpr = Math.min(2, window.devicePixelRatio || 1)

    const resize = () => {
      canvas.width = canvas.clientWidth * dpr
      canvas.height = canvas.clientHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const draw = () => {
      const w = canvas.clientWidth
      const h = canvas.clientHeight
      ctx.clearRect(0, 0, w, h)

      const data = engine.waveform()
      ctx.beginPath()
      if (!data || !active) {
        ctx.moveTo(0, h / 2)
        ctx.lineTo(w, h / 2)
      } else {
        for (let i = 0; i < data.length; i++) {
          const x = (i / (data.length - 1)) * w
          const y = h / 2 - Math.max(-1, Math.min(1, data[i] * 3.2)) * (h / 2) * 0.92
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
        }
      }
      ctx.strokeStyle = active ? 'rgba(110, 231, 183, 0.9)' : 'rgba(127, 138, 163, 0.35)'
      ctx.lineWidth = 1.25
      ctx.stroke()
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [engine, active])

  return <canvas ref={ref} className="visualizer" aria-hidden="true" />
}
