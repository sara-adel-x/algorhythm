# 3Sama — Build Plan

**Product:** an Earth Jukebox. Ten NASA Earth Information Center visualisations you can *hear*:
a spoken gist, a spatial sweep, a touch-explorable sound field, and a "what changed" mode —
built so a blind user can drive it with a keyboard and a screen reader, and so a sighted user
gets a second reading of the same data.

Working name: **3Sama (سماع السما)** — "the hearing of the sky".

---

## 1. Scope

### Must ship (v1, the demo path)
| # | Feature | Notes |
|---|---|---|
| M1 | Landing page with accessible entry | First DOM element is a skip link; no autoplay before a gesture |
| M2 | Start gate that unlocks `AudioContext` | Any key/click, plus a real focusable button |
| M3 | Narrated onboarding (30–45 s) teaching the gestures | Scripted text + `speechSynthesis`, pre-recorded audio as enhancement |
| M4 | Touch/keyboard explore: cursor → continuous sound | Core engine, smoothed, limited |
| M5 | Gist: spoken description + ambient signature | Text derived from NASA's own description |
| M6 | 10 curated EIC scenes bundled offline | All ten official resources |
| M7 | Accessible navigation: keyboard map, object list, ARIA live | Not a fallback bolted on — the primary path for screen readers |
| M8 | Method page: mapping table with reasons + citations | The "Validity" criterion |
| M9 | About / Judging / Data & Credits / Accessibility / Privacy pages | |
| M10 | Change Mode (2012 → 2023 night lights) | The signature feature |

### Should ship
| # | Feature |
|---|---|
| S1 | Sweep modes: horizontal, radar (clockwise), radial |
| S2 | Layer switch for multi-variable scenes (aerosol species, ocean current vs temperature) |
| S3 | Journeys: three narrated guided stories |
| S4 | Ask — preset questions first, optional `/api/ask` with a canned fallback |
| S5 | Presets: Calm / Precise / Minimal, plus speed and range |
| S6 | Blindfold mode (screen black, ripples only) + Reveal |
| S7 | Sound legend / calibration |
| S8 | Sound postcard: record 15 s, download |
| S9 | EN / AR UI with RTL |

### Could (only after freeze)
Webcam hand tracking · "Today's Sky" · GIBS live time-lapse · PWA install · haptics on Android Chrome · browser extension that turns any SVS page into a scene.

### Explicitly out
User accounts, any server-side storage of audio, any LLM in the explore runtime, any claim of clinical benefit, any "first/only" language.

---

## 2. Stages and gates

Each stage ends at a **gate**: I stop, list what exists and what is verified, and wait for your
confirmation before continuing. That keeps scope honest and keeps the demo always runnable.

### Stage 0 — Plan, repo, design direction  ✅ done (direction C)
- Repo, licence, README skeleton.
- Challenge text captured verbatim (`docs/challenge.md`).
- Asset pipeline step 1: ten EIC stills + official metadata fetched (`tools/fetch_svs.py`).
- **Three UI directions rendered as real pages** for you to choose from.
- **Gate:** you pick a direction (or a hybrid) and confirm the scene list.

### Stage 1 — Audio core (the part that must be right)  ← *you are here*
- Vite + TypeScript, no framework. Router, state, design tokens, EN/AR + RTL scaffolding.
- `audio/engine.ts`: persistent voices, `setTargetAtTime` smoothing, master bus → limiter, analyser.
- `audio/mappings.ts`: the pure functions (pitch, pan, gain, timbre, grain) + unit tests.
- Pointer + keyboard explore on one hard-coded grid.
- **Gate:** dragging produces smooth, bounded, non-fatiguing sound; tests pass; first-gesture unlock works on iOS Safari and Android Chrome.

### Stage 2 — Data pipeline and scenes
- `tools/analyze.py`: HSL grid, Sobel edge grid, connected-component objects, dark-region map.
- `tools/label.py`: labels proposed from NASA text, then hand-reviewed; every label records its source.
- `tools/package.py`: emits `public/scenes/*.json` + grids + images.
- Facts ledger generated from SVS descriptions and dataset lists.
- Scene loader, sampler, objects, Gist, three Sweep modes, layer switch, **Change Mode**.
- **Gate:** ten scenes load offline; every spoken fact resolves to a ledger entry with a NASA URL; no sweep exceeds four voices.

### Stage 3 — Experience and accessibility
- Landing, gate, onboarding, hub, scene screen, journeys, compare.
- Narrator with ducking and an `aria-live` transcript.
- Full keyboard map, object-list mode, settings, presets, blindfold mode.
- **Gate:** a complete run-through using only the keyboard, with the screen off, works; axe reports no critical issues; the landing page is usable by a screen reader.

### Stage 4 — Content, QA, submission
- Method / About / Judging / Accessibility / Data & Credits / Privacy.
- Service worker, offline test in airplane mode, performance pass.
- Validation tooling, README, demo script, 30 s video storyboard.
- **Gate:** deployed URL works offline for the demo path; no overclaiming; credits complete.

**Freeze rule:** after Stage 3 plus listening fixes, no new features — bugs only.

---

## 3. The sonification contract (frozen early, because everything depends on it)

| Image property | Sound property | Rule |
|---|---|---|
| x | stereo pan | `pan = 2x − 1` |
| y | pitch | log, 200 → 1600 Hz, top = high |
| luminance | loudness | `gain = 0.25 · L^1.4`, through the limiter |
| hue | timbre + filter | warm → low-passed saw; green → pluck; cyan → FM bell; violet → shimmer |
| local contrast | grain | smooth = smooth, busy = tremolo/granular |
| Sobel edge | short tick (+ optional 18 ms vibrate) | threshold ≈ 0.65 |
| near-black | near silence, 55 Hz sub-hum | space and ocean are quiet |

Global constraints: ≤ 4 voices, low-pass at 3.5 kHz, limiter at −12 dB / 20:1, fade-in on every
voice, default volume low, narration ducks the field by 6 dB.

Change Mode: play frame A, play frame B, then play **only the pixels whose sign flipped**, as a
third voice with its own timbre. For night lights that means "here is where light arrived, here
is where it left" — the emotional core of the demo.

---

## 4. Definition of done for the hackathon

- [ ] Live URL, works offline for the demo path
- [ ] Ten EIC scenes, every credit line and dataset shown on `/data`
- [ ] Keyboard-only demo rehearsed twice
- [ ] axe: no critical issues; one real screen-reader pass (NVDA or VoiceOver)
- [ ] Facts ledger complete; no fact spoken without a NASA source
- [ ] No "first", "only", "cure", "see" in any copy
- [ ] README with AI-use disclosure
- [ ] 30 s video + 3 min live script

## 5. Open questions for you

1. **Team identity** — names, roles, university, contact, GitHub org for the About page.
2. **Public repo now or after freeze?** Currently private.
3. **Arabic narration** — pre-recorded (better quality, more work) or `speechSynthesis` only (fragile voice availability)?
4. **Deadline** — the guidelines PDF and the research report disagree (13–14 vs 14–15 Nov). Confirm the real submission time so I can size the stages.
