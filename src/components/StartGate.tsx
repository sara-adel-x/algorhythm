import { useEffect, useRef } from 'react'

interface Props {
  onBegin: () => void
  sceneTitle?: string
  busy: boolean
}

/**
 * The only screen that may exist before a gesture: browsers will not let us
 * make a sound until the user acts. Any key, any tap, or the button starts it.
 */
export function StartGate({ onBegin, sceneTitle, busy }: Props) {
  const ref = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      onBegin()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBegin])

  return (
    <div className="gate">
      <div className="gate-inner">
        <p className="gate-eyebrow">NASA Space Apps 2026 · The Earth Information Jukebox</p>

        <h1 className="gate-title">
          Algo<span>Rythm</span>
        </h1>
        <p className="gate-sub">Hear the planet.</p>

        <p className="gate-body">
          Every image on this site is real NASA data. AlgoRythm reads one out loud: brightness becomes
          loudness, latitude becomes pitch, colour becomes the instrument. Move across the picture with
          your finger or your arrow keys and listen to what changes.
        </p>

        <button ref={ref} className="gate-btn" onClick={onBegin} disabled={busy}>
          <span className="gate-wave" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </span>
          {busy ? 'Waking up the room…' : 'Begin listening'}
        </button>

        <p className="gate-note">
          Press any key, or tap anywhere. <strong>Headphones recommended.</strong> Nothing here gets
          louder than a conversation.
        </p>

        {sceneTitle && <p className="gate-scene">First scene · {sceneTitle}</p>}
      </div>
    </div>
  )
}
