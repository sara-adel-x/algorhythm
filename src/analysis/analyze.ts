/**
 * Real-time pixel analysis of one NASA frame.
 *
 * Input is the raw RGBA of the frame exactly as GIBS served it (drawn onto an
 * OffscreenCanvas from our same-origin proxy). Nothing here is pre-baked: every
 * number the audio engine uses is computed from these pixels.
 *
 * Per pixel:   RGB → HSL, Rec.709 luma, colormap inversion (colour → measured
 *              value), intensity L, hue-band weights, area on the Earth.
 * Per image:   Sobel gradient magnitude on the intensity image.
 * Per cell:    means of the above on a grid ~128 cells wide (bilinear-sampled
 *              under the cursor), plus coverage, edge strength, fire density.
 * Per frame:   area-weighted statistics (mean value, extent, histogram, spectrum).
 *
 * Pure TypeScript, no DOM: runs in a Web Worker or on the main thread.
 */

import { buildDecodeTable, lookup, type DecodeTable } from './colormap'
import { projection, type BBox, type Crs } from './geo'
import type { Colormap, ValueSpec } from '../nasa/types'

/** Four fixed timbres, anchored on hue (degrees). Shared with the audio legend. */
export const HUE_ANCHORS = [0, 110, 215, 300] as const
export const ACHROMATIC_BAND = 2 // whites and greys sound like "glass"

export function hueBands(hue: number, out: Float32Array | number[], weight: number, offset = 0) {
  const h = ((hue % 360) + 360) % 360
  for (let i = 0; i < 4; i++) {
    const a = HUE_ANCHORS[i]
    const b = HUE_ANCHORS[(i + 1) % 4]
    const span = (b - a + 360) % 360 || 360
    const d = (h - a + 360) % 360
    if (d <= span) {
      const t = d / span
      out[offset + i] += (1 - t) * weight
      out[offset + ((i + 1) % 4)] += t * weight
      return
    }
  }
}

export interface AnalyzeInput {
  width: number
  height: number
  crs: Crs
  bbox: BBox
  /** RGBA of the data layer, `srcWidth × srcHeight`. */
  data: Uint8ClampedArray
  srcWidth: number
  srcHeight: number
  /** When the data comes in another projection, it is resampled onto (crs, bbox). */
  source: { crs: Crs; bbox: BBox } | null
  /** RGBA of a detections overlay (VIIRS thermal anomalies), `width × height`. */
  overlay: Uint8ClampedArray | null
  colormap: Colormap | null
  value: ValueSpec | null
  recolor: 'ice' | null
  cols: number
}

export interface FeatureGrid {
  cols: number
  rows: number
  /** intensity 0..1: decoded value normalised to the layer range, or pixel luma */
  l: Float32Array
  /** Rec.709 luma of the colours on screen, 0..1 */
  luma: Float32Array
  /** circular-mean hue in degrees, NaN where achromatic */
  hue: Float32Array
  sat: Float32Array
  /** 4 hue-band densities per cell (sum to 1 where there is data) */
  spec: Float32Array
  /** Sobel gradient magnitude, normalised to the frame's 95th percentile */
  edge: Float32Array
  /** mean decoded value in layer units, NaN where none */
  value: Float32Array
  /** fraction of the cell with data */
  cov: Float32Array
  /** fraction of the cell flagged by the detections overlay */
  fire: Float32Array
  /** dominant non-data class (index into classes), 0 = none */
  cls: Uint8Array
  classes: string[]
}

export interface FrameStats {
  meanL: number
  meanLuma: number
  coverage: number
  edgeDensity: number
  spectrum: [number, number, number, number]
  /** area-weighted histogram of intensity over data pixels, 8 bins */
  hist: number[]
  /** area-weighted mean of the decoded value, layer units (NaN if not decodable) */
  areaMean: number
  /** km² with ≥ 15 % ice, in millions, including the polar data gap (ice layers only) */
  extent: number | null
  /** of which the polar data gap, millions of km² */
  poleGap: number | null
  firePixels: number
  decoded: number
  unmatched: number
  ms: number
}

export interface AnalysisResult {
  width: number
  height: number
  grid: FeatureGrid
  stats: FrameStats
  /** RGBA to display when the frame was recoloured or reprojected; otherwise null */
  display: Uint8ClampedArray | null
}

// ---------------------------------------------------------------------------

const ICE_THRESHOLD = 15

