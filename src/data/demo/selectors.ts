import {
  bonusSummary,
  classifyVisits,
  sessionPainPoints,
  updatesBetween,
  visitMeasures,
  type CareObservation,
} from '@/domain/care'
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

/** A visit still to happen, or one that has started and not yet been wrapped up. */
export function isUpcoming(appointment: DemoAppointment, now: number) {
  if (!ACTIVE.has(appointment.status)) return false
  if (appointment.session?.startedAt) return true
  return time(appointment.startsAt) + appointment.durationMinutes * 60_000 > now
}

export function nextAppointment(appointments: readonly DemoAppointment[], now: number) {
  return appointments.find((appointment) => isUpcoming(appointment, now))
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

/** The areas with discomfort the visit screens show; a 0/10 still counts in the Recovery Index. */
export function sessionPointsFor(state: DemoState, appointment: DemoAppointment) {
  const previous = previousVisit(state, appointment)
  return sessionPainPoints({
    observations: clientObservations(state, appointment.clientId),
    confirmations: state.confirmations.filter((item) => item.clientId === appointment.clientId),
    appointmentId: appointment.id,
    appointmentStartsAt: appointment.arrival?.completedAt ?? appointment.startsAt,
    arrivalCompleted: Boolean(appointment.arrival),
    ...(previous ? { previousVisitAt: previous.session?.finishedAt ?? previous.startsAt } : {}),
  }).filter((point) => point.pain > 0)
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
