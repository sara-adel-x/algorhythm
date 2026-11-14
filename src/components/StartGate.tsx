import { useEffect, useRef } from 'react'
import '../styles/landing.css'

interface Props {
  onBegin: (sceneId?: string, guided?: boolean) => void
  busy: boolean
  error?: string
  screenReaderMode: boolean
  onScreenReaderMode: () => void
}

const COLLECTION = [
  { id: 'm74', title: 'The Phantom Galaxy', kind: 'Spitzer · Infrared', note: 'Find the rhythm in a spiral of stars.', tag: '01 / Cosmos' },
  { id: 'pillars', title: 'Pillars of Creation', kind: 'Hubble · Near-infrared', note: 'Wander through a stellar nursery.', tag: '02 / Cosmos' },
  { id: 'irma', title: 'Inside the storm', kind: 'MODIS Terra · True colour', note: 'From a quiet eye to a wall of clouds.', tag: '03 / Earth' },
  { id: 'night', title: 'A planet after dark', kind: 'VIIRS · Black Marble', note: 'Follow the places we light up.', tag: '04 / Earth' },
  { id: 'amazon', title: 'A forest, changed', kind: 'Terra / ASTER · Before & after', note: 'Listen to a landscape become fields.', tag: '05 / Earth' },
]

export function Arrow({ diagonal = false }: { diagonal?: boolean }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">{diagonal ? <path d="M6 18 18 6M6 6h12v12" /> : <path d="M4 12h16m-6-6 6 6-6 6" />}</svg>
}

export function SoundMark() {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 10v4m4-7v10m5-15v20m5-15v10m4-7v4" /></svg>
}

