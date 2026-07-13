export const PATTERN_TYPES = [
  'building_baseline',
  'improving',
  'mixed',
  'limited_change',
  'maintenance',
  'sustained_worsening',
  'medical_review_consideration',
] as const

export type PatternType = (typeof PATTERN_TYPES)[number]

export const RECOVERY_STREAMS = ['pain', 'stiffness', 'rom'] as const
export type RecoveryStream = (typeof RECOVERY_STREAMS)[number]

export const EVIDENCE_STREAMS = [...RECOVERY_STREAMS, 'functionalAbility'] as const
export type EvidenceStream = (typeof EVIDENCE_STREAMS)[number]

export type ObservationMetric = EvidenceStream | 'observation'

export type ScoreReading =
  | number
  | {
      readonly value: number
      readonly method?: string | undefined
    }

export interface ContextEvent {
  readonly id: string
  readonly type: string
  readonly occurredAt: string | Date
}

export interface PatternObservation {
  readonly id: string
  readonly observedAt: string | Date
  readonly pain?: ScoreReading | null | undefined
  readonly stiffness?: ScoreReading | null | undefined
  readonly rom?: ScoreReading | null | undefined
  readonly functionalAbility?: ScoreReading | null | undefined
  readonly contextEvents?: readonly ContextEvent[] | undefined
  readonly retrospective?: boolean | undefined
}

export interface RecoveryIndexWeights {
  readonly pain: number
  readonly stiffness: number
  readonly rom: number
}

export interface RecoveryIndexInput {
  readonly pain?: number | null
  readonly stiffness?: number | null
  readonly rom?: number | null
}

export interface RecoveryIndexResult {
  readonly score: number | null
  readonly favourableScores: Readonly<Record<RecoveryStream, number | null>>
  readonly appliedWeights: Readonly<Record<RecoveryStream, number>>
  readonly availableWeight: number
  readonly includedStreams: readonly RecoveryStream[]
  readonly missingStreams: readonly RecoveryStream[]
}

export interface WeightedTrendPoint {
  readonly value: number
  readonly observedAt: string | Date
  readonly weight?: number
}

export type TrendDirection = 'rising' | 'falling' | 'stable'

export interface WeightedTrendResult {
  readonly pointCount: number
  readonly start: number
  readonly end: number
  readonly delta: number
  readonly range: number
  readonly slopePerDay: number
  readonly direction: TrendDirection
  readonly consistency: number
  readonly timeSpanDays: number
}

export interface PatternEngineConfig {
  readonly engineVersion: string
  readonly ruleVersion: string
  readonly label: string
  readonly recoveryWeights: RecoveryIndexWeights
  readonly thresholds: {
    readonly minimumTrendPoints: number
    readonly limitedChangeMinimumPoints: number
    readonly worseningMinimumPoints: number
    readonly materialRecoveryDelta: number
    readonly materialStreamDelta: number
    readonly smallChangeRange: number
    readonly maintenanceMinimumAverage: number
    readonly highPainThreshold: number
    readonly highPainConsecutiveRun: number
    readonly supportedWorseningMinimumConfidence: number
    readonly supportedWorseningMinimumPoints: number
    readonly contextWindowDays: number
    readonly contextualChangeDelta: number
  }
  readonly confidence: {
    readonly targetPointCount: number
    readonly targetTimeSpanDays: number
    readonly weights: {
      readonly pointCount: number
      readonly timeSpan: number
      readonly completeness: number
      readonly trendConsistency: number
      readonly comparableMethods: number
    }
    readonly contextualEventPenalty: number
    readonly maximumRetrospectivePenalty: number
    readonly moderateThreshold: number
    readonly highThreshold: number
  }
}

export type ExclusionReason =
  'invalid_timestamp' | 'invalid_score' | 'incompatible_method' | 'no_recovery_stream'

export interface ExcludedEvidencePoint {
  readonly observationId: string
  readonly metric: ObservationMetric
  readonly reason: ExclusionReason
  readonly method: string | null
}

export interface IncludedEvidencePoint {
  readonly observationId: string
  readonly observedAt: string
  readonly rawScores: Readonly<Record<EvidenceStream, number | null>>
  readonly favourableScores: Readonly<Record<EvidenceStream, number | null>>
  readonly recoveryIndex: number
  readonly includedRecoveryStreams: readonly RecoveryStream[]
  readonly retrospective: boolean
}

export interface DeltaEvidence {
  readonly pointCount: number
  readonly start: number
  readonly end: number
  readonly delta: number
  readonly favourableDelta: number
}

export interface ContextEventProximity {
  readonly eventId: string
  readonly eventType: string
  readonly eventOccurredAt: string
  readonly observationId: string
  readonly observationOccurredAt: string
  readonly distanceDays: number
  readonly nearbyRecoveryChange: number
}

export interface ConfidenceInput {
  readonly pointCount: number
  readonly timeSpanDays: number
  readonly completeness: number
  readonly trendConsistency: number
  readonly comparableMethodRatio: number
  readonly contextualEventCount: number
  readonly retrospectiveRatio: number
}

export type ConfidenceLevel = 'low' | 'moderate' | 'high'

export interface ConfidenceFactor {
  readonly key:
    | 'point_count'
    | 'time_span'
    | 'completeness'
    | 'trend_consistency'
    | 'comparable_methods'
    | 'contextual_events'
    | 'retrospective_entries'
  readonly contribution: number
  readonly maximum: number
}

export interface ConfidenceResult {
  readonly score: number
  readonly level: ConfidenceLevel
  readonly factors: readonly ConfidenceFactor[]
}

export interface PatternEvidence {
  readonly includedPoints: readonly IncludedEvidencePoint[]
  readonly excludedPoints: readonly ExcludedEvidencePoint[]
  readonly deltas: Readonly<Record<'recoveryIndex' | EvidenceStream, DeltaEvidence | null>>
  readonly trends: Readonly<Record<'recoveryIndex' | EvidenceStream, WeightedTrendResult | null>>
  readonly selectedMethods: Readonly<Record<EvidenceStream, string | null>>
  readonly contextualEventProximity: readonly ContextEventProximity[]
  readonly confidenceInput: ConfidenceInput
  readonly highPainConsecutiveRun: number
  readonly recoveryIndexAverage: number | null
}

export type TriggeredRule =
  | 'baseline.minimum_points'
  | 'improving.material_recovery_rise'
  | 'mixed.divergent_streams'
  | 'mixed.no_consistent_pattern'
  | 'limited_change.small_range'
  | 'maintenance.stable_favourable_range'
  | 'sustained_worsening.corroborated_decline'
  | 'medical_review.high_pain_run'
  | 'medical_review.supported_worsening'

export interface PatternExplanation {
  readonly patternLabel: string
  readonly summaryKey: `pattern.${PatternType}`
  readonly triggeredRule: TriggeredRule
  readonly thresholdLabel: string
  readonly facts: {
    readonly includedObservationCount: number
    readonly excludedPointCount: number
    readonly recoveryIndexDelta: number | null
    readonly painDelta: number | null
    readonly stiffnessDelta: number | null
    readonly romDelta: number | null
    readonly functionalAbilityDelta: number | null
    readonly highPainConsecutiveRun: number
    readonly contextualEventCount: number
  }
}

export interface PatternResult {
  readonly pattern: PatternType
  readonly confidence: ConfidenceResult
  readonly evidence: PatternEvidence
  readonly triggeredRule: TriggeredRule
  readonly engineVersion: string
  readonly ruleVersion: string
  readonly explanation: PatternExplanation
}
