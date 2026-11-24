import { classifyPattern, type PatternObservation, type PatternResult } from '../engine'
import { sessionPainPoints } from './observations'
import { ROM_MOVEMENTS } from './types'
import type {
  ArrivalConfirmation,
  CareObservation,
  GoalScore,
  RomMeasurement,
  StiffnessAssessment,
} from './types'

export type VisitRef = {
  readonly id: string
  readonly startsAt: string
  readonly arrivalCompleted: boolean
}

export type VisitMeasures = {
  readonly visitId: string
  readonly observedAt: string
  readonly pain: number | null
  readonly stiffness: number | null
  /** Recorded range as a share of the typical range, on the engine's 0–10 scale. */
  readonly rom: number | null
  readonly functionalAbility: number | null
}

const clamp = (value: number) => Math.min(10, Math.max(0, value))
const round1 = (value: number) => Math.round(value * 10) / 10

/**
 * One comparable row per completed visit, ready for the deterministic pattern engine.
 * Goal ease follows one goal, the one rated most recently by the last visit, so the
 * series never compares the ease of two different goals.
 */
export function visitMeasures(input: {
  readonly visits: readonly VisitRef[]
  readonly observations: readonly CareObservation[]
  readonly confirmations: readonly ArrivalConfirmation[]
  readonly stiffness: readonly StiffnessAssessment[]
  readonly rom: readonly RomMeasurement[]
  readonly goalScores: readonly GoalScore[]
}): VisitMeasures[] {
  const visits = [...input.visits].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
  const lastVisitAt = visits.at(-1)?.startsAt ?? ''
  const goalScores = [...input.goalScores].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
  const trackedGoal = goalScores.filter((score) => score.recordedAt <= lastVisitAt).at(-1)?.goalId
  return visits.map((visit, index) => {
    const previous = visits[index - 1]
    const points = sessionPainPoints({
      observations: input.observations,
      confirmations: input.confirmations,
      appointmentId: visit.id,
      appointmentStartsAt: visit.startsAt,
      arrivalCompleted: visit.arrivalCompleted,
      ...(previous ? { previousVisitAt: previous.startsAt } : {}),
    })
    const stiffness = input.stiffness.filter((item) => item.appointmentId === visit.id)
    const rom = input.rom.filter((item) => item.appointmentId === visit.id)
    const goal = goalScores.filter((score) => score.goalId === trackedGoal && score.recordedAt <= visit.startsAt).at(-1)
    return {
      visitId: visit.id,
      observedAt: visit.startsAt,
      pain: points.length ? Math.max(...points.map((point) => point.pain)) : null,
      stiffness: stiffness.length ? Math.max(...stiffness.map((item) => item.stiffness)) : null,
      rom: rom.length
        ? round1(
            rom.reduce(
              (sum, item) => sum + clamp((item.degrees / ROM_MOVEMENTS[item.movement].typicalDegrees) * 10),
              0,
            ) / rom.length,
          )
        : null,
      functionalAbility: goal ? goal.score : null,
    }
  })
}

export function classifyVisits(measures: readonly VisitMeasures[]): PatternResult {
  const observations: PatternObservation[] = measures.map((measure) => ({
    id: measure.visitId,
    observedAt: measure.observedAt,
    pain: measure.pain,
    stiffness: measure.stiffness,
    rom: measure.rom === null ? null : { value: measure.rom, method: 'percent-of-typical-v1' },
    functionalAbility: measure.functionalAbility,
  }))
  return classifyPattern(observations)
}
