import { isGap, type AreaKey } from '@/domain/care'
import { addDays, practiceMidnight } from '@/lib/dates/practice'
import {
  fmtDayMonth,
  fmtMed,
  practiceDay,
  type FigureMarker,
  type ReportChart,
  type SeriesPoint,
} from './model'

/** Pure layout shared by the on-screen preview and the PDF, so both draw the same marks. */

const DAY = 86_400_000
const time = (iso: string) => new Date(iso).getTime()

export type PlottedPoint = SeriesPoint & { readonly x: number; readonly y: number }

export type ChartLayout = {
  readonly width: number
  readonly height: number
  readonly plot: { readonly x0: number; readonly x1: number; readonly y0: number; readonly y1: number }
  readonly points: readonly PlottedPoint[]
  /** Runs of points joined by a line; a gap longer than GAP_DAYS starts a new run. */
  readonly segments: ReadonlyArray<readonly PlottedPoint[]>
  readonly xTicks: ReadonlyArray<{ readonly x: number; readonly label: string }>
  readonly yTicks: ReadonlyArray<{ readonly y: number; readonly label: string }>
  readonly reference: { readonly y: number; readonly label: string } | null
  readonly latest: { readonly x: number; readonly y: number; readonly label: string } | null
}

const TICK_STEPS_DAYS = [1, 2, 7, 14, 28, 56, 91, 182]

/** Pain charts get the most height; range of motion and goals sit lower so a section keeps to a page. */
export const chartHeight = (chart: ReportChart) => (chart.key.startsWith('pain-') ? 132 : 116)

export function chartLayout(chart: ReportChart, from: string, to: string, width: number, height: number): ChartLayout {
  const plot = { x0: 34, x1: width - 40, y0: height - 22, y1: 12 }
  const t0 = time(from)
  const t1 = Math.max(time(to), t0 + DAY)
  const x = (at: number) => plot.x0 + ((at - t0) / (t1 - t0)) * (plot.x1 - plot.x0)
  const y = (value: number) => plot.y0 - (value / chart.yMax) * (plot.y0 - plot.y1)
  const points = chart.points.map((point) => ({ ...point, x: x(time(point.at)), y: y(point.value) }))

  const segments: PlottedPoint[][] = []
  points.forEach((point, index) => {
    const previous = points[index - 1]
    if (!previous || isGap(time(previous.at), time(point.at))) segments.push([point])
    else segments.at(-1)?.push(point)
  })

  const spanDays = (t1 - t0) / DAY
  const maxTicks = Math.max(2, Math.floor((plot.x1 - plot.x0) / 40))
  const step = TICK_STEPS_DAYS.find((days) => spanDays / days < maxTicks) ?? 365
  const xTicks: Array<{ x: number; label: string }> = []
  const firstDay = practiceDay(from)
  for (let index = 0; index < 60; index += 1) {
    const at = practiceMidnight(addDays(firstDay, index * step))
    if (time(at) > t1) break
    if (time(at) >= t0) xTicks.push({ x: x(time(at)), label: fmtDayMonth(at) })
  }

  const yStep = chart.yMax <= 10 ? 2 : chart.yMax <= 120 ? 20 : 40
  const yTicks: Array<{ y: number; label: string }> = []
  for (let value = 0; value <= chart.yMax; value += yStep) {
    yTicks.push({ y: y(value), label: `${value}${chart.unit === '°' ? '°' : ''}` })
  }

  const last = points.at(-1)
  return {
    width,
    height,
    plot,
    points,
    segments,
    xTicks,
    yTicks,
    reference: chart.reference ? { y: y(chart.reference.value), label: chart.reference.label } : null,
    latest: last ? { x: last.x, y: last.y, label: `${last.value}${chart.unit}` } : null,
  }
}

// ---------------------------------------------------------------- body figure

/**
 * One rendered view of the anatomical model: the image and the orthographic frame it shows,
 * in model units (glTF metres, +X = anatomical left, +Y = up). `left`/`right` are the model x
 * at the image's left and right edges, so the mirrored back view simply has left > right.
 */
export type BodyFrame = {
  readonly src: string
  readonly width: number
  readonly height: number
  readonly left: number
  readonly right: number
  readonly top: number
  readonly bottom: number
}

export type BodyAssets = {
  readonly views: Readonly<Record<'front' | 'back', BodyFrame>>
  /** Model-space x/y of each area's surface anchor. */
  readonly anchors: ReadonlyMap<AreaKey, readonly [number, number]>
}

/** Where a model point falls on the image, as fractions of its width and height. */
export function projectToImage(frame: BodyFrame, [x, y]: readonly [number, number]) {
  return {
    u: (x - frame.left) / (frame.right - frame.left),
    v: (frame.top - y) / (frame.top - frame.bottom),
  }
}

