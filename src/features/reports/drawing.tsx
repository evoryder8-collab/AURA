import { DETAIL_SIZE, LABEL_SIZE, MARKER_RADIUS, type ChartLayout, type FigureLayout } from './geometry'
import { SOURCE_MARKER } from '@/features/progress/model'
import { MARKER_LABEL, PRINT, type MarkerKind, type Prims } from './print'

/**
 * Charts and body markers drawn once, for two renderers: react-pdf's SVG primitives in the
 * exported file and plain SVG elements in the on-screen preview. Same marks, same words.
 */

/** Distinct shapes per source so the chart reads in grayscale; the same shapes as the Progress charts. */
export function Marker({ prims, kind, x, y, size = 3.6 }: { prims: Prims; kind: MarkerKind; x: number; y: number; size?: number }) {
  const { Circle, Rect, Polygon } = prims
  switch (kind === 'measured' ? 'dot' : SOURCE_MARKER[kind]) {
    case 'circle-open':
      return <Circle cx={x} cy={y} r={size} fill={PRINT.paper} stroke={PRINT.ink} strokeWidth={1.3} />
    case 'square':
      return <Rect x={x - size} y={y - size} width={size * 2} height={size * 2} fill={PRINT.ink} />
    case 'diamond':
      return <Polygon points={`${x},${y - size - 1} ${x + size + 1},${y} ${x},${y + size + 1} ${x - size - 1},${y}`} fill={PRINT.ink} />
    case 'triangle':
      return <Polygon points={`${x},${y - size - 0.8} ${x + size + 0.6},${y + size * 0.8} ${x - size - 0.6},${y + size * 0.8}`} fill={PRINT.ink} />
    case 'dot':
      return <Circle cx={x} cy={y} r={size} fill={PRINT.ink} />
  }
}

const legendWidth = (kind: MarkerKind) => 16 + MARKER_LABEL[kind].length * 7 * 0.52 + 14

export function LegendSvg({ prims, kinds, width }: { prims: Prims; kinds: readonly MarkerKind[]; width: number }) {
  const { Svg, G, Text } = prims
  let x = 0
  return (
    <Svg width={width} height={14} viewBox={`0 0 ${width} 14`}>
      {kinds.map((kind) => {
        const at = x
        x += legendWidth(kind)
        return (
          <G key={kind}>
            <Marker prims={prims} kind={kind} x={at + 5} y={7} size={3.4} />
            <Text x={at + 13} y={9.6} fontSize={7} fill={PRINT.muted} {...prims.regular}>
              {MARKER_LABEL[kind]}
            </Text>
          </G>
        )
      })}
    </Svg>
  )
}

export function ChartSvg({ prims, layout, line = true }: { prims: Prims; layout: ChartLayout; line?: boolean }) {
  const { Svg, G, Line, Polyline, Text } = prims
  const { plot } = layout
  return (
    <Svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
      {layout.yTicks.map((tick) => (
        <G key={`y${tick.label}`}>
          <Line x1={plot.x0} x2={plot.x1} y1={tick.y} y2={tick.y} stroke={PRINT.grid} strokeWidth={0.7} />
          <Text x={plot.x0 - 6} y={tick.y + 2.6} fontSize={7} fill={PRINT.muted} textAnchor="end" {...prims.regular}>
            {tick.label}
          </Text>
        </G>
      ))}
      <Line x1={plot.x0} x2={plot.x1} y1={plot.y0} y2={plot.y0} stroke={PRINT.line} strokeWidth={0.9} />
      {layout.xTicks.map((tick) => (
        <G key={`x${tick.x}`}>
          <Line x1={tick.x} x2={tick.x} y1={plot.y0} y2={plot.y0 + 3} stroke={PRINT.line} strokeWidth={0.9} />
          <Text x={tick.x} y={plot.y0 + 13} fontSize={7} fill={PRINT.muted} textAnchor="middle" {...prims.regular}>
            {tick.label}
          </Text>
        </G>
      ))}
      {layout.reference ? (
        <G>
          <Line
            x1={plot.x0}
            x2={plot.x1}
            y1={layout.reference.y}
            y2={layout.reference.y}
            stroke={PRINT.gold}
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          <Text x={plot.x0 + 4} y={layout.reference.y - 4} fontSize={7} fill={PRINT.gold} {...prims.bold}>
            {layout.reference.label}
          </Text>
        </G>
      ) : null}
      {line
        ? layout.segments
            .filter((segment) => segment.length > 1)
            .map((segment) => (
              <Polyline
                key={segment[0]?.at}
                points={segment.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')}
                fill="none"
                stroke={PRINT.aqua}
                strokeWidth={1.4}
                strokeLinejoin="round"
              />
            ))
        : null}
      {layout.points.map((point) => (
        <Marker key={`${point.at}-${point.source}-${point.value}`} prims={prims} kind={point.source} x={point.x} y={point.y} />
      ))}
      {layout.latest ? (
        <Text x={layout.latest.x + 7} y={layout.latest.y + 3} fontSize={8} fill={PRINT.ink} {...prims.bold}>
          {layout.latest.label}
        </Text>
      ) : null}
    </Svg>
  )
}

const LINE = 10.5

/** Score markers, leader lines and labels laid over the body image. */
export function FigureOverlay({ prims, layout }: { prims: Prims; layout: FigureLayout }) {
  const { Svg, G, Line, Circle, Text } = prims
  const { image } = layout
  return (
    <Svg width={layout.width} height={layout.height} viewBox={`0 0 ${layout.width} ${layout.height}`}>
      {layout.markers.map((item) => {
        const toward = item.side === 'right' ? 1 : -1
        const anchor = item.side === 'right' ? 'start' : 'end'
        const lineY = item.labelY + LINE / 2 - 1
        return (
          <G key={item.marker.area}>
            <Line
              x1={item.cx + toward * MARKER_RADIUS}
              y1={item.cy}
              x2={item.labelX - toward * 4}
              y2={lineY}
              stroke={PRINT.ink}
              strokeWidth={0.8}
            />
            <Circle cx={item.cx} cy={item.cy} r={MARKER_RADIUS} fill={PRINT.ink} stroke={PRINT.paper} strokeWidth={1.4} />
            <Text x={item.cx} y={item.cy + 3.2} fontSize={9} fill={PRINT.paper} textAnchor="middle" {...prims.bold}>
              {String(item.marker.pain)}
            </Text>
            {item.lines.map((text, index) => (
              <Text
                key={text}
                x={item.labelX}
                y={item.labelY + 8 + index * LINE}
                fontSize={LABEL_SIZE}
                fill={PRINT.ink}
                textAnchor={anchor}
                {...prims.bold}
              >
                {text}
              </Text>
            ))}
            <Text
              x={item.labelX}
              y={item.labelY + 8 + item.lines.length * LINE}
              fontSize={DETAIL_SIZE}
              fill={PRINT.muted}
              textAnchor={anchor}
              {...prims.regular}
            >
              {item.detail}
            </Text>
          </G>
        )
      })}
      <Text x={image.x + 4} y={layout.height - 3} fontSize={9} fill={PRINT.muted} {...prims.bold}>
        {layout.sides.left}
      </Text>
      <Text x={image.x + image.width - 4} y={layout.height - 3} fontSize={9} fill={PRINT.muted} textAnchor="end" {...prims.bold}>
        {layout.sides.right}
      </Text>
    </Svg>
  )
}
