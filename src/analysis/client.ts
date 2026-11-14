import { analyze, type AnalysisResult } from './analyze'
import { loadPixels, type AnalyzeJob } from './load'
import type { Dataset, FrameInfo } from '../nasa/types'

/** Grid resolution: 128 cells across, rows follow the frame's aspect ratio. */
export const GRID_COLS = 128

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (r: AnalysisResult) => void; reject: (e: Error) => void }>()
/** Recent analyses (LRU). Each holds full-resolution RGBA buffers, so keep only a few. */
const results = new Map<string, Promise<AnalysisResult>>()
const MAX_RESULTS = 6

function getWorker(): Worker | null {
  if (worker) return worker
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null
  try {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (ev: MessageEvent<{ id: number; ok: boolean; result?: AnalysisResult; error?: string }>) => {
      const p = pending.get(ev.data.id)
      if (!p) return
      pending.delete(ev.data.id)
      if (ev.data.ok && ev.data.result) p.resolve(ev.data.result)
      else p.reject(new Error(ev.data.error ?? 'Analysis failed'))
    }
    worker.onerror = () => {
      pending.forEach((p) => p.reject(new Error('Analysis worker crashed')))
      pending.clear()
      worker = null
    }
    return worker
  } catch {
    return null
  }
}

export function jobFor(ds: Dataset, info: FrameInfo): AnalyzeJob {
  const [w, h] = info.size
  const src = info.source
  return {
    dataUrl: info.images.data,
    overlayUrl: info.images.overlay ?? null,
    colormapUrl: info.colormap ? `/api/nasa/colormap?name=${encodeURIComponent(info.colormap)}` : null,
    srcWidth: src ? src.size[0] : w,
    srcHeight: src ? src.size[1] : h,
    params: {
      width: w,
      height: h,
      crs: info.crs,
      bbox: info.bbox,
      source: src ? { crs: src.crs, bbox: src.bbox } : null,
      value: info.colormap ? ds.value : null,
      recolor: ds.recolor,
      cols: GRID_COLS,
    },
  }
}

/** Where the analysis ran, for the "How it works" panel. */
export function analysisRuntime(): 'worker' | 'main-thread' {
  return getWorker() ? 'worker' : 'main-thread'
}

export function analyzeFrame(ds: Dataset, info: FrameInfo): Promise<AnalysisResult> {
  const key = `${info.dataset}|${info.frame}|${info.event?.id ?? ''}|${info.date}`
  const hit = results.get(key)
  if (hit) {
    results.delete(key)
    results.set(key, hit)
    return hit
  }
  const job = jobFor(ds, info)
  const w = getWorker()
  const p = w
    ? new Promise<AnalysisResult>((resolve, reject) => {
        const id = ++seq
        pending.set(id, { resolve, reject })
        w.postMessage({ id, job })
      })
    : (async () => {
        // Main-thread fallback: same loader and analyzer, a detached <canvas>.
        const canvas = document.createElement('canvas')
        const px = await loadPixels(job, (cw, ch) => {
          canvas.width = cw
          canvas.height = ch
          const ctx = canvas.getContext('2d', { willReadFrequently: true })
          if (!ctx) throw new Error('Canvas 2D context unavailable')
          return ctx
        })
        return analyze({ ...job.params, ...px })
      })()
  const guarded = p.catch((e) => {
    results.delete(key)
    throw e
  })
  results.set(key, guarded)
  while (results.size > MAX_RESULTS) results.delete(results.keys().next().value as string)
  return guarded
}
