import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDemoState, DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS } from '@/data/demo/fixtures'
import { mergePersistedDemoState, useDemoStore } from '@/data/demo/store'
import { CalendarPage } from '@/features/calendar/CalendarPage'
import { TodayPage } from '@/features/therapist-home/TodayPage'
import { BookVisitPage } from '@/features/visits/BookVisitPage'
import { VisitsPage } from '@/features/visits/VisitsPage'
import { availableStarts, clockTime, startProblem, zonedParts, zonedTimeToUtc } from '@/features/visits/slots'
import { renderAs, seedDemo, TEST_NOW } from '@/features/visits/testing'
import { PRACTICE_TIME_ZONE, relativeDay } from '@/lib/formatting/time'
import { announceSave } from '@/test/otherTab'

const MIN = 60_000
const DAY = 86_400_000
const pratana = { therapistId: DEMO_THERAPIST_IDS.amara }
const NOA_TODAY = 'appointment-noa-today'
const at = (offsetMs: number) => new Date(TEST_NOW.getTime() + offsetMs).toISOString()
const summary = () => document.querySelector('.today__summary')?.textContent ?? ''

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TEST_NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe('calendar audit', () => {
  it('[any TZ] seeded demo visits follow the practice rules (working day, 09:00-18:00, no overlap) for every launch hour of a week', () => {
    const problems: string[] = []
    const badLaunches = new Set<number>()
    const monday = new Date(2026, 10, 23, 0, 0)
    for (let hour = 0; hour < 7 * 24; hour += 1) {
      const launch = new Date(monday.getTime() + hour * 3_600_000)
      const state = createDemoState(launch)
      for (const appointment of state.appointments) {
        const therapist = state.therapists.find((item) => item.id === appointment.therapistId)!
        const local = zonedParts(appointment.startsAt, PRACTICE_TIME_ZONE)
        const problem = startProblem({
          dayKey: local.dayKey,
          minutes: local.minutes,
          durationMinutes: appointment.durationMinutes,
          busy: state.appointments.filter(
            (other) =>
              other.id !== appointment.id &&
              (other.therapistId === appointment.therapistId || other.clientId === appointment.clientId),
          ),
          now: Date.parse(appointment.startsAt) - 1,
          timeZone: PRACTICE_TIME_ZONE,
          workingDays: therapist.workingDays,
        })
        if (problem) {
          badLaunches.add(hour)
          problems.push(`launch ${launch.toString().slice(0, 21)} -> ${appointment.id} ${local.dayKey} ${clockTime(local.minutes)} ${problem}`)
        }
      }
    }
    const upcoming = problems.filter((line) => !/-v\d/.test(line))
    expect({
      launchHoursWithProblems: `${badLaunches.size} of 168`,
      launchHoursWithUpcomingProblems: `${new Set(upcoming.map((line) => line.slice(0, 28))).size} of 168`,
      upcomingExamples: [upcoming[0], upcoming.find((line) => line.includes('closed')), upcoming.at(-1)],
    }).toEqual({
      launchHoursWithProblems: '0 of 168',
      launchHoursWithUpcomingProblems: '0 of 168',
      upcomingExamples: [undefined, undefined, undefined],
    })
  })

  it('[any TZ] a demo record saved 8 days ago still gives the therapist a current day instead of "No upcoming visits"', () => {
    const saved = { version: 2, savedAt: TEST_NOW.getTime(), ...createDemoState(TEST_NOW) }
    vi.setSystemTime(TEST_NOW.getTime() + 8 * DAY)
    useDemoStore.setState({ ...mergePersistedDemoState(saved, useDemoStore.getState()), hydrated: true })
    renderAs(pratana, '/therapist/today', createElement(TodayPage))
    expect(screen.queryByText('No upcoming visits')).toBeNull()
  })

  it("[any TZ] a confirmed visit whose time passed without a session still appears on the client's Visits page", () => {
    useDemoStore.setState({ ...createDemoState(TEST_NOW), hydrated: true })
    vi.setSystemTime(TEST_NOW.getTime() + DAY)
    const calendar = renderAs(pratana, '/therapist/calendar', createElement(CalendarPage))
    // The therapist's calendar still shows yesterday's visit as booked.
    expect(screen.getByRole('button', { name: /09:00.*Noa Lindqvist.*Confirmed/ })).toBeInTheDocument()
    calendar.unmount()
    renderAs({ clientId: DEMO_CLIENT_IDS.noa }, '/client/visits', createElement(VisitsPage))
    expect(screen.queryByText(/Mon 23 Nov/)).not.toBeNull()
  })

  it('[any TZ] Today\'s "visits today" still counts a visit finished earlier today, matching the Calendar', () => {
    seedDemo()
    const store = useDemoStore.getState()
    store.startSession(NOA_TODAY, at(60 * MIN))
    store.finishSession(NOA_TODAY, at(150 * MIN))
    store.confirmBonus(NOA_TODAY, 0)
    vi.setSystemTime(TEST_NOW.getTime() + 165 * MIN)
    const calendar = renderAs(pratana, '/therapist/calendar', createElement(CalendarPage))
    expect(screen.getByRole('button', { name: /09:00.*Noa Lindqvist.*Finished/ })).toBeInTheDocument()
    calendar.unmount()
    renderAs(pratana, '/therapist/today', createElement(TodayPage))
    expect(summary()).toMatch(/^1 visit today/)
  })

  it('[any TZ] Today\'s "next in N min" keeps counting down while the page stays open', () => {
    vi.useRealTimers()
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] })
    vi.setSystemTime(TEST_NOW)
    seedDemo()
    vi.setSystemTime(TEST_NOW.getTime() + 19 * MIN)
    renderAs(pratana, '/therapist/today', createElement(TodayPage))
    expect(summary()).toMatch(/next in 41 min/)
    act(() => {
      vi.advanceTimersByTime(30 * MIN)
    })
    expect(summary()).toMatch(/next in 11 min/)
  })

  it('[any TZ] a finished session still waiting for wrap-up is not shown as "Up next · Now" the next day', () => {
    seedDemo()
    const store = useDemoStore.getState()
    store.startSession(NOA_TODAY, at(60 * MIN))
    store.finishSession(NOA_TODAY, at(150 * MIN))
    vi.setSystemTime(TEST_NOW.getTime() + DAY)
    renderAs(pratana, '/therapist/today', createElement(TodayPage))
    expect(screen.getByText(/Confirm extra care for Noa/)).toBeInTheDocument()
    expect({ header: summary(), upNext: screen.queryByText(/Up next · Now/)?.textContent ?? null }).toEqual({
      header: '0 visits today',
      upNext: null,
    })
  })

  it('[any TZ] booking a time that passed while the client was on the confirm step says it passed, not that it was taken', async () => {
    seedDemo()
    const user = userEvent.setup()
    renderAs({ clientId: DEMO_CLIENT_IDS.mira }, '/client/visits/book', createElement(BookVisitPage))
    await user.click(screen.getByRole('button', { name: /Pratana Halstrick/ }))
    await user.click(screen.getByRole('button', { name: /Therapeutic massage/ }))
    await user.click(screen.getByRole('button', { name: '10:30' }))
    vi.setSystemTime(TEST_NOW.getTime() + 151 * MIN)
    await user.click(screen.getByRole('button', { name: 'Book this visit' }))
    expect(screen.getByRole('alert').textContent).not.toMatch(/taken/)
  })

  it('[any device TZ from UTC-11 to UTC+11; practice zone stubbed to Pacific/Auckland] Today\'s date line shows the practice day', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_PRACTICE_TIMEZONE', 'Pacific/Auckland')
    // Monday afternoon in Europe, Monday morning in New York, already Tuesday 01:30 in Auckland.
    vi.setSystemTime(Date.parse('2026-11-23T12:30:00.000Z'))
    const time = await import('@/lib/formatting/time')
    const testing = await import('@/features/visits/testing')
    const zoned = await import('@/features/therapist-home/TodayPage')
    expect(time.PRACTICE_TIME_ZONE).toBe('Pacific/Auckland')
    testing.seedDemo()
    testing.renderAs(pratana, '/therapist/today', createElement(zoned.TodayPage))
    expect(document.querySelector('.today__date')?.textContent).toBe('Tuesday 24 November')
  })

  it('[any TZ; VITE_PRACTICE_TIMEZONE stubbed to a misspelt zone] an invalid practice zone falls back instead of breaking every time on screen', async () => {
    vi.resetModules()
    vi.stubEnv('VITE_PRACTICE_TIMEZONE', 'Europe/Zuerich')
    const time = await import('@/lib/formatting/time')
    expect(() => time.fmtTime(Date.now())).not.toThrow()
  })

  it('[any TZ] two open tabs (therapist and client): the second tab neither sees nor keeps the first tab\'s booking', async () => {
    localStorage.clear()
    seedDemo()
    vi.resetModules()
    const clientTab = (await import('@/data/demo/store')).useDemoStore
    await vi.waitFor(() => expect(clientTab.getState().hydrated).toBe(true))
    // The client tab's first load saved; the browser tells the therapist's tab.
    announceSave()
    await vi.waitFor(() => expect(useDemoStore.persist.hasHydrated()).toBe(true))

    const slot = new Date(zonedTimeToUtc('2026-11-24', 14 * 60, PRACTICE_TIME_ZONE)).toISOString()
    const therapistBookingId = useDemoStore.getState().addAppointment({
      clientId: DEMO_CLIENT_IDS.mira,
      therapistId: pratana.therapistId,
      startsAt: slot,
      durationMinutes: 60,
      sessionType: 'Therapeutic massage',
      status: 'confirmed',
      intakeStatus: 'complete',
      room: 'Garden room',
    })
    announceSave()
    await vi.waitFor(() => expect(clientTab.getState().appointments.some((item) => item.id === therapistBookingId)).toBe(true))

    const clientView = clientTab.getState().appointments.filter(
      (item) => item.therapistId === pratana.therapistId || item.clientId === DEMO_CLIENT_IDS.noa,
    )
    const offeredInClientTab = availableStarts({
      dayKey: '2026-11-24',
      durationMinutes: 60,
      busy: clientView,
      now: Date.now(),
      timeZone: PRACTICE_TIME_ZONE,
      workingDays: [1, 2, 3, 4, 5, 6],
    }).includes(slot)
    clientTab.getState().logObservation({ clientId: DEMO_CLIENT_IDS.noa, source: 'home', selections: [{ region: 'neck', side: 'left', pain: 3 }] })

    vi.resetModules()
    const reloaded = (await import('@/data/demo/store')).useDemoStore
    await vi.waitFor(() => expect(reloaded.getState().hydrated).toBe(true))
    expect({
      offeredInClientTab,
      therapistBookingAfterReload: reloaded.getState().appointments.some((item) => item.id === therapistBookingId),
    }).toEqual({ offeredInClientTab: false, therapistBookingAfterReload: true })
  })
})

