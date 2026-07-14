import { format } from 'date-fns'
import { AlertCircle, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'
import { useId } from 'react'
import { Badge } from '@/components/design-system/Badge'
import type { MetricPoint } from '@/data/demo/model'
import { computeRecoveryIndex } from '@/domain/engine'

type MetricKey = 'pain' | 'stiffness' | 'rom' | 'function' | 'response' | 'recovery'

const chartWidth = 640
const chartHeight = 270
const plot = { left: 42, right: 22, top: 25, bottom: 48 }

const metricDetails: Record<
  MetricKey,
  { label: string; signature: string; lowerIsBetter: boolean; scaleMax: number }
> = {
  pain: {
    label: 'Pain over time',
    signature: 'Comfort journey',
    lowerIsBetter: true,
    scaleMax: 10,
  },
  stiffness: {
    label: 'Stiffness over time',
    signature: 'Ease of movement',
    lowerIsBetter: true,
    scaleMax: 10,
  },
  rom: {
    label: 'Range of motion over time',
    signature: 'Mobility arc',
    lowerIsBetter: false,
    scaleMax: 10,
  },
  function: {
    label: 'Functional-goal ability',
    signature: 'Everyday freedom',
    lowerIsBetter: false,
    scaleMax: 10,
  },
  response: {
    label: 'Session response',
    signature: 'Care resonance',
    lowerIsBetter: false,
    scaleMax: 10,
  },
  recovery: {
    label: 'Recovery Index',
    signature: 'Whole-person momentum',
    lowerIsBetter: false,
    scaleMax: 100,
  },
}

const getValue = (point: MetricPoint, metric: MetricKey) => {
  if (metric === 'recovery') {
    return (
      computeRecoveryIndex({ pain: point.pain, stiffness: point.stiffness, rom: point.rom })
        .score ?? 0
    )
  }
  return point[metric]
}

function curvePath(coordinates: { x: number; y: number }[]) {
  if (!coordinates.length) return ''
  return coordinates.slice(1).reduce((path, point, index) => {
    const previous = coordinates[index]!
    const midpoint = (previous.x + point.x) / 2
    return `${path} C ${midpoint} ${previous.y}, ${midpoint} ${point.y}, ${point.x} ${point.y}`
  }, `M ${coordinates[0]!.x} ${coordinates[0]!.y}`)
}

export function ProgressChart({
  points,
  metric,
  compact = false,
}: {
  points: MetricPoint[]
  metric: MetricKey
  compact?: boolean
}) {
  const uniqueId = useId().replace(/:/g, '')
  const details = metricDetails[metric]
  const data = points.map((point) => ({
    id: point.id,
    date: format(new Date(point.recordedAt), 'd MMM'),
    value: getValue(point, metric),
    events: point.events?.join(', ') ?? '',
  }))
  const first = data[0]?.value
  const last = data.at(-1)?.value
  const delta = first === undefined || last === undefined ? null : last - first
  const favourableDelta = details.lowerIsBetter && delta !== null ? -delta : delta
  const summary = !data.length
    ? 'No comparable observations are available yet.'
    : `${data.length} observations. Latest ${last} out of ${details.scaleMax}.${delta === null ? '' : ` Change from first observation: ${delta > 0 ? '+' : ''}${delta}.`}`

  if (!data.length) {
    return (
      <div className="chart-empty">
        <AlertCircle size={19} />
        <strong>{details.label}</strong>
        <span>{summary}</span>
      </div>
    )
  }

  const plotWidth = chartWidth - plot.left - plot.right
  const plotHeight = chartHeight - plot.top - plot.bottom
  const baseline = chartHeight - plot.bottom
  const coordinates = data.map((item, index) => ({
    x: plot.left + (data.length === 1 ? plotWidth / 2 : (index / (data.length - 1)) * plotWidth),
    y:
      plot.top +
      (1 - Math.max(0, Math.min(details.scaleMax, item.value)) / details.scaleMax) * plotHeight,
  }))
  const linePath = curvePath(coordinates)
  const areaPath = `${linePath} L ${coordinates.at(-1)?.x ?? plot.left} ${baseline} L ${coordinates[0]?.x ?? plot.left} ${baseline} Z`
  const ticks = details.scaleMax === 100 ? [100, 75, 50, 25, 0] : [10, 7.5, 5, 2.5, 0]
  const dateStep = Math.max(1, Math.ceil(data.length / 4))
  const direction =
    favourableDelta === null || favourableDelta === 0
      ? 'Steady'
      : favourableDelta > 0
        ? 'Moving favourably'
        : 'Needs attention'

  return (
    <section
      className={`progress-chart progress-chart--${metric}${compact ? ' progress-chart--compact' : ''}`}
      aria-labelledby={`chart-${metric}-${uniqueId}`}
    >
      <header>
        <div>
          <p className="progress-chart__signature">
            <Sparkles size={12} aria-hidden="true" /> {details.signature}
          </p>
          <h3 id={`chart-${metric}-${uniqueId}`}>{details.label}</h3>
        </div>
        {favourableDelta !== null && (
          <Badge
            tone={
              favourableDelta > 2 ? 'favourable' : favourableDelta < -2 ? 'concern' : 'attention'
            }
            icon={favourableDelta >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          >
            {delta && delta > 0 ? '+' : ''}
            {delta ?? 0}
          </Badge>
        )}
      </header>

      <div className="chart-canvas">
        <svg
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${details.label}. ${summary}`}
        >
          <title>{details.label}</title>
          <desc>{summary}</desc>
          <defs>
            <linearGradient id={`journey-area-${uniqueId}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-accent)" stopOpacity="0.38" />
              <stop offset="78%" stopColor="var(--chart-accent-soft)" stopOpacity="0.06" />
              <stop offset="100%" stopColor="var(--chart-accent-soft)" stopOpacity="0" />
            </linearGradient>
            <filter id={`journey-glow-${uniqueId}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="7" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {ticks.map((tick) => {
            const y = plot.top + (1 - tick / details.scaleMax) * plotHeight
            return (
              <g key={tick} className="journey-gridline">
                <line x1={plot.left} x2={chartWidth - plot.right} y1={y} y2={y} />
                <text x={plot.left - 10} y={y + 4} textAnchor="end">
                  {tick}
                </text>
              </g>
            )
          })}

          <path className="journey-area" d={areaPath} fill={`url(#journey-area-${uniqueId})`} />
          <path
            className="journey-line journey-line--glow"
            d={linePath}
            pathLength="1"
            filter={`url(#journey-glow-${uniqueId})`}
          />
          <path className="journey-line" d={linePath} pathLength="1" />

          {coordinates.map((coordinate, index) => {
            const item = data[index]!
            const showDate = index === 0 || index === data.length - 1 || index % dateStep === 0
            return (
              <g key={item.id} className="journey-point">
                {item.events ? (
                  <path
                    className="journey-event-star"
                    d={`M ${coordinate.x} ${coordinate.y - 18} l 3 6 7 1 -5 5 1 7 -6 -3 -6 3 1 -7 -5 -5 7 -1 Z`}
                  />
                ) : null}
                <circle
                  className="journey-point__halo"
                  cx={coordinate.x}
                  cy={coordinate.y}
                  r="10"
                />
                <circle className="journey-point__core" cx={coordinate.x} cy={coordinate.y} r="4.5">
                  <title>
                    {item.date}: {item.value} out of {details.scaleMax}
                    {item.events ? `. Context: ${item.events}` : ''}
                  </title>
                </circle>
                {showDate ? (
                  <text
                    className="journey-date"
                    x={coordinate.x}
                    y={chartHeight - 17}
                    textAnchor="middle"
                  >
                    {item.date}
                  </text>
                ) : null}
              </g>
            )
          })}
        </svg>
      </div>

      <div className="progress-chart__journey" aria-hidden="true">
        <span>
          <small>Beginning</small>
          <strong>
            {first}/{details.scaleMax}
          </strong>
        </span>
        <i />
        <span>
          <small>{direction}</small>
          <strong>
            {last}/{details.scaleMax}
          </strong>
        </span>
      </div>
      <p className="chart-summary">{summary}</p>
      {data.some((item) => item.events) && (
        <div className="chart-events">
          <span>Life context nearby</span>
          {data
            .filter((item) => item.events)
            .map((item) => (
              <i key={`${item.id}-${item.events}`}>
                {item.date} · {item.events}
              </i>
            ))}
        </div>
      )}
    </section>
  )
}
