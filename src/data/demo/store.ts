import { openDB } from 'idb'
import { create, type StateCreator, type StoreApi } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import {
  areaKey,
  confirmBonusCredit,
  finishSummary,
  painEntriesFromSelections,
  type AreaKey,
  type DoctorReport,
  type NoteVisibility,
  type ObservationSource,
  type PainSelection,
  type RomMeasurement,
  type SessionResponse,
} from '@/domain/care'
import { createDemoState, createDemoTherapists, DEMO_THERAPIST_IDS, reanchorDemoState } from './fixtures'
import { listedPhotos, mirrorKey, mirrorStorage, newerRecord, type MirrorState } from './mirror'
import type { ConsentState, DemoAppointment, DemoState } from './model'

const DB_NAME = 'aura-synthetic-demo'
const STORE_NAME = 'demo-state'
export const DEMO_STORAGE_KEY = 'aura-demo-state-v2'
const STATE_VERSION = 2

const dbPromise =
  typeof indexedDB === 'undefined'
    ? null
    : openDB(DB_NAME, 1, {
        upgrade(database) {
          if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME)
        },
      }).catch(() => null)

const memory = new Map<string, string>()

const indexedDbStorage: StateStorage = {
  async getItem(name) {
    const db = dbPromise ? await dbPromise : null
    const indexed = db ? (((await db.get(STORE_NAME, name)) as string | undefined) ?? null) : (memory.get(name) ?? null)
    return newerRecord(indexed, mirrorStorage.read(name))
  },
  async setItem(name, value) {
    // Synchronous first, so a page closed right after an action keeps it.
    mirrorStorage.write(name, value)
    const db = dbPromise ? await dbPromise : null
    if (!db) {
      memory.set(name, value)
      return
    }
    await db.put(STORE_NAME, value, name)
  },
  async removeItem(name) {
    mirrorStorage.remove(name)
    const db = dbPromise ? await dbPromise : null
    if (!db) {
      memory.delete(name)
      return
    }
    await db.delete(STORE_NAME, name)
  },
}

const createId = (prefix: string) =>
  `${prefix}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`

const nowIso = () => new Date().toISOString()

export type NewAppointment = Omit<DemoAppointment, 'id'>

export type ReportDraft = Omit<DoctorReport, 'id' | 'createdAt' | 'updatedAt' | 'status' | 'consent'>

type DemoActions = {
  hydrated: boolean
  setHydrated: (value: boolean) => void
  resetDemo: () => void
  addClient: (input: { preferredName: string; email: string; phone: string; therapistId?: string }) => string
  addAppointment: (appointment: NewAppointment) => string
  updateAppointment: (id: string, patch: Partial<DemoAppointment>) => void
  cancelAppointment: (id: string) => void
  logObservation: (input: {
    clientId: string
    source: ObservationSource
    selections: PainSelection[]
    observedAt?: string
    note?: string
    goalScore?: { goalId: string; score: number }
    appointmentId?: string
    recordedBy?: { role: 'client' | 'therapist'; id: string }
  }) => string
  completeArrival: (input: {
    appointmentId: string
    confirm: Array<{ observationId: string; area: AreaKey }>
    updates: PainSelection[]
    note?: string
  }) => void
  startSession: (appointmentId: string, startedAt?: string) => void
  /** Synthetic test clock: moves the recorded start earlier so time appears to pass. */
  advanceSessionClock: (appointmentId: string, minutes: number) => void
  finishSession: (appointmentId: string, finishedAt?: string) => void
  resumeSession: (appointmentId: string) => void
  confirmBonus: (appointmentId: string, minutes: number) => void
  recordStiffness: (appointmentId: string, area: AreaKey, stiffness: number) => void
  recordRom: (input: Omit<RomMeasurement, 'id' | 'recordedAt' | 'clientId' | 'therapistId'> & { appointmentId: string }) => void
  recordFollowUp: (input: { appointmentId: string; response: SessionResponse; selections: PainSelection[]; note?: string }) => void
  addNote: (input: { clientId: string; therapistId: string; visibility: NoteVisibility; body: string; appointmentId?: string }) => string
  updateNote: (id: string, patch: { body?: string; visibility?: NoteVisibility }) => void
  deleteNote: (id: string) => void
  saveReport: (draft: ReportDraft, id?: string) => string
  requestReportConsent: (id: string) => void
  consentToReport: (id: string, clientId: string) => void
  withdrawReport: (id: string) => void
  updateConsent: (clientId: string, key: keyof ConsentState, value: boolean) => void
  addPhoto: (input: { clientId: string; view: 'front' | 'side' | 'back'; dataUrl: string }) => string
  removePhoto: (id: string) => void
}

