/**
 * /api/nasa — a small, whitelisted, caching proxy for the NASA services the
 * jukebox uses. It exists for three reasons:
 *
 *  1. Same origin. Frames drawn into a <canvas> stay untainted, so the browser
 *     is allowed to read their pixels. No CORS errors, ever.
 *  2. Local caching. Memory (LRU) + disk, per-route TTLs, in-flight
 *     de-duplication, and stale-on-error, so a flaky upstream never silences
 *     the demo.
 *  3. Safety. The browser sends dataset ids and EONET ids, never upstream URLs,
 *     layer names or bounding boxes. The only pass-through is /media, and it is
 *     restricted to NASA image hosts.
 *
 * Node built-ins only (fetch, crypto, fs) so the same file runs in the Vite dev
 * server and in the production container without dependencies.
 */

import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { COLORMAP_BASE, COLORMAPS, DATASETS, GIBS, findDataset } from './catalog.mjs'
import { eventNarration } from '../shared/narration.mjs'

const UA = 'AlgoRythm/1.0 (NASA Space Apps 2026 Earth Information Jukebox)'
const CACHE_DIR = process.env.NASA_CACHE_DIR || path.resolve(process.cwd(), '.cache/nasa')
const MEMORY_CAP = 192 * 1024 * 1024
const DAY = 86400

const TTL = {
  image: 30 * DAY, // a GIBS URL contains its date, so its bytes never change
  colormap: 30 * DAY,
  latest: 3 * 3600,
  events: 10 * 60,
  event: 10 * 60,
  library: DAY,
  svs: 7 * DAY,
  media: 7 * DAY,
  catalog: 15 * 60,
}

const MEDIA_HOSTS = new Set(['images-assets.nasa.gov', 'svs.gsfc.nasa.gov', 'images-api.nasa.gov'])

// --------------------------------------------------------------------------
// cache
// --------------------------------------------------------------------------

const memory = new Map()
let memoryBytes = 0
const inflight = new Map()

const hashKey = (key) => createHash('sha1').update(key).digest('hex')

function memoryGet(key) {
  const entry = memory.get(key)
  if (!entry) return null
  memory.delete(key)
  memory.set(key, entry)
  return entry
}

function memorySet(key, entry) {
  const old = memory.get(key)
  if (old) {
    memoryBytes -= old.body.length
    memory.delete(key)
  }
  memory.set(key, entry)
  memoryBytes += entry.body.length
  for (const [k, v] of memory) {
    if (memoryBytes <= MEMORY_CAP) break
    memory.delete(k)
    memoryBytes -= v.body.length
  }
}

async function diskGet(key) {
  const h = hashKey(key)
  try {
    const meta = JSON.parse(await readFile(path.join(CACHE_DIR, `${h}.json`), 'utf8'))
    const body = await readFile(path.join(CACHE_DIR, `${h}.bin`))
    return { ...meta, body }
  } catch {
    return null
  }
}

async function diskSet(key, entry) {
  const h = hashKey(key)
  await mkdir(CACHE_DIR, { recursive: true })
  await writeFile(path.join(CACHE_DIR, `${h}.bin`), entry.body)
  await writeFile(
    path.join(CACHE_DIR, `${h}.json`),
    JSON.stringify({ key, type: entry.type, storedAt: entry.storedAt, ttl: entry.ttl, source: entry.source }),
  )
}

/** Fetch-through cache. `producer` returns { type, body: Buffer, source }. */
async function cached(key, ttl, producer) {
  let entry = memoryGet(key) ?? (await diskGet(key))
  if (entry && Date.now() - entry.storedAt < entry.ttl * 1000) {
    memorySet(key, entry)
    return { ...entry, cache: 'hit' }
  }
  if (inflight.has(key)) return inflight.get(key)
  const job = (async () => {
    try {
      const fresh = await producer()
      const stored = { ...fresh, storedAt: Date.now(), ttl }
      memorySet(key, stored)
      diskSet(key, stored).catch(() => {})
      return { ...stored, cache: 'miss' }
    } catch (error) {
      if (entry) return { ...entry, cache: 'stale' }
      throw error
    } finally {
      inflight.delete(key)
    }
  })()
  inflight.set(key, job)
  return job
}

