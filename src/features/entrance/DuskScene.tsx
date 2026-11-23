import { clsx } from 'clsx'
import { useState, type CSSProperties } from 'react'
import { Botanicals } from './Botanicals'
import { CausticCanvas } from './CausticCanvas'
import { usePrefersReducedMotion } from './motion'
import './entrance.css'

/**
 * The retreat at dusk behind the entrance and sign-in: breathing lantern and water light,
 * pool reflections moving on the wall, and slow botanical shadows. Purely decorative and
 * never in the way of the controls on top. Reduced motion, or no WebGL, gives a still frame.
 */
export function DuskScene({
  focus,
  energy = 1,
  settled = false,
}: {
  /** Where the pool light falls on the wall, 0–1 from the bottom-left. */
  focus: readonly [number, number]
  /** How bright the wall light is; quieter while a portrait holds the stage. */
  energy?: number
  /** Calm everything down while someone is typing. */
  settled?: boolean
}) {
  const reducedMotion = usePrefersReducedMotion()
  const [webglFailed, setWebglFailed] = useState(false)
  const live = !reducedMotion && !webglFailed
  return (
    <div
      className={clsx('dusk', !live && 'dusk--still', settled && 'dusk--settled')}
      aria-hidden="true"
    >
      <div className="dusk__glow dusk__glow--lantern" />
      <div className="dusk__glow dusk__glow--water" />
      {live ? (
        <CausticCanvas
          className="dusk__light"
          variant="wall"
          focus={focus}
          energy={settled ? energy * 0.55 : energy}
          speed={settled ? 0.16 : 1}
          onUnavailable={() => setWebglFailed(true)}
        />
      ) : (
        <div
          className="dusk__light dusk__light--still"
          style={
            { '--fx': `${focus[0] * 100}%`, '--fy': `${100 - focus[1] * 100}%` } as CSSProperties
          }
        />
      )}
      <Botanicals />
      <div className="dusk__vignette" />
    </div>
  )
}
