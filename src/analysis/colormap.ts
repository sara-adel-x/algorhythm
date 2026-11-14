import type { Colormap } from '../nasa/types'

/**
 * Inverts a published GIBS colormap: pixel RGB → measured value.
 * GIBS data layers are palette images served losslessly, so almost every pixel
 * matches an entry exactly; anything else is matched to the nearest entry within
 * a small tolerance, and counted as "unmatched" otherwise.
 */
export interface DecodeEntry {
  value: number // NaN when the entry has no numeric value
  cls: string | null // e.g. "Pole Mask", "Land Mask", "Snow Rate"
  transparent: boolean
}

export interface DecodeTable {
  exact: Map<number, DecodeEntry>
  list: { rgb: [number, number, number]; entry: DecodeEntry }[]
  near: Map<number, DecodeEntry | null>
}

export function buildDecodeTable(cm: Colormap): DecodeTable {
  const exact = new Map<number, DecodeEntry>()
  const list: DecodeTable['list'] = []
  for (const map of cm.maps) {
    for (const e of map.entries) {
      const entry: DecodeEntry = {
        value: e.value === null ? Number.NaN : e.value,
        cls: map.units ? (map.title && /snow/i.test(map.title) ? 'Snow' : null) : e.label,
        transparent: e.transparent || e.nodata,
      }
      const key = (e.rgb[0] << 16) | (e.rgb[1] << 8) | e.rgb[2]
      if (!exact.has(key)) exact.set(key, entry)
      list.push({ rgb: e.rgb, entry })
    }
  }
  return { exact, list, near: new Map() }
}

export function lookup(t: DecodeTable, r: number, g: number, b: number): DecodeEntry | null {
  const key = (r << 16) | (g << 8) | b
  const hit = t.exact.get(key)
  if (hit) return hit
  const cached = t.near.get(key)
  if (cached !== undefined) return cached
  let best: DecodeEntry | null = null
  let bestD = 6 * 6 * 3
  for (const { rgb, entry } of t.list) {
    const d = (rgb[0] - r) ** 2 + (rgb[1] - g) ** 2 + (rgb[2] - b) ** 2
    if (d < bestD) {
      bestD = d
      best = entry
    }
  }
  t.near.set(key, best)
  return best
}
