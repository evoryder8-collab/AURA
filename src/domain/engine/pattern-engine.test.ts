import { describe, expect, it } from 'vitest'

import { buildPatternEvidence } from './evidence'
import { classifyPattern } from './pattern-engine'
import type { PatternObservation } from './types'

const WEEK_IN_MS = 7 * 86_400_000

function observedAt(index: number): string {
  return new Date(Date.UTC(2026, 0, 1) + index * WEEK_IN_MS).toISOString()
}

function observation(
  index: number,
  scores: Omit<PatternObservation, 'id' | 'observedAt'>,
): PatternObservation {
  return { id: `observation-${index}`, observedAt: observedAt(index), ...scores }
}

function series(
  pain: readonly number[],
  stiffness: readonly number[],
  rom: readonly number[],
): PatternObservation[] {
  return pain.map((painScore, index) =>
    observation(index, {
      pain: painScore,
      stiffness: stiffness[index] ?? null,
      rom: rom[index] ?? null,
    }),
  )
}

describe('classifyPattern minimum data handling', () => {
  it('returns Building Baseline for no observations', () => {
    const result = classifyPattern([])
    expect(result.pattern).toBe('building_baseline')
    expect(result.evidence.includedPoints).toHaveLength(0)
    expect(result.confidence.level).toBe('low')
  })

  it('returns Building Baseline for one comparable observation', () => {
    const result = classifyPattern(series([5], [5], [5]))
    expect(result.pattern).toBe('building_baseline')
    expect(result.triggeredRule).toBe('baseline.minimum_points')
  })

  it('returns Building Baseline for two ordinary observations', () => {
    const result = classifyPattern(series([5, 4], [5, 4], [5, 6]))
    expect(result.pattern).toBe('building_baseline')
  })

  it('does not override the three-point baseline minimum with only two high readings', () => {
    const result = classifyPattern(series([7, 8], [4, 4], [5, 5]))
    expect(result.pattern).toBe('building_baseline')
  })

  it('lets the configured consecutive high-pain run surface a review consideration', () => {
    const result = classifyPattern(series([7, 8, 8], [4, 4, 4], [5, 5, 5]))
    expect(result.pattern).toBe('medical_review_consideration')
    expect(result.triggeredRule).toBe('medical_review.high_pain_run')
    expect(result.evidence.highPainConsecutiveRun).toBe(3)
  })
})

describe('classifyPattern prototype patterns', () => {
  it('classifies a material, consistent Recovery Index rise as Improving', () => {
    const result = classifyPattern(series([6, 5, 4, 3], [7, 6, 5, 4], [3, 4, 5, 6]))
    expect(result.pattern).toBe('improving')
    expect(result.triggeredRule).toBe('improving.material_recovery_rise')
    expect(result.evidence.deltas.recoveryIndex?.favourableDelta).toBe(30)
    expect(result.evidence.deltas.pain).toMatchObject({
      delta: -3,
      favourableDelta: 30,
    })
  })

  it('classifies divergent streams as Mixed', () => {
    const result = classifyPattern(series([6, 5, 4, 3], [3, 4, 5, 6], [5, 5, 5, 5]))
    expect(result.pattern).toBe('mixed')
    expect(result.triggeredRule).toBe('mixed.divergent_streams')
    expect(result.evidence.deltas.pain?.favourableDelta).toBe(30)
    expect(result.evidence.deltas.stiffness?.favourableDelta).toBe(-30)
  })

  it('classifies a material improvement alongside a relevant flat stream as Mixed', () => {
    const result = classifyPattern(series([6, 5, 4, 3], [5, 5, 5, 5], [5, 5, 5, 5]))
    expect(result.pattern).toBe('mixed')
    expect(result.triggeredRule).toBe('mixed.divergent_streams')
  })

  it('classifies a low-range flat series as Limited Change', () => {
    const result = classifyPattern(series([5, 5, 5, 5], [5, 5, 5, 5], [5, 5, 5, 5]))
    expect(result.pattern).toBe('limited_change')
    expect(result.triggeredRule).toBe('limited_change.small_range')
  })

  it('classifies a favourable flat series as Maintenance', () => {
    const result = classifyPattern(series([1, 1, 1, 1], [2, 2, 2, 2], [8, 8, 8, 8]))
    expect(result.pattern).toBe('maintenance')
    expect(result.evidence.recoveryIndexAverage).toBeGreaterThanOrEqual(75)
  })

  it('classifies a corroborated four-point decline as Sustained Worsening', () => {
    const result = classifyPattern(series([3, 4, 5, 6], [3, 4, 5, 6], [7, 6, 5, 4]))
    expect(result.pattern).toBe('sustained_worsening')
    expect(result.triggeredRule).toBe('sustained_worsening.corroborated_decline')
    expect(result.evidence.deltas.recoveryIndex?.favourableDelta).toBe(-30)
  })

  it('escalates a sufficiently supported six-point decline for review consideration', () => {
    const result = classifyPattern(
      series([2, 3, 4, 5, 6, 6.5], [2, 3, 4, 5, 6, 6.5], [8, 7, 6, 5, 4, 3.5]),
    )
    expect(result.pattern).toBe('medical_review_consideration')
    expect(result.triggeredRule).toBe('medical_review.supported_worsening')
    expect(result.confidence.level).toBe('high')
  })
})

