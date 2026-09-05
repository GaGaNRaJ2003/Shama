// -----------------------------------------------------------------------------
// Tonight's Mehfil — the listening queue for the current session.
//
// User-facing name only: this is the same "queue" concept the rest of the app
// already works with, persisted locally. No backend contract is involved.
// -----------------------------------------------------------------------------

export interface MehfilItem {
  id: string
  /** 'work' = a curated ghazal from the catalog; 'recording' = a YouTube Music track. */
  kind: 'work' | 'recording'
  workId?: string
  videoId?: string
  title: string
  artist: string
  poet?: string
  thumbnail?: string
}

const STORAGE_KEY = 'shama.mehfil'

function makeId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `m-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export function readMehfil(): MehfilItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function writeMehfil(items: MehfilItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    /* storage full or unavailable */
  }
}

export function makeMehfilItem(entry: Omit<MehfilItem, 'id'>): MehfilItem {
  return { ...entry, id: makeId() }
}

/** Two entries point at the same thing when their source identifier matches. */
export function sameItem(a: MehfilItem, b: MehfilItem): boolean {
  if (a.kind !== b.kind) return false
  return a.kind === 'work' ? a.workId === b.workId : a.videoId === b.videoId
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length || from === to) return items
  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
