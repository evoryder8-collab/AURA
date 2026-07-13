import { PROTOTYPE_V1_CONFIG } from './config'
import {
  isValidScore,
  normalizeFunctionalAbility,
  normalizePain,
  normalizeRom,
  normalizeStiffness,
} from './normalization'
import { computeRecoveryIndex } from './recovery-index'
import { computeWeightedTrend } from './trend'
import {
  EVIDENCE_STREAMS,
  RECOVERY_STREAMS,
  type ContextEvent,
  type ContextEventProximity,
  type DeltaEvidence,
  type EvidenceStream,
  type ExcludedEvidencePoint,
  type IncludedEvidencePoint,
  type PatternEngineConfig,
  type PatternEvidence,
  type PatternObservation,
  type RecoveryStream,
  type ScoreReading,
  type WeightedTrendPoint,
  type WeightedTrendResult,
} from './types'

const DAY_IN_MS = 86_400_000

const DEFAULT_METHODS: Readonly<Record<EvidenceStream, string>> = {
  pain: 'client_0_10',
  stiffness: 'therapist_0_10',
  rom: 'therapist_0_10',
  functionalAbility: 'client_0_10',
}

interface ExtractedReading {
  readonly value: number
  readonly method: string
}

interface ExtractedObservation {
  readonly source: PatternObservation
  readonly timestamp: number
  readonly readings: Readonly<Record<EvidenceStream, ExtractedReading | null>>
}

interface ProcessedObservation extends ExtractedObservation {
  readonly rawScores: Record<EvidenceStream, number | null>
  readonly favourableScores: Record<EvidenceStream, number | null>
  readonly recoveryIndex: number | null
  readonly recoveryStreams: readonly RecoveryStream[]
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000
}

