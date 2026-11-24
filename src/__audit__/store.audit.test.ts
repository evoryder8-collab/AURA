import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { areaLabel } from '@/domain/care'
import { createDemoState, DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS } from '@/data/demo/fixtures'
import { newerRecord } from '@/data/demo/mirror'
import type { DemoAppointment, DemoPhoto } from '@/data/demo/model'
import { getAppointment, isUpcoming, sessionPointsFor, therapistAppointments } from '@/data/demo/selectors'
import { DEMO_STORAGE_KEY, mergePersistedDemoState, useDemoStore } from '@/data/demo/store'
import { ArrivalPage } from '@/features/arrival/ArrivalPage'
import { LogHowIFeelPage } from '@/features/check-in/LogHowIFeelPage'
import { dayKey } from '@/lib/formatting/time'
import { announceSave } from '@/test/otherTab'
import { demoAuth, renderPage, resetDemoStore } from '@/test/renderWithDemo'

const mira = DEMO_CLIENT_IDS.mira
const wassana = DEMO_THERAPIST_IDS.sora
const NOW = new Date(2026, 10, 23, 8, 0, 0)
const MIRROR_KEY = `${DEMO_STORAGE_KEY}:mirror`

type Store = typeof useDemoStore

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const mirrorWrites = (spy: { mock: { calls: unknown[][] } }) =>
  spy.mock.calls.filter(([key]) => key === MIRROR_KEY).map(([, value]) => value as string)

async function openTab(): Promise<Store> {
  vi.resetModules()
  const { useDemoStore: store } = (await import('@/data/demo/store')) as { useDemoStore: Store }
  await vi.waitFor(() => expect(store.getState().hydrated).toBe(true))
  return store
}

describe('audit: persistence', () => {
  it('keeps an entry saved in one tab after a second open tab saves something else', async () => {
    localStorage.clear()
    const clientTab = await openTab()
    const therapistTab = await openTab()

    vi.setSystemTime(NOW.getTime() + 60_000)
    const entryId = clientTab.getState().logObservation({
      clientId: mira,
      source: 'home',
      selections: [{ region: 'shoulder', side: 'left', pain: 7 }],
    })
    announceSave()
    await vi.waitFor(() => expect(therapistTab.getState().observations.some((item) => item.id === entryId)).toBe(true))
    vi.setSystemTime(NOW.getTime() + 120_000)
    therapistTab.getState().cancelAppointment('appointment-sage-later')

    const reloaded = await openTab()
    expect(reloaded.getState().appointments.find((item) => item.id === 'appointment-sage-later')?.status).toBe('cancelled')
    expect(reloaded.getState().observations.some((item) => item.id === entryId)).toBe(true)
  })

  it('restores the last write of a multi-step action when only the first reached IndexedDB', () => {
    resetDemoStore(NOW)
    const store = useDemoStore.getState()
    store.startSession('appointment-noa-today', '2026-11-23T09:00:00.000Z')
    store.finishSession('appointment-noa-today', '2026-11-23T10:42:00.000Z')

    const spy = vi.spyOn(Storage.prototype, 'setItem')
    useDemoStore.getState().confirmBonus('appointment-noa-today', 12)
    const writes = mirrorWrites(spy)
    expect(writes).toHaveLength(2)
    const [first, last] = writes as [string, string]

    // Reload: IndexedDB committed the first write, the mirror holds the last one.
    const restored = JSON.parse(newerRecord(first, last) ?? '{}') as { state: { appointments: DemoAppointment[] } }
    expect(restored.state.appointments.find((item) => item.id === 'appointment-noa-today')?.status).toBe('completed')
  })

  it('does not bring back a deleted photo when the reload beat the IndexedDB write', () => {
    resetDemoStore(NOW)
    const spy = vi.spyOn(Storage.prototype, 'setItem')
    const photoId = useDemoStore.getState().addPhoto({ clientId: mira, view: 'front', dataUrl: 'data:image/jpeg;base64,AAAA' })
    const photos: DemoPhoto[] = useDemoStore.getState().photos
    vi.setSystemTime(NOW.getTime() + 5_000)
    useDemoStore.getState().removePhoto(photoId)
    const [afterAdd, afterRemove] = mirrorWrites(spy) as [string, string]

    // IndexedDB still holds the record with the photo; the mirror holds the removal.
    const added = JSON.parse(afterAdd) as { state: Record<string, unknown> }
    const indexed = JSON.stringify({ ...added, state: { ...added.state, photos } })
    const restored = JSON.parse(newerRecord(indexed, afterRemove) ?? '{}') as { state: { photos: DemoPhoto[] } }
    expect(restored.state.photos.map((photo) => photo.id)).not.toContain(photoId)
  })

  it('re-anchors the demo schedule to today when the saved record is days old, keeping the person’s own entries', () => {
    const anchoredAt = new Date(2026, 10, 20, 8, 0, 0)
    const saved = createDemoState(anchoredAt)
    saved.observations.push({
      id: 'obs-user-entry',
      clientId: mira,
      source: 'home',
      observedAt: anchoredAt.toISOString(),
      recordedAt: anchoredAt.toISOString(),
      recordedBy: { role: 'client', id: mira },
      entries: [{ region: 'shoulder', side: 'left', pain: 7 }],
    })

    const today = new Date(2026, 10, 24, 9, 0, 0)
    vi.setSystemTime(today)
    const current = { ...useDemoStore.getState(), ...createDemoState(today) }
    const merged = mergePersistedDemoState({ ...saved, version: 2, savedAt: anchoredAt.getTime() }, current)

    expect(merged.observations.find((item) => item.id === 'obs-user-entry')?.observedAt).toBe(anchoredAt.toISOString())
    const noaToday = merged.appointments.find((item) => item.id === 'appointment-noa-today')
    expect({ noaTodayDay: dayKey(noaToday?.startsAt ?? 0), status: noaToday?.status }).toEqual({
      noaTodayDay: dayKey(today),
      status: 'confirmed',
    })
    const wassanaUpcoming = therapistAppointments(merged, wassana).filter((item) => isUpcoming(item, today.getTime()))
    expect(wassanaUpcoming.length).toBeGreaterThan(0)
  })
})