/** One key for both ice frames: thin ice deep blue → solid pack white. */
function iceColour(c: number, out: number[]) {
  const t = Math.min(1, Math.max(0, (c - ICE_THRESHOLD) / (100 - ICE_THRESHOLD)))
  const e = Math.pow(t, 0.8)
  out[0] = Math.round(38 + (246 - 38) * e)
  out[1] = Math.round(92 + (250 - 92) * e)
  out[2] = Math.round(168 + (255 - 168) * e)
}

function normalise(v: number, spec: ValueSpec): number {
  if (spec.log) {
    if (v <= spec.min) return 0
    return Math.min(1, Math.log(v / spec.min) / Math.log(spec.max / spec.min))
  }
  return Math.min(1, Math.max(0, (v - spec.min) / (spec.max - spec.min)))
}

/** Projection lookups are reused across frames of the same view; every EONET event is a new view, so bound them. */
const MAX_VIEWS = 4
function remember<T>(cache: Map<string, T>, key: string, value: T): T {
  cache.set(key, value)
  while (cache.size > MAX_VIEWS) cache.delete(cache.keys().next().value as string)
  return value
}
const areaCache = new Map<string, Float32Array>()

function pixelAreas(crs: Crs, bbox: BBox, w: number, h: number): Float32Array {
  const key = `${crs}|${bbox.join(',')}|${w}x${h}`
  const hit = areaCache.get(key)
  if (hit) return hit
  const proj = projection(crs, bbox)
  const out = new Float32Array(w * h)
  if (crs === 'EPSG:4326') {
    for (let j = 0; j < h; j++) {
      const a = proj.pixelArea(0, j, w, h)
      out.fill(a, j * w, (j + 1) * w)
    }
  } else {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) out[j * w + i] = proj.pixelArea(i, j, w, h)
  }
  return remember(areaCache, key, out)
}

const sampleCache = new Map<string, Int32Array>()

/** For each output pixel, the index of the source pixel to read (or −1). */
function resampleMap(input: AnalyzeInput): Int32Array | null {
  if (!input.source) return null
  const { width: w, height: h, srcWidth: sw, srcHeight: sh } = input
  const sb = input.source.bbox
  const key = `${input.crs}|${input.bbox.join(',')}|${w}x${h}|${input.source.crs}|${sb.join(',')}|${sw}x${sh}`
  const hit = sampleCache.get(key)
  if (hit) return hit
  const proj = projection(input.crs, input.bbox)
  const out = new Int32Array(w * h)
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const { lat, lon } = proj.toLatLon((i + 0.5) / w, (j + 0.5) / h)
      const sx = Math.floor(((lon - sb[0]) / (sb[2] - sb[0])) * sw)
      const sy = Math.floor(((sb[3] - lat) / (sb[3] - sb[1])) * sh)
      out[j * w + i] = sx < 0 || sx >= sw || sy < 0 || sy >= sh ? -1 : sy * sw + sx
    }
  }
  return remember(sampleCache, key, out)
}

