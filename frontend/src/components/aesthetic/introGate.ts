// When the opening plays. Kept apart from IntroSequence so the room can decide
// without loading the opening's 3D scene.

const SEEN_KEY = 'shama.intro'

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

/** First visits get the opening; `?intro=1` asks for it. */
export function shouldPlayIntro(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  if (params.get('intro') === '1') return true
  // Guests arriving by a shared link get it too, after the join card (whose tap
  // lets it sound); their music waits for it to finish.
  if (prefersReducedMotion()) return false
  try {
    return !localStorage.getItem(SEEN_KEY)
  } catch {
    return true
  }
}

export function markIntroSeen() {
  try {
    localStorage.setItem(SEEN_KEY, 'seen')
  } catch {
    /* private mode: it will play again next time */
  }
}
