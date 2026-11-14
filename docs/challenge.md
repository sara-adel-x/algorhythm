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

## Official resources (Resources tab)

The official list points to the NASA Earth Information Center (EIC) and ten Scientific Visualization Studio (SVS) stories, including Caldwell 73 data sonification, sea surface currents and temperature (SVS 3912), GEOS aerosols, night lights and GEDI forest height. AlgoRythm uses SVS live, through `/api/nasa/svs`, for the official title, description, image and URL that accompany each dataset (for example SVS 3912 with sea surface temperature). The sound is never made from SVS stills. It comes from the underlying GIBS data layers, analysed pixel by pixel.

## Objective → feature map (the "Relevance" criterion)

| Official objective (paraphrased) | AlgoRythm feature | Where a judge sees it |
|---|---|---|
| Pair visual frames with **dynamic sonification generated in real time** | Live GIBS frames analysed in a Web Worker (colormap inversion, HSL, hue spectrum, Sobel edges on a 128-column grid). Tone.js voices follow the listening point continuously. | Any dataset: move the mouse or arrow keys |
| Let someone **select a visualization and experience its soundscape** | Seven live NASA datasets, keys 1–7, each with its own scale, timbres, room impulse response and ambience | Dataset selector |
| **Accessibility is a core theme** | Accessible start gate, recorded narrator with exact-text captions, `aria-live` region, screen-reader mode, Blindfold, keyboard-only control, legend, limiter | Gate, `?` help, Blindfold (B) |
| **Balance data translation with musicality** | Scale-quantised pitch, `180 × 18^L` Hz cutoff, four crossfaded timbres, real convolution reverb, ambient bed, −12 dB ducking under narration | Legend (L), How it works |
| **Analyse colour palettes / pixel density / shapes** | Official GIBS colormaps turn colours back into values. Hue spectrum, luminance, edge density and coverage are computed per frame and shown in the stats. | How it works panel |
| **Tell the story of the data / emotional impact** | Time Machine: Arctic sea ice 31 Aug 1984 → 31 Aug 2026 (measured −41 % extent) and MERRA-2 air temperature 1980 → latest | Sea ice or air temperature, press T |
| **Use live and current data** | EONET v3 open storms, wildfires and volcanoes, framed on VIIRS imagery from the event's date | Datasets 5–7 |
| **Document the process and the "why"** | README, `docs/live-data-notes.md` (verified endpoints, colormaps, measurements), in-app source links | Repository and app |