describe('calendar audit: verified correct (these pass)', () => {
  it('[any TZ] local opening-hour times survive both daylight-saving changes in Zurich and New York', () => {
    for (const [zone, days] of [
      ['Europe/Zurich', ['2026-03-29', '2026-10-25']],
      ['America/New_York', ['2026-03-08', '2026-11-01']],
    ] as const) {
      for (const day of days) {
        for (const minutes of [9 * 60, 12 * 60 + 15, 17 * 60]) {
          expect(zonedParts(zonedTimeToUtc(day, minutes, zone), zone)).toMatchObject({ dayKey: day, minutes })
        }
        const starts = availableStarts({ dayKey: day, durationMinutes: 60, busy: [], now: 0, timeZone: zone, workingDays: [0] })
        expect(starts.map((start) => clockTime(zonedParts(start, zone).minutes))).toEqual(
          Array.from({ length: 17 }, (_, index) => clockTime(9 * 60 + index * 30)),
        )
      }
    }
  })

  it('[any TZ] "Today" and "Tomorrow" turn over at midnight in the practice zone', () => {
    const lateMonday = zonedTimeToUtc('2026-11-23', 23 * 60 + 30, PRACTICE_TIME_ZONE)
    expect(relativeDay(zonedTimeToUtc('2026-11-24', 30, PRACTICE_TIME_ZONE), lateMonday)).toBe('Tomorrow')
    expect(relativeDay(zonedTimeToUtc('2026-11-23', 10, PRACTICE_TIME_ZONE), lateMonday)).toBe('Today')
    expect(relativeDay(zonedTimeToUtc('2026-11-22', 23 * 60 + 50, PRACTICE_TIME_ZONE), lateMonday)).toBe('Yesterday')
  })
})
