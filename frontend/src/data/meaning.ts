// -----------------------------------------------------------------------------
// Meaning payloads, made safe to show.
//
// The meaning service answers 200 even when it has nothing: its degraded body
// carries provider names, model ids and raw API errors in the very fields the
// reader would see. None of that belongs on screen (§17), so every payload is
// filtered here before it reaches the UI. The technical detail stays in the
// console for us.
// -----------------------------------------------------------------------------

export interface Meaning {
  translation: string
  simple: string
  detailed: string
  vocabulary: { term: string; meaning: string }[]
  literary_devices: { device: string; english_name: string; explanation: string }[]
  mood: string
  cached: boolean
}

/** Anything that reads like plumbing rather than poetry. */
const LEAK =
  /error code|api[\s_-]?key|rate[\s-]?limit|status \d{3}|\bgroq\b|\bgemini\b|\bopenai\b|\banthropic\b|\bollama\b|\bmistral\b|\bllama\b|\bgpt-|\bclaude-|\bprovider|models?\/|\{\s*['"]error|traceback|temporarily unavailable|currently unavailable|could not generate|couldn't generate|free[\s-]?tier|try again in a (?:minute|moment)|no longer available|update your code|\bendpoint\b|\bhttp\b/i

const NON_ANSWERS = new Set(['unavailable', 'unknown', 'n/a', 'none', 'null'])

function usable(value: unknown): string {
  if (typeof value !== 'string') return ''
  const text = value.trim()
  if (!text) return ''
  if (NON_ANSWERS.has(text.toLowerCase())) return ''
  if (LEAK.test(text)) return ''
  return text
}

/**
 * Returns a meaning with every unusable field dropped, or null when nothing
 * showable survives — in which case the caller falls back to authored content
 * or to the "not available right now" state.
 */
export function sanitizeMeaning(raw: unknown): Meaning | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, any>

  const vocabulary = Array.isArray(r.vocabulary)
    ? r.vocabulary
        .map((v: any) => ({ term: usable(v?.term), meaning: usable(v?.meaning) }))
        .filter((v) => v.term && v.meaning)
    : []

  const literary_devices = Array.isArray(r.literary_devices)
    ? r.literary_devices
        .map((d: any) => ({
          device: usable(d?.device),
          english_name: usable(d?.english_name),
          explanation: usable(d?.explanation),
        }))
        .filter((d) => d.device && d.explanation)
    : []

  const meaning: Meaning = {
    translation: usable(r.translation),
    simple: usable(r.simple),
    detailed: usable(r.detailed),
    vocabulary,
    literary_devices,
    mood: usable(r.mood),
    cached: !!r.cached,
  }

  const hasSomething =
    meaning.simple ||
    meaning.detailed ||
    meaning.translation ||
    meaning.vocabulary.length > 0 ||
    meaning.literary_devices.length > 0

  return hasSomething ? meaning : null
}
