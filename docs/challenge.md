# Challenge: The Earth Information Jukebox

**Event:** 2026 NASA Space Apps Challenge · NASA Space Apps Cairo
**Challenge page:** https://www.spaceappschallenge.org/2026/challenges/the-earth-information-jukebox/
**Difficulty:** Intermediate / Beginner-Youth · **Subjects:** Arts & Multimedia, Earth Science, Software
**Text below is verbatim from the official page** (retrieved 2026-11-14).

---

## Official statement

> NASA's Earth Information Center (EIC) produces stunning visualizations of our changing planet, but presenting Earth science through visualization alone limits who can reach it. We invite you to make this complex Earth science accessible, engaging, and multi-sensory by translating sight into sound. Your challenge is to build an "Earth Jukebox"—an interface, script, or application that pairs EIC visual frames with dynamic sonifications generated in real time.

### Background (official)

> NASA's EIC provides extraordinary visualizations that track how our planet is changing, from shifting global temperatures to evolving oceanic currents. However, this vital information is predominantly presented in a visual format. This current landscape presents a significant gap: relying exclusively on sight limits accessibility for blind and low-vision users and constrains how the public can interact with complex Earth science.
>
> Sonification—the process of translating data into sound—offers a powerful way to bridge this gap. Converting visual elements into audio unlocks multi-sensory ways to experience Earth data. Auditory processing can reveal subtle data patterns that might be missed by the naked eye and can foster a deeper emotional connection to our home planet. Participants might prioritize creating an interactive environment where the translation from sight to sound is exploratory, blending scientific data with artistic expression.
>
> To do this, participants need a way to connect visual imagery with audio generation. You may consider building a "jukebox" interface or algorithm that analyzes EIC visual frames and plays a corresponding soundscape. Potential solutions could involve using computer vision to map color spectrums to musical chords, applying algorithms to translate pixel density into rhythm, or writing artistic rulesets that drive synthesizer parameters based on visual shapes. These are just examples, and we encourage you to develop your own creative alternatives that blend software development, data processing, and audio engineering.

### Objectives (official)

> Your challenge is to create an "Earth Jukebox" experience that generates dynamic sonifications from NASA's EIC visual frames. The desired outcome is a project where individuals can select or experience a specific EIC visualization alongside its corresponding soundscape. You may consider developing an interactive tool that actively translates the visual data into sound, or you may choose to submit a curated collection of original, generated audio files that tell the auditory story of the data.
>
> As you build your project, you may consider exploring a variety of methods and technologies to process the visual data. You might use computer vision techniques to analyze color palettes, shapes, or pixel densities in the EIC imagery, and map those elements to audio parameters like pitch, tempo, or instrumentation. You are welcome to employ machine learning algorithms, open-source audio synthesis frameworks, or custom data-driven artistic rulesets to generate the soundscapes. The exact method of translation is entirely up to you — we encourage you to aim for soundscapes that balance data interpretation with artistic, musically pleasing outputs.
>
> The final deliverable can take many forms to suit your team's skills. You may consider developing an interactive web-based jukebox, a standalone desktop application, a backend API endpoint, or an engaging playlist of original, generated audio files accompanied by an explanation of the creative process used to make them. Think about how your audience will experience the visual data and how your approach can best convey the complexity of our changing planet through sound. By blending software development, audio engineering, and artistic creativity, you can create a unique multi-sensory experience.

### Accessibility note from "Potential Considerations" (official)

> Accessibility is a core theme of this challenge. You could explore adding features that support blind and low-vision users, such as screen-reader compatibility, tactile feedback, or rich descriptive text accompanying your audio.

---

## Official resources (Resources tab, verbatim list)

| # | Resource | SVS id | Used in 3Sama as |
|---|---|---|---|
| 1 | Earth Information Center (EIC) Content Database | gallery | Source of all Earth scenes |
| 2 | Data Sonification: Caldwell 73 | 13786 | Prior-art reference; shown in *Method* page as the conceptual parent |
| 3 | Change in Night Lights 2012 → 2023 (EIC Version) | 5313 | Scene `night-lights` — **two-date pair → Change mode** |
| 4 | Global Sea Surface Currents and Temperature | 3912 | Scene `sea-currents` |
| 5 | GEOS Aerosols | 5669 | Scene `geos-aerosols` — **multi-species layers** |
| 6 | Air Quality Model Runs | 5533 | Scene `air-quality` |
| 7 | Perpetual Ocean 2: Western Boundary Currents | 5425 | Scene `perpetual-ocean` |
| 8 | DYAMOND Global Carbon Dioxide | 5196 | Scene `dyamond-co2` |
| 9 | Lightning Events Detected from ISS 2017–2023 | 5011 | Scene `iss-lightning` — percussive mode |
| 10 | A 3D View of an Atmospheric River | 4960 | Scene `atmospheric-river` |
| 11 | GEDI Forest Height | 4950 | Scene `gedi-forest-height` |

All ten Earth visualisations are fetched by `tools/fetch_svs.py` from `https://svs.gsfc.nasa.gov/api/<id>/`, which gives us the still frame, the official description, the alt text, the credit line and the dataset list — i.e. our facts ledger writes itself from NASA text.

---

## Objective → feature map (the "Relevance" criterion)

| Official objective (paraphrased) | 3Sama feature | Where a judge sees it |
|---|---|---|
| Pair EIC visual frames with **dynamic sonification generated in real time** | `SceneEngine` samples a precomputed 32×24 HSL + edge grid at pointer position; `AudioEngine` maps it to pitch/pan/brightness/timbre continuously in the browser. No audio files are played back for the mapping. | `/scene/:id` — drag anywhere |
| Let someone **select a visualization and experience its soundscape** | Jukebox hub: ten EIC tracks, each with a Gist, a Sweep and a Touch mode | `/hub` |
| **Accessibility is a core theme** | Narrator, object-list fallback, keyboard-only path, blindfold mode, ARIA live regions, hearing-safety limiter | `/accessibility`, live demo |
| **Balance data translation with musicality** | Continuous log pitch + optional C-major pentatonic snap, ≤4 concurrent voices, low-pass ceiling, reverb bus, limiter | `/method` |
| **Analyse colour palettes / pixel density / shapes** | Offline OpenCV pipeline: HSL grid, Sobel edge grid, connected-component objects with hand-reviewed labels from NASA text | `tools/analyze.py`, `/method` |
| **Tell the story of the data / emotional impact** | *Change Mode* — hear the 2012 frame, then the 2023 frame, then only what changed | `/scene/night-lights` → Change |
| **Document the process and the "why"** | `/method` (mapping table + citations), `/about`, README, `docs/decisions.md` | site + repo |

## What this means for the original spec

The architecture document was written before the challenge was verified and assumed a **deep-space** image set (Pillars of Creation, Crab Nebula, …). The official challenge is **Earth-first**. Decision: the product is Earth-first; the deep-space layer concept survives as the **multi-layer / change** mechanic, which is a *better* fit for EIC data (same target, different variable or different year). See `docs/decisions.md` D-01.
