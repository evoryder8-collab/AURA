import { clsx } from 'clsx'
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import type { AreaKey, TableRotation } from '@/domain/care'
import { anchorFor, anchorVisible, type BodyAnchor, type FigureFace } from './anchors'
import { layoutLabels, type PlacedLabel, type Point } from './layout'
import type { BodyRuntime } from './runtime'
import { painHex } from './colors'
import { isBodyViews, projectOnRender, type BodyViews } from './fallback'
import './body-stage.css'

export type BodyMarker = {
  readonly area: AreaKey
  readonly pain: number
  /** Short visible label, e.g. "Left shoulder". */
  readonly label: string
  /** Extra line under the label, e.g. "Yesterday · not yet confirmed". */
  readonly detail?: string
  readonly tone?: 'default' | 'muted' | 'selected'
}

export type ProjectedMarker = { area: AreaKey; x: number; y: number; visible: boolean }

type Props = {
  /** Which side of the client faces the viewer: face up on the table shows the front. */
  face: FigureFace
  /** Head direction on screen, in quarter turns clockwise from "head up". */
  rotation?: TableRotation
  markers: readonly BodyMarker[]
  variant?: 'session' | 'picker' | 'compact'
  onPick?: ((anchor: BodyAnchor) => void) | undefined
  /** Accessible description of what the figure shows. */
  label: string
  showSides?: boolean
  className?: string
}

const sideWord = (marker: BodyMarker) => marker.label

/**
 * The AURA body: a lit 3D anatomical figure with pain markers anchored to anatomical sides.
 * Rendering lives in ./runtime (three.js, loaded on demand); this component owns layout,
 * labels and accessibility, so the figure stays readable even before WebGL is ready.
 */
