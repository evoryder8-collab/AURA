/**
 * A synchronous localStorage copy of the demo record. IndexedDB writes are asynchronous, and a
 * page closed or reloaded right after "Save" or "Confirm" can abort them; the mirror is written
 * before the call returns, so the newest record always survives. Photos stay in IndexedDB only.
 */
type Persisted = { state?: { savedAt?: number; photos?: unknown[]; photosInMirror?: boolean } & Record<string, unknown> }

const parse = (value: string | null): Persisted | null => {
  if (!value) return null
  try {
    return JSON.parse(value) as Persisted
  } catch {
    return null
  }
}

/** The record as written to the mirror: identical, minus photographs. */
export function toMirror(value: string): string {
  const parsed = parse(value)
  if (!parsed?.state) return value
  return JSON.stringify({ ...parsed, state: { ...parsed.state, photos: [], photosInMirror: false } })
}

/** Chooses the newer of the IndexedDB record and the mirror, restoring photos from IndexedDB. */
export function newerRecord(indexed: string | null, mirror: string | null): string | null {
  const a = parse(indexed)
  const b = parse(mirror)
  if (!b?.state) return indexed
  if (!a?.state) return mirror
  if ((b.state.savedAt ?? 0) <= (a.state.savedAt ?? 0)) return indexed
  return JSON.stringify({ ...b, state: { ...b.state, photos: a.state.photos ?? [], photosInMirror: undefined } })
}

export const mirrorStorage = {
  read(name: string): string | null {
    try {
      return localStorage.getItem(`${name}:mirror`)
    } catch {
      return null
    }
  },
  write(name: string, value: string) {
    try {
      localStorage.setItem(`${name}:mirror`, toMirror(value))
    } catch {
      // Storage full or blocked: IndexedDB still holds the record.
    }
  },
  remove(name: string) {
    try {
      localStorage.removeItem(`${name}:mirror`)
    } catch {
      // Nothing to remove.
    }
  },
}
