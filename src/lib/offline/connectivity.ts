export interface ConnectivityMonitor {
  isOnline(): boolean
  subscribe(listener: (online: boolean) => void): () => void
}

export function createBrowserConnectivityMonitor(): ConnectivityMonitor {
  return {
    isOnline() {
      return typeof navigator === 'undefined' ? true : navigator.onLine
    },
    subscribe(listener) {
      if (typeof window === 'undefined') return () => undefined
      const onOnline = () => listener(true)
      const onOffline = () => listener(false)
      window.addEventListener('online', onOnline)
      window.addEventListener('offline', onOffline)
      return () => {
        window.removeEventListener('online', onOnline)
        window.removeEventListener('offline', onOffline)
      }
    },
  }
}