export function analyze(input: AnalyzeInput): AnalysisResult {
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now()
  const { width: w, height: h, value: spec } = input
  const table: DecodeTable | null = input.colormap ? buildDecodeTable(input.colormap) : null
  const map = resampleMap(input)
  const areas = pixelAreas(input.crs, input.bbox, w, h)
  const needDisplay = input.recolor !== null || map !== null
  const display = needDisplay ? new Uint8ClampedArray(w * h * 4) : null

  const cols = input.cols
  const rows = Math.max(1, Math.round((cols * h) / w))
  const n = cols * rows
  const sumL = new Float64Array(n)
  const sumLuma = new Float64Array(n)
  const sumV = new Float64Array(n)
  const cntV = new Float64Array(n)
  const cntData = new Float64Array(n)
  const cntAll = new Float64Array(n)
  const cosH = new Float64Array(n)
  const sinH = new Float64Array(n)
  const sumS = new Float64Array(n)
  const spec4 = new Float64Array(n * 4)
  const fireCnt = new Float64Array(n)
  const classVotes = new Map<number, Float64Array>()
  const classes = ['']
  const classIndex = new Map<string, number>()

  const intensity = new Float32Array(w * h)
  const hist = new Array(8).fill(0)
  const totalSpec = [0, 0, 0, 0]
  const tmpBands = [0, 0, 0, 0]
  const rgb = [0, 0, 0]

  let areaData = 0
  let areaAll = 0
  let areaL = 0
  let areaLuma = 0
  let areaV = 0
  let areaVsum = 0
  let extent = 0
  let poleGap = 0
  let firePixels = 0
  let decoded = 0
  let unmatched = 0

  const vote = (name: string, c: number) => {
    let idx = classIndex.get(name)
    if (idx === undefined) {
      idx = classes.length
      classes.push(name)
      classIndex.set(name, idx)
    }
    let votes = classVotes.get(idx)
    if (!votes) {
      votes = new Float64Array(n)
      classVotes.set(idx, votes)
    }
    votes[c] += 1
  }

  const src = input.data
  const ov = input.overlay
  const cellW = w / cols
  const cellH = h / rows

  for (let j = 0; j < h; j++) {
    const row = Math.min(rows - 1, Math.floor(j / cellH))
    for (let i = 0; i < w; i++) {
      const p = j * w + i
      const col = Math.min(cols - 1, Math.floor(i / cellW))
      const c = row * cols + col
      const area = areas[p]
      cntAll[c] += 1
      areaAll += area

      let r = 0
      let g = 0
      let b = 0
      let a = 0
      const sp = map ? map[p] : p
      if (sp >= 0) {
        const o = sp * 4
        r = src[o]
        g = src[o + 1]
        b = src[o + 2]
        a = src[o + 3]
      }

      // ---- decode the measurement ------------------------------------------
      let value = Number.NaN
      let cls = ''
      let hasData = false
      let L = 0
      let pole = false
      if (table) {
        if (a > 8) {
          const entry = lookup(table, r, g, b)
          if (!entry) {
            unmatched++
          } else if (!entry.transparent) {
            if (Number.isFinite(entry.value)) {
              value = entry.value
              hasData = true
              decoded++
            } else if (entry.cls) {
              cls = entry.cls
              if (input.recolor === 'ice' && /pole/i.test(cls)) {
                // the circle around the pole the satellite never saw: assumed ice
                pole = true
                value = 100
                hasData = true
              }
            }
          }
        }
        if (hasData && spec) L = normalise(value, spec)
      } else if (a > 8) {
        hasData = true
        L = ((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255) * (a / 255)
      }

      // ---- what is on screen -----------------------------------------------
      let dr = r
      let dg = g
      let db = b
      let da = a
      if (input.recolor === 'ice') {
        if (hasData && value >= ICE_THRESHOLD) {
          if (pole) {
            rgb[0] = 214
            rgb[1] = 222
            rgb[2] = 236
          } else iceColour(value, rgb)
          dr = rgb[0]
          dg = rgb[1]
          db = rgb[2]
          da = 255
        } else {
          da = 0
          if (hasData) L = 0 // open water is silent
        }
      }
      if (display) {
        const o = p * 4
        display[o] = dr
        display[o + 1] = dg
        display[o + 2] = db
        display[o + 3] = da
      }

      // ---- per-pixel features ----------------------------------------------
      intensity[p] = L
      if (hasData) {
        cntData[c] += 1
        areaData += area
        sumL[c] += L
        areaL += L * area
        hist[Math.min(7, Math.floor(L * 8))] += area
        if (Number.isFinite(value)) {
          sumV[c] += value
          cntV[c] += 1
          areaV += value * area
          areaVsum += area
        }
        if (input.recolor === 'ice' && value >= ICE_THRESHOLD) {
          extent += area
          if (pole) poleGap += area
        }
      }
      if (cls && (!hasData || pole)) vote(pole ? 'Pole gap' : cls, c)

      if (da > 8) {
        const rn = dr / 255
        const gn = dg / 255
        const bn = db / 255
        const max = Math.max(rn, gn, bn)
        const min = Math.min(rn, gn, bn)
        const l = (max + min) / 2
        const d = max - min
        const luma = (0.2126 * dr + 0.7152 * dg + 0.0722 * db) / 255
        sumLuma[c] += luma
        areaLuma += luma * area
        let s = 0
        let hue = 0
        if (d > 1e-6) {
          s = d / (1 - Math.abs(2 * l - 1))
          if (max === rn) hue = 60 * (((gn - bn) / d) % 6)
          else if (max === gn) hue = 60 * ((bn - rn) / d + 2)
          else hue = 60 * ((rn - gn) / d + 4)
          if (hue < 0) hue += 360
        }
        // chroma decides how much the hue is heard; greys and whites are "glass"
        const chroma = Math.min(1, s * (1 - Math.abs(2 * l - 1)) * 1.6)
        tmpBands[0] = tmpBands[1] = tmpBands[2] = tmpBands[3] = 0
        if (chroma > 0) hueBands(hue, tmpBands, chroma)
        tmpBands[ACHROMATIC_BAND] += 1 - chroma
        for (let k = 0; k < 4; k++) {
          spec4[c * 4 + k] += tmpBands[k]
          totalSpec[k] += tmpBands[k] * area
        }
        sumS[c] += s
        const rad = (hue * Math.PI) / 180
        cosH[c] += Math.cos(rad) * chroma
        sinH[c] += Math.sin(rad) * chroma
      }

      if (ov) {
        const o = p * 4
        if (ov[o + 3] > 64 && ov[o] > 150 && ov[o + 1] < 140) {
          fireCnt[c] += 1
          firePixels++
        }
      }
    }
  }

  // ---- Sobel on the intensity image -----------------------------------------
  const edgeSum = new Float64Array(n)
  for (let j = 1; j < h - 1; j++) {
    const row = Math.min(rows - 1, Math.floor(j / cellH))
    for (let i = 1; i < w - 1; i++) {
      const p = j * w + i
      const tl = intensity[p - w - 1]
      const tc = intensity[p - w]
      const tr = intensity[p - w + 1]
      const ml = intensity[p - 1]
      const mr = intensity[p + 1]
      const bl = intensity[p + w - 1]
      const bc = intensity[p + w]
      const br = intensity[p + w + 1]
      const gx = tr + 2 * mr + br - (tl + 2 * ml + bl)
      const gy = bl + 2 * bc + br - (tl + 2 * tc + tr)
      edgeSum[row * cols + Math.min(cols - 1, Math.floor(i / cellW))] += Math.sqrt(gx * gx + gy * gy)
    }
  }

  // ---- reduce to the grid ------------------------------------------------------
  const grid: FeatureGrid = {
    cols,
    rows,
    l: new Float32Array(n),
    luma: new Float32Array(n),
    hue: new Float32Array(n),
    sat: new Float32Array(n),
    spec: new Float32Array(n * 4),
    edge: new Float32Array(n),
    value: new Float32Array(n),
    cov: new Float32Array(n),
    fire: new Float32Array(n),
    cls: new Uint8Array(n),
    classes,
  }
  const rawEdge = new Float32Array(n)
  for (let c = 0; c < n; c++) {
    const all = cntAll[c] || 1
    grid.l[c] = sumL[c] / all // no-data pixels count as silence
    grid.luma[c] = sumLuma[c] / all
    grid.cov[c] = cntData[c] / all
    grid.value[c] = cntV[c] ? sumV[c] / cntV[c] : Number.NaN
    grid.fire[c] = fireCnt[c] / all
    const coloured = spec4[c * 4] + spec4[c * 4 + 1] + spec4[c * 4 + 2] + spec4[c * 4 + 3]
    for (let k = 0; k < 4; k++) grid.spec[c * 4 + k] = coloured ? spec4[c * 4 + k] / coloured : 0
    grid.sat[c] = coloured ? sumS[c] / coloured : 0
    const mag = Math.hypot(cosH[c], sinH[c])
    grid.hue[c] = mag > 1e-3 ? ((Math.atan2(sinH[c], cosH[c]) * 180) / Math.PI + 360) % 360 : Number.NaN
    rawEdge[c] = edgeSum[c] / all
    let best = 0
    let bestVotes = all * 0.25
    for (const [idx, votes] of classVotes) {
      if (votes[c] > bestVotes) {
        best = idx
        bestVotes = votes[c]
      }
    }
    grid.cls[c] = best
  }
  const sorted = Array.from(rawEdge).filter((v) => v > 1e-6).sort((x, y) => x - y)
  const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))] : 1
  let edgeTotal = 0
  for (let c = 0; c < n; c++) {
    grid.edge[c] = Math.min(1, rawEdge[c] / (p95 || 1))
    edgeTotal += grid.edge[c]
  }

  const specTotal = totalSpec.reduce((s, v) => s + v, 0) || 1
  const histTotal = hist.reduce((s, v) => s + v, 0) || 1
  const t1 = typeof performance !== 'undefined' ? performance.now() : Date.now()

  return {
    width: w,
    height: h,
    grid,
    display,
    stats: {
      meanL: areaAll ? areaL / areaAll : 0,
      meanLuma: areaAll ? areaLuma / areaAll : 0,
      coverage: areaAll ? areaData / areaAll : 0,
      edgeDensity: edgeTotal / n,
      spectrum: totalSpec.map((v) => v / specTotal) as [number, number, number, number],
      hist: hist.map((v) => v / histTotal),
      areaMean: areaVsum ? areaV / areaVsum : Number.NaN,
      extent: input.recolor === 'ice' ? extent / 1e6 : null,
      poleGap: input.recolor === 'ice' ? poleGap / 1e6 : null,
      firePixels,
      decoded,
      unmatched,
      ms: Math.round(t1 - t0),
    },
  }
}

