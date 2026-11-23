import type { AnatomicalSide, AreaKey, RegionId } from './regions'

/** Where an observation came from. Every source is plotted, each with its own marker. */
export type ObservationSource = 'home' | 'arrival' | 'session' | 'follow_up'

export const OBSERVATION_SOURCE_LABEL: Record<ObservationSource, string> = {
  home: 'Logged at home',
  arrival: 'Arrival check',
  session: 'Treatment visit',
  follow_up: 'Next-day follow-up',
}

export type Actor = { readonly role: 'client' | 'therapist'; readonly id: string }

export type PainEntry = {
  readonly region: RegionId
  readonly side: AnatomicalSide
  /** 0 = no pain, 10 = worst imaginable. */
  readonly pain: number
}

export type GoalScoreEntry = { readonly goalId: string; readonly score: number }

/**
 * One moment a person described how they feel. `observedAt` is when it applies,
 * `recordedAt` is when it was entered. A day without an observation is a gap.
 */
export type CareObservation = {
  readonly id: string
  readonly clientId: string
  readonly source: ObservationSource
  readonly observedAt: string
  readonly recordedAt: string
  readonly recordedBy: Actor
  readonly appointmentId?: string
  readonly entries: readonly PainEntry[]
  readonly note?: string
  readonly goalScores?: readonly GoalScoreEntry[]
}

/**
 * "Still accurate" at arrival. It points at the original observation and never
 * becomes a second measurement.
 */
export type ArrivalConfirmation = {
  readonly id: string
  readonly clientId: string
  readonly appointmentId: string
  readonly observationId: string
  readonly area: AreaKey
  readonly confirmedAt: string
}

export type StiffnessAssessment = {
  readonly id: string
  readonly clientId: string
  readonly appointmentId: string
  readonly therapistId: string
  readonly recordedAt: string
  readonly area: AreaKey
  /** 0 = supple, 10 = very stiff, by palpation. */
  readonly stiffness: number
}

export type RomMovement = 'neck_rotation' | 'shoulder_flexion' | 'shoulder_abduction' | 'shoulder_external_rotation'
export type RomMethod = 'goniometer' | 'visual_estimate'

export const ROM_MOVEMENTS: Record<RomMovement, { label: string; typicalDegrees: number }> = {
  neck_rotation: { label: 'Neck rotation', typicalDegrees: 80 },
  shoulder_flexion: { label: 'Shoulder flexion', typicalDegrees: 180 },
  shoulder_abduction: { label: 'Shoulder abduction', typicalDegrees: 180 },
  shoulder_external_rotation: { label: 'Shoulder external rotation', typicalDegrees: 90 },
}

export const ROM_METHOD_LABEL: Record<RomMethod, string> = {
  goniometer: 'Goniometer',
  visual_estimate: 'Visual estimate',
}

export type RomMeasurement = {
  readonly id: string
  readonly clientId: string
  readonly appointmentId?: string
  readonly therapistId: string
  readonly recordedAt: string
  readonly movement: RomMovement
  readonly side: Exclude<AnatomicalSide, 'centre'>
  readonly degrees: number
  readonly method: RomMethod
}

export type FunctionalGoal = {
  readonly id: string
  readonly clientId: string
  /** In the client's own words, e.g. "Turn to look behind the car". */
  readonly wording: string
  readonly area: AreaKey
  readonly createdAt: string
  readonly status: 'active' | 'achieved' | 'paused'
}

export type GoalScore = {
  readonly id: string
  readonly goalId: string
  readonly clientId: string
  readonly recordedAt: string
  /** 0 = not possible today, 10 = easy. */
  readonly score: number
  readonly source: ObservationSource
  readonly observationId?: string
}

/** How the client felt the day after a visit. */
export type SessionResponse = -2 | -1 | 0 | 1 | 2

export const SESSION_RESPONSE_LABEL: Record<`${SessionResponse}`, string> = {
  '-2': 'Much worse',
  '-1': 'A little worse',
  '0': 'About the same',
  '1': 'A little better',
  '2': 'Much better',
}

export type FollowUpResponse = {
  readonly id: string
  readonly clientId: string
  readonly appointmentId: string
  readonly respondedAt: string
  readonly response: SessionResponse
  readonly observationId?: string
}

export type BonusCredit = {
  /** Always `bonus-<appointmentId>`: one credit per visit, whatever retries happen. */
  readonly id: string
  readonly appointmentId: string
  readonly clientId: string
  readonly therapistId: string
  readonly minutes: number
  readonly bookedMinutes: number
  readonly actualMinutes: number
  readonly visitDate: string
  readonly confirmedAt: string
}

export type NoteVisibility = 'private' | 'report'

export type TherapistNote = {
  readonly id: string
  readonly clientId: string
  readonly therapistId: string
  readonly createdAt: string
  readonly updatedAt: string
  /** `private` notes never leave the practice. `report` notes are written for a doctor. */
  readonly visibility: NoteVisibility
  readonly body: string
  readonly appointmentId?: string
}

export const REPORT_SECTIONS = ['bodyMap', 'painTrend', 'rangeOfMotion', 'goals', 'visits', 'photos'] as const
export type ReportSection = (typeof REPORT_SECTIONS)[number]
export type ReportFigureView = 'auto' | 'front' | 'back' | 'paired'

export type ReportConsent = {
  readonly consentedAt: string
  readonly recipient: string
  readonly purpose: string
  readonly includesPhotos: boolean
}

export type DoctorReport = {
  readonly id: string
  readonly clientId: string
  readonly preparedBy: string
  readonly createdAt: string
  readonly updatedAt: string
  readonly status: 'draft' | 'awaiting_consent' | 'consented' | 'withdrawn'
  readonly recipient: string
  readonly purpose: string
  readonly dateFrom: string
  readonly dateTo: string
  readonly areas: readonly AreaKey[]
  readonly sections: readonly ReportSection[]
  readonly view: ReportFigureView
  readonly noteId?: string
  /** The exact wording the client and doctor will read, copied from the selected note. */
  readonly noteText: string
  readonly recommendation: string
  readonly includePhotos: boolean
  readonly consent?: ReportConsent
}
