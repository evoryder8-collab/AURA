import type { SupabaseClient } from '@supabase/supabase-js'
import type {
  AppointmentListOptions,
  AppointmentRecord,
  AuraRepositories,
  BookableTherapistRecord,
  ClientListOptions,
  ClientRecord,
  CreateAppointmentInput,
  CreateClientInput,
  PublicTherapistDirectoryRecord,
  UpdateAppointmentInput,
} from './contracts'
import { asRepositoryError, repositoryError } from './errors'
import {
  actorProfileSchema,
  appointmentRowSchema,
  bookableTherapistRowSchema,
  clientRowSchema,
  createAppointmentSchema,
  createClientSchema,
  publicTherapistDirectoryRowSchema,
  updateAppointmentSchema,
} from './validation'

const CLIENT_COLUMNS = [
  'id',
  'practice_id',
  'auth_user_id',
  'preferred_name',
  'legal_name',
  'email',
  'phone',
  'date_of_birth',
  'intake_status',
  'active',
  'created_by',
  'created_at',
  'updated_at',
].join(',')

const APPOINTMENT_COLUMNS = [
  'id',
  'practice_id',
  'client_id',
  'therapist_user_id',
  'starts_at',
  'duration_minutes',
  'session_type',
  'status',
  'intake_status_snapshot',
  'requested_by',
  'room',
  'created_at',
  'updated_at',
].join(',')

const PUBLIC_THERAPIST_COLUMNS = [
  'practice_name',
  'directory_slug',
  'professional_name',
  'professional_title',
  'public_portrait_path',
].join(',')

const BOOKABLE_THERAPIST_COLUMNS = [
  'user_id',
  'directory_slug',
  'professional_name',
  'professional_title',
  'public_portrait_path',
].join(',')

type ActorContext = {
  readonly userId: string
  readonly practiceId: string
  readonly role: 'therapist' | 'client'
}

