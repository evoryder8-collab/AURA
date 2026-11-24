/**
 * A synchronous localStorage copy of the demo record. IndexedDB writes are asynchronous, and a
 * page closed or reloaded right after "Save" or "Confirm" can abort them; the mirror is written
 * before the call returns, so the newest record always survives. Photos stay in IndexedDB only;
 * the mirror lists their ids so a photo removed since the last IndexedDB write stays removed.
 */
type Photo = { id: string }
type MirrorState = { savedAt?: number; photos?: Photo[]; photoIds?: string[] } & Record<string, unknown>
type Persisted = { state?: MirrorState }

const parse = (value: string | null): Persisted | null => {
  if (!value) return null
  try {
    return JSON.parse(value) as Persisted
  } catch {
    return null
  }
}

export const mirrorKey = (name: string) => `${name}:mirror`

/** The record as written to the mirror: identical, with photographs reduced to their ids. */
export function toMirror(value: string): string {
  const parsed = parse(value)
  if (!parsed?.state) return value
  const photoIds = (parsed.state.photos ?? []).map((photo) => photo.id)
  return JSON.stringify({ ...parsed, state: { ...parsed.state, photos: [], photoIds } })
}

/** The photos a mirrored record still lists; a mirror from before ids were kept lists them all. */
function listedPhotos<T extends Photo>(photos: readonly T[], state: MirrorState): T[] {
  const ids = state.photoIds
  return ids ? photos.filter((photo) => ids.includes(photo.id)) : [...photos]
}

/** Chooses the newer of the IndexedDB record and the mirror, restoring photos from IndexedDB. */
export function newerRecord(indexed: string | null, mirror: string | null): string | null {
  const a = parse(indexed)
  const b = parse(mirror)
  if (!b?.state) return indexed
  if (!a?.state) return mirror
  if ((b.state.savedAt ?? 0) <= (a.state.savedAt ?? 0)) return indexed
  return JSON.stringify({ ...b, state: { ...b.state, photos: listedPhotos(a.state.photos ?? [], b.state), photoIds: undefined } })
}

export const mirrorStorage = {
  read(name: string): string | null {
    try {
      return localStorage.getItem(mirrorKey(name))
    } catch {
      return null
    }
  },
  write(name: string, value: string) {
    try {
      localStorage.setItem(mirrorKey(name), toMirror(value))
    } catch {
      // Storage full or blocked: IndexedDB still holds the record.
    }
  },
  remove(name: string) {
    try {
      localStorage.removeItem(mirrorKey(name))
    } catch {
      // Nothing to remove.
    }
  },
}
