import { clsx } from 'clsx'
import { useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { fmtShortDate } from '@/lib/formatting/time'
import { DAY_MS, lineSegments, type Gap, type Marker, type TimeWindow, type Tone, type Visit } from './model'
import { MarkerShape } from './SourceMarker'

export type ChartDatum = {
  readonly id: string
  readonly at: number
  readonly value: number
  readonly marker: Marker
  readonly tone: Tone
  /** Read by screen readers on the point's button: date, value with unit, source. */
  readonly label: string
}

export type ChartScale = {
  readonly min: number
  readonly max: number
  readonly ticks: readonly number[]
  readonly format: (value: number) => string
}

type Props = {
  readonly label: string
  readonly window: TimeWindow
  readonly scale: ChartScale
  readonly data: readonly ChartDatum[]
  readonly visits: readonly Visit[]
  readonly gaps?: readonly Gap[]
  readonly line?: 'solid' | 'dashed' | 'none'
  readonly bars?: boolean
  readonly showVisitNames?: boolean
  /** A reference band, e.g. the typical range of a movement. */
  readonly reference?: { readonly from: number; readonly to: number; readonly label: string }
  /** Visits with nothing to plot (no reply), drawn as an empty outline on the baseline. */
  readonly empty?: ReadonlyArray<{ readonly at: number; readonly id: string }>
  readonly selectedId: string | null
  readonly onSelect: (id: string) => void
  readonly detailId?: string
  readonly height?: number
}

const LABEL_FONT = 11
const textWidth = (text: string) => text.length * LABEL_FONT * 0.58 + 8

function useWidth(fallback: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const element = ref.current
    if (!element) return
    const update = () => {
      if (element.clientWidth > 0) setWidth(element.clientWidth)
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/** Day ticks at local midnight, spaced so labels never touch. */
function dayTicks(window: TimeWindow, plotWidth: number) {
  const days = Math.max(1, (window.to - window.from) / DAY_MS)
  const fit = Math.max(1, Math.floor(plotWidth / 70))
  const step = [1, 2, 3, 7, 14, 21, 28, 56, 91].find((value) => days / value <= fit) ?? Math.ceil(days / fit)
  const ticks: number[] = []
  const first = new Date(window.from)
  first.setHours(0, 0, 0, 0)
  if (first.getTime() < window.from) first.setDate(first.getDate() + 1)
  for (const day = first; day.getTime() <= window.to; day.setDate(day.getDate() + step)) ticks.push(day.getTime())
  return ticks
}

/** Visit labels: first names in one or two rows, initials if names cannot fit, none if even those collide. */
function visitLabelLayout(xs: readonly number[], names: readonly string[]) {
  for (const mode of ['name', 'initial'] as const) {
    const texts = names.map((name) => (mode === 'name' ? name : (name[0] ?? '')))
    for (const rows of [1, 2] as const) {
      const fits = xs.every((x, index) => {
        const next = xs[index + rows]
        const nextText = texts[index + rows]
        return next === undefined || nextText === undefined
          ? true
          : next - x >= (textWidth(texts[index] ?? '') + textWidth(nextText)) / 2
      })
      if (fits) return { mode, rows, texts }
    }
  }
  return { mode: 'none' as const, rows: 1 as const, texts: names.map(() => '') }
}

export function TimeChart({
  label,
  window,
  scale,
  data,
  visits,
  gaps = [],
  line = 'solid',
  bars = false,
  showVisitNames = false,
  reference,
  empty = [],
  selectedId,
  onSelect,
  detailId,
  height = 200,
}: Props) {
  const [wrapRef, width] = useWidth(640)
  const svgRef = useRef<SVGSVGElement>(null)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const plotVisits = visits.filter((visit) => visit.end >= window.from && visit.at <= window.to)
  const left = 38
  const plotWidth = Math.max(40, width - left - 14)
  const span = Math.max(1, window.to - window.from)
  const x = (at: number) => left + ((Math.min(Math.max(at, window.from), window.to) - window.from) / span) * plotWidth
  const labelLayout = visitLabelLayout(
    plotVisits.map((visit) => x(visit.at)),
    plotVisits.map((visit) => visit.therapistName),
  )
  const visitRows = showVisitNames && labelLayout.mode !== 'none' ? labelLayout.rows : 0
  const margin = { top: 14 + visitRows * 15, right: 14, bottom: 28, left }
  const plotHeight = height - margin.top - margin.bottom
  const y = (value: number) => margin.top + (1 - (value - scale.min) / (scale.max - scale.min)) * plotHeight
  const right = margin.left + plotWidth
  const bottom = margin.top + plotHeight
  const baseline = y(Math.min(Math.max(0, scale.min), scale.max))
  const selected = data.find((item) => item.id === selectedId)
  const focusId = selected?.id ?? data.at(-1)?.id

  const ticks = dayTicks(window, plotWidth).filter((tick) => right - x(tick) > 44)

  const move = (event: KeyboardEvent<SVGGElement>, index: number) => {
    const last = data.length - 1
    const target =
      event.key === 'ArrowRight' || event.key === 'ArrowUp'
        ? Math.min(last, index + 1)
        : event.key === 'ArrowLeft' || event.key === 'ArrowDown'
          ? Math.max(0, index - 1)
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : event.key === 'Enter' || event.key === ' '
                ? index
                : null
    if (target === null) return
    event.preventDefault()
    const next = data[target]
    if (!next) return
    onSelect(next.id)
    const points = svgRef.current?.querySelectorAll<SVGGElement>('[data-point]') ?? []
    ;[...points].find((point) => point.dataset.point === next.id)?.focus()
  }

  // A tap anywhere in the plot picks the nearest point, so dense stretches stay usable on touch.
  const pickNearest = (event: MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.width === 0 || !data.length) return
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    let best: { id: string; distance: number } | null = null
    for (const item of data) {
      const distance = Math.hypot(x(item.at) - px, (y(item.value) - py) * 0.5)
      if (!best || distance < best.distance) best = { id: item.id, distance }
    }
    if (best && best.distance < 48) onSelect(best.id)
  }

  const segments = line === 'none' || bars ? [] : lineSegments(data, gaps)
  const barWidth = Math.max(8, Math.min(18, plotWidth / Math.max(1, data.length + empty.length) / 3))

  return (
    <div ref={wrapRef} className="time-chart">
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="group"
        aria-label={`${label}. Use the arrow keys to move between entries.`}
        onClick={pickNearest}
      >
        <defs>
          <pattern id={`hatch-${uid}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1="0" y1="0" x2="0" y2="7" className="time-chart__hatch-line" />
          </pattern>
        </defs>

        {reference ? (
          <g className="time-chart__reference">
            <rect x={margin.left} width={plotWidth} y={y(reference.to)} height={Math.max(0, y(reference.from) - y(reference.to))} />
            <line x1={margin.left} x2={right} y1={y(reference.to)} y2={y(reference.to)} />
            <text x={right - 4} y={y(reference.to) - 5} textAnchor="end">
              {reference.label}
            </text>
          </g>
        ) : null}

        <g className="time-chart__grid" aria-hidden="true">
          {scale.ticks.map((tick) => (
            <g key={tick}>
              <line x1={margin.left} x2={right} y1={y(tick)} y2={y(tick)} />
              <text x={margin.left - 8} y={y(tick) + 4} textAnchor="end">
                {scale.format(tick)}
              </text>
            </g>
          ))}
        </g>

        <g className="time-chart__visits" aria-hidden="true">
          {plotVisits.map((visit, index) => {
            const start = x(visit.at)
            const actual = x(visit.end) - start
            const bandWidth = Math.max(10, actual)
            const bandX = start - (bandWidth - actual) / 2
            const text = labelLayout.texts[index] ?? ''
            const half = textWidth(text) / 2
            const labelX = Math.min(Math.max(bandX + bandWidth / 2, half), width - half)
            return (
              <g key={visit.id}>
                <rect x={bandX} width={bandWidth} y={margin.top} height={plotHeight} rx="3" />
                {showVisitNames && text ? (
                  <text x={labelX} y={11 + (index % labelLayout.rows) * 15} textAnchor="middle">
                    {text}
                  </text>
                ) : null}
              </g>
            )
          })}
        </g>

        <g className="time-chart__gaps" aria-hidden="true">
          {gaps.map((gap) => {
            const gapX = x(gap.from)
            const gapWidth = x(gap.to) - gapX
            const horizontal = textWidth(gap.label) <= gapWidth - 6
            const middle = gapX + gapWidth / 2
            const centre = margin.top + plotHeight / 2
            return (
              <g key={`${gap.from}-${gap.to}`} className="time-chart__gap">
                <rect x={gapX} width={gapWidth} y={margin.top} height={plotHeight} fill={`url(#hatch-${uid})`} />
                <line x1={gapX} x2={gapX} y1={margin.top} y2={bottom} />
                <line x1={gapX + gapWidth} x2={gapX + gapWidth} y1={margin.top} y2={bottom} />
                {horizontal ? (
                  <text x={middle} y={centre + 4} textAnchor="middle">
                    {gap.label}
                  </text>
                ) : gapWidth >= 14 && textWidth(gap.label) <= plotHeight - 8 ? (
                  <text x={middle + 4} y={centre} textAnchor="middle" transform={`rotate(-90 ${middle + 4} ${centre})`}>
                    {gap.label}
                  </text>
                ) : null}
              </g>
            )
          })}
        </g>

        <g className="time-chart__axis" aria-hidden="true">
          <line x1={margin.left} x2={right} y1={bottom} y2={bottom} />
          {ticks.map((tick) => {
            const tx = x(tick)
            const crowded = tx - margin.left < 16
            return (
              <g key={tick}>
                <line x1={tx} x2={tx} y1={bottom} y2={bottom + 4} />
                <text x={tx} y={bottom + 17} textAnchor={crowded ? 'start' : 'middle'}>
                  {fmtShortDate(tick + DAY_MS / 2)}
                </text>
              </g>
            )
          })}
          <text x={right} y={bottom + 17} textAnchor="end" className="time-chart__today">
            Today
          </text>
        </g>

        {segments.map((segment) => (
          <path
            key={`${segment[0]?.id}`}
            className={clsx('time-chart__line', line === 'dashed' && 'time-chart__line--dashed')}
            pathLength={line === 'solid' ? 1 : undefined}
            d={segment.map((item, index) => `${index ? 'L' : 'M'}${x(item.at).toFixed(1)} ${y(item.value).toFixed(1)}`).join(' ')}
            aria-hidden="true"
          />
        ))}

        {selected ? (
          <line
            className="time-chart__guide"
            x1={x(selected.at)}
            x2={x(selected.at)}
            y1={margin.top}
            y2={bottom}
            aria-hidden="true"
          />
        ) : null}

        {empty.map((item) => (
          <rect
            key={item.id}
            className="time-chart__empty"
            x={x(item.at) - barWidth / 2}
            width={barWidth}
            y={baseline - 6}
            height={12}
            rx="3"
            aria-hidden="true"
          />
        ))}

        {data.map((item, index) => {
          const px = x(item.at)
          const py = y(item.value)
          const isSelected = item.id === selectedId
          return (
            <g
              key={item.id}
              data-point={item.id}
              className={clsx('time-chart__point', `tone-${item.tone}`, isSelected && 'is-selected')}
              role="button"
              tabIndex={item.id === focusId ? 0 : -1}
              aria-pressed={isSelected}
              aria-label={item.label}
              aria-describedby={isSelected && detailId ? detailId : undefined}
              onClick={(event) => {
                event.stopPropagation()
                onSelect(item.id)
              }}
              onKeyDown={(event) => move(event, index)}
            >
              <circle cx={px} cy={py} r="22" className="time-chart__hit" />
              {bars ? (
                item.value === 0 ? (
                  <rect x={px - barWidth / 2} width={barWidth} y={baseline - 2} height={4} rx="2" className="time-chart__bar" />
                ) : (
                  <rect
                    x={px - barWidth / 2}
                    width={barWidth}
                    y={Math.min(py, baseline)}
                    height={Math.abs(baseline - py)}
                    rx="3"
                    className="time-chart__bar"
                  />
                )
              ) : (
                <MarkerShape marker={item.marker} x={px} y={py} size={isSelected ? 16 : 11} />
              )}
              <circle cx={px} cy={py} r="15" className="time-chart__focus" />
            </g>
          )
        })}
      </svg>
    </div>
  )
}