async function cachedJson(key, ttl, build) {
  const result = await cached(key, ttl, async () => {
    const value = await build()
    return { type: 'application/json; charset=utf-8', body: Buffer.from(JSON.stringify(value)), source: key }
  })
  return { value: JSON.parse(result.body.toString('utf8')), cache: result.cache }
}

// --------------------------------------------------------------------------
// upstream
// --------------------------------------------------------------------------

class UpstreamError extends Error {
  constructor(message, status = 502) {
    super(message)
    this.status = status
  }
}

async function upstream(url, { expect = 'any', timeout = 30000 } = {}) {
  let res
  try {
    res = await fetch(url, { headers: { 'User-Agent': UA, Accept: '*/*' }, signal: AbortSignal.timeout(timeout) })
  } catch (error) {
    throw new UpstreamError(`NASA upstream unreachable: ${new URL(url).host} (${error?.name ?? 'error'})`)
  }
  const type = res.headers.get('content-type') ?? 'application/octet-stream'
  const body = Buffer.from(await res.arrayBuffer())
  if (!res.ok) throw new UpstreamError(`NASA upstream ${new URL(url).host} returned HTTP ${res.status}`)
  if (expect === 'image' && !type.startsWith('image/')) {
    // GIBS answers a bad request with HTTP 200 and an XML ServiceException.
    const text = body.toString('utf8').replace(/\s+/g, ' ').slice(0, 240)
    throw new UpstreamError(`GIBS did not return an image: ${text}`)
  }
  if (expect === 'json') {
    try {
      return { type, body, json: JSON.parse(body.toString('utf8')) }
    } catch {
      throw new UpstreamError(`NASA upstream ${new URL(url).host} returned invalid JSON`)
    }
  }
  return { type, body }
}

// --------------------------------------------------------------------------
// GIBS
// --------------------------------------------------------------------------

const iso = (d) => d.toISOString().slice(0, 10)
const addDays = (d, n) => new Date(d.getTime() + n * DAY * 1000)

function wmsUrl({ crs, layer, bbox, size, format = 'image/png', time, transparent = true }) {
  // WMS 1.3.0 uses lat,lon axis order for EPSG:4326. Our catalog stores lon,lat.
  const box = crs === 'EPSG:4326' ? [bbox[1], bbox[0], bbox[3], bbox[2]] : bbox
  const p = new URLSearchParams({
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.3.0',
    LAYERS: layer,
    STYLES: '',
    CRS: crs,
    BBOX: box.map((v) => Number(v.toFixed(6))).join(','),
    WIDTH: String(size[0]),
    HEIGHT: String(size[1]),
    FORMAT: format,
  })
  if (format === 'image/png') p.set('TRANSPARENT', transparent ? 'TRUE' : 'FALSE')
  if (time) p.set('TIME', time)
  return `${GIBS[crs]}?${p.toString()}`
}

/** Is there data for this layer/date? An empty GIBS day is a ~207-byte transparent PNG. */
async function hasData(crs, layer, time) {
  const url = wmsUrl({ crs, layer, bbox: crs === 'EPSG:4326' ? [-180, -90, 180, 90] : [-3500000, -3500000, 3500000, 3500000], size: [256, 128], time })
  const r = await cached(url, TTL.image, async () => {
    const u = await upstream(url, { expect: 'image' })
    return { type: u.type, body: u.body, source: url }
  })
  return r.body.length > 1024
}

async function resolveLatest(crs, layer, unit, maxBack) {
  const { value } = await cachedJson(`latest:${crs}:${layer}:${unit}`, TTL.latest, async () => {
    const today = new Date()
    for (let i = 1; i <= maxBack; i++) {
      let time
      if (unit === 'month') {
        const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1))
        time = iso(d)
      } else {
        time = iso(addDays(new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())), -i))
      }
      if (await hasData(crs, layer, time)) return { date: time }
    }
    throw new UpstreamError(`No recent data found for ${layer}`)
  })
  return value.date
}

