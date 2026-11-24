import { useEffect, useState } from 'react'

/** The current time, refreshed every minute so "next in 12 min" and "Today" stay true while a page stays open. */
export function useNow() {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return now
}
