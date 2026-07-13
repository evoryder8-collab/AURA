import { useEffect, useMemo, useRef, type ReactNode } from 'react'

import { useAuth } from '@/features/auth/auth-context'
import { offlineRuntime } from '@/lib/offline/queueClient'
import type { OfflineSyncController } from '@/lib/offline/sync-controller'

type RuntimeBoundary = Pick<
  OfflineSyncController,
  'start' | 'stop' | 'activateOwner' | 'clearOwner'
>

export function OfflineRuntimeProvider({
  children,
  runtime = offlineRuntime,
}: {
  children: ReactNode
  runtime?: RuntimeBoundary
}) {
  const auth = useAuth()
  const previousOwner = useRef<string | null>(null)
  const ownerKey = useMemo(() => {
    if (auth.role == null) return null
    if (auth.user != null) return auth.user.id
    return auth.role === 'therapist' ? 'demo-therapist' : auth.demoClientId
  }, [auth.demoClientId, auth.role, auth.user])

  useEffect(() => {
    runtime.start()
    return () => runtime.stop()
  }, [runtime])

  useEffect(() => {
    const priorOwner = previousOwner.current
    if (priorOwner != null && priorOwner !== ownerKey) {
      void runtime.clearOwner(priorOwner)
    }
    if (ownerKey != null && priorOwner !== ownerKey) {
      void runtime.activateOwner(ownerKey)
    }
    previousOwner.current = ownerKey
  }, [ownerKey, runtime])

  return children
}
