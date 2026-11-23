import { addDays, addMinutes, setHours, setMinutes, setSeconds, setMilliseconds, startOfHour } from 'date-fns'
import {
  painEntriesFromSelections,
  type ArrivalConfirmation,
  type BonusCredit,
  type CareObservation,
  type FollowUpResponse,
  type GoalScore,
  type PainSelection,
  type RomMeasurement,
  type SessionResponse,
  type StiffnessAssessment,
  type TherapistNote,
} from '@/domain/care'
import type { DemoAppointment, DemoClient, DemoState, DemoTherapist } from './model'

/** Stable ids so persisted demo state and sign-in shortcuts survive reloads. */
export const DEMO_THERAPIST_IDS = {
  amara: 'demo-therapist-amara',
  sora: 'demo-therapist-sora',
} as const

export const DEMO_CLIENT_IDS = {
  mira: 'demo-client-mira',
  noa: 'demo-client-noa',
  sage: 'demo-client-sage',
} as const

const iso = (date: Date) => date.toISOString()

function dayAt(now: Date, dayOffset: number, hour: number, minute = 0) {
  return setMilliseconds(setSeconds(setMinutes(setHours(addDays(now, dayOffset), hour), minute), 0), 0)
}

export function createDemoTherapists(): DemoTherapist[] {
  return [
    {
      id: DEMO_THERAPIST_IDS.amara,
      preferredName: 'Pratana',
      displayName: 'Pratana Halstrick',
      dateOfBirth: '1991-01-15',
      username: 'pratana',
      email: 'pratana@aura-demo.invalid',
      professionalTitle: 'Massage therapist · practice lead',
      specialties: ['Neck and shoulder care', 'Restorative massage'],
      bio: 'Calm, precise work for necks and shoulders that carry the day.',
      possessive: 'her',
      assignedClientIds: [DEMO_CLIENT_IDS.mira, DEMO_CLIENT_IDS.noa],
      workingDays: [1, 2, 3, 4, 5, 6],
      availability: { status: 'available', label: 'Openings this week' },
      portrait: { hero: 'portraits/pratana-hero.webp', avatar: 'portraits/pratana-avatar.webp' },
      synthetic: true,
    },
    {
      id: DEMO_THERAPIST_IDS.sora,
      preferredName: 'Wassana',
      displayName: 'Wassana Schlaepfer',
      dateOfBirth: '1971-01-15',
      username: 'wassana',
      email: 'wassana@aura-demo.invalid',
      professionalTitle: 'Therapeutic massage practitioner',
      specialties: ['Back and whole-body care', 'Progress reviews'],
      bio: 'Thirty years of steady hands and careful listening.',
      assignedClientIds: [DEMO_CLIENT_IDS.mira, DEMO_CLIENT_IDS.sage],
      workingDays: [1, 2, 3, 4, 5],
      availability: { status: 'available', label: 'Openings this week' },
      portrait: { hero: 'portraits/wassana-hero.webp', avatar: 'portraits/wassana-avatar.webp' },
      synthetic: true,
    },
  ]
}

function client(
  id: string,
  preferredName: string,
  surname: string,
  dateOfBirth: string,
  therapistIds: string[],
  createdAt: string,
): DemoClient {
  return {
    id,
    preferredName,
    displayName: `${preferredName} ${surname}`,
    dateOfBirth,
    username: preferredName.toLocaleLowerCase(),
    email: `${preferredName.toLocaleLowerCase()}@aura-demo.invalid`,
    phone: '+00 000 000 0000',
    synthetic: true,
    intakeStatus: 'complete',
    active: true,
    assignedTherapistIds: therapistIds,
    consents: { healthData: true, photography: false, reminders: true, handoff: false, aiProcessing: false },
    createdAt,
  }
}

type VisitSpec = {
  key: string
  clientId: string
  therapistId: string
  day: number
  hour?: number
  duration?: number
  actual: number
  sessionType?: string
  /** Areas scored at arrival. Omit when the client only confirmed earlier reports. */
  arrival?: PainSelection[]
  confirm?: Array<{ observationKey: string; area: ArrivalConfirmation['area'] }>
  stiffness?: Array<[ArrivalConfirmation['area'], number]>
  rom?: Array<[RomMeasurement['movement'], RomMeasurement['side'], number]>
  followUp?: { response: SessionResponse; pain: PainSelection[]; note?: string }
  goal?: number
}

type HomeSpec = {
  key: string
  clientId: string
  day: number
  hour: number
  minute?: number
  pain: PainSelection[]
  note?: string
  goal?: number
}