async function resolveFrameDate(ds, frameKey, event) {
  const f = ds.frames[frameKey]
  const spec = f.date
  if (typeof spec === 'string') return spec
  if (spec.latest) return resolveLatest(ds.crs, f.layer, spec.latest, spec.maxBack ?? 8)
  if (spec.sameMonthAs) {
    const other = await resolveFrameDate(ds, spec.sameMonthAs, event)
    return `${spec.year}-${other.slice(5, 7)}-01`
  }
  if (spec.fromEvent) {
    if (!event?.date) throw new UpstreamError('This event has no dated position', 404)
    const eventDay = event.date.slice(0, 10)
    const today = iso(new Date())
    // Same-day VIIRS mosaics are still being assembled; use the previous full day.
    return eventDay >= today ? iso(addDays(new Date(`${today}T00:00:00Z`), -1)) : eventDay
  }
  throw new UpstreamError('Unknown date rule', 500)
}

function eventBox(ds, event) {
  const [w, h] = ds.span
  let lon = event.lon
  let lat = event.lat
  lat = Math.min(90 - h / 2, Math.max(-90 + h / 2, lat))
  lon = Math.min(180 - w / 2, Math.max(-180 + w / 2, lon))
  return [lon - w / 2, lat - h / 2, lon + w / 2, lat + h / 2]
}

function worldviewLink(ds, layer, date, bbox, overlay) {
  const layers = [overlay, layer].filter(Boolean).join(',')
  const p = new URLSearchParams({ l: layers, t: date })
  if (ds.crs === 'EPSG:3413') p.set('p', 'arctic')
  else p.set('v', bbox.map((v) => v.toFixed(2)).join(','))
  return `https://worldview.earthdata.nasa.gov/?${p.toString()}`
}

async function frameInfo(ds, frameKey, eventId) {
  const f = ds.frames[frameKey]
  if (!f) throw new UpstreamError(`Dataset ${ds.id} has no frame "${frameKey}"`, 400)
  let event = null
  let nearby = []
  if (ds.kind === 'event') {
    if (!eventId) throw new UpstreamError('Choose an event first', 400)
    const list = await eventList(ds)
    event = list.events.find((e) => e.id === eventId) ?? (await eventDetail(eventId, ds.category))
    if (!event) throw new UpstreamError(`Unknown EONET event ${eventId}`, 404)
  }
  const bbox = ds.kind === 'event' ? eventBox(ds, event) : ds.bbox
  const date = await resolveFrameDate(ds, frameKey, event)
  const q = (part) =>
    `/api/nasa/image?${new URLSearchParams({ dataset: ds.id, frame: frameKey, part, ...(eventId ? { event: eventId } : {}) })}`
  const format = f.format ?? 'image/png'
  const src = f.source ?? { crs: ds.crs, bbox, size: ds.size }
  const upstreamUrls = {
    data: wmsUrl({ crs: src.crs, layer: f.layer, bbox: src.bbox, size: src.size, format, time: date }),
  }
  const images = { data: q('data') }
  if (ds.base) {
    upstreamUrls.base = wmsUrl({ crs: ds.crs, layer: ds.base.layer, bbox, size: ds.size, format: ds.base.format })
    images.base = q('base')
  }
  if (f.overlay) {
    upstreamUrls.overlay = wmsUrl({ crs: ds.crs, layer: f.overlay.layer, bbox, size: ds.size, time: date })
    images.overlay = q('overlay')
  }
  if (ds.kind === 'event') {
    const list = await eventList(ds)
    nearby = list.events.filter(
      (e) => e.id !== event.id && e.lon >= bbox[0] && e.lon <= bbox[2] && e.lat >= bbox[1] && e.lat <= bbox[3],
    )
  }
  return {
    dataset: ds.id,
    frame: frameKey,
    crs: ds.crs,
    bbox,
    size: ds.size,
    date,
    layer: f.layer,
    title: f.title,
    instrument: f.instrument,
    colormap: f.colormap ?? null,
    source: f.source ? { crs: f.source.crs, bbox: f.source.bbox, size: f.source.size } : null,
    overlay: f.overlay ? { layer: f.overlay.layer, title: f.overlay.title } : null,
    base: ds.base ? { layer: ds.base.layer, title: ds.base.title } : null,
    images,
    upstream: upstreamUrls,
    worldview: f.source
      ? worldviewLink({ crs: f.source.crs }, f.layer, date, f.source.bbox, f.overlay?.layer)
      : worldviewLink(ds, f.layer, date, bbox, f.overlay?.layer),
    event,
    nearby: nearby.slice(0, 40),
  }
}

