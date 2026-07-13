import { useCallback, useEffect, useRef, useState } from 'react'

type WakeSentinel = EventTarget & { released: boolean; release: () => Promise<void> }
type NavigatorWithWakeLock = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeSentinel> }
}

export function useWakeLock(active: boolean) {
  const sentinel = useRef<WakeSentinel | null>(null)
  const [status, setStatus] = useState<'active' | 'released' | 'unsupported' | 'denied'>('released')

  const request = useCallback(async () => {
    const wakeLock = (navigator as NavigatorWithWakeLock).wakeLock
    if (!wakeLock) {
      setStatus('unsupported')
      return
    }
    try {
      sentinel.current = await wakeLock.request('screen')
      setStatus('active')
      sentinel.current.addEventListener('release', () => setStatus('released'), { once: true })
    } catch {
      setStatus('denied')
    }
  }, [])

  useEffect(() => {
    if (!active) return
    void request()
    const onVisibility = () => {
      if (document.visibilityState === 'visible' && sentinel.current?.released) void request()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      void sentinel.current?.release()
    }
  }, [active, request])

  return { status, request }
}