// ---------------------------------------------------------------------------
// sampling under the cursor
// ---------------------------------------------------------------------------

export interface Sample {
  l: number
  luma: number
  spec: [number, number, number, number]
  edge: number
  value: number
  cov: number
  fire: number
  hue: number
  sat: number
  cls: string
}

/** Bilinear sample of the feature grid at a normalised position. */
export function sampleGrid(grid: FeatureGrid, x: number, y: number): Sample {
  const fx = Math.min(grid.cols - 1, Math.max(0, x * grid.cols - 0.5))
  const fy = Math.min(grid.rows - 1, Math.max(0, y * grid.rows - 0.5))
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(grid.cols - 1, x0 + 1)
  const y1 = Math.min(grid.rows - 1, y0 + 1)
  const tx = fx - x0
  const ty = fy - y0
  const idx = [y0 * grid.cols + x0, y0 * grid.cols + x1, y1 * grid.cols + x0, y1 * grid.cols + x1]
  const wts = [(1 - tx) * (1 - ty), tx * (1 - ty), (1 - tx) * ty, tx * ty]
  const lerp = (arr: Float32Array) => idx.reduce((s, c, k) => s + arr[c] * wts[k], 0)
  const spec: [number, number, number, number] = [0, 0, 0, 0]
  for (let k = 0; k < 4; k++) spec[k] = idx.reduce((s, c, m) => s + grid.spec[c * 4 + k] * wts[m], 0)
  // values: average only the neighbours that have one
  let vs = 0
  let vw = 0
  idx.forEach((c, k) => {
    const v = grid.value[c]
    if (Number.isFinite(v)) {
      vs += v * wts[k]
      vw += wts[k]
    }
  })
  const nearest = idx[(ty < 0.5 ? 0 : 2) + (tx < 0.5 ? 0 : 1)]
  return {
    l: lerp(grid.l),
    luma: lerp(grid.luma),
    spec,
    edge: lerp(grid.edge),
    value: vw > 0.2 ? vs / vw : Number.NaN,
    cov: lerp(grid.cov),
    fire: lerp(grid.fire),
    hue: grid.hue[nearest],
    sat: lerp(grid.sat),
    cls: grid.classes[grid.cls[nearest]] ?? '',
  }
}