async function frameImage(ds, frameKey, part, eventId) {
  const info = await frameInfo(ds, frameKey, eventId)
  const url = info.upstream[part]
  if (!url) throw new UpstreamError(`No ${part} image for this frame`, 404)
  return cached(url, TTL.image, async () => {
    const u = await upstream(url, { expect: 'image', timeout: 60000 })
    return { type: u.type, body: u.body, source: url }
  })
}

// --------------------------------------------------------------------------
// colormaps
// --------------------------------------------------------------------------

const attr = (s, name) => {
  const m = new RegExp(`\\b${name}="([^"]*)"`).exec(s)
  return m ? m[1] : null
}

function parseColormap(xml) {
  const maps = []
  for (const block of xml.matchAll(/<ColorMap(?!s)\b([^>]*)>([\s\S]*?)<\/ColorMap>/g)) {
    const units = attr(block[1], 'units')
    const title = attr(block[1], 'title')
    const legend = new Map()
    for (const le of block[2].matchAll(/<LegendEntry\b([^>]*)\/>/g)) {
      legend.set(attr(le[1], 'id'), attr(le[1], 'tooltip'))
    }
    const entries = []
    for (const e of block[2].matchAll(/<ColorMapEntry\b([^>]*)\/>/g)) {
      const a = e[1]
      const rgb = (attr(a, 'rgb') ?? '0,0,0').split(',').map(Number)
      const raw = attr(a, 'value')
      let lo = null
      let hi = null
      let value = null
      if (raw && units) {
        const nums = raw.match(/-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?|INF/gi) ?? []
        const toNum = (t) => (/INF/i.test(t) ? null : Number(t))
        if ((raw.startsWith('[') || raw.startsWith('(')) && nums.length >= 2) {
          lo = toNum(nums[0])
          hi = toNum(nums[1])
          if (raw.includes('-INF')) lo = null
          value = lo !== null && hi !== null ? (lo + hi) / 2 : lo ?? hi
        } else if (nums.length) {
          value = toNum(nums[0])
          lo = hi = value
        }
      }
      entries.push({
        rgb,
        value,
        lo,
        hi,
        transparent: attr(a, 'transparent') === 'true',
        nodata: attr(a, 'nodata') === 'true',
        label: units ? null : legend.get(attr(a, 'ref')) ?? title,
      })
    }
    maps.push({ title, units, entries })
  }
  return maps
}

async function colormap(name) {
  if (!COLORMAPS.has(name)) throw new UpstreamError('Unknown colormap', 400)
  const url = `${COLORMAP_BASE}${name}.xml`
  return cachedJson(`colormap:v2:${url}`, TTL.colormap, async () => {
    const u = await upstream(url)
    return { name, url, maps: parseColormap(u.body.toString('utf8')) }
  })
}

// --------------------------------------------------------------------------
// EONET
// --------------------------------------------------------------------------

function centroid(geom) {
  if (geom.type === 'Point') return geom.coordinates
  const ring = geom.coordinates?.[0] ?? []
  if (!ring.length) return [null, null]
  const s = ring.reduce((a, p) => [a[0] + p[0], a[1] + p[1]], [0, 0])
  return [s[0] / ring.length, s[1] / ring.length]
}

function trimEvent(e, category) {
  const geoms = (e.geometry ?? []).filter(Boolean)
  const track = geoms
    .map((g) => {
      const [lon, lat] = centroid(g)
      return { date: g.date, lon, lat, magnitudeValue: g.magnitudeValue ?? null, magnitudeUnit: g.magnitudeUnit ?? null }
    })
    .filter((p) => Number.isFinite(p.lon) && Number.isFinite(p.lat))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
  const last = track[track.length - 1] ?? { date: null, lon: null, lat: null, magnitudeValue: null, magnitudeUnit: null }
  const out = {
    id: e.id,
    title: e.title,
    category,
    closed: e.closed ?? null,
    link: e.link ?? `https://eonet.gsfc.nasa.gov/api/v3/events/${e.id}`,
    sources: (e.sources ?? []).map((s) => ({ id: s.id, url: s.url })),
    date: last.date,
    lon: last.lon,
    lat: last.lat,
    magnitudeValue: last.magnitudeValue,
    magnitudeUnit: last.magnitudeUnit,
    track: track.slice(-60),
  }
  out.narration = eventNarration(out)
  return out
}

