/** AlgoRythm wordmark: a pulse that becomes a ripple, then the name. */
export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className={`wordmark${compact ? ' compact' : ''}`}>
      <svg className="wordmark-mark" viewBox="0 0 40 40" aria-hidden="true">
        <circle cx="20" cy="20" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" opacity="0.95" />
        <circle cx="20" cy="20" r="12" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />
        <circle cx="20" cy="20" r="17.5" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.28" />
        <path d="M2 20h7l2.5-5 3 10 3-14 3 16 3-11 2.5 4H38" fill="none" stroke="var(--aurora)" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span className="wordmark-text">
        Algo<em>Rythm</em>
      </span>
    </span>
  )
}
