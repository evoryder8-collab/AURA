import type { TrendDirection, WeightedTrendPoint, WeightedTrendResult } from './types'

const DAY_IN_MS = 86_400_000
const ROUNDING_FACTOR = 10_000

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * ROUNDING_FACTOR) / ROUNDING_FACTOR
}

function timestamp(value: string | Date): number {
  const result = value instanceof Date ? value.getTime() : Date.parse(value)
  if (!Number.isFinite(result)) {
    throw new RangeError('Trend point observedAt must be a valid timestamp.')
  }
  return result
}

function trendDirection(delta: number, stableDelta: number): TrendDirection {
  if (delta > stableDelta) return 'rising'
  if (delta < -stableDelta) return 'falling'
  return 'stable'
}

export function computeWeightedTrend(
  input: readonly WeightedTrendPoint[],
  stableDelta = 0,
): WeightedTrendResult | null {
  if (!Number.isFinite(stableDelta) || stableDelta < 0) {
    throw new RangeError('Stable delta must be finite and non-negative.')
  }
  if (input.length === 0) return null

  const points = input
    .map((point, originalIndex) => {
      if (!Number.isFinite(point.value)) {
        throw new RangeError('Trend point values must be finite.')
      }
      const weight = point.weight ?? 1
      if (!Number.isFinite(weight) || weight <= 0) {
        throw new RangeError('Trend point weights must be finite and positive.')
      }
      return {
        value: point.value,
        time: timestamp(point.observedAt),
        weight,
        originalIndex,
      }
    })
    .sort((left, right) => left.time - right.time || left.originalIndex - right.originalIndex)

  const first = points[0]
  const last = points.at(-1)
  if (first == null || last == null) return null

  const timeValues = points.map((point) => (point.time - first.time) / DAY_IN_MS)
  const totalWeight = points.reduce((sum, point) => sum + point.weight, 0)
  const weightedMeanTime =
    points.reduce((sum, point, index) => sum + (timeValues[index] ?? 0) * point.weight, 0) /
    totalWeight
  const weightedMeanValue =
    points.reduce((sum, point) => sum + point.value * point.weight, 0) / totalWeight

  let numerator = 0
  let denominator = 0
  for (const [index, point] of points.entries()) {
    const centeredTime = (timeValues[index] ?? 0) - weightedMeanTime
    numerator += point.weight * centeredTime * (point.value - weightedMeanValue)
    denominator += point.weight * centeredTime * centeredTime
  }

  const delta = last.value - first.value
  const direction = trendDirection(delta, stableDelta)
  const stepDirections: TrendDirection[] = []
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    if (previous != null && current != null) {
      stepDirections.push(trendDirection(current.value - previous.value, stableDelta))
    }
  }

  const consistency =
    stepDirections.length === 0
      ? 1
      : stepDirections.filter((step) => {
          if (direction === 'stable') return step === 'stable'
          return step === direction || step === 'stable'
        }).length / stepDirections.length

  const values = points.map((point) => point.value)
  const range = Math.max(...values) - Math.min(...values)

  return {
    pointCount: points.length,
    start: first.value,
    end: last.value,
    delta: round(delta),
    range: round(range),
    slopePerDay: round(denominator === 0 ? 0 : numerator / denominator),
    direction,
    consistency: round(consistency),
    timeSpanDays: round((last.time - first.time) / DAY_IN_MS),
  }
}