export type DemoStore = DemoState & DemoActions

type Persisted = Partial<DemoState> & { version?: number; savedAt?: number }

/**
 * `savedAt` of the newest record this tab has written or loaded. Every write goes past it, so the
 * last write of a multi-step action always wins over the first, and another tab's record is
 * taken in only when it is newer.
 */
let latestSavedAt = 0
const nextSavedAt = () => (latestSavedAt = Math.max(Date.now(), latestSavedAt + 1))

/** The store's own setter, which persist does not wrap: state that came from storage is not saved back. */
let setUnsaved: StoreApi<DemoStore>['setState'] = () => undefined

const withUnsavedSet = <S extends StateCreator<DemoStore, [], [['zustand/persist', unknown]]>>(creator: S): S =>
  ((setState, getState, api) => {
    setUnsaved = setState
    return creator(setState, getState, api)
  }) as S

function loadRecord(persisted: unknown, current: DemoStore): DemoStore {
  latestSavedAt = Math.max(latestSavedAt, (persisted as Persisted | undefined)?.savedAt ?? 0)
  return mergePersistedDemoState(persisted, current)
}

/**
 * Takes in a record another open tab saved, without saving it back: tabs would otherwise echo
 * each other forever. Photos come from this tab, limited to the ids the record lists; a photo
 * another tab added is loaded from IndexedDB.
 */
function adoptNewerRecord() {
  const current = useDemoStore.getState()
  const record: MirrorState | null = current.hydrated ? mirrorStorage.newerThan(DEMO_STORAGE_KEY, latestSavedAt) : null
  if (!record) return
  const { photoIds: _ids, ...rest } = record
  const photos = listedPhotos(current.photos, record)
  setUnsaved(loadRecord({ ...rest, photos }, current), true)
  if ((record.photoIds?.length ?? 0) > photos.length) void useDemoStore.persist.rehydrate()
}

export function mergePersistedDemoState(persisted: unknown, current: DemoStore): DemoStore {
  const state = (persisted ?? {}) as Persisted
  if (state.version !== STATE_VERSION || !Array.isArray(state.clients) || !Array.isArray(state.observations)) {
    return current
  }
  const identities = createDemoTherapists()
  return {
    ...current,
    // A record from an earlier day gets today's demo schedule, keeping what the person entered.
    ...reanchorDemoState(state as DemoState, new Date()),
    // Identity and portraits always follow the current build; the record keeps the person's data.
    therapists: (state.therapists ?? identities).map((therapist) => {
      const fresh = identities.find((item) => item.id === therapist.id)
      return fresh ? { ...therapist, ...fresh, assignedClientIds: therapist.assignedClientIds } : therapist
    }),
  }
}