export function createDemoState(now: Date = new Date()): DemoState {
  const therapists = createDemoTherapists()
  const created = iso(dayAt(now, -60, 9))
  const clients = [
    client(DEMO_CLIENT_IDS.mira, 'Mira', 'Ellison', '1992-04-12', [DEMO_THERAPIST_IDS.amara, DEMO_THERAPIST_IDS.sora], created),
    client(DEMO_CLIENT_IDS.noa, 'Noa', 'Lindqvist', '1987-09-23', [DEMO_THERAPIST_IDS.amara], created),
    client(DEMO_CLIENT_IDS.sage, 'Sage', 'Okafor', '1979-01-30', [DEMO_THERAPIST_IDS.sora], created),
  ]

  const P = DEMO_THERAPIST_IDS.amara
  const W = DEMO_THERAPIST_IDS.sora
  const M = DEMO_CLIENT_IDS.mira
  const N = DEMO_CLIENT_IDS.noa
  const S = DEMO_CLIENT_IDS.sage
  const shoulder = (pain: number): PainSelection => ({ region: 'shoulder', side: 'left', pain })
  const neck = (pain: number): PainSelection => ({ region: 'neck', side: 'left', pain })
  const back = (pain: number): PainSelection => ({ region: 'lower_back', side: 'centre', pain })
  const hip = (pain: number): PainSelection => ({ region: 'hip', side: 'right', pain })

  const homes: HomeSpec[] = [
    { key: 'mira-h1', clientId: M, day: -31, hour: 19, pain: [shoulder(4)], note: 'Desk day, tight by the evening.' },
    { key: 'mira-h2', clientId: M, day: -24, hour: 8, minute: 30, pain: [shoulder(6)], note: 'Woke up stiff after sleeping on that side.', goal: 4 },
    { key: 'mira-h3', clientId: M, day: -10, hour: 21, minute: 15, pain: [shoulder(5)], note: 'Better after the weekend; still catches when I reach back.' },
    { key: 'noa-h1', clientId: N, day: -1, hour: 18, minute: 20, pain: [back(5)], note: 'Gardening at the weekend; sore when bending down.' },
  ]

  const visits: VisitSpec[] = [
    { key: 'mira-v1', clientId: M, therapistId: W, day: -42, actual: 66, sessionType: 'First visit', arrival: [shoulder(5), neck(3)], stiffness: [['shoulder:left', 7]], rom: [['neck_rotation', 'left', 55], ['shoulder_abduction', 'left', 140]], followUp: { response: 1, pain: [shoulder(4)] }, goal: 4 },
    { key: 'mira-v2', clientId: M, therapistId: P, day: -35, actual: 70, arrival: [shoulder(6)], stiffness: [['shoulder:left', 7]], rom: [['neck_rotation', 'left', 58], ['shoulder_abduction', 'left', 145]], followUp: { response: 1, pain: [shoulder(4)] } },
    { key: 'mira-v3', clientId: M, therapistId: W, day: -28, actual: 64, arrival: [shoulder(5), neck(2)], stiffness: [['shoulder:left', 6]], rom: [['neck_rotation', 'left', 60], ['shoulder_abduction', 'left', 150]], followUp: { response: 0, pain: [shoulder(5)] }, goal: 5 },
    { key: 'mira-v4', clientId: M, therapistId: P, day: -21, actual: 68, confirm: [{ observationKey: 'mira-h2', area: 'shoulder:left' }], stiffness: [['shoulder:left', 6]], rom: [['neck_rotation', 'left', 57], ['shoulder_abduction', 'left', 148]] },
    { key: 'mira-v5', clientId: M, therapistId: P, day: -14, actual: 72, arrival: [shoulder(6), neck(3)], stiffness: [['shoulder:left', 7]], rom: [['neck_rotation', 'left', 55], ['shoulder_abduction', 'left', 142]], followUp: { response: 0, pain: [shoulder(5)] }, goal: 5 },
    { key: 'mira-v6', clientId: M, therapistId: P, day: -7, actual: 65, arrival: [shoulder(6)], stiffness: [['shoulder:left', 7]], rom: [['neck_rotation', 'left', 52], ['shoulder_abduction', 'left', 140]], followUp: { response: 0, pain: [shoulder(5)], note: 'Looser for an evening, then back to the same.' }, goal: 4 },
    { key: 'noa-v1', clientId: N, therapistId: P, day: -20, actual: 92, duration: 90, arrival: [back(6)], stiffness: [['lower_back:centre', 6]], followUp: { response: 1, pain: [back(4)] } },
    { key: 'noa-v2', clientId: N, therapistId: P, day: -9, actual: 95, duration: 90, arrival: [back(4)], stiffness: [['lower_back:centre', 5]], followUp: { response: 1, pain: [back(3)] } },
    { key: 'sage-v1', clientId: S, therapistId: W, day: -16, actual: 47, duration: 45, arrival: [hip(5)], stiffness: [['hip:right', 5]], followUp: { response: 1, pain: [hip(4)] } },
    { key: 'sage-v2', clientId: S, therapistId: W, day: -2, actual: 45, duration: 45, arrival: [hip(4)], stiffness: [['hip:right', 4]], followUp: { response: 1, pain: [hip(3)] } },
  ]

  const observations: CareObservation[] = []
  const observationIds = new Map<string, string>()
  const addObservation = (observation: CareObservation, key?: string) => {
    observations.push(observation)
    if (key) observationIds.set(key, observation.id)
  }
  const goalScores: GoalScore[] = []
  const goalId = 'goal-mira-reverse'

  for (const home of homes) {
    const at = iso(dayAt(now, home.day, home.hour, home.minute ?? 0))
    addObservation(
      {
        id: `obs-${home.key}`,
        clientId: home.clientId,
        source: 'home',
        observedAt: at,
        recordedAt: iso(addMinutes(new Date(at), 2)),
        recordedBy: { role: 'client', id: home.clientId },
        entries: painEntriesFromSelections(home.pain),
        ...(home.note ? { note: home.note } : {}),
        ...(home.goal !== undefined ? { goalScores: [{ goalId, score: home.goal }] } : {}),
      },
      home.key,
    )
    if (home.goal !== undefined) {
      goalScores.push({ id: `goal-score-${home.key}`, goalId, clientId: home.clientId, recordedAt: at, score: home.goal, source: 'home', observationId: `obs-${home.key}` })
    }
  }

  const appointments: DemoAppointment[] = []
  const confirmations: ArrivalConfirmation[] = []
  const stiffness: StiffnessAssessment[] = []
  const rom: RomMeasurement[] = []
  const followUps: FollowUpResponse[] = []
  const bonusCredits: BonusCredit[] = []

  for (const visit of visits) {
    const appointmentId = `appointment-${visit.key}`
    const startsAt = dayAt(now, visit.day, visit.hour ?? 10)
    const booked = visit.duration ?? 60
    const arrivalAt = iso(addMinutes(startsAt, -6))
    const finishedAt = iso(addMinutes(startsAt, visit.actual))
    let arrivalObservationId: string | undefined
    if (visit.arrival) {
      arrivalObservationId = `obs-${visit.key}-arrival`
      addObservation({
        id: arrivalObservationId,
        clientId: visit.clientId,
        source: 'arrival',
        observedAt: arrivalAt,
        recordedAt: arrivalAt,
        recordedBy: { role: 'client', id: visit.clientId },
        appointmentId,
        entries: painEntriesFromSelections(visit.arrival),
      })
    }
    for (const confirm of visit.confirm ?? []) {
      const observationId = observationIds.get(confirm.observationKey)
      if (observationId) {
        confirmations.push({ id: `confirm-${visit.key}-${confirm.area}`, clientId: visit.clientId, appointmentId, observationId, area: confirm.area, confirmedAt: arrivalAt })
      }
    }
    for (const [area, value] of visit.stiffness ?? []) {
      stiffness.push({ id: `stiffness-${visit.key}-${area}`, clientId: visit.clientId, appointmentId, therapistId: visit.therapistId, recordedAt: finishedAt, area, stiffness: value })
    }
    for (const [movement, side, degrees] of visit.rom ?? []) {
      rom.push({ id: `rom-${visit.key}-${movement}`, clientId: visit.clientId, appointmentId, therapistId: visit.therapistId, recordedAt: iso(addMinutes(startsAt, 4)), movement, side, degrees, method: 'goniometer' })
    }
    if (visit.goal !== undefined && visit.clientId === M) {
      goalScores.push({ id: `goal-score-${visit.key}`, goalId, clientId: M, recordedAt: arrivalAt, score: visit.goal, source: 'arrival' })
    }
    if (visit.followUp) {
      const followAt = iso(dayAt(now, visit.day + 1, 9, 10))
      const observationId = `obs-${visit.key}-follow`
      addObservation({
        id: observationId,
        clientId: visit.clientId,
        source: 'follow_up',
        observedAt: followAt,
        recordedAt: followAt,
        recordedBy: { role: 'client', id: visit.clientId },
        appointmentId,
        entries: painEntriesFromSelections(visit.followUp.pain),
        ...(visit.followUp.note ? { note: visit.followUp.note } : {}),
      })
      followUps.push({ id: `follow-${visit.key}`, clientId: visit.clientId, appointmentId, respondedAt: followAt, response: visit.followUp.response, observationId })
    }
    const extra = Math.max(0, visit.actual - booked)
    bonusCredits.push({
      id: `bonus-${appointmentId}`,
      appointmentId,
      clientId: visit.clientId,
      therapistId: visit.therapistId,
      minutes: extra,
      bookedMinutes: booked,
      actualMinutes: visit.actual,
      visitDate: iso(startsAt),
      confirmedAt: finishedAt,
    })
    appointments.push({
      id: appointmentId,
      clientId: visit.clientId,
      therapistId: visit.therapistId,
      startsAt: iso(startsAt),
      durationMinutes: booked,
      sessionType: visit.sessionType ?? (booked >= 90 ? 'Deep restorative massage' : booked <= 45 ? 'Focused session' : 'Therapeutic massage'),
      status: 'completed',
      intakeStatus: 'complete',
      room: 'Garden room',
      arrival: { completedAt: arrivalAt, ...(arrivalObservationId ? { observationId: arrivalObservationId } : {}) },
      session: { startedAt: iso(startsAt), finishedAt, summary: { bookedMinutes: booked, actualMinutes: visit.actual, extraMinutes: extra } },
    })
  }

  // Upcoming: Noa with Pratana at the next half hour (90 minutes), Mira with Wassana tomorrow.
  const nextSlot = addMinutes(startOfHour(now), now.getMinutes() < 30 ? 60 : 90)
  appointments.push(
    {
      id: 'appointment-noa-today',
      clientId: N,
      therapistId: P,
      startsAt: iso(nextSlot),
      durationMinutes: 90,
      sessionType: 'Deep restorative massage',
      status: 'confirmed',
      intakeStatus: 'complete',
      room: 'Garden room',
    },
    {
      id: 'appointment-mira-tomorrow',
      clientId: M,
      therapistId: W,
      startsAt: iso(dayAt(now, 1, 10)),
      durationMinutes: 60,
      sessionType: 'Therapeutic massage',
      status: 'confirmed',
      intakeStatus: 'complete',
      room: 'Garden room',
    },
    {
      id: 'appointment-sage-later',
      clientId: S,
      therapistId: W,
      startsAt: iso(dayAt(now, 3, 15)),
      durationMinutes: 45,
      sessionType: 'Focused session',
      status: 'confirmed',
      intakeStatus: 'complete',
      room: 'Garden room',
    },
  )

  const notes: TherapistNote[] = [
    {
      id: 'note-mira-private-1',
      clientId: M,
      therapistId: W,
      createdAt: iso(dayAt(now, -28, 11, 20)),
      updatedAt: iso(dayAt(now, -28, 11, 20)),
      visibility: 'private',
      body: 'Prefers the room warmer. Side-lying on the left is uncomfortable; use the bolster.',
      appointmentId: 'appointment-mira-v3',
    },
    {
      id: 'note-mira-private-2',
      clientId: M,
      therapistId: P,
      createdAt: iso(dayAt(now, -7, 11, 10)),
      updatedAt: iso(dayAt(now, -7, 11, 10)),
      visibility: 'private',
      body: 'Guarded on left rotation. Upper trapezius and levator scapulae tender; lighter pressure on the neck preferred.',
      appointmentId: 'appointment-mira-v6',
    },
    {
      id: 'note-mira-report-1',
      clientId: M,
      therapistId: P,
      createdAt: iso(dayAt(now, -7, 11, 15)),
      updatedAt: iso(dayAt(now, -7, 11, 15)),
      visibility: 'report',
      body: 'Left shoulder discomfort has been reported at 5–6/10 at each of the last six visits, and left neck rotation has measured between 52° and 60°. The discomfort has continued between visits.',
      appointmentId: 'appointment-mira-v6',
    },
  ]

  return {
    therapists,
    clients,
    appointments,
    observations,
    confirmations,
    stiffness,
    rom,
    goals: [
      {
        id: goalId,
        clientId: M,
        wording: 'Turn to look behind the car without pain',
        area: 'shoulder:left',
        createdAt: iso(dayAt(now, -42, 10)),
        status: 'active',
      },
    ],
    goalScores,
    followUps,
    bonusCredits,
    notes,
    reports: [],
    photos: [],
  }
}
