export interface UserCatalogEntry {
  id: string // generated UUID
  videoId: string
  title: string
  artist: string
  album?: string
  thumbnail?: string
  addedAt: string // ISO date
}

const STORAGE_KEY = 'shama_user_catalog'

function generateId(): string {
  // crypto.randomUUID is available in all modern browsers
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for older environments
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function readCatalog(): UserCatalogEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeCatalog(entries: UserCatalogEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries))
  } catch {
    /* storage full or unavailable */
  }
}

export function getUserCatalog(): UserCatalogEntry[] {
  return readCatalog()
}

export function addToCatalog(
  entry: Omit<UserCatalogEntry, 'id' | 'addedAt'>
): UserCatalogEntry {
  const catalog = readCatalog()
  const newEntry: UserCatalogEntry = {
    ...entry,
    id: generateId(),
    addedAt: new Date().toISOString(),
  }
  catalog.unshift(newEntry) // newest first
  writeCatalog(catalog)
  return newEntry
}

export function removeFromCatalog(id: string): void {
  const catalog = readCatalog()
  const filtered = catalog.filter((entry) => entry.id !== id)
  writeCatalog(filtered)
}

export function isInCatalog(videoId: string): boolean {
  const catalog = readCatalog()
  return catalog.some((entry) => entry.videoId === videoId)
}
