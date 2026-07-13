import { openDB, type DBSchema } from 'idb'

import { isOfflineMutation, type OfflineMutation } from './mutation-queue'

const DEFAULT_DATABASE_NAME = 'aura-offline-queue'
const STORE_NAME = 'mutations'

interface OfflineQueueDatabase extends DBSchema {
  mutations: {
    key: string
    value: OfflineMutation
    indexes: { 'by-owner': string }
  }
}

export interface OfflineMutationStorage {
  load(ownerKey: string): Promise<readonly OfflineMutation[]>
  save(ownerKey: string, queue: readonly OfflineMutation[]): Promise<void>
  clear(ownerKey: string): Promise<void>
}

export interface OfflineMutationStorageOptions {
  readonly databaseName?: string
  readonly forceMemory?: boolean
}

function assertOwnerKey(ownerKey: string): void {
  if (ownerKey.trim().length === 0 || ownerKey.length > 200) {
    throw new TypeError('Offline queue owner key must be a non-empty, bounded string.')
  }
}

function validateOwnedQueue(ownerKey: string, queue: readonly OfflineMutation[]): void {
  assertOwnerKey(ownerKey)
  const ids = new Set<string>()
  for (const mutation of queue) {
    if (!isOfflineMutation(mutation) || mutation.ownerKey !== ownerKey) {
      throw new TypeError('Offline storage accepts only valid mutations for its owner.')
    }
    if (ids.has(mutation.id)) {
      throw new TypeError(`Offline storage received a duplicate id: ${mutation.id}`)
    }
    ids.add(mutation.id)
  }
}

function sorted(queue: readonly OfflineMutation[]): readonly OfflineMutation[] {
  return [...queue].sort(
    (left, right) =>
      Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id),
  )
}

class MemoryOfflineMutationStorage implements OfflineMutationStorage {
  readonly #mutations = new Map<string, OfflineMutation>()

  async load(ownerKey: string): Promise<readonly OfflineMutation[]> {
    assertOwnerKey(ownerKey)
    return sorted(
      [...this.#mutations.values()].filter((mutation) => mutation.ownerKey === ownerKey),
    )
  }

  async save(ownerKey: string, queue: readonly OfflineMutation[]): Promise<void> {
    validateOwnedQueue(ownerKey, queue)
    await this.clear(ownerKey)
    for (const mutation of queue) this.#mutations.set(mutation.id, mutation)
  }

  async clear(ownerKey: string): Promise<void> {
    assertOwnerKey(ownerKey)
    for (const [id, mutation] of this.#mutations) {
      if (mutation.ownerKey === ownerKey) this.#mutations.delete(id)
    }
  }
}

class IndexedDbOfflineMutationStorage implements OfflineMutationStorage {
  readonly #database

  constructor(databaseName: string) {
    this.#database = openDB<OfflineQueueDatabase>(databaseName, 1, {
      upgrade(database) {
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          const store = database.createObjectStore(STORE_NAME, {
            keyPath: 'id',
          })
          store.createIndex('by-owner', 'ownerKey')
        }
      },
    })
  }

  async load(ownerKey: string): Promise<readonly OfflineMutation[]> {
    assertOwnerKey(ownerKey)
    const database = await this.#database
    const stored = await database.getAllFromIndex(STORE_NAME, 'by-owner', ownerKey)
    return sorted(
      stored.filter((mutation) => isOfflineMutation(mutation) && mutation.ownerKey === ownerKey),
    )
  }

  async save(ownerKey: string, queue: readonly OfflineMutation[]): Promise<void> {
    validateOwnedQueue(ownerKey, queue)
    const database = await this.#database
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const existingKeys = await transaction.store.index('by-owner').getAllKeys(ownerKey)
    await Promise.all(existingKeys.map((key) => transaction.store.delete(key)))
    await Promise.all(queue.map((mutation) => transaction.store.put(mutation)))
    await transaction.done
  }

  async clear(ownerKey: string): Promise<void> {
    assertOwnerKey(ownerKey)
    const database = await this.#database
    const transaction = database.transaction(STORE_NAME, 'readwrite')
    const keys = await transaction.store.index('by-owner').getAllKeys(ownerKey)
    await Promise.all(keys.map((key) => transaction.store.delete(key)))
    await transaction.done
  }
}

export function createOfflineMutationStorage(
  options: OfflineMutationStorageOptions = {},
): OfflineMutationStorage {
  if (options.forceMemory === true || typeof indexedDB === 'undefined') {
    return new MemoryOfflineMutationStorage()
  }
  return new IndexedDbOfflineMutationStorage(options.databaseName ?? DEFAULT_DATABASE_NAME)
}
