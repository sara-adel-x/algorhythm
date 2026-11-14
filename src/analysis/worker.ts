/// <reference lib="webworker" />
/**
 * Analysis worker. Fetches each frame from our own /api/nasa proxy, draws it
 * onto an OffscreenCanvas (same origin, so the canvas is never tainted), reads
 * the pixels back and runs the analyzer off the main thread.
 */
import { analyze } from './analyze'
import { loadPixels, type AnalyzeJob } from './load'

declare const self: DedicatedWorkerGlobalScope

self.onmessage = async (ev: MessageEvent<{ id: number; job: AnalyzeJob }>) => {
  const { id, job } = ev.data
  try {
    const px = await loadPixels(job, (w, h) => {
      const canvas = new OffscreenCanvas(w, h)
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable')
      return ctx
    })
    const result = analyze({ ...job.params, ...px })
    const transfer: Transferable[] = [
      result.grid.l.buffer,
      result.grid.luma.buffer,
      result.grid.hue.buffer,
      result.grid.sat.buffer,
      result.grid.spec.buffer,
      result.grid.edge.buffer,
      result.grid.value.buffer,
      result.grid.cov.buffer,
      result.grid.fire.buffer,
      result.grid.cls.buffer,
    ]
    if (result.display) transfer.push(result.display.buffer)
    self.postMessage({ id, ok: true, result }, transfer)
  } catch (error) {
    self.postMessage({ id, ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}