/** Linear morph between two samples (Time Machine). */
export function mixSamples(a: Sample, b: Sample, t: number): Sample {
  const m = (p: number, q: number) => p + (q - p) * t
  const value = Number.isFinite(a.value) && Number.isFinite(b.value) ? m(a.value, b.value) : t < 0.5 ? a.value : b.value
  return {
    l: m(a.l, b.l),
    luma: m(a.luma, b.luma),
    spec: [m(a.spec[0], b.spec[0]), m(a.spec[1], b.spec[1]), m(a.spec[2], b.spec[2]), m(a.spec[3], b.spec[3])],
    edge: m(a.edge, b.edge),
    value,
    cov: m(a.cov, b.cov),
    fire: m(a.fire, b.fire),
    hue: t < 0.5 ? a.hue : b.hue,
    sat: m(a.sat, b.sat),
    cls: t < 0.5 ? a.cls : b.cls,
  }
}

export function mixStats(a: FrameStats, b: FrameStats, t: number): FrameStats {
  const m = (p: number, q: number) => p + (q - p) * t
  return {
    ...b,
    meanL: m(a.meanL, b.meanL),
    meanLuma: m(a.meanLuma, b.meanLuma),
    coverage: m(a.coverage, b.coverage),
    edgeDensity: m(a.edgeDensity, b.edgeDensity),
    spectrum: a.spectrum.map((v, k) => m(v, b.spectrum[k])) as FrameStats['spectrum'],
    hist: a.hist.map((v, k) => m(v, b.hist[k])),
    areaMean: m(a.areaMean, b.areaMean),
    extent: a.extent !== null && b.extent !== null ? m(a.extent, b.extent) : b.extent,
  }
}