/** Browsing and Tab never autoplay; an intentional entry gesture unlocks audio. */
export function StartGate({ onBegin, busy, error, screenReaderMode, onScreenReaderMode }: Props) {
  const beginRef = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (busy || e.ctrlKey || e.metaKey || e.altKey || e.repeat || e.key.length !== 1) return
      const target = e.target as HTMLElement
      if (target.closest('a, button, input, select, textarea, [contenteditable="true"]')) return
      if (e.key === ' ' || /^[a-z0-9]$/i.test(e.key)) { e.preventDefault(); onBegin() }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onBegin, busy])

  return (
    <div className="landing">
      <a className="skip" href="#landing-main">Skip to introduction</a>
      <header className="landing-nav">
        <a className="landing-brand" href="#landing-main" aria-label="AlgoRythm home"><span className="brand-mark" aria-hidden="true" /><span>Algo<i>Rythm</i><span className="brand-period">.</span></span></a>
        <nav aria-label="Introduction"><a href="#how-to-listen">How it works</a><a href="#collection">The collection</a><a href="#accessibility">Made for everyone</a></nav>
        <button className="landing-access" aria-pressed={screenReaderMode} onClick={onScreenReaderMode}><span className="access-dot" aria-hidden="true" />Screen reader {screenReaderMode ? 'on' : 'mode'}</button>
      </header>
      <main id="landing-main" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="landing-heading">
          <div className="hero-copy">
            <p className="landing-eyebrow"><span /> A listening experience, powered by NASA imagery</p>
            <h1 id="landing-heading">A universe<br />worth <em>listening</em><br />to.</h1>
            <p className="hero-description">Galaxies have structure. Storms have patterns. Our planet is changing. AlgoRythm turns their images into sound you can explore — one movement, one discovery at a time.</p>
            <p className="hero-audience">Designed with blind and low-vision listeners in mind.<br />An invitation to everyone.</p>
            <div className="hero-actions"><button ref={beginRef} className="landing-primary" onClick={() => onBegin()} disabled={busy}><SoundMark />{busy ? 'Preparing your soundscape…' : 'Begin listening'}<Arrow /></button><button className="landing-secondary" onClick={() => onBegin('irma', true)} disabled={busy}>Take a guided journey <Arrow diagonal /></button></div>
            <p className="hero-listening-note"><span className="headphone-icon" aria-hidden="true">◠</span>Headphones recommended. Start with your device volume low.</p>
            {error && <p className="entry-error" role="alert">{error} Please try Begin listening again.</p>}
          </div>
          <figure className="hero-observation">
            <div className="observation-topline"><span>FIELD NOTES / 001</span><span>THE PHANTOM GALAXY <Arrow diagonal /></span></div>
            <div className="galaxy-window"><div className="orbit orbit-outer" aria-hidden="true" /><div className="orbit orbit-inner" aria-hidden="true" /><img src="/scenes/m74/image.webp" alt="Spitzer's infrared image of M74: a glowing centre and pink spiral arms against dark space." fetchPriority="high" /><div className="observation-crosshair" aria-hidden="true"><i /><b /></div><span className="observation-callout" aria-hidden="true">01 — the galactic core<span>Brightness becomes fullness</span></span><span className="orbit-note" aria-hidden="true">LOOK CLOSER. LISTEN DIFFERENTLY.</span></div>
            <div className="observation-wave" aria-hidden="true">{Array.from({ length: 77 }, (_, i) => <i key={i} style={{ height: `${5 + Math.abs(Math.sin(i * .53) * Math.sin(i * .12)) * 30}px` }} />)}</div>
            <figcaption className="observation-caption"><span>M74 · NASA / JPL-Caltech / STScI</span><span>Image → sound</span></figcaption>
          </figure>
        </section>
        <div className="landing-principles" aria-label="Our approach"><p><span>01</span>Real NASA images.<em>Not imagined worlds.</em></p><p><span>02</span>Your movement, your music.<em>No two paths need be the same.</em></p><p><span>03</span>Another way to understand.<em>Not a replacement for image descriptions.</em></p></div>
        <section className="landing-method" id="how-to-listen" aria-labelledby="method-heading">
          <div className="section-intro"><p className="section-index">01 / The translation</p><h2 id="method-heading">Same image.<br /><em>Another sense.</em></h2><p>This is sonification: translating visual properties into musical ones. The sound is a designed interpretation of the image — not a recording from space.</p></div>
          <div className="method-steps">
            <article><span className="method-number">01</span><div><h3>Move to explore.</h3><p>Drag a finger or use the arrow keys. Up means higher notes; left and right move the sound around you.</p><p className="method-key"><kbd>← ↑ ↓ →</kbd> Move the listening point</p></div></article>
            <article><span className="method-number">02</span><div><h3>Let the image play.</h3><p>Bright regions sound fuller. Colour blends the voices. Boundaries add soft accents. Dark space gets quiet.</p><div className="method-swatches" aria-label="Four voices: warm, hollow, glass and shimmer"><span>Warm</span><span>Hollow</span><span>Glass</span><span>Shimmer</span></div></div></article>
            <article><span className="method-number">03</span><div><h3>Find a story inside it.</h3><p>Rest on a landmark to hear its narration, or let a guided journey take you through the whole scene.</p><p className="method-key"><kbd>H</kbd> Next landmark <kbd>Space</kbd> Guided journey</p></div></article>
          </div>
        </section>
        <section className="landing-collection" id="collection" aria-labelledby="collection-heading">
          <div className="collection-heading"><div><p className="section-index">02 / The collection</p><h2 id="collection-heading">Five scenes. <em>A new perspective.</em></h2></div><p>From deep space to the ground beneath us.<br />Choose where your listening begins.</p></div>
          <div className="collection-cards">{COLLECTION.map((item) => <button key={item.id} className="collection-card" disabled={busy} onClick={() => onBegin(item.id)} aria-label={`Listen to ${item.title}`}><span className="collection-photo"><img src={`/scenes/${item.id}/image.webp`} alt="" loading="lazy" /><span className="collection-go"><Arrow diagonal /></span>{item.id === 'amazon' && <span className="collection-badge">Time machine</span>}{item.id === 'irma' && <span className="collection-badge">Guided favourite</span>}</span><span className="collection-label">{item.tag}</span><span className="collection-title">{item.title}</span><span className="collection-note">{item.note}</span><span className="collection-source">{item.kind}</span></button>)}</div>
        </section>
        <section className="landing-accessibility" id="accessibility" aria-labelledby="access-heading">
          <div><p className="section-index">03 / An open invitation</p><h2 id="access-heading">The picture is only<br /><em>the beginning.</em></h2><p>Scientific imagery should invite more people in. Explore with a keyboard, a touch screen, narration or your own screen reader. Discover at your own pace.</p><button className="landing-primary access-primary" disabled={busy} onClick={() => onBegin()}>Find your first sound <Arrow /></button></div>
          <div className="access-features"><article><span>01</span><div><h3>Keyboard, first.</h3><p>Navigate scenes, landmarks and listening modes without a mouse. Press <kbd>?</kbd> inside the experience for the key map.</p></div></article><article><span>02</span><div><h3>Narration, your way.</h3><p>A warm voice guides you. Screen reader mode switches that voice off and keeps the written transcript available.</p><button className="access-setting" onClick={onScreenReaderMode} aria-pressed={screenReaderMode}>{screenReaderMode ? 'Screen reader mode is on' : 'Enable screen reader mode'} <Arrow /></button></div></article><article><span>03</span><div><h3>Listen before you look.</h3><p>Try Blindfold mode: the image disappears, the sound stays. Explore, then reveal it when you are ready.</p></div></article></div>
        </section>
      </main>
      <footer className="landing-footer"><a className="landing-brand" href="#landing-main">Algo<i>Rythm</i><span className="brand-period">.</span></a><p>Hear the planet. And a little beyond.</p><span>NASA Space Apps 2026 · The Earth Information Jukebox<br />Independent challenge project. Imagery credited to NASA and partners.</span><a href="https://github.com/sara-adel-x/algorhythm" target="_blank" rel="noreferrer">Project repository <Arrow diagonal /></a></footer>
    </div>
  )
}
