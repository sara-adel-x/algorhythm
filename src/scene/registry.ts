import type { Scene } from './types'

/** The collection, in the order it appears in the rail. */
export const SCENE_IDS = ['m74', 'pillars', 'irma', 'night', 'amazon'] as const

const cache = new Map<string, Scene>()

export async function loadScene(id: string): Promise<Scene> {
  const hit = cache.get(id)
  if (hit) return hit
  const res = await fetch(`/scenes/${id}/scene.json`)
  if (!res.ok) throw new Error(`scene ${id}: HTTP ${res.status}`)
  const scene = (await res.json()) as Scene
  cache.set(id, scene)
  return scene
}

export function neighbour(id: string, step: number): string {
  const i = SCENE_IDS.indexOf(id as (typeof SCENE_IDS)[number])
  const n = (i + step + SCENE_IDS.length) % SCENE_IDS.length
  return SCENE_IDS[n]
}

export function sceneNumber(id: string): string {
  const i = SCENE_IDS.indexOf(id as (typeof SCENE_IDS)[number])
  return String(i + 1).padStart(2, '0')
}