describe('audit: arrival', () => {
  beforeEach(() => resetDemoStore(NOW))

  it('keeps the score when arrival is opened again and confirmed as still accurate', async () => {
    useDemoStore.getState().completeArrival({
      appointmentId: 'appointment-mira-tomorrow',
      confirm: [],
      updates: [{ region: 'shoulder', side: 'left', pain: 6 }],
    })
    // Back from Session Mode lands on the arrival screen again.
    const user = userEvent.setup()
    renderPage(createElement(ArrivalPage), {
      path: '/therapist/arrival/:appointmentId',
      url: '/therapist/arrival/appointment-mira-tomorrow',
      auth: demoAuth('therapist', wassana),
    })
    await user.click(screen.getByRole('button', { name: 'All still accurate' }))
    await user.click(screen.getByRole('button', { name: 'I’m ready' }))

    const state = useDemoStore.getState()
    const appointment = getAppointment(state, 'appointment-mira-tomorrow')
    if (!appointment) throw new Error('fixture missing')
    const dangling = state.confirmations.filter(
      (item) => item.appointmentId === appointment.id && !state.observations.some((observation) => observation.id === item.observationId),
    )
    expect({
      points: sessionPointsFor(state, appointment).map((point) => [point.area, point.pain]),
      danglingConfirmations: dangling.length,
    }).toEqual({ points: [['shoulder:left', 6]], danglingConfirmations: 0 })
  })
})

describe('audit: log how I feel', () => {
  beforeEach(() => resetDemoStore(NOW))

  const open = () => renderPage(createElement(LogHowIFeelPage), { path: '/client/log', url: '/client/log', auth: demoAuth('client', mira) })
  const recentChip = (name: RegExp) =>
    within(screen.getByRole('region', { name: 'Recently recorded' })).getByRole('button', { name })

  it('keeps one card per side, stores exactly the shown cards and lists exactly what was stored', async () => {
    useDemoStore.getState().logObservation({
      clientId: mira,
      source: 'home',
      selections: [{ region: 'shoulder', side: 'right', pain: 3 }],
      observedAt: new Date(NOW.getTime() - 3_600_000).toISOString(),
    })
    const user = userEvent.setup()
    open()
    await user.click(recentChip(/^Right shoulder/))
    await user.click(recentChip(/^Left shoulder/))
    const card = (name: string) => screen.getByRole('heading', { name }).closest('article') as HTMLElement
    const toLeft = within(card('Right shoulder')).getByRole('button', { name: 'Left' })
    expect(toLeft).toHaveAttribute('aria-disabled', 'true')
    expect(toLeft).toHaveAccessibleDescription('Left shoulder is already added')
    expect(within(card('Right shoulder')).getByRole('button', { name: 'Both' })).toHaveAttribute('aria-disabled', 'true')
    await user.click(toLeft)
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual(['Right shoulder', 'Left shoulder'])

    await user.click(within(card('Right shoulder')).getByRole('radio', { name: '2 out of 10' }))
    await user.click(within(card('Left shoulder')).getByRole('radio', { name: '8 out of 10' }))
    await user.click(screen.getByRole('button', { name: /^Save/ }))

    const stored = (useDemoStore.getState().observations.at(-1)?.entries ?? []).map(
      (entry) => `${areaLabel(entry.region, entry.side)}${entry.pain}/10`,
    )
    expect(stored).toEqual(['Right shoulder2/10', 'Left shoulder8/10'])
    const shown = within(screen.getByRole('status'))
      .getAllByRole('listitem')
      .map((item) => item.textContent)
    expect(shown).toEqual(stored)
  })

  it('“Feels fine now” on the left shoulder leaves the right shoulder’s score alone', async () => {
    const user = userEvent.setup()
    open()
    await user.click(screen.getByRole('button', { name: 'Choose from a list' }))
    await user.click(screen.getByRole('button', { name: 'Shoulder' }))
    const card = screen.getByRole('heading', { name: 'Left shoulder' }).closest('article') as HTMLElement
    await user.click(within(card).getByRole('button', { name: 'Both' }))
    await user.click(within(card).getByRole('radio', { name: '6 out of 10' }))
    const leftChip = recentChip(/^Left shoulder/).closest('.log__chip') as HTMLElement
    await user.click(within(leftChip).getByRole('button', { name: 'Feels fine now' }))
    await user.click(screen.getByRole('button', { name: /^Save/ }))

    expect(useDemoStore.getState().observations.at(-1)?.entries).toEqual([
      { region: 'shoulder', side: 'left', pain: 0 },
      { region: 'shoulder', side: 'right', pain: 6 },
    ])
  })
})