export const useDemoStore = create<DemoStore>()(
  withUnsavedSet(persist(
    (set, get) => {
      const patchAppointment = (id: string, patch: (appointment: DemoAppointment) => DemoAppointment) =>
        set((state) => ({ appointments: state.appointments.map((item) => (item.id === id ? patch(item) : item)) }))
      const findAppointment = (id: string) => get().appointments.find((item) => item.id === id)

      return {
        ...createDemoState(),
        hydrated: false,
        // Only the first load saves; reloading another tab's photo from storage has nothing new to save.
        setHydrated: (hydrated) => (get().hydrated === hydrated ? undefined : set({ hydrated })),
        resetDemo: () => set({ ...createDemoState() }),

        addClient: (input) => {
          const id = createId('demo-client')
          const therapistId =
            get().therapists.find((therapist) => therapist.id === input.therapistId)?.id ?? DEMO_THERAPIST_IDS.amara
          set((state) => ({
            clients: [
              ...state.clients,
              {
                id,
                preferredName: input.preferredName,
                displayName: input.preferredName,
                dateOfBirth: '1990-01-01',
                username: input.preferredName.toLocaleLowerCase(),
                email: input.email || `${id}@aura-demo.invalid`,
                phone: input.phone || '+00 000 000 0000',
                synthetic: true,
                intakeStatus: 'pending',
                active: true,
                assignedTherapistIds: [therapistId],
                consents: { healthData: false, photography: false, reminders: false, handoff: false, aiProcessing: false },
                createdAt: nowIso(),
              },
            ],
            therapists: state.therapists.map((therapist) =>
              therapist.id === therapistId
                ? { ...therapist, assignedClientIds: [...therapist.assignedClientIds, id] }
                : therapist,
            ),
          }))
          return id
        },

        addAppointment: (appointment) => {
          const id = createId('appointment')
          set((state) => ({
            appointments: [...state.appointments, { ...appointment, id, createdAt: nowIso() }],
            clients: state.clients.map((client) =>
              client.id === appointment.clientId && !client.assignedTherapistIds.includes(appointment.therapistId)
                ? { ...client, assignedTherapistIds: [...client.assignedTherapistIds, appointment.therapistId] }
                : client,
            ),
            therapists: state.therapists.map((therapist) =>
              therapist.id === appointment.therapistId && !therapist.assignedClientIds.includes(appointment.clientId)
                ? { ...therapist, assignedClientIds: [...therapist.assignedClientIds, appointment.clientId] }
                : therapist,
            ),
          }))
          return id
        },

        updateAppointment: (id, patch) => patchAppointment(id, (item) => ({ ...item, ...patch })),
        cancelAppointment: (id) => patchAppointment(id, (item) => ({ ...item, status: 'cancelled' })),

        logObservation: (input) => {
          const id = createId('obs')
          const recordedAt = nowIso()
          const entries = painEntriesFromSelections(input.selections)
          if (!entries.length) throw new RangeError('Choose at least one area before saving.')
          const note = input.note?.trim()
          set((state) => ({
            observations: [
              ...state.observations,
              {
                id,
                clientId: input.clientId,
                source: input.source,
                observedAt: input.observedAt ?? recordedAt,
                recordedAt,
                recordedBy: input.recordedBy ?? { role: 'client', id: input.clientId },
                entries,
                ...(input.appointmentId ? { appointmentId: input.appointmentId } : {}),
                ...(note ? { note } : {}),
                ...(input.goalScore ? { goalScores: [input.goalScore] } : {}),
              },
            ],
            goalScores: input.goalScore
              ? [
                  ...state.goalScores,
                  {
                    id: createId('goal-score'),
                    goalId: input.goalScore.goalId,
                    clientId: input.clientId,
                    recordedAt: input.observedAt ?? recordedAt,
                    score: input.goalScore.score,
                    source: input.source,
                    observationId: id,
                  },
                ]
              : state.goalScores,
          }))
          return id
        },

        completeArrival: ({ appointmentId, confirm, updates, note }) => {
          const appointment = findAppointment(appointmentId)
          if (!appointment) return
          const completedAt = nowIso()
          const text = note?.trim()
          // Re-running arrival replaces this visit's arrival record instead of adding a second one, so a score
          // confirmed from that record is carried into its replacement rather than left pointing at nothing.
          const previous = get().observations.find((item) => item.id === appointment.arrival?.observationId)
          const carried = confirm.flatMap((item) =>
            item.observationId === previous?.id
              ? previous.entries.filter((entry) => areaKey(entry.region, entry.side) === item.area)
              : [],
          )
          const selections = [...carried, ...updates]
          set((state) => ({
            observations: state.observations.filter((item) => item.id !== previous?.id),
            confirmations: state.confirmations.filter((item) => item.appointmentId !== appointmentId),
          }))
          const updatedAreas = new Set(
            painEntriesFromSelections(selections).map((entry) => areaKey(entry.region, entry.side)),
          )
          const observationId = selections.length
            ? get().logObservation({
                clientId: appointment.clientId,
                source: 'arrival',
                selections,
                appointmentId,
                ...(text ? { note: text } : {}),
              })
            : undefined
          set((state) => ({
            confirmations: [
              ...state.confirmations,
              ...confirm
                .filter((item) => !updatedAreas.has(item.area))
                .map((item) => ({
                  id: createId('confirm'),
                  clientId: appointment.clientId,
                  appointmentId,
                  observationId: item.observationId,
                  area: item.area,
                  confirmedAt: completedAt,
                })),
            ],
          }))
          // The note belongs to the arrival itself, so it is kept when every area was only confirmed.
          patchAppointment(appointmentId, (item) => ({
            ...item,
            arrival: { completedAt, ...(observationId ? { observationId } : {}), ...(text ? { note: text } : {}) },
          }))
        },

        startSession: (appointmentId, startedAt = nowIso()) =>
          patchAppointment(appointmentId, (item) =>
            item.session?.startedAt && !item.session.finishedAt ? item : { ...item, session: { startedAt } },
          ),

        advanceSessionClock: (appointmentId, minutes) =>
          patchAppointment(appointmentId, (item) =>
            item.session && !item.session.finishedAt
              ? {
                  ...item,
                  session: {
                    ...item.session,
                    startedAt: new Date(new Date(item.session.startedAt).getTime() - minutes * 60_000).toISOString(),
                  },
                }
              : item,
          ),

        finishSession: (appointmentId, finishedAt = nowIso()) =>
          patchAppointment(appointmentId, (item) =>
            item.session && !item.session.finishedAt
              ? {
                  ...item,
                  session: {
                    ...item.session,
                    finishedAt: finishedAt < item.session.startedAt ? item.session.startedAt : finishedAt,
                    summary: finishSummary(
                      item.session.startedAt,
                      finishedAt < item.session.startedAt ? item.session.startedAt : finishedAt,
                      item.durationMinutes,
                    ),
                  },
                }
              : item,
          ),

        resumeSession: (appointmentId) =>
          patchAppointment(appointmentId, (item) =>
            item.session && item.status !== 'completed' ? { ...item, session: { startedAt: item.session.startedAt } } : item,
          ),

        confirmBonus: (appointmentId, minutes) => {
          const appointment = findAppointment(appointmentId)
          const summary = appointment?.session?.summary
          if (!appointment || !summary) return
          set((state) => ({
            bonusCredits: confirmBonusCredit(state.bonusCredits, {
              appointmentId,
              clientId: appointment.clientId,
              therapistId: appointment.therapistId,
              minutes,
              bookedMinutes: summary.bookedMinutes,
              actualMinutes: summary.actualMinutes,
              visitDate: appointment.session?.startedAt ?? appointment.startsAt,
              confirmedAt: nowIso(),
            }),
          }))
          patchAppointment(appointmentId, (item) => ({ ...item, status: 'completed' }))
        },

        recordStiffness: (appointmentId, area, stiffness) => {
          const appointment = findAppointment(appointmentId)
          if (!appointment || !Number.isInteger(stiffness) || stiffness < 0 || stiffness > 10) return
          set((state) => ({
            stiffness: [
              ...state.stiffness.filter((item) => !(item.appointmentId === appointmentId && item.area === area)),
              {
                id: createId('stiffness'),
                clientId: appointment.clientId,
                appointmentId,
                therapistId: appointment.therapistId,
                recordedAt: nowIso(),
                area,
                stiffness,
              },
            ],
          }))
        },

        recordRom: (input) => {
          const appointment = findAppointment(input.appointmentId)
          if (!appointment || !Number.isFinite(input.degrees) || input.degrees < 0 || input.degrees > 200) return
          set((state) => ({
            rom: [
              ...state.rom.filter(
                (item) =>
                  !(item.appointmentId === input.appointmentId && item.movement === input.movement && item.side === input.side),
              ),
              {
                ...input,
                id: createId('rom'),
                clientId: appointment.clientId,
                therapistId: appointment.therapistId,
                recordedAt: nowIso(),
              },
            ],
          }))
        },

        recordFollowUp: ({ appointmentId, response, selections, note }) => {
          const appointment = findAppointment(appointmentId)
          if (!appointment) return
          if (get().followUps.some((item) => item.appointmentId === appointmentId)) return
          const text = note?.trim()
          const observationId = selections.length
            ? get().logObservation({
                clientId: appointment.clientId,
                source: 'follow_up',
                selections,
                appointmentId,
                ...(text ? { note: text } : {}),
              })
            : undefined
          set((state) => ({
            followUps: [
              ...state.followUps,
              {
                id: createId('follow'),
                clientId: appointment.clientId,
                appointmentId,
                respondedAt: nowIso(),
                response,
                ...(observationId ? { observationId } : {}),
                // Kept with the reply, so a note sent without a score is not lost.
                ...(text ? { note: text } : {}),
              },
            ],
          }))
        },

        addNote: (input) => {
          const id = createId('note')
          const body = input.body.trim()
          if (!body) throw new RangeError('A note needs some words.')
          const at = nowIso()
          set((state) => ({
            notes: [
              ...state.notes,
              {
                id,
                clientId: input.clientId,
                therapistId: input.therapistId,
                createdAt: at,
                updatedAt: at,
                visibility: input.visibility,
                body,
                ...(input.appointmentId ? { appointmentId: input.appointmentId } : {}),
              },
            ],
          }))
          return id
        },

        updateNote: (id, patch) =>
          set((state) => ({
            notes: state.notes.map((note) =>
              note.id === id
                ? {
                    ...note,
                    ...(patch.body !== undefined && patch.body.trim() ? { body: patch.body.trim() } : {}),
                    ...(patch.visibility ? { visibility: patch.visibility } : {}),
                    updatedAt: nowIso(),
                  }
                : note,
            ),
          })),

        deleteNote: (id) => set((state) => ({ notes: state.notes.filter((note) => note.id !== id) })),

        saveReport: (draft, id) => {
          const at = nowIso()
          const reportId = id ?? createId('report')
          set((state) => {
            const existing = state.reports.find((report) => report.id === reportId)
            const next: DoctorReport = {
              ...draft,
              id: reportId,
              createdAt: existing?.createdAt ?? at,
              updatedAt: at,
              // Any edit after consent needs the client's agreement again.
              status: 'draft',
            }
            return {
              reports: existing
                ? state.reports.map((report) => (report.id === reportId ? next : report))
                : [...state.reports, next],
            }
          })
          return reportId
        },

        requestReportConsent: (id) =>
          set((state) => ({
            reports: state.reports.map((report) =>
              report.id === id && report.status === 'draft' ? { ...report, status: 'awaiting_consent' } : report,
            ),
          })),

        consentToReport: (id, clientId) =>
          set((state) => ({
            reports: state.reports.map((report) =>
              report.id === id && report.clientId === clientId && report.status === 'awaiting_consent'
                ? {
                    ...report,
                    status: 'consented',
                    consent: {
                      consentedAt: nowIso(),
                      recipient: report.recipient,
                      purpose: report.purpose,
                      includesPhotos: report.includePhotos,
                    },
                  }
                : report,
            ),
          })),

        withdrawReport: (id) =>
          set((state) => ({
            reports: state.reports.map((report) => {
              if (report.id !== id) return report
              const { consent: _withdrawn, ...rest } = report
              return { ...rest, status: 'withdrawn' }
            }),
          })),

        updateConsent: (clientId, key, value) =>
          set((state) => ({
            clients: state.clients.map((client) =>
              client.id === clientId ? { ...client, consents: { ...client.consents, [key]: value } } : client,
            ),
          })),

        addPhoto: ({ clientId, view, dataUrl }) => {
          const id = createId('photo')
          set((state) => ({ photos: [...state.photos, { id, clientId, view, dataUrl, capturedAt: nowIso() }] }))
          return id
        },

        removePhoto: (id) => set((state) => ({ photos: state.photos.filter((photo) => photo.id !== id) })),
      }
    },
    {
      name: DEMO_STORAGE_KEY,
      version: STATE_VERSION,
      storage: createJSONStorage(() => indexedDbStorage),
      partialize: (state): Persisted => ({
        version: STATE_VERSION,
        savedAt: nextSavedAt(),
        anchoredAt: state.anchoredAt,
        therapists: state.therapists,
        clients: state.clients,
        appointments: state.appointments,
        observations: state.observations,
        confirmations: state.confirmations,
        stiffness: state.stiffness,
        rom: state.rom,
        goals: state.goals,
        goalScores: state.goalScores,
        followUps: state.followUps,
        bonusCredits: state.bonusCredits,
        notes: state.notes,
        reports: state.reports,
        photos: state.photos,
      }),
      merge: loadRecord,
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    },
  )),
)

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === mirrorKey(DEMO_STORAGE_KEY)) adoptNewerRecord()
  })
}
