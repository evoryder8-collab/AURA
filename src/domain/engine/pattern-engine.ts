import { computeConfidence } from './confidence'
import { PROTOTYPE_V1_CONFIG } from './config'
import { buildPatternEvidence } from './evidence'
import type {
  EvidenceStream,
  PatternEngineConfig,
  PatternEvidence,
  PatternExplanation,
  PatternObservation,
  PatternResult,
  PatternType,
  TriggeredRule,
} from './types'

const PATTERN_LABELS: Readonly<Record<PatternType, string>> = {
  building_baseline: 'Building Baseline',
  improving: 'Improving',
  mixed: 'Mixed',
  limited_change: 'Limited Change',
  maintenance: 'Maintenance',
  sustained_worsening: 'Sustained Worsening',
  medical_review_consideration: 'Medical Review Consideration',
}

interface Classification {
  readonly pattern: PatternType
  readonly rule: TriggeredRule
}

function deltaFor(
  evidence: PatternEvidence,
  stream: 'recoveryIndex' | EvidenceStream,
): number | null {
  return evidence.deltas[stream]?.favourableDelta ?? null
}

function classifyEvidence(
  evidence: PatternEvidence,
  confidenceScore: number,
  config: PatternEngineConfig,
): Classification {
  const thresholds = config.thresholds
  const pointCount = evidence.includedPoints.length
  const recoveryDelta = deltaFor(evidence, 'recoveryIndex')
  const painDelta = deltaFor(evidence, 'pain')
  const functionalDelta = deltaFor(evidence, 'functionalAbility')
  const corroboratingWorsening =
    (painDelta != null && painDelta <= -thresholds.materialStreamDelta) ||
    (functionalDelta != null && functionalDelta <= -thresholds.materialStreamDelta)
  const sustainedWorsening =
    pointCount >= thresholds.worseningMinimumPoints &&
    recoveryDelta != null &&
    recoveryDelta <= -thresholds.materialRecoveryDelta &&
    corroboratingWorsening

  if (evidence.highPainConsecutiveRun >= thresholds.highPainConsecutiveRun) {
    return {
      pattern: 'medical_review_consideration',
      rule: 'medical_review.high_pain_run',
    }
  }

  if (
    sustainedWorsening &&
    pointCount >= thresholds.supportedWorseningMinimumPoints &&
    confidenceScore >= thresholds.supportedWorseningMinimumConfidence
  ) {
    return {
      pattern: 'medical_review_consideration',
      rule: 'medical_review.supported_worsening',
    }
  }

  if (pointCount < thresholds.minimumTrendPoints) {
    return {
      pattern: 'building_baseline',
      rule: 'baseline.minimum_points',
    }
  }

  if (sustainedWorsening) {
    return {
      pattern: 'sustained_worsening',
      rule: 'sustained_worsening.corroborated_decline',
    }
  }

  const relevantDeltas = (['pain', 'stiffness', 'rom', 'functionalAbility'] as const)
    .map((stream) => evidence.deltas[stream])
    .filter(
      (delta): delta is NonNullable<typeof delta> =>
        delta != null && delta.pointCount >= thresholds.minimumTrendPoints,
    )
    .map((delta) => delta.favourableDelta)
  const hasImprovingStream = relevantDeltas.some((delta) => delta >= thresholds.materialStreamDelta)
  const hasWorseningStream = relevantDeltas.some(
    (delta) => delta <= -thresholds.materialStreamDelta,
  )
  const hasStableStream = relevantDeltas.some(
    (delta) => Math.abs(delta) <= thresholds.smallChangeRange,
  )

  if (hasImprovingStream && (hasWorseningStream || hasStableStream)) {
    return { pattern: 'mixed', rule: 'mixed.divergent_streams' }
  }

  if (
    recoveryDelta != null &&
    recoveryDelta >= thresholds.materialRecoveryDelta &&
    !hasWorseningStream
  ) {
    return {
      pattern: 'improving',
      rule: 'improving.material_recovery_rise',
    }
  }

  const relevantTrends = (
    ['recoveryIndex', 'pain', 'stiffness', 'rom', 'functionalAbility'] as const
  )
    .map((stream) => evidence.trends[stream])
    .filter(
      (trend): trend is NonNullable<typeof trend> =>
        trend != null && trend.pointCount >= thresholds.minimumTrendPoints,
    )
  const stableRanges = relevantTrends.every((trend) => trend.range <= thresholds.smallChangeRange)
  if (pointCount >= thresholds.limitedChangeMinimumPoints && stableRanges) {
    if (
      evidence.recoveryIndexAverage != null &&
      evidence.recoveryIndexAverage >= thresholds.maintenanceMinimumAverage
    ) {
      return {
        pattern: 'maintenance',
        rule: 'maintenance.stable_favourable_range',
      }
    }
    return {
      pattern: 'limited_change',
      rule: 'limited_change.small_range',
    }
  }

  return { pattern: 'mixed', rule: 'mixed.no_consistent_pattern' }
}

export function explainPattern(
  pattern: PatternType,
  triggeredRule: TriggeredRule,
  evidence: PatternEvidence,
  thresholdLabel = PROTOTYPE_V1_CONFIG.label,
): PatternExplanation {
  return {
    patternLabel: PATTERN_LABELS[pattern],
    summaryKey: `pattern.${pattern}`,
    triggeredRule,
    thresholdLabel,
    facts: {
      includedObservationCount: evidence.includedPoints.length,
      excludedPointCount: evidence.excludedPoints.length,
      recoveryIndexDelta: deltaFor(evidence, 'recoveryIndex'),
      painDelta: deltaFor(evidence, 'pain'),
      stiffnessDelta: deltaFor(evidence, 'stiffness'),
      romDelta: deltaFor(evidence, 'rom'),
      functionalAbilityDelta: deltaFor(evidence, 'functionalAbility'),
      highPainConsecutiveRun: evidence.highPainConsecutiveRun,
      contextualEventCount: evidence.contextualEventProximity.length,
    },
  }
}

export function classifyPattern(
  observations: readonly PatternObservation[],
  config: PatternEngineConfig = PROTOTYPE_V1_CONFIG,
): PatternResult {
  const evidence = buildPatternEvidence(observations, config)
  const confidence = computeConfidence(evidence.confidenceInput, config)
  const classification = classifyEvidence(evidence, confidence.score, config)
  const explanation = explainPattern(
    classification.pattern,
    classification.rule,
    evidence,
    config.label,
  )

  return {
    pattern: classification.pattern,
    confidence,
    evidence,
    triggeredRule: classification.rule,
    engineVersion: config.engineVersion,
    ruleVersion: config.ruleVersion,
    explanation,
  }
}
