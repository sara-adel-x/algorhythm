# AlgoRythm — current implementation plan

The approved product is the NASA-image sonification experience described in EARTH_JUKEBOX_SPEC.md, with the user's later choices taking priority: **AlgoRythm** is the name; **C / Sound Garden** is the design; retain the existing five real NASA scenes and feature set. The current request is to continue and make the first page more clearly outlined. Do not restart concept selection or add live dependencies.

## This increment

Turn the minimal audio gate into a complete editorial introduction. Its hierarchy is navigation, purpose-led headline and authentic NASA visual, a short accessibility proposition, a three-part visual-to-audio explanation, the existing collection with direct scene entry, and practical listening guidance. A prominent Begin listening action starts the real experience. A guided-tour entry opens Irma in Journey mode. Visitors can browse first without accidental autoplay; screen-reader mode is available before narration starts. Support returning home and preserve user settings.

Keep warm ivory, moss green, Newsreader/Inter/IBM Plex Mono, fine rules, numbered captions and restrained motion. Use actual existing NASA imagery, not generated space art or decorative data claims. All controls must work, have visible focus, and respect reduced motion. No claim that output volume is medically safe or calibrated to a conversation; recommend starting at low device volume.

At the same time, fix confirmed behavior defects in this path: automatic narration before entry, double-triggered keyboard controls, stale narration timers, Journey selector not starting its tour, uncancelled legend/narrator playback, and Time Machine using the full pair as its first frame rather than the actual earlier crop.

## Structure and serving

- `src/components/StartGate.tsx`: accessible introductory page, scene entry controls and first-gesture instructions.
- `src/styles/landing.css`: dedicated editorial landing layout and responsive behavior.
- `src/App.tsx`: home/listening state, first-gesture startup, Journey state, keyboard control and mode transitions.
- `src/audio/`: reusable Tone.js engine, mapping and narration; cancellation, safe limiting and ducking.
- `src/scene/`: baked scene metadata and registry; no live NASA calls in the demo.
- `public/scenes/`: original five scene packages and their prebaked narration; NASA credits remain visible.
- `pipeline/`: offline building and focused regression checks.

Vite/React/TypeScript stays the stack. Manus-managed Preview hosts the same static frontend with no backend or database; the existing user's GitHub repository remains a preserved separate copy. Export remains a standard Vite static build suitable for Vercel. Publishing is separate from saving a Preview checkpoint.

## Remaining broader scope (not claimed complete)

Real-device iOS/VoiceOver and NVDA testing; complete Arctic sea-ice numeric-data story instead of the current image-based Mato Grosso comparison; reach the 6–8 polished-scene target; offline caching; optional NASA live bonus; submission video or slides. Keep these for separately reviewed increments.
