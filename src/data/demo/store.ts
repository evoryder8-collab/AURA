import { openDB } from 'idb'
import { create } from 'zustand'
import { createJSONStorage, persist, type StateStorage } from 'zustand/middleware'
import { createDemoState } from './fixtures'
import type {
  ConsentState,
  DemoAppointment,
  DemoClient,
  DemoHandoff,
  DemoState,
  IntakeDraft,
} from './model'

const DB_NAME = 'aura-synthetic-demo'
const STORE_NAME = 'demo-state'

const dbPromise =
  typeof indexedDB === 'undefined'
    ? null
    : openDB(DB_NAME, 1, {
        upgrade(database) {
          if (!database.objectStoreNames.contains(STORE_NAME)) {
            database.createObjectStore(STORE_NAME)
          }
        },
      })

const memory = new Map<string, string>()

const indexedDbStorage: StateStorage = {
  async getItem(name) {
    if (!dbPromise) return memory.get(name) ?? null
    return (await (await dbPromise).get(STORE_NAME, name)) ?? null
  },
  async setItem(name, value) {
    if (!dbPromise) {
      memory.set(name, value)
      return
    }
    await (await dbPromise).put(STORE_NAME, value, name)
  },
  async removeItem(name) {
    if (!dbPromise) {
      memory.delete(name)
      return
    }
    await (await dbPromise).delete(STORE_NAME, name)
  },
}

const createId = (prefix: string) =>
  `${prefix}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Date.now()}`

export type NewAppointment = Omit<DemoAppointment, 'id'>

type DemoActions = {
  hydrated: boolean
  setHydrated: (value: boolean) => void
  resetDemo: () => void
  addClient: (input: { preferredName: string; email: string; phone: string }) => string
  addAppointment: (appointment: NewAppointment) => string
  updateAppointment: (id: string, patch: Partial<DemoAppointment>) => void
  saveIntakeDraft: (clientId: string, intake: IntakeDraft) => void
  completeIntake: (
    clientId: string,
    goal?: DemoClient['goals'][number] | DemoClient['goals'],
    intake?: IntakeDraft,
  ) => void
  recordCheckIn: (input: {
    clientId: string
    appointmentId: string
    pain: number
    stiffness: number
    rom: number
    functionScore: number
    events: string[]
  }) => void
  recordFollowUp: (input: {
    clientId: string
    appointmentId: string
    response: string
    goalScore: number
    comment: string
  }) => void
  updateConsent: (clientId: string, key: keyof ConsentState, value: boolean) => void
  approveInsight: (clientId: string, approved: boolean) => void
  startSession: (appointmentId: string, startedAt?: string) => void
  finishSession: (appointmentId: string, finishedAt?: string) => void
  completeWrapUp: (
    appointmentId: string,
    values: {
      actualMinutes: number
      bonusMinutes: number
      pressure: string
      response: string
      note: string
      areas: string[]
      approaches: string[]
      aftercare: string
      voiceCapture?: { durationSeconds: number; sizeBytes: number; recordedAt: string }
    },
  ) => void
  addPhoto: (clientId: string, view: 'front' | 'side' | 'back', phase: 'before' | 'after') => void
  createHandoff: (handoff: Omit<DemoHandoff, 'id' | 'createdAt'>) => string
  updateHandoff: (handoffId: string, patch: Partial<DemoHandoff>) => void
}

export type DemoStore = DemoState & DemoActions

