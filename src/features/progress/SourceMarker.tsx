import { clsx } from 'clsx'
import { OBSERVATION_SOURCE_LABEL, type ObservationSource } from '@/domain/care'
import { SOURCE_MARKER, type Marker } from './model'

/** A marker drawn inside a chart, centred on (x, y). */
export function MarkerShape({ marker, x, y, size }: { marker: Marker; x: number; y: number; size: number }) {
  const r = size / 2
  switch (marker) {
    case 'circle-open':
      return <circle cx={x} cy={y} r={r - 1} className="marker marker--open" />
    case 'diamond':
      return <path d={`M${x} ${y - r - 1}L${x + r + 1} ${y}L${x} ${y + r + 1}L${x - r - 1} ${y}Z`} className="marker" />
    case 'square':
      return <rect x={x - r + 0.5} y={y - r + 0.5} width={size - 1} height={size - 1} rx="1.5" className="marker" />
    case 'triangle':
      return <path d={`M${x} ${y - r - 1}L${x + r + 0.5} ${y + r - 0.5}L${x - r - 0.5} ${y + r - 0.5}Z`} className="marker" />
    case 'dot':
      return <circle cx={x} cy={y} r={r - 1.5} className="marker" />
  }
}

/** The same marker as a small standalone icon for the legend, the detail card and the table. */
export function SourceIcon({ source, className }: { source: ObservationSource; className?: string }) {
  return (
    <svg
      className={clsx('source-icon', `tone-${source}`, className)}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <MarkerShape marker={SOURCE_MARKER[source]} x={8} y={8} size={10} />
    </svg>
  )
}

export function SourceLabel({ source }: { source: ObservationSource }) {
  return (
    <span className="source-label">
      <SourceIcon source={source} />
      {OBSERVATION_SOURCE_LABEL[source]}
    </span>
  )
}
