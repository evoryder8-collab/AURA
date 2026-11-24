import { addMinutes } from 'date-fns'
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
import {
  addDays,
  CLOSING_MINUTES,
  OPENING_MINUTES,
  SLOT_STEP_MINUTES,
  startProblem,
  zonedParts,
  zonedTimeToUtc,
} from '@/features/visits/slots'
import { PRACTICE_TIME_ZONE } from '@/lib/formatting/time'
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

/** Wall-clock time in the practice zone, `day` days after the practice day of `now`. */
const practiceClock = (now: Date) => {
  const today = zonedParts(now.getTime(), PRACTICE_TIME_ZONE).dayKey
  return (day: number, minutes: number) => new Date(zonedTimeToUtc(addDays(today, day), minutes, PRACTICE_TIME_ZONE))
}

const SLOT_GRID = Array.from(
  { length: (CLOSING_MINUTES - OPENING_MINUTES) / SLOT_STEP_MINUTES },
  (_, index) => OPENING_MINUTES + index * SLOT_STEP_MINUTES,
)

type Wish = { therapistId: string; clientId: string; day: number; minutes: number; durationMinutes: number }

/**
 * Seeds every visit by the rules a booking must follow: the first start that `startProblem` accepts
 * against the visits already seeded for the same therapist or client. The wished time comes first,
 * then later and earlier times that day, then the same on the next day in `direction`: earlier for
 * history, later for bookings.
 */
