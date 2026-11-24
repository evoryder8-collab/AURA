import { clsx } from 'clsx'
import { useEffect, useState, type CSSProperties } from 'react'
import type { AreaKey } from '@/domain/care'
import { anchorFor, anchorVisible, type FigureFace } from './anchors'
import { painHex } from './colors'
import type { BodyViews } from './fallback'
import { loadBodyViews } from './views'
import './body-thumb.css'

/**
 * A small, still preview of the same anatomical model: the print render plus a numbered dot per area.
 * Cheap enough for lists and phones; Session Mode uses the live figure.
 */
export function BodyThumb({
  face,
  markers,
  label,
  className,
}: {
  face: FigureFace
  markers: ReadonlyArray<{ area: AreaKey; pain: number }>
  label: string
  className?: string
}) {
  const [views, setViews] = useState<BodyViews | null>(null)
  useEffect(() => {
    let active = true
    void loadBodyViews().then((value) => active && setViews(value))
    return () => {
      active = false
    }
  }, [])
  const frame = views?.[face]
  return (
    <figure className={clsx('body-thumb', className)} aria-label={label}>
      <img src={`${import.meta.env.BASE_URL}body/${face}-thumb.webp`} alt="" draggable={false} />
      {frame
        ? markers.map((marker) => {
            const anchor = anchorFor(marker.area)
            if (!anchor) return null
            const [x, y] = anchor.position
            const left = ((x - frame.left) / (frame.right - frame.left)) * 100
            const top = ((frame.top - y) / (frame.top - frame.bottom)) * 100
            return (
              <span
                key={marker.area}
                className={clsx('body-thumb__dot', !anchorVisible(anchor, face) && 'is-hidden-side')}
                style={{ left: `${left}%`, top: `${top}%`, '--pain': painHex(marker.pain) } as CSSProperties}
                aria-hidden="true"
              >
                {marker.pain}
              </span>
            )
          })
        : null}
    </figure>
  )
}
