import type {
  ArrivalConfirmation,
  BonusCredit,
  CareObservation,
  DoctorReport,
  FinishSummary,
  FollowUpResponse,
  FunctionalGoal,
  GoalScore,
  RomMeasurement,
  StiffnessAssessment,
  TherapistNote,
} from '@/domain/care'
import type { ReportInputs } from '@/features/reports/model'

export type AppointmentStatus =
  'requested' | 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'declined'

export type IntakeStatus = 'pending' | 'partial' | 'complete' | 'review_required'

export type ConsentState = {
  healthData: boolean
  photography: boolean
  reminders: boolean
  handoff: boolean
  aiProcessing: boolean
}

export type DemoPortrait = {
  /** Large transparent cut-out for reveals and hero moments. */
  readonly hero: string
  /** Head-and-shoulders crop for lists, bookings and the signed-in header. */
  readonly avatar: string
}

export type DemoTherapist = {
  id: string
  preferredName: string
  displayName: string
  dateOfBirth: string
  username: string
  email: string
  professionalTitle: string
  specialties: string[]
  bio: string
  /** Possessive used in copy about this therapist; omitted when not stated. */
  possessive?: 'her' | 'his' | 'their'
  assignedClientIds: string[]
  workingDays: number[]
  availability: { status: 'available' | 'limited' | 'away'; label: string }
  portrait?: DemoPortrait
  synthetic: true
}

export type DemoClient = {
  id: string
  preferredName: string
  displayName: string
  dateOfBirth: string
  username: string
  email: string
  phone: string
  synthetic: true
  intakeStatus: IntakeStatus
  active: boolean
  assignedTherapistIds: string[]
  consents: ConsentState
  createdAt: string
}

export type DemoAppointment = {
  id: string
  clientId: string
  therapistId: string
  startsAt: string
  durationMinutes: number
  sessionType: string
  status: AppointmentStatus
  intakeStatus: IntakeStatus
  room: string
  requestNote?: string
  createdAt?: string
  /** `note` is what the client added at arrival; a scored arrival record carries it too. */
  arrival?: { completedAt: string; observationId?: string; note?: string }
  session?: {
    startedAt: string
    finishedAt?: string
    summary?: FinishSummary
    response?: string
  }
}

export type DemoPhoto = {
  id: string
  clientId: string
  view: 'front' | 'side' | 'back'
  capturedAt: string
  /** Downscaled JPEG kept only in this browser's synthetic demo storage. */
  dataUrl: string
}

/**
 * What a report showed when the client was asked to agree, kept so the report they agree to is
 * the report that is shared. Photographs are kept by id only: deleting one, or turning
 * photography off, still removes it.
 */
export type ReportSnapshot = Omit<ReportInputs, 'content' | 'photos'> & {
  readonly content: Omit<ReportInputs['content'], 'report'>
  readonly photoIds: readonly string[]
}

/** A report plus, from the moment it is sent to the client, the content it was sent with. */
export type DemoReport = DoctorReport & { readonly snapshot?: ReportSnapshot }

export type DemoState = {
  therapists: DemoTherapist[]
  clients: DemoClient[]
  appointments: DemoAppointment[]
  observations: CareObservation[]
  confirmations: ArrivalConfirmation[]
  stiffness: StiffnessAssessment[]
  rom: RomMeasurement[]
  goals: FunctionalGoal[]
  goalScores: GoalScore[]
  followUps: FollowUpResponse[]
  bonusCredits: BonusCredit[]
  notes: TherapistNote[]
  reports: DemoReport[]
  photos: DemoPhoto[]
}
