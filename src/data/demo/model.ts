import type { PatternType } from '@/domain/engine'

export type { PatternType }

export type AppointmentStatus =
  'requested' | 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'declined'

export type BodySide = 'left' | 'right' | 'central' | 'bilateral' | 'not_applicable'

export type MetricPoint = {
  id: string
  recordedAt: string
  appointmentId: string
  pain: number
  stiffness: number
  rom: number
  function: number
  response: number
  events?: string[]
}

export type FunctionalGoal = {
  id: string
  category: string
  wording: string
  region: string
  baseline: number
  current: number
  importance: 'important' | 'very_important' | 'essential'
  targetDate: string
  status: 'active' | 'achieved' | 'paused' | 'revised' | 'archived'
}

export type ConsentState = {
  healthData: boolean
  photography: boolean
  reminders: boolean
  handoff: boolean
  aiProcessing: boolean
}

export type DemoTherapist = {
  id: string
  preferredName: string
  displayName: string
  dateOfBirth: string
  professionalTitle: string
  specialties: string[]
  assignedClientIds: string[]
  availability: {
    status: 'available' | 'limited' | 'away'
    label: string
    nextAvailableAt?: string
  }
  portraitUrl?: string
  portraitScale?: number
  synthetic: true
}

export type IntakeDraft = {
  step: number
  preferredName: string
  email: string
  phone: string
  dateOfBirth: string
  healthNotes: string
  healthFlags: string[]
  hasRecentProcedure: boolean
  procedureRegion: string
  procedureType: string
  procedureDate: string
  clearance: string
  medications: string
  restrictions: string
  goalWording: string
  goalCategory: string
  goalScore: number
  additionalGoals?: Array<{
    wording: string
    category: string
    score: number
    region: string
  }>
  bodyRegions: string[]
  painScore: number
  consents: ConsentState
  guardianName: string
  guardianRelationship: string
  guardianConfirmed: boolean
  savedAt: string
}

export type DemoClient = {
  id: string
  preferredName: string
  displayName: string
  email: string
  phone: string
  dateOfBirth: string
  portraitUrl?: string
  portraitScale?: number
  synthetic: true
  phase: string
  pattern: PatternType
  confidence: number
  recoveryIndex: number
  intakeStatus: 'pending' | 'partial' | 'complete' | 'review_required'
  active: boolean
  assignedTherapistIds: string[]
  reviewProgress: boolean
  caution?: {
    label: string
    fact: string
    region: string
    source: string
    reviewedAt: string
  }
  goals: FunctionalGoal[]
  metrics: MetricPoint[]
  consents: ConsentState
  insight: {
    status: 'draft' | 'approved' | 'rejected'
    therapist: string
    client: string
    evidence: string
  }
  bonusMinutesLifetime: number
  lastFollowUpAt?: string
  photos: Array<{ id: string; view: 'front' | 'side' | 'back'; phase: 'before' | 'after' }>
  intakeDraft?: IntakeDraft
  intakeRecord?: IntakeDraft
}

export type DemoAppointment = {
  id: string
  clientId: string
  therapistId: string
  startsAt: string
  durationMinutes: number
  sessionType: string
  status: AppointmentStatus
  intakeStatus: DemoClient['intakeStatus']
  room: string
  requestNote?: string
  session?: {
    startedAt?: string
    finishedAt?: string
    actualMinutes?: number
    bonusMinutes?: number
    pressure?: string
    response?: string
    note?: string
    preparationNote?: string
    assessment?: {
      stiffness: number
      rom: number
      method: string
      region: string
    }
    areas?: string[]
    approaches?: string[]
    aftercare?: string
    voiceCapture?: {
      durationSeconds: number
      sizeBytes: number
      recordedAt: string
    }
  }
}

export type ContextEvent = {
  id: string
  clientId: string
  appointmentId?: string
  type: string
  description: string
  occurredAt: string
}

export type DemoHandoff = {
  id: string
  clientId: string
  status: 'draft' | 'awaiting_consent' | 'approved' | 'generated' | 'revoked'
  recipientName: string
  recipientOrganization: string
  purpose: string
  therapistNote?: string
  dateFrom: string
  dateTo: string
  includedSections: string[]
  includePhotos: boolean
  expiresAt: string
  createdAt: string
}

export type DemoState = {
  therapists: DemoTherapist[]
  clients: DemoClient[]
  appointments: DemoAppointment[]
  events: ContextEvent[]
  handoffs: DemoHandoff[]
}
