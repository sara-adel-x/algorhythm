# AlgoRythm — realignment to the 2026 Earth Information Jukebox challenge

The user's 14 Nov instruction supersedes the earlier "static scenes, no live dependency" plan. AlgoRythm (name kept) becomes a live NASA Earth-data jukebox. **Stop after this increment for user review.**

## Required in this increment

1. **Home page without photography.** A clean dark UI; the first thing is an accessible full-screen Start button ("Enter the Earth Jukebox") that runs `Tone.start()` inside the gesture and plays the pre-recorded keyboard onboarding (aria-live transcript). Then a selector of real NASA Earth datasets. No galaxy/space or stock images anywhere; deep-space scenes (M74, Pillars) and the static scene.json packages are removed.
2. **`/api/nasa` proxy with local caching** (same origin → no CORS, canvases never tainted). Whitelisted routes only:
   - `datasets` – catalog with resolved latest dates (probes GIBS; an empty day is a ~207-byte transparent PNG).
   - `frame-info` / `image` – NASA GIBS WMS GetMap for catalog layers only (EPSG:3413 Arctic, EPSG:4326 global, event-centred boxes derived server-side from EONET coordinates).
   - `colormap` – official GIBS v1.3 colormap XML parsed to JSON.
   - `events` / `event` – NASA EONET v3 (severeStorms, wildfires, volcanoes) trimmed, with narration text.
   - `library` – NASA Images & Video Library search; `svs` – SVS (EIC visualisation) metadata; `media` – image bytes from images-assets.nasa.gov / svs.gsfc.nasa.gov only.
   - Memory + disk cache (`.cache/nasa`), per-route TTL, in-flight de-duplication, stale-on-error, `x-cache` header.
3. **Real-time pixel analysis → Tone.js.** Every frame is fetched through the proxy, drawn to an OffscreenCanvas in a Web Worker (main-thread fallback) and analysed: RGB, HSL, Rec.709 luma, saturation-weighted hue spectrum, Sobel gradient magnitude, coverage, and — for colour-coded data layers — the measured value recovered per pixel by inverting NASA's published colormap. A feature grid (~128 cells wide) is sampled bilinearly under the cursor. Mapping: y → scale-quantised pitch; x → HRTF pan; intensity L → lowpass `180·18^L` Hz and gain; hue spectrum → crossfade of four fixed timbres; Sobel edges → soft percussive accents; no data/dark → near silence; whole-frame statistics → drone partials (harmonic sculpting), noise bed, scale.
   - Intensity is pixel luma for true-colour imagery; for colour-coded layers it is the decoded value normalised to the layer range (on those maps colour, not brightness, carries the number). Both are shown.
4. **Time Machine** with two real dated frames: Arctic sea ice 31 Aug 1984 (Nimbus-7 SMMR, GIBS `SSMIS_Sea_Ice_Concentration`) vs 31 Aug 2026 (GHRSST MUR L4 sea-ice field, `GHRSST_L4_MUR_Sea_Ice_Concentration`, fetched on the global grid and reprojected in the browser onto the same polar grid); both decoded and re-coloured with one key so the sound hears ice, not a palette change. Extent (≥15 %, polar-stereographic area-corrected, pole hole counted as ice) is computed in the browser; the audio morph (cell features, drone level/brightness, open-water noise) follows the real difference. Also MERRA-2 2 m air temperature, same month 1980 vs latest, cos-latitude-weighted mean.
5. **Audio resources.** Convolution reverb with real Voxengo impulse responses (royalty-free), pink-noise bed and additive drone sculpted from frame statistics. Pre-generated MP3 narration for onboarding, dataset facts, the EONET events open at bake time and the Time Machine results; played only when the clip text equals the live text. No SpeechSynthesis fallback — otherwise the text goes to the aria-live region and transcript only. Music ducks −12 dB while narration plays.

## Datasets (selector order)
1 Arctic sea ice (Time Machine) · 2 Global air temperature (Time Machine) · 3 Sea surface temperature & currents · 4 Precipitation (IMERG) · 5 Severe storms (EONET + VIIRS true colour) · 6 Wildfires (EONET + VIIRS thermal anomalies) · 7 Volcanoes (EONET). Each shows live NASA Images and SVS context and source links.

## Structure
- `server/catalog.mjs` dataset definitions; `server/nasa.mjs` proxy + cache (Node built-ins only); `server/index.mjs` production server (static `dist` optional, `/api/*`); `shared/narration.mjs` narration templates shared by server, client and bake script.
- `vite.config.ts` mounts the same middleware in dev/preview.
- `src/nasa/` API client + types; `src/analysis/` analyzer (pure), worker, colormap decode, projections, metrics; `src/audio/` engine, mapping, scales, narrator, narration manifest; `src/app/useJukebox.ts` controller; `src/app/model.ts` ambience rules, landmarks, value text, Time Machine sweep; `src/components/` Gate, DatasetSelector, Stage, ListenPanel, Overlays, Visualizer; `src/styles/theme.css` dark theme. `server/` proxy (`nasa.mjs`), catalog, production server; `shared/narration.mjs` texts used by proxy, browser and the narration bake script.
- `public/ir/` impulse responses; `public/narration/` MP3s + `manifest.json`; `pipeline/bake_narration.mjs` lists texts to record.

## Design (user override of the earlier ivory direction)
Dark, quiet "night-side Earth" interface: near-black blue (#05070d → #0c1222), soft ink #e6ebf5, one ownable aurora-green signature (#6ee7b7) plus data accents ice-blue and ember; Newsreader headlines, Inter UI, IBM Plex Mono for live numbers. No imagery on the home page; the only pictures in the app are the NASA frames being sonified. Large targets, visible focus rings, reduced-motion respected.

## Serving
Manus Preview runs Vite with the proxy middleware. Publishing: static `dist` + container (`server/index.mjs`) for `/api/*` (server feature, Dockerfile, `/api/health`). Not published in this increment.
