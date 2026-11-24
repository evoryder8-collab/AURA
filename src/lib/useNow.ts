import { useEffect, useState } from 'react'

/**
 * The current time, refreshed every minute so "next in 12 min" and "Today" stay true while a page stays open.
 * Intervals pause while a tab sleeps, so it also refreshes the moment the page becomes visible again.
 */
export function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const refresh = () => setNow(Date.now())
    const timer = window.setInterval(refresh, 60_000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return now
}
