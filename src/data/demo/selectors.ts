import {
  bonusSummary,
  classifyVisits,
  sessionPainPoints,
  updatesBetween,
  visitMeasures,
  type CareObservation,
} from '@/domain/care'
import { daysBetween } from '@/lib/formatting/time'
import type { DemoAppointment, DemoState } from './model'

const time = (iso: string) => new Date(iso).getTime()
const ACTIVE: ReadonlySet<DemoAppointment['status']> = new Set(['confirmed', 'pending', 'requested'])

export const getClient = (state: Pick<DemoState, 'clients'>, clientId: string | null | undefined) =>
  state.clients.find((client) => client.id === clientId)

export const getTherapist = (state: Pick<DemoState, 'therapists'>, therapistId: string | null | undefined) =>
  state.therapists.find((therapist) => therapist.id === therapistId)

export const getAppointment = (state: Pick<DemoState, 'appointments'>, appointmentId: string | null | undefined) =>
  state.appointments.find((appointment) => appointment.id === appointmentId)

export function clientAppointments(state: Pick<DemoState, 'appointments'>, clientId: string) {
  return state.appointments
    .filter((appointment) => appointment.clientId === clientId)
    .sort((a, b) => time(a.startsAt) - time(b.startsAt))
}

export function therapistAppointments(state: Pick<DemoState, 'appointments'>, therapistId: string) {
  return state.appointments
    .filter((appointment) => appointment.therapistId === therapistId)
    .sort((a, b) => time(a.startsAt) - time(b.startsAt))
}

/**
 * The therapist's working list: a visit whose booked time is not over, or a session they started and
 * have not finished, however late, so they can return to it. A finished session is never upcoming.
 */
export function isUpcoming(appointment: DemoAppointment, now: number) {
  if (!ACTIVE.has(appointment.status)) return false
  if (appointment.session) return !appointment.session.finishedAt
  return time(appointment.startsAt) + appointment.durationMinutes * 60_000 > now
}

/** A visit still ahead of the client: booked, its session not yet started, and its booked time not over. */
export const isAhead = (appointment: DemoAppointment, now: number) => !appointment.session && isUpcoming(appointment, now)

/** The client's next visit; a visit whose session has started is already under way or behind them. */
export function nextAppointment(appointments: readonly DemoAppointment[], now: number) {
  return appointments.find((appointment) => isAhead(appointment, now))
}

/** The next-day follow-up stays open on the visit day and the two practice days after it. */
const FOLLOW_UP_DAYS = 2

/** A finished visit from the last few practice days that the client has not answered yet. */
export function followUpOpen(state: Pick<DemoState, 'followUps'>, appointment: DemoAppointment, now: number) {
  if (!appointment.session?.finishedAt) return false
  const days = daysBetween(appointment.startsAt, now)
  return days >= 0 && days <= FOLLOW_UP_DAYS && !state.followUps.some((item) => item.appointmentId === appointment.id)
}

/** The client's last visit that happened before this one, with any therapist. */
export function previousVisit(state: Pick<DemoState, 'appointments'>, appointment: DemoAppointment) {
  return clientAppointments(state, appointment.clientId)
    .filter((item) => item.status === 'completed' && time(item.startsAt) < time(appointment.startsAt))
    .at(-1)
}

export function clientObservations(state: Pick<DemoState, 'observations'>, clientId: string): CareObservation[] {
  return state.observations.filter((observation) => observation.clientId === clientId)
}

/** What the client reported since their previous visit, for the therapist preview. */
export function preVisitUpdates(state: DemoState, appointment: DemoAppointment, now: number) {
  const previous = previousVisit(state, appointment)
  const since = previous?.session?.finishedAt ?? previous?.startsAt
  const until = new Date(Math.min(now, time(appointment.startsAt) + appointment.durationMinutes * 60_000)).toISOString()
  return updatesBetween(clientObservations(state, appointment.clientId), since, until)
}

export function sessionPointsFor(state: DemoState, appointment: DemoAppointment) {
  const previous = previousVisit(state, appointment)
  return sessionPainPoints({
    observations: clientObservations(state, appointment.clientId),
    confirmations: state.confirmations.filter((item) => item.clientId === appointment.clientId),
    appointmentId: appointment.id,
    appointmentStartsAt: appointment.arrival?.completedAt ?? appointment.startsAt,
    arrivalCompleted: Boolean(appointment.arrival),
    ...(previous ? { previousVisitAt: previous.session?.finishedAt ?? previous.startsAt } : {}),
  })
}

export function clientBonus(state: Pick<DemoState, 'bonusCredits'>, clientId: string) {
  return bonusSummary(state.bonusCredits, clientId)
}

export function clientRecovery(state: DemoState, clientId: string) {
  const visits = clientAppointments(state, clientId)
    .filter((appointment) => appointment.status === 'completed')
    .map((appointment) => ({
      id: appointment.id,
      startsAt: appointment.arrival?.completedAt ?? appointment.startsAt,
      arrivalCompleted: Boolean(appointment.arrival),
    }))
  const measures = visitMeasures({
    visits,
    observations: clientObservations(state, clientId),
    confirmations: state.confirmations.filter((item) => item.clientId === clientId),
    stiffness: state.stiffness.filter((item) => item.clientId === clientId),
    rom: state.rom.filter((item) => item.clientId === clientId),
    goalScores: state.goalScores.filter((item) => item.clientId === clientId),
  })
  return { measures, result: classifyVisits(measures) }
}