async function eventList(ds) {
  const { value } = await cachedJson(`events:${ds.category}:${ds.status ?? 'open'}:${ds.days ?? ''}`, TTL.events, async () => {
    const fetchList = async (status, days) => {
      const p = new URLSearchParams({ category: ds.category, status, limit: '500' })
      if (days) p.set('days', String(days))
      const url = `https://eonet.gsfc.nasa.gov/api/v3/events?${p}`
      const u = await upstream(url, { expect: 'json' })
      return { url, events: (u.json.events ?? []).map((e) => trimEvent(e, ds.category)).filter((e) => e.date) }
    }
    let scope = ds.status === 'all' ? `past ${ds.days} days` : 'open'
    let r = await fetchList(ds.status ?? 'open', ds.days)
    if (!r.events.length && (ds.status ?? 'open') === 'open') {
      r = await fetchList('all', 30)
      scope = 'past 30 days (none open)'
    }
    const events = r.events.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1
      return (b.magnitudeValue ?? 0) - (a.magnitudeValue ?? 0)
    })
    return { category: ds.category, scope, source: r.url, fetchedAt: new Date().toISOString(), total: events.length, events }
  })
  return value
}

async function eventDetail(id, category) {
  if (!/^EONET_\d+$/.test(id)) throw new UpstreamError('Invalid EONET id', 400)
  const { value } = await cachedJson(`event:${id}`, TTL.event, async () => {
    const u = await upstream(`https://eonet.gsfc.nasa.gov/api/v3/events/${id}`, { expect: 'json' })
    return trimEvent(u.json, category ?? u.json.categories?.[0]?.id ?? 'unknown')
  })
  return value
}

// --------------------------------------------------------------------------
// NASA Images & Video Library, SVS
// --------------------------------------------------------------------------

const stripHtml = (s = '') =>
  String(s)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;/g, '’')
    .replace(/\s+/g, ' ')
    .trim()

const clip = (s, n) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s)
const media = (u) => (u ? `/api/nasa/media?${new URLSearchParams({ u: String(u).replace(/^http:\/\//, 'https://') })}` : null)

async function library(q) {
  const query = String(q ?? '').trim().slice(0, 80)
  if (!query) throw new UpstreamError('Missing query', 400)
  return cachedJson(`library:${query.toLowerCase()}`, TTL.library, async () => {
    const url = `https://images-api.nasa.gov/search?${new URLSearchParams({ q: query, media_type: 'image', page_size: '20' })}`
    const u = await upstream(url, { expect: 'json' })
    const items = (u.json.collection?.items ?? [])
      .map((it) => {
        const d = it.data?.[0] ?? {}
        const preview = (it.links ?? []).find((l) => l.rel === 'preview')?.href ?? null
        return {
          nasaId: d.nasa_id,
          title: d.title,
          description: clip(stripHtml(d.description ?? d.description_508 ?? ''), 520),
          date: d.date_created ?? null,
          center: d.center ?? null,
          thumb: media(preview),
          details: `https://images.nasa.gov/details/${encodeURIComponent(d.nasa_id ?? '')}`,
        }
      })
      .filter((it) => it.nasaId && it.title && it.description.length > 40)
      .slice(0, 4)
    return { query, source: url, items }
  })
}

function firstImageUrl(obj) {
  if (!obj) return null
  if (typeof obj === 'string') return /\.(jpe?g|png|webp)(\?|$)/i.test(obj) ? obj : null
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const u = firstImageUrl(v)
      if (u) return u
    }
    return null
  }
  if (typeof obj === 'object') {
    for (const k of ['url', 'file', 'image', 'src']) {
      const u = firstImageUrl(obj[k])
      if (u) return u
    }
    for (const v of Object.values(obj)) {
      const u = firstImageUrl(v)
      if (u) return u
    }
  }
  return null
}

