import { useSyncExternalStore } from 'react'

const query = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void) {
  const media = window.matchMedia(query)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/** True when the visitor asked for less motion; the scene then renders one still frame. */
export function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/**
 * Runs `frame` on every animation frame while the tab is visible, with the seconds since the
 * previous frame (capped, so a background tab never makes the motion jump).
 */
export function runWhileVisible(frame: (now: number, dt: number) => void) {
  let handle = 0
  let last = 0
  const tick = (now: number) => {
    handle = requestAnimationFrame(tick)
    const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60
    last = now
    frame(now, dt)
  }
  const start = () => {
    cancelAnimationFrame(handle)
    last = 0
    if (!document.hidden) handle = requestAnimationFrame(tick)
  }
  document.addEventListener('visibilitychange', start)
  start()
  return () => {
    cancelAnimationFrame(handle)
    document.removeEventListener('visibilitychange', start)
  }
}

/** Frame-rate independent easing toward a target. */
export const approach = (current: number, target: number, rate: number, dt: number) =>
  current + (target - current) * (1 - Math.exp(-rate * dt))
