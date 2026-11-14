export const WELCOME: string
export const DATASET_INTROS: Record<string, string>
export const VOLCANO_INTRO_OPEN: string
export function datasetIntro(id: string, eventScope?: string | null): string | undefined
export const TIME_MACHINE_INTRO: Record<string, string>
export const BLINDFOLD: string
export const NO_TIME_MACHINE: string
export function spokenDate(iso: string | null | undefined): string
export function spokenMonth(iso: string): string
export function spokenLat(lat: number): string
export function spokenLon(lon: number): string
export function eventNarration(e: {
  title: string
  category: string
  date: string | null
  lat: number | null
  lon: number | null
  closed: string | null
  magnitudeValue: number | null
  magnitudeUnit: string | null
  sources: { id: string }[]
}): string
export function iceSummary(thenDate: string, nowDate: string, thenExtent: number, nowExtent: number): string
export function temperatureSummary(thenDate: string, nowDate: string, thenMeanC: number, nowMeanC: number): string
