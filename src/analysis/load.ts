import type { BBox, Crs } from './geo'
import type { Colormap, ValueSpec } from '../nasa/types'

/** Everything needed to analyse one frame. URLs are same-origin /api/nasa paths. */
export interface AnalyzeJob {
  dataUrl: string
  overlayUrl: string | null
  colormapUrl: string | null
  srcWidth: number
  srcHeight: number
  params: {
    width: number
    height: number
    crs: Crs
    bbox: BBox
    source: { crs: Crs; bbox: BBox } | null
    value: ValueSpec | null
    recolor: 'ice' | null
    cols: number
  }
}

type Ctx2D = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

async function bitmap(url: string): Promise<ImageBitmap> {
  const res = await fetch(url)
  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      message = (await res.json()).error ?? message
    } catch {
      /* not JSON */
    }
    throw new Error(message)
  }
  const blob = await res.blob()
  // No colour management and no premultiplication: palette colours must
  // survive byte-for-byte so they can be matched against NASA's colormap.
  return createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
}

function read(img: ImageBitmap, w: number, h: number, make: (w: number, h: number) => Ctx2D): Uint8ClampedArray {
  const ctx = make(w, h)
  ctx.imageSmoothingEnabled = false
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h).data
}

export async function loadPixels(job: AnalyzeJob, make: (w: number, h: number) => Ctx2D) {
  const [dataImg, overlayImg, colormap] = await Promise.all([
    bitmap(job.dataUrl),
    job.overlayUrl ? bitmap(job.overlayUrl) : Promise.resolve(null),
    job.colormapUrl
      ? fetch(job.colormapUrl).then((r) => {
          if (!r.ok) throw new Error(`Colormap HTTP ${r.status}`)
          return r.json() as Promise<Colormap>
        })
      : Promise.resolve(null),
  ])
  const data = read(dataImg, job.srcWidth, job.srcHeight, make)
  const overlay = overlayImg ? read(overlayImg, job.params.width, job.params.height, make) : null
  dataImg.close()
  overlayImg?.close()
  return { data, overlay, colormap, srcWidth: job.srcWidth, srcHeight: job.srcHeight }
}
