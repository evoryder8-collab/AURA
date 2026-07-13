import { openDB, type DBSchema } from 'idb'

import { isMinimalPendingSessionState, type MinimalPendingSessionState } from './pending-session'

const DEFAULT_DATABASE_NAME = 'aura-pending-sessions'
const STORE_NAME = 'pending-sessions'

interface StoredPendingSession {
  readonly key: string
  readonly ownerKey: string
  readonly state: MinimalPendingSessionState
}

interface PendingSessionDatabase extends DBSchema {
  'pending-sessions': {
    key: string
    value: StoredPendingSession
    indexes: { 'by-owner': string }
  }
}

export interface PendingSessionStorage {
  load(ownerKey: string, appointmentId: string): Promise<MinimalPendingSessionState | null>
  save(ownerKey: string, state: MinimalPendingSessionState): Promise<void>
  remove(ownerKey: string, appointmentId: string): Promise<void>
  clear(ownerKey: string): Promise<void>
}

export interface PendingSessionStorageOptions {
  readonly databaseName?: string
  readonly forceMemory?: boolean
}

function assertIdentifier(value: string, label: string): void {
  if (value.trim().length === 0 || value.length > 200) {
    throw new TypeError(`${label} must be a non-empty, bounded string.`)
  }
}

function storageKey(ownerKey: string, appointmentId: string): string {
  assertIdentifier(ownerKey, 'Pending-session owner key')
  assertIdentifier(appointmentId, 'Pending-session appointment id')
  return `${ownerKey.length}:${ownerKey}${appointmentId}`
}

function validateState(ownerKey: string, state: MinimalPendingSessionState): void {
  assertIdentifier(ownerKey, 'Pending-session owner key')
  if (!isMinimalPendingSessionState(state)) {
    throw new TypeError('Only minimal pending Session Mode state may be stored.')
  }
}

class MemoryPendingSessionStorage implements PendingSessionStorage {
  readonly #sessions = new Map<string, StoredPendingSession>()

  async load(ownerKey: string, appointmentId: string): Promise<MinimalPendingSessionState | null> {
    const stored = this.#sessions.get(storageKey(ownerKey, appointmentId))
    return stored != null && isMinimalPendingSessionState(stored.state) ? stored.state : null
  }

  async save(ownerKey: string, state: MinimalPendingSessionState): Promise<void> {
    validateState(ownerKey, state)
    const key = storageKey(ownerKey, state.appointmentId)
    this.#sessions.set(key, { key, ownerKey, state })
  }

  async remove(ownerKey: string, appointmentId: string): Promise<void> {
    this.#sessions.delete(storageKey(ownerKey, appointmentId))
  }

  async clear(ownerKey: string): Promise<void> {
    assertIdentifier(ownerKey, 'Pending-session owner key')
    for (const [key, stored] of this.#sessions) {
      if (stored.ownerKey === ownerKey) this.#sessions.delete(key)
    }
  }
}

class IndexedDbPendingSessionStorage implements PendingSessionStorage {
  readonly #database

  constructor(databaseName: string) {
    this.#database = openDB<PendingSessionDatabase>(databaseName, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, {
            keyPath: 'key',
          })
          store.createIndex('by-owner', 'ownerKey')
        }
      },
    })
  }

  async load(ownerKey: string, appointmentId: string): Promise<MinimalPendingSessionState | null> {
    const database = await this.#database
    const stored = await database.get(STORE_NAME, storageKey(ownerKey, appointmentId))
    return stored != null &&
      stored.ownerKey === ownerKey &&
      isMinimalPendingSessionState(stored.state)
      ? stored.state
      : null
  }

  async save(ownerKey: string, state: MinimalPendingSessionState): Promise<void> {
    validateState(ownerKey, state)
    const database = await this.#database
    const key = storageKey(ownerKey, state.appointmentId)
    await database.put(STORE_NAME, { key, ownerKey, state })
  }

  async remove(ownerKey: string, appointmentId: string): Promise<void> {
    const database = await this.#database
    await database.delete(STORE_NAME, storageKey(ownerKey, appointmentId))
  }

  async clear(ownerKey: string): Promise<void> {
    assertIdentifier(ownerKey, 'Pending-session owner key')
    const database = await this.#database
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const keys = await transaction.store.index('by-owner').getAllKeys(ownerKey)
    await Promise.all(keys.map((key) => transaction.store.delete(key)))
    await transaction.done
  }
}

export function createPendingSessionStorage(
  options: PendingSessionStorageOptions = {},
): PendingSessionStorage {
  if (options.forceMemory === true || typeof indexedDB === 'undefined') {
    return new MemoryPendingSessionStorage()
  }
  return new IndexedDbPendingSessionStorage(options.databaseName ?? DEFAULT_DATABASE_NAME)
}
