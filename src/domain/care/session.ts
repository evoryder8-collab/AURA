import type { BonusCredit } from './types'

export type SessionClock = {
  readonly elapsedSeconds: number
  readonly remainingSeconds: number
  readonly extraSeconds: number
  readonly phase: 'booked' | 'extra'
  /** `90:00` counting down, then `+00:01` counting up during extra care. */
  readonly display: string
}

const pad = (value: number) => String(value).padStart(2, '0')

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`
}

/**
 * Derived from timestamps only, so a dimmed screen, a backgrounded tab or a reload
 * always shows the true elapsed time.
 */
export function sessionClock(
  startedAt: string,
  bookedMinutes: number,
  now: number | string,
  finishedAt?: string,
): SessionClock {
  if (!Number.isFinite(bookedMinutes) || bookedMinutes <= 0) {
    throw new RangeError('Booked minutes must be a positive number.')
  }
  const start = new Date(startedAt).getTime()
  const end = finishedAt ? new Date(finishedAt).getTime() : new Date(now).getTime()
  const elapsedSeconds = Math.max(0, Math.floor((end - start) / 1000))
  const bookedSeconds = bookedMinutes * 60
  const remainingSeconds = Math.max(0, bookedSeconds - elapsedSeconds)
  const extraSeconds = Math.max(0, elapsedSeconds - bookedSeconds)
  const phase = extraSeconds > 0 ? 'extra' : 'booked'
  return {
    elapsedSeconds,
    remainingSeconds,
    extraSeconds,
    phase,
    display: phase === 'extra' ? `+${formatClock(extraSeconds)}` : formatClock(remainingSeconds),
  }
}

export type FinishSummary = {
  readonly bookedMinutes: number
  readonly actualMinutes: number
  readonly extraMinutes: number
}

/**
 * A 102-minute session on a 90-minute booking gives 12 extra minutes. Minutes are counted
 * between the clock minutes shown for the start and the finish (10:00–11:42 is 102), so the
 * time range and the Actual figure on the finish screen always agree.
 */
export function finishSummary(startedAt: string, finishedAt: string, bookedMinutes: number): FinishSummary {
  const start = new Date(startedAt).getTime()
  const finish = new Date(finishedAt).getTime()
  if (!Number.isFinite(finish - start) || finish < start) {
    throw new RangeError('A session cannot finish before it starts.')
  }
  const actualMinutes = Math.floor(finish / 60_000) - Math.floor(start / 60_000)
  return { bookedMinutes, actualMinutes, extraMinutes: Math.max(0, actualMinutes - bookedMinutes) }
}

/** The most Bonus Care a visit can carry: the time actually given past the booking, at most 240. */
export function maxBonusMinutes(summary: Pick<FinishSummary, 'bookedMinutes' | 'actualMinutes'>): number {
  return Math.min(240, Math.max(0, summary.actualMinutes - summary.bookedMinutes))
}

export function bonusCreditId(appointmentId: string) {
  return `bonus-${appointmentId}`
}

/**
 * Records a confirmed Bonus Care amount once per visit. A retry, double tap or reload
 * that confirms the same visit again leaves the ledger unchanged.
 */
export function confirmBonusCredit(
  credits: readonly BonusCredit[],
  credit: Omit<BonusCredit, 'id'>,
): BonusCredit[] {
  const id = bonusCreditId(credit.appointmentId)
  if (credits.some((item) => item.id === id)) return [...credits]
  const limit = maxBonusMinutes(credit)
  if (!Number.isInteger(credit.minutes) || credit.minutes < 0 || credit.minutes > limit) {
    throw new RangeError(`Bonus Care minutes must be a whole number from 0 to ${limit}, the time given past the booking.`)
  }
  return [...credits, { ...credit, id }]
}

export type TherapistBonusTotal = {
  readonly therapistId: string
  readonly minutes: number
  readonly visits: number
}

export type BonusSummary = {
  readonly lifetimeMinutes: number
  readonly byTherapist: readonly TherapistBonusTotal[]
  readonly credits: readonly BonusCredit[]
}

/** Every Bonus Care figure on every screen comes from this one ledger. */
export function bonusSummary(credits: readonly BonusCredit[], clientId: string): BonusSummary {
  const own = credits
    .filter((credit) => credit.clientId === clientId)
    .sort((a, b) => new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime())
  const totals = new Map<string, TherapistBonusTotal>()
  for (const credit of own) {
    const current = totals.get(credit.therapistId) ?? { therapistId: credit.therapistId, minutes: 0, visits: 0 }
    totals.set(credit.therapistId, {
      therapistId: credit.therapistId,
      minutes: current.minutes + credit.minutes,
      visits: current.visits + (credit.minutes > 0 ? 1 : 0),
    })
  }
  return {
    lifetimeMinutes: own.reduce((sum, credit) => sum + credit.minutes, 0),
    byTherapist: [...totals.values()].filter((item) => item.minutes > 0).sort((a, b) => b.minutes - a.minutes),
    credits: own,
  }
}

/** Head-of-table direction on the device, in quarter turns clockwise from "head up". */
export type TableRotation = 0 | 90 | 180 | 270

export function rotateTable(rotation: TableRotation, direction: 1 | -1): TableRotation {
  return (((rotation + direction * 90) % 360) + 360) % 360 as TableRotation
}

export type ClientPosition = 'face_up' | 'face_down'

/**
 * Where the client's anatomical left appears on screen for a body seen from above,
 * head pointing in `rotation`. Face up we see their front, so their left is on the
 * viewer's right when the head points up.
 */
export function anatomicalLeftScreenDirection(
  position: ClientPosition,
  rotation: TableRotation,
): 'right' | 'down' | 'left' | 'up' {
  const directions = ['right', 'down', 'left', 'up'] as const
  const base = position === 'face_up' ? 0 : 2
  return directions[(base + rotation / 90) % 4] ?? 'right'
}