async function svs(id) {
  if (!/^\d{1,6}$/.test(String(id))) throw new UpstreamError('Invalid SVS id', 400)
  return cachedJson(`svs:v4:${id}`, TTL.svs, async () => {
    const url = `https://svs.gsfc.nasa.gov/api/${id}/`
    const u = await upstream(url, { expect: 'json' })
    const d = u.json
    const img = firstImageUrl(d.main_image) ?? firstImageUrl(d.media_groups)
    // SVS appends its media-file list to the description ("|| file.jpg (1024x576) …").
    const text = stripHtml(d.description ?? '')
      .split(/\s*\|\|\s*/)[0]
      .replace(/\s*(?:\d+K|HD|4K) version\.?$/i, '')
      .trim()
    const description = clip(text.length > 30 ? text : stripHtml(d.description ?? ''), 700)
    return {
      id: Number(id),
      title: d.title,
      description,
      fact: svsFact(d.title, description),
      released: d.release_date ?? null,
      url: `https://svs.gsfc.nasa.gov/${id}`,
      image: media(img),
      source: url,
    }
  })
}

/** A short, speakable line built only from SVS's own title and first sentences. */
function svsFact(title, description) {
  // Production notes ("rendered for hyperwalls", "burned in time stamps") are not science; skip them when spoken.
  const production = /\b(rendered|hyperwalls?|print media|time ?stamps?|burned in|resolution devices|frames? per second)\b/i
  const sentences = (description.replace(/…$/, '').match(/[^.!?]+[.!?]+/g) ?? [description])
    .map((s) => s.trim().replace(/,\s*\./g, '.').replace(/\s+,/g, ','))
    .filter((s) => !production.test(s))
  let body = ''
  for (const s of sentences) {
    if ((body + ' ' + s).length > 260) break
    body = body ? `${body} ${s}` : s
  }
  if (!body) body = sentences[0] ?? ''
  body = body.replace(/[\s,;:–-]+$/, '')
  if (body && !/[.!?]$/.test(body)) body += '.'
  return `From NASA’s Scientific Visualization Studio: ${title}. ${body}`.trim()
}

async function mediaBytes(u) {
  let url
  try {
    url = new URL(String(u))
  } catch {
    throw new UpstreamError('Invalid media URL', 400)
  }
  if (url.protocol !== 'https:' || !MEDIA_HOSTS.has(url.hostname)) throw new UpstreamError('Host not allowed', 400)
  return cached(url.toString(), TTL.media, async () => {
    const r = await upstream(url.toString(), { expect: 'image', timeout: 45000 })
    return { type: r.type, body: r.body, source: url.toString() }
  })
}

// --------------------------------------------------------------------------
// catalog
// --------------------------------------------------------------------------

async function catalog() {
  return cachedJson('catalog:v2', TTL.catalog, async () => {
    const datasets = await Promise.all(
      DATASETS.map(async (ds) => {
        const frames = {}
        let status = { ok: true, message: '' }
        let events = null
        try {
          if (ds.kind === 'event') {
            const list = await eventList(ds)
            events = { total: list.total, scope: list.scope, latest: list.events[0]?.date ?? null }
            if (!list.total) status = { ok: false, message: 'EONET lists no events right now' }
          }
          for (const key of Object.keys(ds.frames)) {
            const f = ds.frames[key]
            const date = ds.kind === 'event' ? null : await resolveFrameDate(ds, key, null)
            frames[key] = { layer: f.layer, title: f.title, instrument: f.instrument, date, colormap: f.colormap ?? null }
          }
        } catch (error) {
          status = { ok: false, message: error?.message ?? 'NASA service unavailable' }
        }
        return {
          id: ds.id,
          number: ds.number,
          theme: ds.theme,
          title: ds.title,
          subtitle: ds.subtitle,
          kind: ds.kind,
          category: ds.category ?? null,
          crs: ds.crs,
          bbox: ds.bbox ?? null,
          size: ds.size,
          value: ds.value,
          recolor: ds.recolor ?? null,
          timeMachine: ds.timeMachine ?? null,
          defaultFrame: ds.defaultFrame,
          sound: ds.sound,
          svs: ds.svs,
          library: ds.library,
          eventOverlay: ds.eventOverlay ?? null,
          note: ds.note,
          landmarks: ds.landmarks ?? [],
          frames,
          events,
          status,
        }
      }),
    )
    return { generatedAt: new Date().toISOString(), datasets }
  })
}

