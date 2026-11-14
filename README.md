# 3Sama · سماع السما

**An Earth Jukebox.** Ten visualisations from NASA's Earth Information Center, turned into
sound you can move through — built for the 2026 NASA Space Apps Challenge.

> The challenge: *“build an ‘Earth Jukebox’ — an interface, script, or application that pairs EIC
> visual frames with dynamic sonifications generated in real time.”*
> — [The Earth Information Jukebox](https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/)

**Status: Stage 0 — plan, repository, data pipeline and three UI directions.**
Nothing in this repo plays audio yet; see `docs/plan.md` for the stage gates.

---

## What it is

Most Earth-science communication is a picture. A picture excludes anyone who cannot see it, and
even for those who can, it flattens a dataset into one frozen moment. 3Sama reads the picture
out loud instead:

- **Gist** — a short spoken description, taken from NASA's own text for that visualisation.
- **Sweep** — the frame plays left to right, or clockwise, or outward from the centre, one object
  voice at a time. Four voices maximum, ever.
- **Touch explore** — drag a finger or arrow-key cursor across the frame. Pitch is latitude,
  stereo is longitude, loudness is brightness, timbre is colour.
- **Change mode** — for the night-lights visualisation: hear 2012, hear 2023, then hear *only the
  pixels whose sign flipped*. What arrived, and what left.

The same ten scenes are the whole product. No accounts, no uploads, no model in the playback path.

## Why sound, and why this is not only for blind users

- Most Earth-science imagery is **already an encoding**: colour ramps stand in for temperature,
  concentration, or height. Reading it as sound is not a downgrade, it is a second reading.
- Alt text gives one flat sentence. It cannot carry layout, scale, density, or change over time.
- Change mode lets anyone *hear* the difference between two years, which a side-by-side image
  comparison makes surprisingly hard.

Wording rule for this project: **equal access**, never “helping the blind”, never “first”, never
“only”. Prior art is credited on the site and below.

## Repository layout

```
3sama/
├─ docs/
│  ├─ challenge.md      official challenge text (verbatim) + objective → feature map
│  ├─ plan.md           scope, stage gates, sonification contract
│  └─ decisions.md      decision log
├─ design/              three UI directions, rendered as real pages
│  ├─ a-jukebox.html    warm, tactile, record-store
│  ├─ b-observatory.html instrument panel, telemetry
│  ├─ c-garden.html     editorial, light, calm
│  ├─ assets/           NASA stills + self-hosted webfonts
│  └─ shots/            desktop / mobile renders
├─ tools/
│  ├─ fetch_svs.py      pull the ten EIC visualisations + official metadata
│  ├─ fetch_fonts.py    self-host the webfonts (no CDN at runtime)
│  └─ shoot.py          render the design directions to PNG
└─ data/svs/            fetched manifest + stills
```

## Run it

```bash
git clone https://github.com/sara-adel-x/3sama && cd 3sama
python3 tools/fetch_svs.py --out data/svs      # 10 stills + metadata from svs.gsfc.nasa.gov
python3 tools/fetch_fonts.py                   # optional, fonts are already committed
open design/a-jukebox.html                     # the design directions are plain HTML
```

No build step yet. The application scaffold (Vite + TypeScript) lands in Stage 1.

## Data

Every scene comes from the ten visualisations named on the challenge's Resources tab, fetched from
the NASA Scientific Visualization Studio API. We keep the still, the official description, the alt
text, the credit line and the dataset list, so that no sentence in the product is unsourced.

| Scene | SVS | Why it is in the set |
|---|---|---|
| Change in Night Lights 2012 → 2023 | [5313](https://svs.gsfc.nasa.gov/5313/) | high contrast; two dates → Change mode |
| Global Sea Surface Currents and Temperature | [3912](https://svs.gsfc.nasa.gov/3912/) | continuous field, strong colour structure |
| GEOS Aerosols | [5669](https://svs.gsfc.nasa.gov/5669/) | several species → layer switching |
| GEDI Forest Height | [4950](https://svs.gsfc.nasa.gov/4950/) | categorical colour ramp |
| DYAMOND Global Carbon Dioxide | [5196](https://svs.gsfc.nasa.gov/5196/) | plumes, motion |
| Lightning Events from the ISS 2017–2023 | [5011](https://svs.gsfc.nasa.gov/5011/) | punctate → percussive mode |
| A 3D View of an Atmospheric River | [4960](https://svs.gsfc.nasa.gov/4960/) | depth |
| Perpetual Ocean 2: Western Boundary Currents | [5425](https://svs.gsfc.nasa.gov/5425/) | high-contrast flow |
| Air Quality Model Runs | [5533](https://svs.gsfc.nasa.gov/5533/) | gridded model output |
| Data Sonification: Caldwell 73 | [13786](https://svs.gsfc.nasa.gov/13786/) | NASA's own sonification, kept as a reference |

Visualisations: NASA Scientific Visualization Studio / Earth Information Center. Per-scene credit
lines and dataset names are shown in the app and listed on the Data & credits page.

## Prior art

NASA's own sonification work (including the Caldwell 73 example linked by the challenge), Chandra's
*A Universe of Sound*, STScI's Astronify, STRAUSS, herakoi, vOICe, EyeMusic and SoundSight. 3Sama
does not claim to be the first anything; what it adds is scene-level structure, an explicit
change-over-time mode, and a keyboard-first path in a free web app.

## AI use disclosure

Placeholder until the official 2026 wording is confirmed. Current position: AI tools are used
during development and documentation only. The playback path — pixel analysis, mapping, synthesis —
is deterministic and contains no model. Any AI-assisted answer in the “Ask” feature is labelled as
such in the interface.

## Licence

Code: MIT. NASA imagery and visualisations remain the property of NASA and its partners, used under
their media guidelines with credit lines retained. See `LICENSE` and the Data & credits page.
