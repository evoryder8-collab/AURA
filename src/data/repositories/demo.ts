import type { DemoAppointment, DemoClient } from '@/data/demo/model'
import { useDemoStore, type DemoStore } from '@/data/demo/store'
import type {
  AppointmentListOptions,
  AppointmentRecord,
  AuraRepositories,
  ClientListOptions,
  ClientRecord,
  CreateAppointmentInput,
  CreateClientInput,
  UpdateAppointmentInput,
} from './contracts'
import { asRepositoryError, repositoryError } from './errors'
import { createAppointmentSchema, createClientSchema, updateAppointmentSchema } from './validation'

export interface DemoStorePort {
  getState(): DemoStore
}

const defaultStore: DemoStorePort = { getState: () => useDemoStore.getState() }

function mapClient(client: DemoClient): ClientRecord {
  return {
    source: 'demo',
    id: client.id,
    practiceId: null,
    authUserId: null,
    preferredName: client.preferredName,
    legalName: null,
    email: client.email,
    phone: client.phone,
    dateOfBirth: client.dateOfBirth,
    intakeStatus: client.intakeStatus,
    active: client.active,
    createdBy: null,
    createdAt: null,
    updatedAt: null,
  }
}

function mapAppointment(appointment: DemoAppointment): AppointmentRecord {
  return {
    source: 'demo',
    id: appointment.id,
    practiceId: null,
    clientId: appointment.clientId,
    therapistUserId: appointment.therapistId,
    startsAt: appointment.startsAt,
    durationMinutes: appointment.durationMinutes,
    sessionType: appointment.sessionType,
    status: appointment.status,
    intakeStatusSnapshot: appointment.intakeStatus,
    requestedBy: null,
    room: appointment.room,
    createdAt: null,
    updatedAt: null,
  }
}

function clientMatches(client: DemoClient, options: ClientListOptions | undefined) {
  if (options?.active !== undefined && client.active !== options.active) return false
  if (options?.intakeStatuses?.length && !options.intakeStatuses.includes(client.intakeStatus)) {
    return false
  }
  return true
}

function appointmentMatches(
  appointment: DemoAppointment,
  options: AppointmentListOptions | undefined,
) {
  if (options?.clientId && appointment.clientId !== options.clientId) return false
  if (options?.statuses?.length && !options.statuses.includes(appointment.status)) return false
  if (options?.startsAtOrAfter && appointment.startsAt < options.startsAtOrAfter) return false
  if (options?.startsBefore && appointment.startsAt >= options.startsBefore) return false
  return true
}

export function createDemoRepositories(store: DemoStorePort = defaultStore): AuraRepositories {
  const clients = {
    async list(options?: ClientListOptions) {
      return store
        .getState()
        .clients.filter((client) => clientMatches(client, options))
        .map(mapClient)
    },
    async get(clientId: string) {
      const client = store.getState().clients.find((item) => item.id === clientId)
      return client ? mapClient(client) : null
    },
    async create(input: CreateClientInput) {
      const operation = 'clients.create'
      try {
        const parsed = createClientSchema.safeParse(input)
        if (!parsed.success) throw repositoryError('invalid_input', operation)
        const id = store.getState().addClient({
          preferredName: parsed.data.preferredName,
          email: parsed.data.email ?? '',
          phone: parsed.data.phone ?? '',
        })
        const created = store.getState().clients.find((client) => client.id === id)
        if (!created) throw repositoryError('write_failed', operation)
        return mapClient(created)
      } catch (error) {
        throw asRepositoryError(error, 'write_failed', operation)
      }
    },
  }

  const appointments = {
    async list(options?: AppointmentListOptions) {
      return store
        .getState()
        .appointments.filter((appointment) => appointmentMatches(appointment, options))
        .sort((left, right) => left.startsAt.localeCompare(right.startsAt))
        .map(mapAppointment)
    },
    async get(appointmentId: string) {
      const appointment = store.getState().appointments.find((item) => item.id === appointmentId)
      return appointment ? mapAppointment(appointment) : null
    },
    async create(input: CreateAppointmentInput) {
      const operation = 'appointments.create'
      try {
        const parsed = createAppointmentSchema.safeParse(input)
        if (!parsed.success) throw repositoryError('invalid_input', operation)
        if (!store.getState().clients.some((client) => client.id === parsed.data.clientId)) {
          throw repositoryError('not_found', operation)
        }
        const state = store.getState()
        const client = state.clients.find((item) => item.id === parsed.data.clientId)
        const therapistId =
          parsed.data.therapistUserId ??
          client?.assignedTherapistIds[0] ??
          state.therapists.find((therapist) =>
            therapist.assignedClientIds.includes(parsed.data.clientId),
          )?.id ??
          state.therapists[0]?.id
        if (!therapistId) throw repositoryError('not_found', operation)
        const id = state.addAppointment({
          clientId: parsed.data.clientId,
          therapistId,
          startsAt: parsed.data.startsAt,
          durationMinutes: parsed.data.durationMinutes,
          sessionType: parsed.data.sessionType,
          status: parsed.data.status,
          intakeStatus: parsed.data.intakeStatusSnapshot,
          room: parsed.data.room ?? 'Unassigned',
        })
        const created = store.getState().appointments.find((appointment) => appointment.id === id)
        if (!created) throw repositoryError('write_failed', operation)
        return mapAppointment(created)
      } catch (error) {
        throw asRepositoryError(error, 'write_failed', operation)
      }
    },
    async update(appointmentId: string, patch: UpdateAppointmentInput) {
      const operation = 'appointments.update'
      try {
        const parsed = updateAppointmentSchema.safeParse(patch)
        if (!parsed.success) throw repositoryError('invalid_input', operation)
        if (
          !store.getState().appointments.some((appointment) => appointment.id === appointmentId)
        ) {
          throw repositoryError('not_found', operation)
        }
        const demoPatch: Partial<DemoAppointment> = {}
        if (parsed.data.startsAt !== undefined) demoPatch.startsAt = parsed.data.startsAt
        if (parsed.data.durationMinutes !== undefined) {
          demoPatch.durationMinutes = parsed.data.durationMinutes
        }
        if (parsed.data.sessionType !== undefined) demoPatch.sessionType = parsed.data.sessionType
        if (parsed.data.status !== undefined) demoPatch.status = parsed.data.status
        if (parsed.data.intakeStatusSnapshot !== undefined) {
          demoPatch.intakeStatus = parsed.data.intakeStatusSnapshot
        }
        if (parsed.data.room !== undefined) demoPatch.room = parsed.data.room ?? 'Unassigned'
        store.getState().updateAppointment(appointmentId, demoPatch)
        const updated = store
          .getState()
          .appointments.find((appointment) => appointment.id === appointmentId)
        if (!updated) throw repositoryError('write_failed', operation)
        return mapAppointment(updated)
      } catch (error) {
        throw asRepositoryError(error, 'write_failed', operation)
      }
    },
  }

  return {
    mode: 'demo',
    clients,
    appointments,
    async readSnapshot() {
      const [clientRecords, appointmentRecords] = await Promise.all([
        clients.list(),
        appointments.list(),
      ])
      return {
        mode: 'demo',
        clients: clientRecords,
        appointments: appointmentRecords,
        capturedAt: new Date().toISOString(),
      }
    },
  }
}
