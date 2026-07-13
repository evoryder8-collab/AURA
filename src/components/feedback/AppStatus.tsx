import { useEffect, useState } from 'react'
import { RefreshCw, WifiOff, X } from 'lucide-react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { env } from '@/config/env'

export function AppStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  useEffect(() => {
    const onOnline = () => setOnline(true)
    const onOffline = () => setOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return (
    <>
      {!env.isProduction && (
        <div className="test-build" role="status">
          TEST BUILD — SYNTHETIC DATA ONLY
        </div>
      )}
      {!online && (
        <div className="connection-toast" role="status">
          <WifiOff size={16} /> Offline · local session state remains available
        </div>
      )}
      {needRefresh && (
        <div className="update-toast" role="status">
          <RefreshCw size={17} />
          <span>A refreshed version of AURA is ready.</span>
          <button onClick={() => void updateServiceWorker(true)}>Update</button>
          <button aria-label="Dismiss update" onClick={() => setNeedRefresh(false)}>
            <X size={16} />
          </button>
        </div>
      )}
    </>
  )
}