function seedStart(input: {
  wish: Wish
  direction: 1 | -1
  notBefore: number
  seeded: readonly DemoAppointment[]
  therapists: readonly DemoTherapist[]
  today: string
}): { day: number; startsAt: Date } {
  const { wish } = input
  const workingDays = input.therapists.find((therapist) => therapist.id === wish.therapistId)?.workingDays ?? []
  const busy = input.seeded.filter((item) => item.therapistId === wish.therapistId || item.clientId === wish.clientId)
  const times = [wish.minutes, ...SLOT_GRID.filter((minutes) => minutes > wish.minutes), ...SLOT_GRID.filter((minutes) => minutes < wish.minutes)]
  for (let step = 0; step < 14; step += 1) {
    const day = wish.day + step * input.direction
    const dayKey = addDays(input.today, day)
    const minutes = times.find(
      (candidate) =>
        !startProblem({
          dayKey,
          minutes: candidate,
          durationMinutes: wish.durationMinutes,
          busy,
          now: input.notBefore,
          timeZone: PRACTICE_TIME_ZONE,
          workingDays,
        }),
    )
    if (minutes !== undefined) return { day, startsAt: new Date(zonedTimeToUtc(dayKey, minutes, PRACTICE_TIME_ZONE)) }
  }
  throw new Error(`No opening for the seeded visit on day ${wish.day}.`)
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
  const today = zonedParts(now.getTime(), PRACTICE_TIME_ZONE).dayKey
  const at = practiceClock(now)
  const created = iso(at(-60, 9 * 60))
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
    const observedAt = iso(at(home.day, home.hour * 60 + (home.minute ?? 0)))
    addObservation(
      {
        id: `obs-${home.key}`,
        clientId: home.clientId,
        source: 'home',
        observedAt,
        recordedAt: iso(addMinutes(new Date(observedAt), 2)),
        recordedBy: { role: 'client', id: home.clientId },
        entries: painEntriesFromSelections(home.pain),
        ...(home.note ? { note: home.note } : {}),
        ...(home.goal !== undefined ? { goalScores: [{ goalId, score: home.goal }] } : {}),
      },
      home.key,
    )
    if (home.goal !== undefined) {
      goalScores.push({ id: `goal-score-${home.key}`, goalId, clientId: home.clientId, recordedAt: observedAt, score: home.goal, source: 'home', observationId: `obs-${home.key}` })
    }
  }

  const appointments: DemoAppointment[] = []
  const confirmations: ArrivalConfirmation[] = []
  const stiffness: StiffnessAssessment[] = []
  const rom: RomMeasurement[] = []
  const followUps: FollowUpResponse[] = []
  const bonusCredits: BonusCredit[] = []
  const seed = (wish: Wish, direction: 1 | -1, notBefore: number) =>
    seedStart({ wish, direction, notBefore, seeded: appointments, therapists, today })
  const seededVisits = new Map<string, { startsAt: Date; finishedAt: Date }>()
  /** A time `minutes` after a seeded visit started or finished, so notes and the goal follow the visit. */
  const visitTime = (key: string, edge: 'startsAt' | 'finishedAt', minutes = 0) => {
    const visit = seededVisits.get(key)
    if (!visit) throw new Error(`Unknown seeded visit ${key}.`)
    return iso(addMinutes(visit[edge], minutes))
  }

  for (const visit of visits) {
    const appointmentId = `appointment-${visit.key}`
    const booked = visit.duration ?? 60
    const { day, startsAt } = seed(
      { therapistId: visit.therapistId, clientId: visit.clientId, day: visit.day, minutes: (visit.hour ?? 10) * 60, durationMinutes: booked },
      -1,
      -Infinity,
    )
    seededVisits.set(visit.key, { startsAt, finishedAt: addMinutes(startsAt, visit.actual) })
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
      const followAt = iso(at(day + 1, 9 * 60 + 10))
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
      followUps.push({
        id: `follow-${visit.key}`,
        clientId: visit.clientId,
        appointmentId,
        respondedAt: followAt,
        response: visit.followUp.response,
        observationId,
        ...(visit.followUp.note ? { note: visit.followUp.note } : {}),
      })
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

  // Upcoming: Noa with Pratana from the half hour after next (90 minutes), Mira with Wassana the next working day.
  const halfHour = Math.floor(zonedParts(now.getTime(), PRACTICE_TIME_ZONE).minutes / 30) * 30
  const bookings: Array<{ id: string; clientId: string; therapistId: string; day: number; minutes: number; durationMinutes: number; sessionType: string }> = [
    { id: 'appointment-noa-today', clientId: N, therapistId: P, day: 0, minutes: halfHour + 60, durationMinutes: 90, sessionType: 'Deep restorative massage' },
    { id: 'appointment-mira-tomorrow', clientId: M, therapistId: W, day: 1, minutes: 10 * 60, durationMinutes: 60, sessionType: 'Therapeutic massage' },
    { id: 'appointment-mira-next-week', clientId: M, therapistId: P, day: 6, minutes: 14 * 60, durationMinutes: 60, sessionType: 'Therapeutic massage' },
    { id: 'appointment-noa-next-week', clientId: N, therapistId: P, day: 7, minutes: 9 * 60 + 30, durationMinutes: 90, sessionType: 'Deep restorative massage' },
    { id: 'appointment-sage-later', clientId: S, therapistId: W, day: 3, minutes: 15 * 60, durationMinutes: 45, sessionType: 'Focused session' },
  ]
  for (const booking of bookings) {
    const { id, clientId, therapistId, durationMinutes, sessionType } = booking
    const { startsAt } = seed(booking, 1, now.getTime())
    appointments.push({
      id,
      clientId,
      therapistId,
      startsAt: iso(startsAt),
      durationMinutes,
      sessionType,
      status: 'confirmed',
      intakeStatus: 'complete',
      room: 'Garden room',
    })
  }

  const notes: TherapistNote[] = [
    {
      id: 'note-mira-private-1',
      clientId: M,
      therapistId: W,
      createdAt: visitTime('mira-v3', 'finishedAt', 16),
      updatedAt: visitTime('mira-v3', 'finishedAt', 16),
      visibility: 'private',
      body: 'Prefers the room warmer. Side-lying on the left is uncomfortable; use the bolster.',
      appointmentId: 'appointment-mira-v3',
    },
    {
      id: 'note-mira-private-2',
      clientId: M,
      therapistId: P,
      createdAt: visitTime('mira-v6', 'finishedAt', 5),
      updatedAt: visitTime('mira-v6', 'finishedAt', 5),
      visibility: 'private',
      body: 'Guarded on left rotation. Upper trapezius and levator scapulae tender; lighter pressure on the neck preferred.',
      appointmentId: 'appointment-mira-v6',
    },
    {
      id: 'note-mira-report-1',
      clientId: M,
      therapistId: P,
      createdAt: visitTime('mira-v6', 'finishedAt', 10),
      updatedAt: visitTime('mira-v6', 'finishedAt', 10),
      visibility: 'report',
      body: 'Left shoulder discomfort has been reported at 5–6/10 at each of the last six visits, and left neck rotation has measured between 52° and 60°. The discomfort has continued between visits.',
      appointmentId: 'appointment-mira-v6',
    },
  ]

  return {
    anchoredAt: iso(now),
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
        createdAt: visitTime('mira-v1', 'startsAt'),
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

/** The seeded collections whose records carry dates. */
const DATED = ['clients', 'appointments', 'observations', 'confirmations', 'stiffness', 'rom', 'goals', 'goalScores', 'followUps', 'bonusCredits', 'notes'] as const
type Linked = { id: string; appointmentId?: string; observationId?: string }

/**
 * A record saved before the anchor was kept: the earlier build always put Noa's visit an hour after
 * the half hour the demo was made, so that time gives the anchor back. It counts only when this build
 * regenerates the very same visit from it.
 */
function inferredAnchor(saved: Pick<DemoState, 'appointments'>): string | undefined {
  const noa = saved.appointments.find((item) => item.id === 'appointment-noa-today')
  if (!noa) return undefined
  const candidate = new Date(Date.parse(noa.startsAt) - 60 * 60_000)
  const regenerated = createDemoState(candidate).appointments.find((item) => item.id === noa.id)
  return JSON.stringify(regenerated) === JSON.stringify(noa) ? iso(candidate) : undefined
}

/**
 * Moves the untouched demo story to today. The story is generated around the day the demo was first
 * opened; a visitor coming back by the story's next visit day (Mira's visit "tomorrow") carries on with
 * it, but one coming back later would find every booking in the past. Then each record still identical
 * to its version at the old anchor is replaced by its version at `now`. What the person added or changed
 * stays as it is, and so does every seeded record tied to it through a visit or a log, so a visit never
 * drifts away from its arrival, its notes or the log it confirmed.
 */
export function reanchorDemoState(saved: Omit<DemoState, 'anchoredAt'> & { anchoredAt?: string }, now: Date): DemoState {
  const anchor = saved.anchoredAt ?? inferredAnchor(saved)
  const day = (at: string | number) => zonedParts(at, PRACTICE_TIME_ZONE).dayKey
  const today = day(now.getTime())
  // A record whose anchor cannot be known is left as it is: anchored to today, none of it will match the seed again.
  if (!anchor || day(anchor) >= today) return { ...saved, anchoredAt: anchor ?? iso(now) }
  const before = createDemoState(new Date(anchor))
  const nextVisitDay = before.appointments
    .filter((item) => item.status === 'confirmed' && day(item.startsAt) > day(anchor))
    .map((item) => day(item.startsAt))
    .sort()[0]
  if (nextVisitDay && today <= nextVisitDay) return { ...saved, anchoredAt: anchor }

  const after = createDemoState(now)
  const untouched = (key: (typeof DATED)[number], record: Linked) => {
    const seeded = (before[key] as Linked[]).find((item) => item.id === record.id)
    return seeded !== undefined && JSON.stringify(seeded) === JSON.stringify(record)
  }
  const movable = new Set<Linked>(DATED.flatMap((key) => (saved[key] as Linked[]).filter((record) => untouched(key, record))))
  const staying = DATED.flatMap((key) => saved[key] as Linked[]).filter((record) => !movable.has(record))
  const pinned = new Set(staying.flatMap((record) => [record.id, record.appointmentId, record.observationId]))
  for (let grew = true; grew; ) {
    grew = false
    for (const record of movable) {
      if (![record.id, record.appointmentId, record.observationId].some((id) => id !== undefined && pinned.has(id))) continue
      movable.delete(record)
      for (const id of [record.id, record.appointmentId, record.observationId]) pinned.add(id)
      grew = true
    }
  }

  const moved: Record<string, unknown> = { ...saved, anchoredAt: iso(now) }
  for (const key of DATED) {
    const fresh = new Map((after[key] as Linked[]).map((item) => [item.id, item]))
    moved[key] = (saved[key] as Linked[]).map((record) => (movable.has(record) ? (fresh.get(record.id) ?? record) : record))
  }
  return moved as DemoState
}