export function BodyStage({
  face,
  rotation = 0,
  markers,
  variant = 'session',
  onPick,
  label,
  showSides = true,
  className,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const runtimeRef = useRef<BodyRuntime | null>(null)
  const onPickRef = useRef(onPick)
  const [projected, setProjected] = useState<{
    markers: ProjectedMarker[]
    center: Point
    axis: Point
    width: number
    height: number
    leftDirection: Point
  } | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading')

  const markersRef = useRef(markers)
  useEffect(() => {
    onPickRef.current = onPick
    markersRef.current = markers
  }, [onPick, markers])

  const markerKey = markers.map((marker) => `${marker.area}:${marker.pain}:${marker.tone ?? ''}`).join('|')

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return
    let disposed = false
    let runtime: BodyRuntime | null = null
    import('./runtime')
      .then(async ({ createBodyRuntime }) => {
        if (disposed) return
        runtime = await createBodyRuntime(canvas, {
          interactive: true,
          onPick: (anchor) => onPickRef.current?.(anchor),
          onProject: (value) => {
            if (!disposed) setProjected(value)
          },
        })
        if (disposed) {
          runtime.dispose()
          return
        }
        runtimeRef.current = runtime
        setStatus('ready')
      })
      .catch(() => {
        if (!disposed) setStatus('unavailable')
      })
    return () => {
      disposed = true
      runtime?.dispose()
      runtimeRef.current = null
    }
  }, [])

  useEffect(() => {
    runtimeRef.current?.update({
      face,
      rotation,
      markers: markersRef.current.map((marker) => ({
        area: marker.area,
        pain: marker.pain,
        emphasis: marker.tone === 'muted' ? 0.45 : marker.tone === 'selected' ? 1.25 : 1,
      })),
    })
  }, [face, rotation, markerKey, status]) // markerKey captures every marker change that affects the render

  // Without WebGL (or the model), project onto the print renders of the same model instead.
  const [fallbackImage, setFallbackImage] = useState<{ width: number; height: number; angle: number } | null>(null)
  useEffect(() => {
    if (status !== 'unavailable') return
    const host = hostRef.current
    if (!host) return
    let views: BodyViews | null = null
    let cancelled = false
    const update = () => {
      const rect = host.getBoundingClientRect()
      if (!views || rect.width < 2 || rect.height < 2) return
      const projection = projectOnRender({
        views,
        face,
        rotation,
        width: rect.width,
        height: rect.height,
        areas: markersRef.current.map((marker) => marker.area),
      })
      setProjected(projection)
      setFallbackImage(projection.image)
    }
    fetch(`${import.meta.env.BASE_URL}body/views.json`)
      .then((response) => (response.ok ? response.json() : null))
      .then((value: unknown) => {
        if (cancelled || !isBodyViews(value)) return
        views = value
        update()
      })
      .catch(() => undefined)
    const observer = new ResizeObserver(update)
    observer.observe(host)
    return () => {
      cancelled = true
      observer.disconnect()
    }
  }, [status, face, rotation, markerKey]) // markerKey captures marker changes

  const placed = useMemo<Array<PlacedLabel & { data: BodyMarker; visible: boolean }>>(() => {
    if (!projected) return []
    const items = markers.flatMap((marker) => {
      const point = projected.markers.find((item) => item.area === marker.area)
      return point ? [{ marker, point }] : []
    })
    const compact = variant === 'compact'
    const horizontal = Math.abs(projected.axis.x) > 0.5
    const layout = layoutLabels({
      markers: items.map(({ marker, point }) => ({ id: marker.area, x: point.x, y: point.y })),
      center: projected.center,
      axis: projected.axis,
      offset: compact ? Math.min(projected.width, projected.height) * 0.3 : horizontal ? projected.height * 0.3 : projected.width * 0.31,
      gap: horizontal ? (compact ? 130 : variant === 'session' ? 250 : 220) : compact ? 30 : variant === 'session' ? 76 : 64,
      bounds: {
        width: projected.width,
        height: projected.height,
        marginX: compact ? 70 : variant === 'session' ? 140 : 115,
        marginY: compact ? 22 : variant === 'session' ? 44 : 34,
      },
    })
    return layout.flatMap((item) => {
      const entry = items.find(({ marker }) => marker.area === item.id)
      return entry ? [{ ...item, data: entry.marker, visible: entry.point.visible }] : []
    })
  }, [markers, projected, variant])

  const sideLabels = useMemo(() => {
    if (!projected || !showSides) return null
    const reach = Math.min(projected.width, projected.height) * (variant === 'compact' ? 0.42 : 0.44)
    const at = (direction: 1 | -1) => ({
      x: projected.center.x + projected.leftDirection.x * reach * direction,
      y: projected.center.y + projected.leftDirection.y * reach * direction,
    })
    return { left: at(1), right: at(-1) }
  }, [projected, showSides, variant])

  return (
    <figure
      ref={hostRef}
      className={clsx('body-stage', `body-stage--${variant}`, status === 'ready' && 'is-ready', className)}
      aria-label={label}
    >
      <div className="body-stage__pool" aria-hidden="true" />
      <canvas ref={canvasRef} className={clsx('body-stage__canvas', onPick && 'is-pickable')} aria-hidden="true" />
      {status === 'unavailable' && fallbackImage ? (
        <img
          className="body-stage__render"
          src={`${import.meta.env.BASE_URL}body/${face}.png`}
          alt=""
          style={{
            width: fallbackImage.width,
            height: fallbackImage.height,
            transform: `translate(-50%, -50%) rotate(${fallbackImage.angle}deg)`,
          }}
        />
      ) : null}
      {status === 'loading' ? <span className="body-stage__loading" aria-hidden="true" /> : null}

      {sideLabels ? (
        <div className="body-stage__sides" aria-hidden="true">
          <span style={{ left: sideLabels.left.x, top: sideLabels.left.y }}>L</span>
          <span style={{ left: sideLabels.right.x, top: sideLabels.right.y }}>R</span>
        </div>
      ) : null}

      {projected ? (
        <svg className="body-stage__leaders" width={projected.width} height={projected.height} aria-hidden="true">
          {placed.map((item) => (
            <line
              key={item.id}
              x1={item.marker.x}
              y1={item.marker.y}
              x2={item.label.x}
              y2={item.label.y}
              className={clsx(!item.visible && 'is-hidden-side')}
            />
          ))}
        </svg>
      ) : null}

      <div className="body-stage__markers" aria-hidden="true">
        {placed.map((item) => (
          <span
            key={`dot-${item.id}`}
            data-area={item.id}
            className={clsx('body-dot', !item.visible && 'is-hidden-side', item.data.tone && `is-${item.data.tone}`)}
            style={{ left: item.marker.x, top: item.marker.y, '--pain': painHex(item.data.pain) } as CSSProperties}
          />
        ))}
        {placed.map((item) => (
          <span
            key={`label-${item.id}`}
            data-area={item.id}
            className={clsx('body-label', !item.visible && 'is-hidden-side', item.data.tone && `is-${item.data.tone}`)}
            style={{ left: item.label.x, top: item.label.y, '--pain': painHex(item.data.pain) } as CSSProperties}
          >
            <b className="num">{item.data.pain}</b>
            <span className="body-label__text">
              <span>{sideWord(item.data)}</span>
              {!item.visible ? <em>{face === 'front' ? 'on the back' : 'on the front'}</em> : null}
              {item.data.detail && variant !== 'compact' ? <small>{item.data.detail}</small> : null}
            </span>
          </span>
        ))}
      </div>

      <figcaption className="visually-hidden">
        {label}.{' '}
        {markers.length
          ? markers
              .map((marker) => {
                const anchor = anchorFor(marker.area)
                const hidden = anchor ? !anchorVisible(anchor, face) : false
                return `${marker.label}, ${marker.pain} out of 10${hidden ? `, on the ${face === 'front' ? 'back' : 'front'} of the body` : ''}${marker.detail ? `, ${marker.detail}` : ''}`
              })
              .join('; ')
          : 'No areas marked.'}
      </figcaption>
    </figure>
  )
}
