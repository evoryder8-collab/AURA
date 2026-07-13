import type { DemoAppointment, DemoClient, DemoState, DemoTherapist } from './model'

export function getDemoTherapist(
  state: Pick<DemoState, 'therapists'>,
  therapistId: string | null | undefined,
): DemoTherapist | undefined {
  return state.therapists.find((therapist) => therapist.id === therapistId)
}

export function therapistCanAccessClient(
  state: Pick<DemoState, 'therapists'>,
  therapistId: string | null | undefined,
  clientId: string,
): boolean {
  return Boolean(getDemoTherapist(state, therapistId)?.assignedClientIds.includes(clientId))
}

export function clientsAssignedToTherapist(
  state: Pick<DemoState, 'therapists' | 'clients'>,
  therapistId: string | null | undefined,
): DemoClient[] {
  const therapist = getDemoTherapist(state, therapistId)
  if (!therapist) return []
  const assigned = new Set(therapist.assignedClientIds)
  return state.clients.filter((client) => assigned.has(client.id))
}

export function appointmentsForTherapist(
  state: Pick<DemoState, 'appointments'>,
  therapistId: string | null | undefined,
): DemoAppointment[] {
  if (!therapistId) return []
  return state.appointments.filter((appointment) => appointment.therapistId === therapistId)
}

export function therapistsForClient(
  state: Pick<DemoState, 'therapists' | 'clients'>,
  clientId: string,
): DemoTherapist[] {
  const client = state.clients.find((item) => item.id === clientId)
  if (!client) return []
  const assigned = new Set(client.assignedTherapistIds)
  return state.therapists.filter(
    (therapist) => assigned.has(therapist.id) && therapist.assignedClientIds.includes(clientId),
  )
}