export const useDemoStore = create<DemoStore>()(
  persist(
    (set, get) => ({
      ...createDemoState(),
      hydrated: false,
      setHydrated: (hydrated) => set({ hydrated }),
      resetDemo: () => set({ ...createDemoState() }),
      addClient: (input) => {
        const id = createId('demo-client')
        const client: DemoClient = {
          id,
          preferredName: input.preferredName,
          displayName: `${input.preferredName} — fictional demo`,
          email: input.email || `${id}@example.invalid`,
          phone: input.phone || '+00 000 000 0000',
          dateOfBirth: '1990-01-01',
          synthetic: true,
          phase: 'Building baseline',
          pattern: 'building_baseline',
          confidence: 20,
          recoveryIndex: 0,
          intakeStatus: 'pending',
          active: true,
          reviewProgress: false,
          goals: [],
          metrics: [],
          consents: {
            healthData: false,
            photography: false,
            reminders: false,
            handoff: false,
            aiProcessing: false,
          },
          insight: {
            status: 'draft',
            therapist: 'More comparable observations are needed before a pattern can be described.',
            client: 'We are building your baseline.',
            evidence: 'No comparable observations · prototype-v1',
          },
          bonusMinutesLifetime: 0,
          photos: [],
        }
        set((state) => ({ clients: [...state.clients, client] }))
        return id
      },
      addAppointment: (appointment) => {
        const id = createId('appointment')
        set((state) => ({ appointments: [...state.appointments, { ...appointment, id }] }))
        return id
      },
      updateAppointment: (id, patch) =>
        set((state) => ({
          appointments: state.appointments.map((item) =>
            item.id === id ? { ...item, ...patch } : item,
          ),
        })),
      saveIntakeDraft: (clientId, intake) =>
        set((state) => ({
          clients: state.clients.map((client) =>
            client.id === clientId
              ? {
                  ...client,
                  preferredName: intake.preferredName,
                  displayName: `${intake.preferredName} — fictional demo`,
                  email: intake.email,
                  phone: intake.phone,
                  dateOfBirth: intake.dateOfBirth,
                  intakeStatus: 'partial',
                  intakeDraft: intake,
                }
              : client,
          ),
          appointments: state.appointments.map((appointment) =>
            appointment.clientId === clientId
              ? { ...appointment, intakeStatus: 'partial' }
              : appointment,
          ),
        })),
      completeIntake: (clientId, goal, intake) =>
        set((state) => ({
          clients: state.clients.map((client) =>
            client.id === clientId
              ? {
                  ...client,
                  ...(intake
                    ? {
                        preferredName: intake.preferredName,
                        displayName: `${intake.preferredName} — fictional demo`,
                        email: intake.email,
                        phone: intake.phone,
                        dateOfBirth: intake.dateOfBirth,
                        consents: intake.consents,
                        intakeDraft: intake,
                        intakeRecord: intake,
                        ...(intake.hasRecentProcedure && intake.clearance === 'missing'
                          ? {
                              caution: {
                                label: 'Clearance to confirm',
                                fact: `A recent ${intake.procedureType || 'procedure'} was recorded; clearance has not yet been attached.`,
                                region: intake.procedureRegion,
                                source: 'First-visit intake · procedures',
                                reviewedAt: intake.savedAt,
                              },
                            }
                          : {}),
                      }
                    : {}),
                  intakeStatus: 'complete',
                  goals: goal
                    ? [...client.goals, ...(Array.isArray(goal) ? goal : [goal])]
                    : client.goals,
                }
              : client,
          ),
          appointments: state.appointments.map((appointment) =>
            appointment.clientId === clientId
              ? { ...appointment, intakeStatus: 'complete' }
              : appointment,
          ),
        })),
      recordCheckIn: (input) =>
        set((state) => ({
          clients: state.clients.map((client) => {
            if (client.id !== input.clientId) return client
            return {
              ...client,
              metrics: [
                ...client.metrics,
                {
                  id: createId('metric'),
                  appointmentId: input.appointmentId,
                  recordedAt: new Date().toISOString(),
                  pain: input.pain,
                  stiffness: input.stiffness,
                  rom: input.rom,
                  function: input.functionScore,
                  response: input.functionScore,
                  ...(input.events.length ? { events: input.events } : {}),
                },
              ],
              goals: client.goals.map((goal, index) =>
                index === 0 ? { ...goal, current: input.functionScore } : goal,
              ),
            }
          }),
        })),
      recordFollowUp: (input) =>
        set((state) => ({
          appointments: state.appointments.map((appointment) =>
            appointment.id === input.appointmentId
              ? {
                  ...appointment,
                  session: {
                    ...appointment.session,
                    response: input.response,
                    ...(input.comment
                      ? { note: input.comment }
                      : appointment.session?.note
                        ? { note: appointment.session.note }
                        : {}),
                  },
                }
              : appointment,
          ),
          clients: state.clients.map((client) =>
            client.id === input.clientId
              ? {
                  ...client,
                  lastFollowUpAt: new Date().toISOString(),
                  goals: client.goals.map((goal, index) =>
                    index === 0 ? { ...goal, current: input.goalScore } : goal,
                  ),
                }
              : client,
          ),
        })),
      updateConsent: (clientId, key, value) =>
        set((state) => ({
          clients: state.clients.map((client) =>
            client.id === clientId
              ? { ...client, consents: { ...client.consents, [key]: value } }
              : client,
          ),
        })),
      approveInsight: (clientId, approved) =>
        set((state) => ({
          clients: state.clients.map((client) =>
            client.id === clientId
              ? {
                  ...client,
                  insight: { ...client.insight, status: approved ? 'approved' : 'rejected' },
                }
              : client,
          ),
        })),
      startSession: (appointmentId, startedAt = new Date().toISOString()) =>
        get().updateAppointment(appointmentId, {
          session: {
            ...get().appointments.find((item) => item.id === appointmentId)?.session,
            startedAt,
          },
        }),
      finishSession: (appointmentId, finishedAt = new Date().toISOString()) => {
        const appointment = get().appointments.find((item) => item.id === appointmentId)
        if (!appointment?.session?.startedAt) return
        const elapsed = Math.max(
          1,
          Math.round(
            (new Date(finishedAt).getTime() - new Date(appointment.session.startedAt).getTime()) /
              60000,
          ),
        )
        get().updateAppointment(appointmentId, {
          status: 'completed',
          session: { ...appointment.session, finishedAt, actualMinutes: elapsed },
        })
      },
      completeWrapUp: (appointmentId, values) => {
        const appointment = get().appointments.find((item) => item.id === appointmentId)
        if (!appointment) return
        get().updateAppointment(appointmentId, {
          status: 'completed',
          session: { ...appointment.session, ...values },
        })
        set((state) => ({
          clients: state.clients.map((client) =>
            client.id === appointment.clientId
              ? {
                  ...client,
                  bonusMinutesLifetime: client.bonusMinutesLifetime + values.bonusMinutes,
                }
              : client,
          ),
        }))
      },
      addPhoto: (clientId, view, phase) =>
        set((state) => ({
          clients: state.clients.map((client) =>
            client.id === clientId
              ? { ...client, photos: [...client.photos, { id: createId('photo'), view, phase }] }
              : client,
          ),
        })),
      createHandoff: (handoff) => {
        const id = createId('handoff')
        set((state) => ({
          handoffs: [...state.handoffs, { ...handoff, id, createdAt: new Date().toISOString() }],
        }))
        return id
      },
      updateHandoff: (handoffId, patch) =>
        set((state) => ({
          handoffs: state.handoffs.map((handoff) =>
            handoff.id === handoffId ? { ...handoff, ...patch } : handoff,
          ),
        })),
    }),
    {
      name: 'aura-demo-state-v1',
      storage: createJSONStorage(() => indexedDbStorage),
      partialize: ({ clients, appointments, events, handoffs }) => ({
        clients,
        appointments,
        events,
        handoffs,
      }),
      onRehydrateStorage: () => (state) => state?.setHydrated(true),
    },
  ),
)

export const getClient = (state: DemoState, clientId: string | undefined) =>
  state.clients.find((client) => client.id === clientId)

export const getAppointment = (state: DemoState, appointmentId: string | undefined) =>
  state.appointments.find((appointment) => appointment.id === appointmentId)
