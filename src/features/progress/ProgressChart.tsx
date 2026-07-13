import { format } from 'date-fns'
import { AlertCircle, TrendingDown, TrendingUp } from 'lucide-react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Badge } from '@/components/design-system/Badge'
import type { MetricPoint } from '@/data/demo/model'
import { computeRecoveryIndex } from '@/domain/engine'

type MetricKey = 'pain' | 'stiffness' | 'rom' | 'function' | 'response' | 'recovery'

const labels: Record<MetricKey, string> = {
  pain: 'Pain over time',
  stiffness: 'Stiffness over time',
  rom: 'Range of motion over time',
  function: 'Functional-goal ability',
  response: 'Session response',
  recovery: 'Recovery Index',
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

export function ProgressChart({
  points,
  metric,
  compact = false,
}: {
  points: MetricPoint[]
  metric: MetricKey
  compact?: boolean
}) {
  const data = points.map((point) => ({
    date: format(new Date(point.recordedAt), 'd MMM'),
    value: getValue(point, metric),
    events: point.events?.join(', ') ?? '',
  }))
  const first = data[0]?.value
  const last = data.at(-1)?.value
  const delta = first === undefined || last === undefined ? null : last - first
  const favourableDelta =
    metric === 'pain' || metric === 'stiffness' ? (delta === null ? null : -delta) : delta
  const scaleMax = metric === 'recovery' ? 100 : 10
  const summary = !data.length
    ? 'No comparable observations are available yet.'
    : `${data.length} observations. Latest ${last} out of ${scaleMax}.${delta === null ? '' : ` Change from first observation: ${delta > 0 ? '+' : ''}${delta}.`}`

  if (!data.length) {
    return (
      <div className="chart-empty">
        <AlertCircle size={19} />
        <strong>{labels[metric]}</strong>
        <span>{summary}</span>
      </div>
    )
  }

  return (
    <section
      className={`progress-chart${compact ? ' progress-chart--compact' : ''}`}
      aria-labelledby={`chart-${metric}`}
    >
      <header>
        <div>
          <p className="eyebrow">Recorded measure</p>
          <h3 id={`chart-${metric}`}>{labels[metric]}</h3>
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
      <div className="chart-canvas" role="img" aria-label={`${labels[metric]}. ${summary}`}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 12, right: 8, bottom: 2, left: -24 }}>
            <CartesianGrid vertical={false} stroke="rgba(24,32,29,.08)" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: '#7b847f' }}
            />
            <YAxis
              domain={[0, scaleMax]}
              ticks={metric === 'recovery' ? [0, 25, 50, 75, 100] : [0, 2, 4, 6, 8, 10]}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: '#7b847f' }}
            />
            <ReferenceLine
              y={metric === 'recovery' ? 50 : 5}
              stroke="rgba(173,117,43,.28)"
              strokeDasharray="4 5"
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: '1px solid rgba(24,32,29,.12)',
                fontSize: 12,
              }}
              formatter={(value) => [`${value}/${scaleMax}`, labels[metric]]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#426b5a"
              strokeWidth={2.5}
              dot={{ r: 3, fill: '#fdfbf7', strokeWidth: 2 }}
              activeDot={{ r: 5 }}
              isAnimationActive={!window.matchMedia('(prefers-reduced-motion: reduce)').matches}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className="chart-summary">{summary}</p>
      {data.some((item) => item.events) && (
        <div className="chart-events">
          <span>Context nearby</span>
          {data
            .filter((item) => item.events)
            .map((item) => (
              <i key={`${item.date}-${item.events}`}>
                {item.date} · {item.events}
              </i>
            ))}
        </div>
      )}
    </section>
  )
}
