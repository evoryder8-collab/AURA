import { useId, useState } from 'react'
import { clsx } from 'clsx'
import { bodyRegionLabel } from './regions'

type View = 'front' | 'back' | 'horizontal'

type Shape = {
  id: string
  kind: 'circle' | 'rect' | 'ellipse'
  x: number
  y: number
  width?: number
  height?: number
  r?: number
  rx?: number
}

const common: Shape[] = [
  { id: 'head', kind: 'circle', x: 100, y: 28, r: 15 },
  { id: 'left_shoulder', kind: 'circle', x: 72, y: 68, r: 15 },
  { id: 'right_shoulder', kind: 'circle', x: 128, y: 68, r: 15 },
  { id: 'left_arm', kind: 'rect', x: 54, y: 78, width: 17, height: 66, rx: 8 },
  { id: 'right_arm', kind: 'rect', x: 129, y: 78, width: 17, height: 66, rx: 8 },
  { id: 'left_hand', kind: 'ellipse', x: 61, y: 157, width: 20, height: 26 },
  { id: 'right_hand', kind: 'ellipse', x: 139, y: 157, width: 20, height: 26 },
  { id: 'left_hip', kind: 'circle', x: 85, y: 162, r: 16 },
  { id: 'right_hip', kind: 'circle', x: 115, y: 162, r: 16 },
  { id: 'left_thigh', kind: 'rect', x: 76, y: 175, width: 19, height: 66, rx: 9 },
  { id: 'right_thigh', kind: 'rect', x: 105, y: 175, width: 19, height: 66, rx: 9 },
  { id: 'left_knee', kind: 'circle', x: 85, y: 248, r: 11 },
  { id: 'right_knee', kind: 'circle', x: 115, y: 248, r: 11 },
  { id: 'left_lower_leg', kind: 'rect', x: 78, y: 258, width: 15, height: 65, rx: 7 },
  { id: 'right_lower_leg', kind: 'rect', x: 107, y: 258, width: 15, height: 65, rx: 7 },
  { id: 'left_foot', kind: 'ellipse', x: 83, y: 331, width: 25, height: 14 },
  { id: 'right_foot', kind: 'ellipse', x: 117, y: 331, width: 25, height: 14 },
]

const torso: Record<'front' | 'back', Shape[]> = {
  front: [
    { id: 'chest', kind: 'rect', x: 77, y: 58, width: 46, height: 51, rx: 18 },
    { id: 'abdomen', kind: 'rect', x: 82, y: 108, width: 36, height: 54, rx: 15 },
  ],
  back: [
    { id: 'upper_back', kind: 'rect', x: 77, y: 58, width: 46, height: 54, rx: 18 },
    { id: 'lower_back', kind: 'rect', x: 82, y: 111, width: 36, height: 51, rx: 15 },
  ],
}

export function BodyMap({
  value,
  onChange,
  cautionRegions = [],
  priorityRegions = [],
  initialView = 'front',
  horizontalOnly = false,
  readonly = false,
}: {
  value: string[]
  onChange?: (value: string[]) => void
  cautionRegions?: string[]
  priorityRegions?: string[]
  initialView?: View
  horizontalOnly?: boolean
  readonly?: boolean
}) {
  const [view, setView] = useState<View>(horizontalOnly ? 'horizontal' : initialView)
  const labelId = useId()

  const toggle = (id: string) => {
    if (readonly || !onChange) return
    onChange(value.includes(id) ? value.filter((region) => region !== id) : [...value, id])
  }

  const renderShape = (shape: Shape) => {
    const className = clsx(
      'body-map__region',
      value.includes(shape.id) && 'is-selected',
      priorityRegions.includes(shape.id) && 'is-priority',
      cautionRegions.includes(shape.id) && 'is-caution',
    )
    const commonProps = {
      className,
      role: readonly ? undefined : ('button' as const),
      tabIndex: readonly ? undefined : 0,
      'aria-label': `${bodyRegionLabel(shape.id)}${value.includes(shape.id) ? ', selected' : ''}${cautionRegions.includes(shape.id) ? ', caution' : ''}`,
      onClick: () => toggle(shape.id),
      onKeyDown: (event: React.KeyboardEvent<SVGElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          toggle(shape.id)
        }
      },
    }
    if (shape.kind === 'circle')
      return <circle key={shape.id} cx={shape.x} cy={shape.y} r={shape.r} {...commonProps} />
    if (shape.kind === 'ellipse')
      return (
        <ellipse
          key={shape.id}
          cx={shape.x}
          cy={shape.y}
          rx={(shape.width ?? 0) / 2}
          ry={(shape.height ?? 0) / 2}
          {...commonProps}
        />
      )
    return (
      <rect
        key={shape.id}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rx={shape.rx}
        {...commonProps}
      />
    )
  }

  return (
    <div className={clsx('body-map', horizontalOnly && 'body-map--horizontal')}>
      {!horizontalOnly && (
        <div className="segmented" aria-label="Body map view">
          <button className={view === 'front' ? 'is-active' : ''} onClick={() => setView('front')}>
            Front
          </button>
          <button className={view === 'back' ? 'is-active' : ''} onClick={() => setView('back')}>
            Back
          </button>
        </div>
      )}
      <p id={labelId} className="sr-only">
        Select one or more body regions. Use the Front and Back controls to change view.
      </p>
      {view === 'horizontal' ? (
        <svg viewBox="0 0 390 145" aria-labelledby={labelId}>
          <path
            className="body-map__silhouette"
            d="M31 71c19-10 42-7 60-9 24-2 37-16 60-20 41-7 91 7 130 22l61 7-61 8c-39 23-95 30-137 16-19-6-31-19-53-20-19-1-41 5-60-4Z"
          />
          {[
            { id: 'head', kind: 'circle' as const, x: 46, y: 69, r: 22 },
            { id: 'upper_back', kind: 'ellipse' as const, x: 130, y: 62, width: 70, height: 40 },
            { id: 'lower_back', kind: 'ellipse' as const, x: 198, y: 68, width: 64, height: 43 },
            { id: 'left_hip', kind: 'circle' as const, x: 249, y: 72, r: 22 },
            {
              id: 'left_thigh',
              kind: 'rect' as const,
              x: 268,
              y: 59,
              width: 57,
              height: 25,
              rx: 12,
            },
            {
              id: 'left_lower_leg',
              kind: 'rect' as const,
              x: 320,
              y: 63,
              width: 50,
              height: 18,
              rx: 9,
            },
          ].map(renderShape)}
        </svg>
      ) : (
        <svg viewBox="0 0 200 355" aria-labelledby={labelId}>
          <path
            className="body-map__silhouette"
            d="M100 8c-16 0-26 12-26 28 0 9 4 17 10 22-18 4-30 15-35 33l-11 48c-3 15 7 27 19 30l5 80 2 94h30l6-73 6 73h30l2-94 5-80c12-3 22-15 19-30l-11-48c-5-18-17-29-35-33 6-5 10-13 10-22 0-16-10-28-26-28Z"
          />
          {[...torso[view], ...common].map(renderShape)}
        </svg>
      )}
      <div className="body-map__legend" aria-hidden="true">
        <span>
          <i className="legend-dot legend-dot--selected" />
          Selected
        </span>
        {priorityRegions.length > 0 && (
          <span>
            <i className="legend-dot legend-dot--priority" />
            Priority
          </span>
        )}
        {cautionRegions.length > 0 && (
          <span>
            <i className="legend-dot legend-dot--caution" />
            Caution / do not treat
          </span>
        )}
      </div>
    </div>
  )
}
