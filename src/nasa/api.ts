import type { Catalog, Colormap, EventList, FrameInfo, LibraryItem, SvsItem } from './types'

/** All NASA traffic goes through our own origin: never CORS, never a tainted canvas. */
async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal })
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    /* fall through */
  }
  if (!res.ok) {
    const message = (body as { error?: string } | null)?.error ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return body as T
}

const memo = new Map<string, Promise<unknown>>()
function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = memo.get(key) as Promise<T> | undefined
  if (hit) return hit
  const p = load().catch((e) => {
    memo.delete(key)
    throw e
  })
  memo.set(key, p)
  return p
}

export const nasa = {
  catalog: () => once('catalog', () => getJson<Catalog>('/api/nasa/datasets')),
  frameInfo: (dataset: string, frame: string, event?: string | null) =>
    once(`frame:${dataset}:${frame}:${event ?? ''}`, () =>
      getJson<FrameInfo>(`/api/nasa/frame-info?${new URLSearchParams({ dataset, frame, ...(event ? { event } : {}) })}`),
    ),
  colormap: (name: string) => once(`cmap:${name}`, () => getJson<Colormap>(`/api/nasa/colormap?name=${encodeURIComponent(name)}`)),
  events: (dataset: string, limit = 40) =>
    getJson<EventList>(`/api/nasa/events?${new URLSearchParams({ dataset, limit: String(limit) })}`),
  library: (q: string) =>
    once(`lib:${q}`, () => getJson<{ query: string; source: string; items: LibraryItem[] }>(`/api/nasa/library?q=${encodeURIComponent(q)}`)),
  svs: (id: number) => once(`svs:${id}`, () => getJson<SvsItem>(`/api/nasa/svs?id=${id}`)),
}