const CHAR_WIDTH = 0.56 // Helvetica, generous so an estimate never overflows its column

export function wrapWords(text: string, maxWidth: number, fontSize: number): string[] {
  const limit = Math.max(4, Math.floor(maxWidth / (fontSize * CHAR_WIDTH)))
  const lines: string[] = []
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const current = lines.at(-1)
    if (current !== undefined && `${current} ${word}`.length <= limit) lines[lines.length - 1] = `${current} ${word}`
    else lines.push(word)
  }
  return lines
}

export type PlacedMarker = {
  readonly marker: FigureMarker
  readonly cx: number
  readonly cy: number
  /** Which side of the drawing the label sits on. */
  readonly side: 'left' | 'right'
  readonly labelX: number
  readonly labelY: number
  readonly lines: readonly string[]
  readonly detail: string
}

export type FigureLayout = {
  readonly width: number
  readonly height: number
  readonly image: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  readonly markers: readonly PlacedMarker[]
  /** Letters printed under the figure's left and right edges: the client's own sides. */
  readonly sides: { readonly left: 'R' | 'L'; readonly right: 'R' | 'L' }
  readonly missing: readonly FigureMarker[]
}

export const MARKER_RADIUS = 9
export const LABEL_SIZE = 8.5
export const DETAIL_SIZE = 7.5
const LABEL_MARGIN = 14
const MIN_COLUMN = 104
const LINE_HEIGHT = 10.5
const LABEL_GAP = 6

export function figureLayout(input: {
  readonly frame: BodyFrame
  readonly anchors: BodyAssets['anchors']
  readonly markers: readonly FigureMarker[]
  readonly width: number
  readonly height: number
}): FigureLayout {
  const { frame, width, height } = input
  const imageHeight = height - 16
  const imageWidth = imageHeight * (frame.width / frame.height)
  const front = frame.right > frame.left

  const missing: FigureMarker[] = []
  const projected = input.markers.flatMap((marker) => {
    const anchor = input.anchors.get(marker.area)
    if (!anchor) {
      missing.push(marker)
      return []
    }
    const { u, v } = projectToImage(frame, anchor)
    return [{ marker, u, v, side: (u >= 0.5 ? 'right' : 'left') as 'left' | 'right' }]
  })

  // Centred unless the labels' only side is too narrow; then the drawing makes room for them.
  const sides = new Set(projected.map((item) => item.side))
  let imageX = (width - imageWidth) / 2
  if (sides.size === 1 && imageX - LABEL_MARGIN < MIN_COLUMN) {
    imageX = sides.has('right')
      ? Math.max(2, width - imageWidth - LABEL_MARGIN - MIN_COLUMN)
      : Math.min(width - imageWidth - 2, LABEL_MARGIN + MIN_COLUMN)
  }
  const image = { x: imageX, y: 0, width: imageWidth, height: imageHeight }
  const column = { left: image.x - LABEL_MARGIN, right: width - image.x - image.width - LABEL_MARGIN }

  const placed = projected.map(({ marker, u, v, side }) => {
    const room = Math.max(40, column[side])
    const date = fmtMed(marker.observedAt)
    const detail = `recorded ${date}`.length * DETAIL_SIZE * CHAR_WIDTH <= room ? `recorded ${date}` : date
    return {
      marker,
      cx: image.x + u * image.width,
      cy: image.y + v * image.height,
      side,
      lines: wrapWords(`${marker.label} ${marker.pain}/10`, room, LABEL_SIZE),
      detail,
    }
  })

  const result: PlacedMarker[] = []
  for (const side of ['left', 'right'] as const) {
    const group = placed.filter((item) => item.side === side).sort((a, b) => a.cy - b.cy)
    const span = (item: (typeof group)[number]) => (item.lines.length + 1) * LINE_HEIGHT
    let floor = 0
    const ys = group.map((item) => {
      const y = Math.max(item.cy - LINE_HEIGHT / 2, floor)
      floor = y + span(item) + LABEL_GAP
      return y
    })
    // Pull the stack back up if it ran past the foot of the drawing.
    let limit = imageHeight
    for (let index = group.length - 1; index >= 0; index -= 1) {
      const item = group[index] as (typeof group)[number]
      const y = Math.min(ys[index] as number, limit - span(item))
      ys[index] = y
      limit = y - LABEL_GAP
    }
    group.forEach((item, index) => {
      result.push({
        ...item,
        labelX: side === 'right' ? image.x + image.width + LABEL_MARGIN - 4 : image.x - LABEL_MARGIN + 4,
        labelY: ys[index] as number,
      })
    })
  }

  return {
    width,
    height,
    image,
    markers: result,
    sides: front ? { left: 'R', right: 'L' } : { left: 'L', right: 'R' },
    missing,
  }
}