function parseTimestamp(value: string | Date): number | null {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function readScore(reading: ScoreReading, stream: EvidenceStream): ExtractedReading {
  if (typeof reading === 'number') {
    return { value: reading, method: DEFAULT_METHODS[stream] }
  }
  const cleanedMethod = reading.method?.trim().toLocaleLowerCase()
  return {
    value: reading.value,
    method:
      cleanedMethod == null || cleanedMethod.length === 0 ? DEFAULT_METHODS[stream] : cleanedMethod,
  }
}

function extractObservation(
  observation: PatternObservation,
  excludedPoints: ExcludedEvidencePoint[],
): ExtractedObservation | null {
  const observedAt = parseTimestamp(observation.observedAt)
  if (observedAt == null) {
    excludedPoints.push({
      observationId: observation.id,
      metric: 'observation',
      reason: 'invalid_timestamp',
      method: null,
    })
    return null
  }

  const readings: Record<EvidenceStream, ExtractedReading | null> = {
    pain: null,
    stiffness: null,
    rom: null,
    functionalAbility: null,
  }

  for (const stream of EVIDENCE_STREAMS) {
    const input = observation[stream]
    if (input == null) continue
    const extracted = readScore(input, stream)
    if (!isValidScore(extracted.value)) {
      excludedPoints.push({
        observationId: observation.id,
        metric: stream,
        reason: 'invalid_score',
        method: extracted.method,
      })
      continue
    }
    readings[stream] = extracted
  }

  return { source: observation, timestamp: observedAt, readings }
}

function selectMethods(
  observations: readonly ExtractedObservation[],
): Record<EvidenceStream, string | null> {
  const selected: Record<EvidenceStream, string | null> = {
    pain: null,
    stiffness: null,
    rom: null,
    functionalAbility: null,
  }

  for (const stream of EVIDENCE_STREAMS) {
    const counts = new Map<string, number>()
    for (const observation of observations) {
      const method = observation.readings[stream]?.method
      if (method != null) counts.set(method, (counts.get(method) ?? 0) + 1)
    }
    const ranked = [...counts.entries()].sort(
      ([leftMethod, leftCount], [rightMethod, rightCount]) =>
        rightCount - leftCount || leftMethod.localeCompare(rightMethod),
    )
    selected[stream] = ranked[0]?.[0] ?? null
  }

  return selected
}

function favourableScore(stream: EvidenceStream, value: number): number {
  switch (stream) {
    case 'pain':
      return normalizePain(value)
    case 'stiffness':
      return normalizeStiffness(value)
    case 'rom':
      return normalizeRom(value)
    case 'functionalAbility':
      return normalizeFunctionalAbility(value)
  }
}

function makeDelta(
  rawPoints: readonly WeightedTrendPoint[],
  favourablePoints: readonly WeightedTrendPoint[],
): DeltaEvidence | null {
  if (rawPoints.length === 0 || favourablePoints.length === 0) return null
  const rawTrend = computeWeightedTrend(rawPoints)
  const favourableTrend = computeWeightedTrend(favourablePoints)
  if (rawTrend == null || favourableTrend == null) return null
  return {
    pointCount: favourableTrend.pointCount,
    start: rawTrend.start,
    end: rawTrend.end,
    delta: rawTrend.delta,
    favourableDelta: favourableTrend.delta,
  }
}

function contextualProximity(
  observations: readonly ExtractedObservation[],
  includedPoints: readonly IncludedEvidencePoint[],
  config: PatternEngineConfig,
  excludedPoints: ExcludedEvidencePoint[],
): ContextEventProximity[] {
  const changes: Array<{
    observationId: string
    timestamp: number
    recoveryChange: number
  }> = []
  for (let index = 1; index < includedPoints.length; index += 1) {
    const previous = includedPoints[index - 1]
    const current = includedPoints[index]
    if (previous == null || current == null) continue
    const change = current.recoveryIndex - previous.recoveryIndex
    if (Math.abs(change) >= config.thresholds.contextualChangeDelta) {
      changes.push({
        observationId: current.observationId,
        timestamp: Date.parse(current.observedAt),
        recoveryChange: round(change),
      })
    }
  }

  const result: ContextEventProximity[] = []
  for (const observation of observations) {
    for (const event of observation.source.contextEvents ?? []) {
      const eventTimestamp = parseTimestamp(event.occurredAt)
      if (eventTimestamp == null) {
        excludedPoints.push({
          observationId: `${observation.source.id}:event:${event.id}`,
          metric: 'observation',
          reason: 'invalid_timestamp',
          method: null,
        })
        continue
      }
      const nearbyChange = findNearestChange(eventTimestamp, changes, config)
      if (nearbyChange == null) continue
      result.push({
        eventId: event.id,
        eventType: event.type,
        eventOccurredAt: new Date(eventTimestamp).toISOString(),
        observationId: nearbyChange.observationId,
        observationOccurredAt: new Date(nearbyChange.timestamp).toISOString(),
        distanceDays: round(Math.abs(eventTimestamp - nearbyChange.timestamp) / DAY_IN_MS),
        nearbyRecoveryChange: nearbyChange.recoveryChange,
      })
    }
  }
  return result
}

function findNearestChange(
  eventTimestamp: number,
  changes: readonly {
    observationId: string
    timestamp: number
    recoveryChange: number
  }[],
  config: PatternEngineConfig,
): (typeof changes)[number] | null {
  let nearest: (typeof changes)[number] | null = null
  let nearestDistance = Number.POSITIVE_INFINITY
  for (const change of changes) {
    const distance = Math.abs(eventTimestamp - change.timestamp) / DAY_IN_MS
    if (distance <= config.thresholds.contextWindowDays && distance < nearestDistance) {
      nearest = change
      nearestDistance = distance
    }
  }
  return nearest
}

function countHighPainRun(points: readonly IncludedEvidencePoint[], threshold: number): number {
  let currentRun = 0
  let longestRun = 0
  for (const point of points) {
    const pain = point.rawScores.pain
    if (pain != null && pain >= threshold) {
      currentRun += 1
      longestRun = Math.max(longestRun, currentRun)
    } else {
      currentRun = 0
    }
  }
  return longestRun
}

function contextEventsFrom(observations: readonly ExtractedObservation[]): readonly ContextEvent[] {
  return observations.flatMap((observation) => observation.source.contextEvents ?? [])
}

export function buildPatternEvidence(
  input: readonly PatternObservation[],
  config: PatternEngineConfig = PROTOTYPE_V1_CONFIG,
): PatternEvidence {
  const excludedPoints: ExcludedEvidencePoint[] = []
  const observations = input
    .map((observation) => extractObservation(observation, excludedPoints))
    .filter((observation): observation is ExtractedObservation => observation != null)
    .sort(
      (left, right) =>
        left.timestamp - right.timestamp || left.source.id.localeCompare(right.source.id),
    )
  const selectedMethods = selectMethods(observations)

  let validMethodReadingCount = 0
  let allValidReadingCount = 0
  const processed: ProcessedObservation[] = observations.map((observation) => {
    const rawScores: Record<EvidenceStream, number | null> = {
      pain: null,
      stiffness: null,
      rom: null,
      functionalAbility: null,
    }
    const favourableScores: Record<EvidenceStream, number | null> = {
      pain: null,
      stiffness: null,
      rom: null,
      functionalAbility: null,
    }

    for (const stream of EVIDENCE_STREAMS) {
      const reading = observation.readings[stream]
      if (reading == null) continue
      allValidReadingCount += 1
      if (reading.method !== selectedMethods[stream]) {
        excludedPoints.push({
          observationId: observation.source.id,
          metric: stream,
          reason: 'incompatible_method',
          method: reading.method,
        })
        continue
      }
      validMethodReadingCount += 1
      rawScores[stream] = reading.value
      favourableScores[stream] = favourableScore(stream, reading.value)
    }

    const recovery = computeRecoveryIndex(
      {
        pain: rawScores.pain,
        stiffness: rawScores.stiffness,
        rom: rawScores.rom,
      },
      config.recoveryWeights,
    )
    if (recovery.score == null) {
      excludedPoints.push({
        observationId: observation.source.id,
        metric: 'observation',
        reason: 'no_recovery_stream',
        method: null,
      })
    }

    return {
      ...observation,
      rawScores,
      favourableScores,
      recoveryIndex: recovery.score,
      recoveryStreams: recovery.includedStreams,
    }
  })

  const includedPoints: IncludedEvidencePoint[] = processed
    .filter(
      (
        observation,
      ): observation is ProcessedObservation & {
        recoveryIndex: number
      } => observation.recoveryIndex != null,
    )
    .map((observation) => ({
      observationId: observation.source.id,
      observedAt: new Date(observation.timestamp).toISOString(),
      rawScores: observation.rawScores,
      favourableScores: observation.favourableScores,
      recoveryIndex: observation.recoveryIndex,
      includedRecoveryStreams: observation.recoveryStreams,
      retrospective: observation.source.retrospective === true,
    }))

  const rawPoints: Record<EvidenceStream, WeightedTrendPoint[]> = {
    pain: [],
    stiffness: [],
    rom: [],
    functionalAbility: [],
  }
  const favourablePoints: Record<EvidenceStream, WeightedTrendPoint[]> = {
    pain: [],
    stiffness: [],
    rom: [],
    functionalAbility: [],
  }
  for (const observation of processed) {
    for (const stream of EVIDENCE_STREAMS) {
      const raw = observation.rawScores[stream]
      const favourable = observation.favourableScores[stream]
      if (raw != null) {
        rawPoints[stream].push({
          value: raw,
          observedAt: new Date(observation.timestamp),
        })
      }
      if (favourable != null) {
        favourablePoints[stream].push({
          value: favourable,
          observedAt: new Date(observation.timestamp),
        })
      }
    }
  }
  const recoveryPoints: WeightedTrendPoint[] = includedPoints.map((point) => ({
    value: point.recoveryIndex,
    observedAt: point.observedAt,
  }))

  const recoveryTrend = computeWeightedTrend(recoveryPoints, config.thresholds.smallChangeRange)
  const trends: Record<'recoveryIndex' | EvidenceStream, WeightedTrendResult | null> = {
    recoveryIndex: recoveryTrend,
    pain: computeWeightedTrend(favourablePoints.pain, config.thresholds.smallChangeRange),
    stiffness: computeWeightedTrend(favourablePoints.stiffness, config.thresholds.smallChangeRange),
    rom: computeWeightedTrend(favourablePoints.rom, config.thresholds.smallChangeRange),
    functionalAbility: computeWeightedTrend(
      favourablePoints.functionalAbility,
      config.thresholds.smallChangeRange,
    ),
  }
  const recoveryDelta: DeltaEvidence | null =
    recoveryTrend == null
      ? null
      : {
          pointCount: recoveryTrend.pointCount,
          start: recoveryTrend.start,
          end: recoveryTrend.end,
          delta: recoveryTrend.delta,
          favourableDelta: recoveryTrend.delta,
        }
  const deltas: Record<'recoveryIndex' | EvidenceStream, DeltaEvidence | null> = {
    recoveryIndex: recoveryDelta,
    pain: makeDelta(rawPoints.pain, favourablePoints.pain),
    stiffness: makeDelta(rawPoints.stiffness, favourablePoints.stiffness),
    rom: makeDelta(rawPoints.rom, favourablePoints.rom),
    functionalAbility: makeDelta(rawPoints.functionalAbility, favourablePoints.functionalAbility),
  }

  const proximity = contextualProximity(observations, includedPoints, config, excludedPoints)
  const availableRecoveryReadings = includedPoints.reduce(
    (total, point) => total + point.includedRecoveryStreams.length,
    0,
  )
  const completeness =
    includedPoints.length === 0
      ? 0
      : availableRecoveryReadings / (includedPoints.length * RECOVERY_STREAMS.length)
  const retrospectiveCount = includedPoints.filter((point) => point.retrospective).length
  const methodRatio =
    allValidReadingCount === 0 ? 0 : validMethodReadingCount / allValidReadingCount
  const recoveryIndexAverage =
    includedPoints.length === 0
      ? null
      : round(
          includedPoints.reduce((sum, point) => sum + point.recoveryIndex, 0) /
            includedPoints.length,
        )

  return {
    includedPoints,
    excludedPoints,
    deltas,
    trends,
    selectedMethods,
    contextualEventProximity: proximity,
    confidenceInput: {
      pointCount: includedPoints.length,
      timeSpanDays: recoveryTrend?.timeSpanDays ?? 0,
      completeness: round(completeness),
      trendConsistency:
        includedPoints.length >= config.thresholds.minimumTrendPoints
          ? (recoveryTrend?.consistency ?? 0)
          : 0,
      comparableMethodRatio: round(methodRatio),
      contextualEventCount: contextEventsFrom(observations).length,
      retrospectiveRatio:
        includedPoints.length === 0 ? 0 : round(retrospectiveCount / includedPoints.length),
    },
    highPainConsecutiveRun: countHighPainRun(includedPoints, config.thresholds.highPainThreshold),
    recoveryIndexAverage,
  }
}
