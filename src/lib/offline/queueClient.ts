import { env } from '@/config/env'

import {
  createMinimalPendingSessionState,
  createMutationId,
  createOfflineMutationStorage,
  createPendingSessionStorage,
  OfflineSyncController,
  type JsonObject,
  type MinimalPendingSessionState,
  type OfflineMutationTransport,
} from './index'

const mutationStorage = createOfflineMutationStorage()
const pendingSessionStorage = createPendingSessionStorage()

const syntheticMutationTypes = new Set(['check_in.recorded', 'session.started', 'session.finished'])

const transport: OfflineMutationTransport = {
  async send(mutation) {
    if (
      env.demoMode &&
      mutation.ownerKey.startsWith('demo-') &&
      syntheticMutationTypes.has(mutation.mutationType)
    ) {
      // Demo actions are applied to the local synthetic repository before they
      // are queued. Acknowledging the idempotency key is therefore deterministic.
      return { outcome: 'synced' }
    }
    return {
      outcome: 'retryable_error',
      errorCode: 'connected_sync_adapter_unavailable',
    }
  },
}

export const offlineRuntime = new OfflineSyncController({
  storage: mutationStorage,
  pendingSessionStorage,
  transport,
})

export async function queueOfflineMutation(
  ownerKey: string,
  mutationType: string,
  payload: JsonObject,
  idempotencyKey?: string,
): Promise<string> {
  offlineRuntime.start()
  const id = createMutationId()
  await offlineRuntime.enqueue({
    id,
    ownerKey,
    ...(idempotencyKey == null ? {} : { idempotencyKey }),
    mutationType,
    payload,
  })
  return id
}

export async function savePendingSessionState(
  ownerKey: string,
  input: Omit<MinimalPendingSessionState, 'version'>,
): Promise<void> {
  await pendingSessionStorage.save(ownerKey, createMinimalPendingSessionState(input))
}

export function loadPendingSessionState(
  ownerKey: string,
  appointmentId: string,
): Promise<MinimalPendingSessionState | null> {
  return pendingSessionStorage.load(ownerKey, appointmentId)
}

export function clearPendingSessionState(ownerKey: string, appointmentId: string): Promise<void> {
  return pendingSessionStorage.remove(ownerKey, appointmentId)
}
