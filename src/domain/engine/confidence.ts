import { PROTOTYPE_V1_CONFIG } from './config'
import type {
  ConfidenceFactor,
  ConfidenceInput,
  ConfidenceLevel,
  ConfidenceResult,
  PatternEngineConfig,
} from './types'

function clampRatio(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`${label} must be finite.`)
  }
  return Math.min(1, Math.max(0, value))
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function levelForScore(score: number, config: PatternEngineConfig['confidence']): ConfidenceLevel {
  if (score >= config.highThreshold) return 'high'
  if (score >= config.moderateThreshold) return 'moderate'
  return 'low'
}

export function computeConfidence(
  input: ConfidenceInput,
  config: PatternEngineConfig = PROTOTYPE_V1_CONFIG,
): ConfidenceResult {
  if (!Number.isFinite(input.pointCount) || input.pointCount < 0) {
    throw new RangeError('Point count must be finite and non-negative.')
  }
  if (!Number.isFinite(input.timeSpanDays) || input.timeSpanDays < 0) {
    throw new RangeError('Time span must be finite and non-negative.')
  }
  if (!Number.isFinite(input.contextualEventCount) || input.contextualEventCount < 0) {
    throw new RangeError('Contextual event count must be finite and non-negative.')
  }

  const completeness = clampRatio(input.completeness, 'Completeness')
  const trendConsistency = clampRatio(input.trendConsistency, 'Trend consistency')
  const comparableMethodRatio = clampRatio(input.comparableMethodRatio, 'Comparable method ratio')
  const retrospectiveRatio = clampRatio(input.retrospectiveRatio, 'Retrospective ratio')

  const pointCountContribution =
    Math.min(input.pointCount / config.confidence.targetPointCount, 1) *
    config.confidence.weights.pointCount
  const timeSpanContribution =
    Math.min(input.timeSpanDays / config.confidence.targetTimeSpanDays, 1) *
    config.confidence.weights.timeSpan
  const completenessContribution = completeness * config.confidence.weights.completeness
  const consistencyContribution = trendConsistency * config.confidence.weights.trendConsistency
  const methodContribution = comparableMethodRatio * config.confidence.weights.comparableMethods
  const contextPenalty =
    input.contextualEventCount > 0 ? config.confidence.contextualEventPenalty : 0
  const retrospectivePenalty = retrospectiveRatio * config.confidence.maximumRetrospectivePenalty

  const factors: ConfidenceFactor[] = [
    {
      key: 'point_count',
      contribution: round(pointCountContribution),
      maximum: config.confidence.weights.pointCount,
    },
    {
      key: 'time_span',
      contribution: round(timeSpanContribution),
      maximum: config.confidence.weights.timeSpan,
    },
    {
      key: 'completeness',
      contribution: round(completenessContribution),
      maximum: config.confidence.weights.completeness,
    },
    {
      key: 'trend_consistency',
      contribution: round(consistencyContribution),
      maximum: config.confidence.weights.trendConsistency,
    },
    {
      key: 'comparable_methods',
      contribution: round(methodContribution),
      maximum: config.confidence.weights.comparableMethods,
    },
    {
      key: 'contextual_events',
      contribution: round(-contextPenalty),
      maximum: config.confidence.contextualEventPenalty,
    },
    {
      key: 'retrospective_entries',
      contribution: round(-retrospectivePenalty),
      maximum: config.confidence.maximumRetrospectivePenalty,
    },
  ]

  const unboundedScore =
    pointCountContribution +
    timeSpanContribution +
    completenessContribution +
    consistencyContribution +
    methodContribution -
    contextPenalty -
    retrospectivePenalty
  const score = round(Math.min(100, Math.max(0, unboundedScore)))

  return {
    score,
    level: levelForScore(score, config.confidence),
    factors,
  }
}
