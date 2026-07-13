import type { PatternEngineConfig } from './types'

export const PROTOTYPE_PATTERN_THRESHOLD_LABEL =
  'Prototype pattern thresholds — not clinically validated.'

export const PROTOTYPE_V1_CONFIG: PatternEngineConfig = {
  engineVersion: 'aura-pattern-engine-v1',
  ruleVersion: 'prototype-v1',
  label: PROTOTYPE_PATTERN_THRESHOLD_LABEL,
  recoveryWeights: {
    pain: 0.45,
    stiffness: 0.35,
    rom: 0.2,
  },
  thresholds: {
    minimumTrendPoints: 3,
    limitedChangeMinimumPoints: 4,
    worseningMinimumPoints: 4,
    materialRecoveryDelta: 8,
    materialStreamDelta: 8,
    smallChangeRange: 5,
    maintenanceMinimumAverage: 75,
    highPainThreshold: 7,
    highPainConsecutiveRun: 3,
    supportedWorseningMinimumConfidence: 75,
    supportedWorseningMinimumPoints: 6,
    contextWindowDays: 3,
    contextualChangeDelta: 6,
  },
  confidence: {
    targetPointCount: 6,
    targetTimeSpanDays: 28,
    weights: {
      pointCount: 25,
      timeSpan: 15,
      completeness: 25,
      trendConsistency: 25,
      comparableMethods: 10,
    },
    contextualEventPenalty: 5,
    maximumRetrospectivePenalty: 10,
    moderateThreshold: 50,
    highThreshold: 75,
  },
}