// --------------------------------------------------------------------------
// HTTP
// --------------------------------------------------------------------------

function send(res, status, type, body, headers = {}) {
  res.statusCode = status
  res.setHeader('Content-Type', type)
  res.setHeader('Content-Length', body.length)
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v)
  res.end(res.req?.method === 'HEAD' ? undefined : body)
}

const sendJson = (res, status, value, headers = {}) =>
  send(res, status, 'application/json; charset=utf-8', Buffer.from(JSON.stringify(value)), {
    'Cache-Control': 'no-cache',
    ...headers,
  })

function sendBytes(res, r, maxAge) {
  send(res, 200, r.type, r.body, {
    'Cache-Control': `public, max-age=${maxAge}`,
    'X-Cache': r.cache,
    'X-Upstream': r.source,
  })
}

export async function handleNasa(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const p = url.pathname
  const q = url.searchParams
  if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Method not allowed' })
  try {
    if (p === '/api/health') return sendJson(res, 200, { ok: true, service: 'algorhythm', time: new Date().toISOString() })
    if (p === '/api/nasa/datasets') {
      const r = await catalog()
      return sendJson(res, 200, r.value, { 'X-Cache': r.cache })
    }
    const dsFrom = () => {
      const ds = findDataset(q.get('dataset') ?? '')
      if (!ds) throw new UpstreamError('Unknown dataset', 404)
      return ds
    }
    if (p === '/api/nasa/frame-info') {
      const ds = dsFrom()
      return sendJson(res, 200, await frameInfo(ds, q.get('frame') ?? ds.defaultFrame, q.get('event')))
    }
    if (p === '/api/nasa/image') {
      const ds = dsFrom()
      const part = q.get('part') ?? 'data'
      if (!['data', 'base', 'overlay'].includes(part)) throw new UpstreamError('Invalid part', 400)
      return sendBytes(res, await frameImage(ds, q.get('frame') ?? ds.defaultFrame, part, q.get('event')), 86400)
    }
    if (p === '/api/nasa/colormap') {
      const r = await colormap(q.get('name') ?? '')
      return sendJson(res, 200, r.value, { 'X-Cache': r.cache })
    }
    if (p === '/api/nasa/events') {
      const ds = dsFrom()
      if (ds.kind !== 'event' && !ds.eventOverlay) throw new UpstreamError('This dataset has no events', 400)
      const target = ds.kind === 'event' ? ds : findDataset('storms')
      const list = await eventList(target)
      const limit = Math.min(80, Math.max(1, Number(q.get('limit') ?? 40) || 40))
      return sendJson(res, 200, { ...list, events: list.events.slice(0, limit) })
    }
    if (p === '/api/nasa/event') return sendJson(res, 200, await eventDetail(q.get('id') ?? ''))
    if (p === '/api/nasa/library') {
      const r = await library(q.get('q'))
      return sendJson(res, 200, r.value, { 'X-Cache': r.cache })
    }
    if (p === '/api/nasa/svs') {
      const r = await svs(q.get('id'))
      return sendJson(res, 200, r.value, { 'X-Cache': r.cache })
    }
    if (p === '/api/nasa/media') return sendBytes(res, await mediaBytes(q.get('u')), 7 * 86400)
    return sendJson(res, 404, { error: 'Unknown /api/nasa route' })
  } catch (error) {
    const status = error instanceof UpstreamError ? error.status : 500
    return sendJson(res, status, { error: error?.message ?? 'Unexpected error' })
  }
}

/** Connect-style middleware for Vite (dev and preview). */
export function nasaMiddleware() {
  return (req, res, next) => {
    const p = (req.url ?? '').split('?')[0]
    if (p === '/api/health' || p.startsWith('/api/nasa/')) {
      void handleNasa(req, res)
      return
    }
    next()
  }
}
