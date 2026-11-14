# Decision log

Newest first. Each entry: what we decided, the alternative, and why.

---

## D-12 · The name is AlgoRythm
**Decided.** The product is **AlgoRythm** everywhere: repo, wordmark, page titles, docs.
**Alternative.** "Earth Jukebox" (as the attached spec §12 asks), or 3Sama.
**Why.** You asked for AlgoRythm in the same message and it is the more recent instruction. The
wordmark sets the second R in moss green, so the algorithm/rhythm split reads on purpose rather
than as a typo. **If the spec line should win, say so and it is a one-command rename** — nothing in
the code depends on the name.

## D-11 · React + Tone.js, per the spec
**Decided.** Vite + React 19 + TypeScript, Tone.js for audio, Vercel for hosting.
**Alternative.** Vanilla TS + raw Web Audio (the earlier architecture document).
**Why.** The newer spec is explicit, and `Tone.Panner3D`, `Tone.Reverb` and the transport helpers
save a day of plumbing. The cost is bundle size (500 kB raw, 141 kB gzipped) — acceptable because
the demo path is cached by a service worker later.

## D-10 · Direction C, but the stage stays black
**Decided.** The paper-and-serif direction you chose, with the listening stage as a black plate.
**Alternative.** The spec's "dark cosmic theme" for the whole interface.
**Why.** Direction C was the explicit choice and it is what makes the project look unlike every
other hackathon entry. The stage carries the cosmic weight; the chrome stays calm and high-contrast,
which also helps low-vision users read the controls.

## D-09 · Landmarks are hand-authored, the detector only votes
**Decided.** `pipeline/meta/<id>.json` is the source of truth for hotspot position and text. The CV
proposal is stored beside it as `cv_agreement` (0–1) for provenance.
**Alternative.** Ship the detector's brightest blobs with generated labels.
**Why.** A wrong label on a NASA image is the fastest way to lose the Validity criterion. The
`cv_agreement` field also gives us an honest number to quote if a judge asks how the landmarks were
found.

## D-08 · Lightness is mean blended with the 75th percentile
**Decided.** Each 16×12 block stores `0.55 · mean + 0.45 · p75` for lightness, and `0.5/0.5` at the
80th percentile for edges.
**Alternative.** Plain block mean.
**Why.** Measured on M74: a spiral filament crossing a mostly-black block averaged to L 0.10, so the
listener heard near-silence on the brightest visible structure in the frame. With the blend the same
block reads 0.245 and the core reads 0.944. Documented in the pipeline, and it is the kind of detail
the Validity criterion is actually about.

## D-02 · Ten official scenes, no invented ones
**Decided.** The scene set *is* the ten visualisations named on the challenge's Resources tab,
plus Caldwell 73 as an in-app reference for NASA's own sonification.
**Alternative.** Curate our own list of striking Earth imagery.
**Why.** The judging criterion is relevance to *this* challenge. Using exactly the provided
resources removes any argument, and the resources tab already spans the range we need: point data
(lightning), continuous fields (currents, temperature), categorical layers (aerosols, forest
height), plumes (CO₂), and change over time (night lights).

## D-01 · Earth-first, not deep-space
**Decided.** The product is built on NASA Earth Information Center visualisations.
The layered/wavelength concept from the original architecture document survives as
**change over time** and **multi-variable layers**, not as visible-vs-infrared.
**Alternative.** Keep the original deep-space scene list (Pillars of Creation, Crab Nebula, …).
**Why.** The architecture document was written before the challenge was verified and assumed a
space-imagery challenge. The official statement is explicit: *“NASA's Earth Information Center
(EIC) produces stunning visualizations of our changing planet… build an ‘Earth Jukebox’.”*
A deep-space gallery would be off-brief on the Relevance criterion. The underlying idea — one
target, several layers, and a mode that plays only what differs — transfers cleanly and is
arguably stronger for Earth data, because “what changed between 2012 and 2023” is a real question
with a real answer in the pixels.

## D-03 · Fetch from the SVS API, not from the HTML pages
**Decided.** `tools/fetch_svs.py` reads `https://svs.gsfc.nasa.gov/api/<id>/`.
**Alternative.** Scrape the gallery page, or pull frames from the videos.
**Why.** The API returns the still, the official description, the alt text, the credit objects and
the dataset list in one request. That is our facts ledger, generated rather than transcribed, so
the “every claim has a NASA source” rule is enforced by construction.

## D-04 · Facts ledger is generated, not authored
**Decided.** `data/svs/manifest.json` (later `public/scenes/*.json`) is the only source of spoken
facts. Nothing is paraphrased by a human from memory.
**Why.** The validity criterion punishes confident-sounding claims without a source. If a sentence
cannot be traced to an SVS field, it does not ship.

## D-05 · Images and grids are bundled, never fetched at runtime
**Decided.** Precompute the analysis grid offline; ship the image and the grid as static files.
**Why.** Removes the CORS question entirely (`getImageData` on a cross-origin NASA asset host is
unreliable), keeps the demo working on weak venue Wi-Fi, and makes the analysis reproducible.

## D-06 · Three UI directions built as real pages, not pictures
**Decided.** `design/*.html` are hand-written, self-contained, responsive pages using the real NASA
stills and self-hosted fonts, rendered to PNG by `tools/shoot.py`.
**Why.** A mockup image hides layout problems. A real page at 430 px and 1440 px shows them, and
the chosen direction can be lifted into the app almost unchanged.

## D-07 · No framework
**Decided.** Vite + vanilla TypeScript, plain CSS custom properties.
**Alternative.** React, Svelte.
**Why.** The app is one audio graph, one canvas, one router and a dozen pages. A framework buys
little and costs bundle size, which matters for the offline demo. Also keeps the code readable for
a small team under time pressure.

## D-08 · Scripted narrator, not a generative one
**Decided.** All onboarding, journey and help narration is authored text, spoken through
`speechSynthesis`, with pre-recorded audio as an enhancement where time allows. An LLM may only
answer open-ended “Ask” questions, labelled as AI-assisted, with a canned fallback.
**Why.** Reliability on venue Wi-Fi, and accuracy: a generative narrator will eventually state a
fact that is not in the ledger.
