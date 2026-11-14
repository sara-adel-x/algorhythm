# Build order and current state

Mapped to §14 of the project spec. Each step stops for approval.

| # | Step | State |
|---|---|---|
| 1 | Scaffold + audio engine on one scene (M74) | **done — awaiting your ear** |
| 2 | Pipeline + `scene.json` + 2–3 more scenes | pipeline written, one scene built |
| 3 | Keyboard navigation + ARIA + start screen / onboarding | keyboard map and start gate done, ARIA in progress |
| 4 | Narrator (scripts, TTS files, ducking) + Journey mode | ducking done with browser voice, no MP3s yet |
| 5 | Time Machine (Arctic ice, real data) | not started |
| 6 | Blindfold mode + Sound Legend | not started |
| 7 | Remaining scenes + NASA live bonus | not started |
| 8 | Polish, iOS testing, "How it sounds", docs, video | not started |

Minimum winning set if time runs short: 1 + 3 + 4 + 6 with two scenes.

## What step 1 actually contains

- Vite + React 19 + TypeScript, no CSS framework.
- `src/audio/engine.ts`: four fixed lead voices (warm saw, hollow triangle, FM glass, sine shimmer)
  crossfaded by hue; a two-oscillator drone with a slow LFO on its filter; an FM accent bell; a
  7 s convolution reverb; a compressor and a −3 dB limiter. HRTF `Panner3D` with stereo fallback.
- `src/audio/mapping.ts`: the sonification contract as pure functions —
  `pitchIndex`, `panFor`, `gainFor`, `cutoffFor`, `hueWeights`, `accentFor`, `cellAt`.
- `src/audio/scales.ts`: note maths with no Tone.js import, so it can be unit-tested alone.
- `pipeline/build_scene.py`: image → 16×12 grid. Lightness and edge use mean blended with the 75th
  percentile, because a plain mean erases a thin filament into the black around it and the listener
  hears silence exactly where the picture is brightest.
- `pipeline/meta/m74.json`: hand-authored title, credit, sound design, four landmarks with text,
  and a `sourced` flag on each (`nasa` for NASA's own sentence, `image` for what is visible in the
  frame). This is the "AI suggests, human verifies" rule made concrete: the CV proposes candidate
  positions, the human list is authoritative, and each entry records how much the detector agreed.
- Start gate, explore stage with ripples, live readout, landmark list, help dialog, keyboard map,
  `aria-live` narration transcript, narration ducking.
- Verified in a real browser: 0 console errors, no horizontal overflow at 390 / 430 / 1024 / 1440 px,
  and measured output levels that follow brightness (bright core ≈ −37 dBFS, black space ≈ −45 dBFS).

## Known gaps at this gate

- No pre-generated narration MP3s yet (browser voice stands in).
- No journey, time machine, blindfold or sound legend — the buttons are visible but disabled.
- No unit tests yet for the mapping functions.
- Only one scene, and it is a deep-space one. The Earth scenes from the challenge's resource list
  are fetched and analysed but not yet in the gallery.