describe('pattern evidence quality and exclusions', () => {
  it('renormalizes each point when an eligible stream is missing', () => {
    const evidence = buildPatternEvidence([
      observation(0, { pain: 4, stiffness: 5 }),
      observation(1, { pain: 3, stiffness: 4, rom: 6 }),
      observation(2, { pain: 2, stiffness: 3, rom: 7 }),
    ])
    expect(evidence.includedPoints[0]?.recoveryIndex).toBe(55.63)
    expect(evidence.includedPoints[0]?.includedRecoveryStreams).toEqual(['pain', 'stiffness'])
    expect(evidence.confidenceInput.completeness).toBeCloseTo(8 / 9, 4)
  })

  it('does not treat a missing follow-up score as a negative response', () => {
    const result = classifyPattern(series([6, 5, 4, 3], [6, 5, 4, 3], [4, 5, 6, 7]))
    expect(result.pattern).toBe('improving')
    expect(result.evidence.deltas.functionalAbility).toBeNull()
    expect(result.evidence.confidenceInput.completeness).toBe(1)
  })

  it('excludes invalid scores without failing the entire analysis', () => {
    const evidence = buildPatternEvidence([
      observation(0, { pain: 11 }),
      observation(1, { pain: 5, stiffness: 4, rom: 6 }),
    ])
    expect(evidence.includedPoints).toHaveLength(1)
    expect(evidence.excludedPoints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          observationId: 'observation-0',
          metric: 'pain',
          reason: 'invalid_score',
        }),
        expect.objectContaining({
          observationId: 'observation-0',
          reason: 'no_recovery_stream',
        }),
      ]),
    )
  })

  it('excludes invalid observation timestamps explicitly', () => {
    const evidence = buildPatternEvidence([
      { id: 'invalid-date', observedAt: 'not-a-date', pain: 5 },
      observation(0, { pain: 5 }),
    ])
    expect(evidence.excludedPoints).toContainEqual({
      observationId: 'invalid-date',
      metric: 'observation',
      reason: 'invalid_timestamp',
      method: null,
    })
  })

  it('keeps incompatible ROM methods out of a single comparison group', () => {
    const observations = [0, 1, 2, 3].map((index) =>
      observation(index, {
        pain: 5 - index * 0.5,
        stiffness: 5 - index * 0.5,
        rom: {
          value: 4 + index,
          method: index < 2 ? 'degrees' : 'manual 0-10',
        },
      }),
    )
    const evidence = buildPatternEvidence(observations)

    expect(evidence.selectedMethods.rom).toBe('degrees')
    expect(
      evidence.excludedPoints.filter(
        (point) => point.metric === 'rom' && point.reason === 'incompatible_method',
      ),
    ).toHaveLength(2)
    expect(evidence.deltas.rom?.pointCount).toBe(2)
  })

  it('does not infer a ROM pattern by bridging incompatible methods', () => {
    const result = classifyPattern(
      [0, 1, 2, 3].map((index) =>
        observation(index, {
          rom: {
            value: index < 2 ? 2 + index : 8 + (index - 2),
            method: index < 2 ? 'method-a' : 'method-b',
          },
        }),
      ),
    )
    expect(result.pattern).toBe('building_baseline')
    expect(result.evidence.includedPoints).toHaveLength(2)
    expect(
      result.evidence.excludedPoints.filter((point) => point.reason === 'incompatible_method'),
    ).toHaveLength(2)
  })

  it('records contextual event proximity without assigning causation', () => {
    const evidence = buildPatternEvidence([
      observation(0, { pain: 6, stiffness: 6, rom: 4 }),
      observation(1, {
        pain: 4,
        stiffness: 4,
        rom: 6,
        contextEvents: [{ id: 'event-sleep', type: 'poor_sleep', occurredAt: observedAt(1) }],
      }),
      observation(2, { pain: 3, stiffness: 3, rom: 7 }),
    ])
    expect(evidence.contextualEventProximity).toEqual([
      expect.objectContaining({
        eventId: 'event-sleep',
        observationId: 'observation-1',
        distanceDays: 0,
        nearbyRecoveryChange: 20,
      }),
    ])
  })

  it('does not attach a distant event to a change', () => {
    const evidence = buildPatternEvidence([
      observation(0, {
        pain: 6,
        stiffness: 6,
        rom: 4,
        contextEvents: [
          {
            id: 'event-old',
            type: 'long_drive',
            occurredAt: '2025-10-01T00:00:00Z',
          },
        ],
      }),
      observation(1, { pain: 4, stiffness: 4, rom: 6 }),
      observation(2, { pain: 3, stiffness: 3, rom: 7 }),
    ])
    expect(evidence.contextualEventProximity).toEqual([])
  })
})

describe('pattern result metadata', () => {
  it('returns versions, exact facts, and structured explanation keys', () => {
    const result = classifyPattern(series([6, 5, 4], [6, 5, 4], [4, 5, 6]))
    expect(result.engineVersion).toBe('aura-pattern-engine-v1')
    expect(result.ruleVersion).toBe('prototype-v1')
    expect(result.explanation).toMatchObject({
      patternLabel: 'Improving',
      summaryKey: 'pattern.improving',
      thresholdLabel: 'Prototype pattern thresholds — not clinically validated.',
      facts: {
        includedObservationCount: 3,
        recoveryIndexDelta: 20,
        painDelta: 20,
        stiffnessDelta: 20,
        romDelta: 20,
      },
    })
  })
})
