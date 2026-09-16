'use client'

/**
 * How complete the *learning* experience is for a given ghazal.
 *
 * Deliberately measured rather than predicted. Every component here is
 * something we already compute while preparing a recording — whether lyrics
 * were found, how much of the singing we can name a couplet for, how closely
 * the timings fit this performance. Probing LRCLIB is also rate-limited, so a
 * cached measurement is worth more than a model's guess at it.
 *
 * Used to order the Library so the ghazals where everything works — words,
 * timings, meanings — are the ones offered first.
 */

export interface Readiness {
  /** Lyrics exist for this recording at all. */
  hasLyrics: boolean
  /** Lyrics carry timings, so the page can follow the singer. */
  hasSynced: boolean
  /** Timings belong to this performance rather than another rendition. */
  timingReliable: boolean
  /** Share of sung lines we can name a curated couplet for (0..1). */
  coverage: number
  /** Couplets held in the catalogue, with translation and meaning. */
  couplets: number
  checkedAt: number
}

const STORE = 'shama.readiness'

export function readReadiness(): Record<string, Readiness> {
  try {
    const raw = localStorage.getItem(STORE)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function writeReadiness(workId: string, value: Readiness) {
  try {
    const all = readReadiness()
    all[workId] = value
    localStorage.setItem(STORE, JSON.stringify(all))
  } catch {
    /* ignore */
  }
}

/**
 * 0..1. Weighted so the things a learner actually needs dominate: being able
 * to follow the singing, and having couplets with meanings attached to follow
 * along *with*. A recording with perfect timings but no couplets we know is
 * still a poor lesson, which is exactly the gap this score is meant to expose.
 */
export function score(r: Readiness | undefined): number {
  if (!r) return 0
  const words = r.hasLyrics ? 0.2 : 0
  // Timings from another rendition only roughly follow the singer.
  const synced = r.hasSynced ? (r.timingReliable ? 0.25 : 0.1) : 0
  const reliable = r.hasSynced && r.timingReliable ? 0.1 : 0
  const covered = 0.3 * Math.min(1, r.coverage)
  // Beyond about eight couplets the marginal value flattens out.
  const depth = 0.15 * Math.min(1, r.couplets / 8)
  return Math.round((words + synced + reliable + covered + depth) * 100) / 100
}

/** A short, honest phrase for what a listener will actually get. */
export function describe(r: Readiness | undefined): string {
  if (!r) return 'not checked yet'
  if (!r.hasLyrics) return 'no words found'
  if (!r.hasSynced) return 'words, not timed'
  if (!r.timingReliable) return 'words, timings approximate'
  if (r.coverage >= 0.6) return 'follows along, with meanings'
  if (r.coverage > 0) return 'follows along, some meanings'
  return 'follows along'
}
