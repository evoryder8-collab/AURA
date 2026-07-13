export const appointmentStatuses = [
  'requested',
  'pending',
  'confirmed',
  'completed',
  'cancelled',
  'declined',
] as const

export type AppointmentStatus = (typeof appointmentStatuses)[number]

export const intakeStatuses = ['pending', 'partial', 'complete', 'review_required'] as const

export type IntakeStatus = (typeof intakeStatuses)[number]
export type RepositoryMode = 'demo' | 'supabase'

/**
 * Client-safe core record shared by the local and connected adapters.
 * Therapist-only observations and private notes deliberately do not appear here.
 */
export interface ClientRecord {
  readonly source: RepositoryMode
  readonly id: string
  readonly practiceId: string | null
  readonly authUserId: string | null
  readonly preferredName: string
  readonly legalName: string | null
  readonly email: string | null
  readonly phone: string | null
  readonly dateOfBirth: string | null
  readonly intakeStatus: IntakeStatus
  readonly active: boolean
  readonly createdBy: string | null
  readonly createdAt: string | null
  readonly updatedAt: string | null
}

/** Scheduling data only. The therapist scheduling note lives in its own repository/table. */
export interface AppointmentRecord {
  readonly source: RepositoryMode
  readonly id: string
  readonly practiceId: string | null
  readonly clientId: string
  readonly therapistUserId: string | null
  readonly startsAt: string
  readonly durationMinutes: number
  readonly sessionType: string
  readonly status: AppointmentStatus
  readonly intakeStatusSnapshot: IntakeStatus
  readonly requestedBy: string | null
  readonly room: string | null
  readonly createdAt: string | null
  readonly updatedAt: string | null
}

export interface ClientListOptions {
  readonly active?: boolean
  readonly intakeStatuses?: readonly IntakeStatus[]
}

export interface AppointmentListOptions {
  readonly clientId?: string
  readonly statuses?: readonly AppointmentStatus[]
  readonly startsAtOrAfter?: string
  readonly startsBefore?: string
}

export interface CreateClientInput {
  readonly preferredName: string
  readonly legalName?: string | null
  readonly email?: string | null
  readonly phone?: string | null
  readonly dateOfBirth?: string | null
}

export interface CreateAppointmentInput {
  readonly clientId: string
  readonly therapistUserId?: string
  readonly startsAt: string
  readonly durationMinutes: number
  readonly sessionType: string
  readonly status: AppointmentStatus
  readonly intakeStatusSnapshot: IntakeStatus
  readonly requestedBy?: string | null
  readonly room?: string | null
}

export interface UpdateAppointmentInput {
  readonly startsAt?: string
  readonly durationMinutes?: number
  readonly sessionType?: string
  readonly status?: AppointmentStatus
  readonly intakeStatusSnapshot?: IntakeStatus
  readonly room?: string | null
}

export interface ClientRepository {
  list(options?: ClientListOptions): Promise<readonly ClientRecord[]>
  get(clientId: string): Promise<ClientRecord | null>
  create(input: CreateClientInput): Promise<ClientRecord>
}

export interface AppointmentRepository {
  list(options?: AppointmentListOptions): Promise<readonly AppointmentRecord[]>
  get(appointmentId: string): Promise<AppointmentRecord | null>
  create(input: CreateAppointmentInput): Promise<AppointmentRecord>
  update(appointmentId: string, patch: UpdateAppointmentInput): Promise<AppointmentRecord>
}

export interface RepositorySnapshot {
  readonly mode: RepositoryMode
  readonly clients: readonly ClientRecord[]
  readonly appointments: readonly AppointmentRecord[]
  readonly capturedAt: string
}

export interface AuraRepositories {
  readonly mode: RepositoryMode
  readonly clients: ClientRepository
  readonly appointments: AppointmentRepository
  readSnapshot(): Promise<RepositorySnapshot>
}