function mapClient(value: unknown, operation: string): ClientRecord {
  const parsed = clientRowSchema.safeParse(value)
  if (!parsed.success) throw repositoryError('invalid_response', operation)
  const row = parsed.data
  return {
    source: 'supabase',
    id: row.id,
    practiceId: row.practice_id,
    authUserId: row.auth_user_id,
    preferredName: row.preferred_name,
    legalName: row.legal_name,
    email: row.email,
    phone: row.phone,
    dateOfBirth: row.date_of_birth,
    intakeStatus: row.intake_status,
    active: row.active,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapAppointment(value: unknown, operation: string): AppointmentRecord {
  const parsed = appointmentRowSchema.safeParse(value)
  if (!parsed.success) throw repositoryError('invalid_response', operation)
  const row = parsed.data
  return {
    source: 'supabase',
    id: row.id,
    practiceId: row.practice_id,
    clientId: row.client_id,
    therapistUserId: row.therapist_user_id,
    startsAt: row.starts_at,
    durationMinutes: row.duration_minutes,
    sessionType: row.session_type,
    status: row.status,
    intakeStatusSnapshot: row.intake_status_snapshot,
    requestedBy: row.requested_by,
    room: row.room,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function mapPublicTherapist(value: unknown, operation: string): PublicTherapistDirectoryRecord {
  const parsed = publicTherapistDirectoryRowSchema.safeParse(value)
  if (!parsed.success) throw repositoryError('invalid_response', operation)
  const row = parsed.data
  return {
    source: 'supabase',
    practiceName: row.practice_name,
    directorySlug: row.directory_slug,
    professionalName: row.professional_name,
    professionalTitle: row.professional_title,
    publicPortraitPath: row.public_portrait_path,
  }
}

function mapBookableTherapist(value: unknown, operation: string): BookableTherapistRecord {
  const parsed = bookableTherapistRowSchema.safeParse(value)
  if (!parsed.success) throw repositoryError('invalid_response', operation)
  const row = parsed.data
  return {
    source: 'supabase',
    userId: row.user_id,
    directorySlug: row.directory_slug,
    professionalName: row.professional_name,
    professionalTitle: row.professional_title,
    publicPortraitPath: row.public_portrait_path,
  }
}

function mapClientList(value: unknown, operation: string) {
  if (!Array.isArray(value)) throw repositoryError('invalid_response', operation)
  return value.map((row) => mapClient(row, operation))
}

function mapAppointmentList(value: unknown, operation: string) {
  if (!Array.isArray(value)) throw repositoryError('invalid_response', operation)
  return value.map((row) => mapAppointment(row, operation))
}

async function loadActor(client: SupabaseClient, operation: string): Promise<ActorContext> {
  const auth = await client.auth.getUser()
  if (auth.error || !auth.data.user) throw repositoryError('unauthorized', operation)

  const profile = await client
    .from('profiles')
    .select('practice_id,role')
    .eq('id', auth.data.user.id)
    .maybeSingle()
  if (profile.error || !profile.data) throw repositoryError('unauthorized', operation)
  const parsed = actorProfileSchema.safeParse(profile.data)
  if (!parsed.success) throw repositoryError('invalid_response', operation)
  return {
    userId: auth.data.user.id,
    practiceId: parsed.data.practice_id,
    role: parsed.data.role,
  }
}

export function createSupabaseRepositories(client: SupabaseClient): AuraRepositories {
  const therapists = {
    async listPublic() {
      const operation = 'therapists.listPublic'
      try {
        const response = await client
          .from('public_therapist_directory')
          .select(PUBLIC_THERAPIST_COLUMNS)
          .order('professional_name')
        if (response.error || !Array.isArray(response.data)) {
          throw repositoryError('read_failed', operation)
        }
        return response.data.map((row) => mapPublicTherapist(row, operation))
      } catch (error) {
        throw asRepositoryError(error, 'read_failed', operation)
      }
    },
    async listBookable() {
      const operation = 'therapists.listBookable'
      try {
        const response = await client
          .from('client_therapist_directory')
          .select(BOOKABLE_THERAPIST_COLUMNS)
          .order('professional_name')
        if (response.error || !Array.isArray(response.data)) {
          throw repositoryError('read_failed', operation)
        }
        return response.data.map((row) => mapBookableTherapist(row, operation))
      } catch (error) {
        throw asRepositoryError(error, 'read_failed', operation)
      }
    },
  }

  const clients = {
    async list(options?: ClientListOptions) {
      const operation = 'clients.list'
      try {
        let query = client.from('clients').select(CLIENT_COLUMNS).order('preferred_name')
        if (options?.active !== undefined) query = query.eq('active', options.active)
        if (options?.intakeStatuses?.length) {
          query = query.in('intake_status', [...options.intakeStatuses])
        }
        const response = await query
        if (response.error) throw repositoryError('read_failed', operation)
        return mapClientList(response.data, operation)
      } catch (error) {
        throw asRepositoryError(error, 'read_failed', operation)
      }
    },
    async get(clientId: string) {
      const operation = 'clients.get'
      try {
        const response = await client
          .from('clients')
          .select(CLIENT_COLUMNS)
          .eq('id', clientId)
          .maybeSingle()
        if (response.error) throw repositoryError('read_failed', operation)
        return response.data ? mapClient(response.data, operation) : null
      } catch (error) {
        throw asRepositoryError(error, 'read_failed', operation)
      }
    },
    async create(input: CreateClientInput) {
      const operation = 'clients.create'
      try {
        const parsed = createClientSchema.safeParse(input)
        if (!parsed.success) throw repositoryError('invalid_input', operation)
        const actor = await loadActor(client, operation)
        if (actor.role !== 'therapist') throw repositoryError('forbidden', operation)
        const values: Record<string, unknown> = {
          practice_id: actor.practiceId,
          preferred_name: parsed.data.preferredName,
          intake_status: 'pending',
          active: true,
          created_by: actor.userId,
        }
        if (parsed.data.legalName !== undefined) values.legal_name = parsed.data.legalName
        if (parsed.data.email !== undefined) values.email = parsed.data.email
        if (parsed.data.phone !== undefined) values.phone = parsed.data.phone
        if (parsed.data.dateOfBirth !== undefined) values.date_of_birth = parsed.data.dateOfBirth
        const response = await client.from('clients').insert(values).select(CLIENT_COLUMNS).single()
        if (response.error || !response.data) throw repositoryError('write_failed', operation)
        return mapClient(response.data, operation)
      } catch (error) {
        throw asRepositoryError(error, 'write_failed', operation)
      }
    },
  }

  const appointments = {
    async list(options?: AppointmentListOptions) {
      const operation = 'appointments.list'
      try {
        let query = client.from('appointments').select(APPOINTMENT_COLUMNS).order('starts_at')
        if (options?.clientId) query = query.eq('client_id', options.clientId)
        if (options?.statuses?.length) query = query.in('status', [...options.statuses])
        if (options?.startsAtOrAfter) query = query.gte('starts_at', options.startsAtOrAfter)
        if (options?.startsBefore) query = query.lt('starts_at', options.startsBefore)
        const response = await query
        if (response.error) throw repositoryError('read_failed', operation)
        return mapAppointmentList(response.data, operation)
      } catch (error) {
        throw asRepositoryError(error, 'read_failed', operation)
      }
    },
    async get(appointmentId: string) {
      const operation = 'appointments.get'
      try {
        const response = await client
          .from('appointments')
          .select(APPOINTMENT_COLUMNS)
          .eq('id', appointmentId)
          .maybeSingle()
        if (response.error) throw repositoryError('read_failed', operation)
        return response.data ? mapAppointment(response.data, operation) : null
      } catch (error) {
        throw asRepositoryError(error, 'read_failed', operation)
      }
    },
    async create(input: CreateAppointmentInput) {
      const operation = 'appointments.create'
      try {
        const parsed = createAppointmentSchema.safeParse(input)
        if (!parsed.success) throw repositoryError('invalid_input', operation)
        const actor = await loadActor(client, operation)
        if (actor.role === 'client' && parsed.data.status !== 'requested') {
          throw repositoryError('forbidden', operation)
        }
        const therapistUserId =
          parsed.data.therapistUserId ?? (actor.role === 'therapist' ? actor.userId : null)
        if (!therapistUserId) throw repositoryError('invalid_input', operation)
        if (actor.role === 'client') {
          const response = await client.rpc('request_appointment', {
            requested_therapist_user_id: therapistUserId,
            requested_starts_at: parsed.data.startsAt,
            requested_duration_minutes: parsed.data.durationMinutes,
            requested_session_type: parsed.data.sessionType,
          })
          if (response.error || !response.data) throw repositoryError('write_failed', operation)
          return mapAppointment(response.data, operation)
        }
        const values: Record<string, unknown> = {
          practice_id: actor.practiceId,
          client_id: parsed.data.clientId,
          therapist_user_id: therapistUserId,
          starts_at: parsed.data.startsAt,
          duration_minutes: parsed.data.durationMinutes,
          session_type: parsed.data.sessionType,
          status: parsed.data.status,
          intake_status_snapshot: parsed.data.intakeStatusSnapshot,
          requested_by: parsed.data.requestedBy ?? actor.userId,
        }
        if (parsed.data.room !== undefined) values.room = parsed.data.room
        const response = await client
          .from('appointments')
          .insert(values)
          .select(APPOINTMENT_COLUMNS)
          .single()
        if (response.error || !response.data) throw repositoryError('write_failed', operation)
        return mapAppointment(response.data, operation)
      } catch (error) {
        throw asRepositoryError(error, 'write_failed', operation)
      }
    },
    async update(appointmentId: string, patch: UpdateAppointmentInput) {
      const operation = 'appointments.update'
      try {
        const parsed = updateAppointmentSchema.safeParse(patch)
        if (!parsed.success) throw repositoryError('invalid_input', operation)
        const actor = await loadActor(client, operation)
        if (actor.role === 'client') {
          const keys = Object.keys(parsed.data)
          if (keys.length !== 1 || parsed.data.status !== 'cancelled') {
            throw repositoryError('forbidden', operation)
          }
          const response = await client.rpc('cancel_appointment', {
            target_appointment_id: appointmentId,
          })
          if (response.error || !response.data) throw repositoryError('write_failed', operation)
          return mapAppointment(response.data, operation)
        }
        const values: Record<string, unknown> = {}
        if (parsed.data.startsAt !== undefined) values.starts_at = parsed.data.startsAt
        if (parsed.data.durationMinutes !== undefined) {
          values.duration_minutes = parsed.data.durationMinutes
        }
        if (parsed.data.sessionType !== undefined) values.session_type = parsed.data.sessionType
        if (parsed.data.status !== undefined) values.status = parsed.data.status
        if (parsed.data.intakeStatusSnapshot !== undefined) {
          values.intake_status_snapshot = parsed.data.intakeStatusSnapshot
        }
        if (parsed.data.room !== undefined) values.room = parsed.data.room
        const response = await client
          .from('appointments')
          .update(values)
          .eq('id', appointmentId)
          .select(APPOINTMENT_COLUMNS)
          .single()
        if (response.error || !response.data) throw repositoryError('write_failed', operation)
        return mapAppointment(response.data, operation)
      } catch (error) {
        throw asRepositoryError(error, 'write_failed', operation)
      }
    },
  }

  return {
    mode: 'supabase',
    therapists,
    clients,
    appointments,
    async readSnapshot() {
      const [clientRecords, appointmentRecords] = await Promise.all([
        clients.list(),
        appointments.list(),
      ])
      return {
        mode: 'supabase',
        clients: clientRecords,
        appointments: appointmentRecords,
        capturedAt: new Date().toISOString(),
      }
    },
  }
}
