# AlgoRythm

**Hear the planet.** NASA imagery, read out loud.

Built for the 2026 NASA Space Apps Challenge — [The Earth Information Jukebox](https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/).

> **Status: Step 1 of the build order — scaffold + audio engine on one scene (M74).**
> The sound is the thing being judged here; nothing else is finished on purpose.
> See `docs/plan.md` for the step gates and `docs/build-order.md` for the mapping to the spec.

---

## What it does

Every picture in this project is a real NASA image. AlgoRythm reads it out loud:

| Image | Sound |
|---|---|
| vertical position | pitch, quantised to the scene's scale |
| horizontal position | stereo / 3D position |
| brightness | loudness and filter cutoff |
| hue | which of four fixed timbres is blended in |
| edge strength | a short soft accent |
| near-black | near silence — only the drone |

Move a finger across the picture, or the arrow keys, and the sound follows. The point is not to
turn pixels into beeps: it is to make the *structure* of an image audible — where the bright
things are, how they are arranged, and which parts are empty.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # type-check + production build
```

Python 3 with `numpy` and `pillow` is needed only to rebuild scenes:

```bash
python3 pipeline/build_scene.py \
  --image pipeline/source/m74.jpg \
  --meta  pipeline/meta/m74.json \
  --id    m74 \
  --out   public/scenes/m74
```

## How it is put together

```
pipeline/                 offline, Python
  fetch_svs.py            pull NASA SVS / EIC visualisations + official metadata
  build_scene.py          image → 16×12 grid (hue, saturation, lightness, edge) → scene.json
  meta/m74.json           hand-authored title, credit, sound design, landmarks, facts
  source/m74.jpg          the original NASA frame

public/scenes/m74/        what the browser loads
  image.webp              1600 px, self-hosted, no CORS questions
  scene.json              192 cells + hotspots + credits

src/
  audio/engine.ts         the whole audio graph: 4 fixed voices, drone, accents, reverb, limiter
  audio/mapping.ts        the sonification contract as pure functions
  audio/scales.ts         note maths, no Tone.js import, so it can be tested alone
  components/             start gate, stage with ripples, waveform, help
  App.tsx                 state, keyboard map, narration with ducking
```

### The audio graph

```
drone ─────────────┐
4 fixed lead voices ┼─► lowpass ─► Panner3D ─► duck ─┬─► compressor ─► limiter(−3 dB) ─► out
accent bell ───────┘                                 └─► reverb send ─► compressor
```

Rules the engine enforces:

- **Four fixed timbres, crossfaded by hue.** The oscillator type is never changed while playing,
  because that clicks. At most two voices are audible at any moment.
- **Pitch is always in the scene's scale**, reached by portamento — the mapping cannot produce a
  sour note.
- **Every parameter moves with a ramp** (60–120 ms), never a jump.
- **The limiter is always last**, master starts at a conversation, not a concert.
- **Narration ducks the music** by roughly 12 dB while it speaks.

## Data

Scene 1 is **M74**, the Phantom Galaxy, from NASA's Spitzer Space Telescope —
NASA/JPL-Caltech/STScI, image `PIA08533`, released 2006-06-09.
Source: <https://images.nasa.gov/details/PIA08533>

The ten Earth Information Center visualisations named on the challenge's resources tab are already
fetched into `data/svs/` and will become the rest of the collection.

## Keyboard

`↑↓←→` move · `Shift` + arrow jumps four cells · `H` next landmark · `Enter` describe this point ·
`Space` play/pause · `M` mute · `?` keys · `Esc` close.

## Credits and prior art

NASA Scientific Visualization Studio / Earth Information Center, NASA/JPL-Caltech/STScI.
Prior art credited: NASA's own sonifications (including the Caldwell 73 example linked by the
challenge), Chandra's *A Universe of Sound*, STScI's Astronify, STRAUSS, herakoi, vOICe, EyeMusic,
SoundSight. AlgoRythm does not claim to be the first anything.

## Licence

Code: MIT. NASA imagery remains the property of NASA and its partners, used under their media
guidelines with credit lines retained.
