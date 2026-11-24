import { cleanup, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import { bonusCreditId, bonusSummary, confirmBonusCredit, finishSummary, sessionClock } from '@/domain/care'
import { suggestBonusCareMinutes } from '@/domain/rules/bonus-care'
import { ClientProfilePage } from '@/features/clients/ClientProfilePage'
import { ClientHomePage } from '@/features/client-home/ClientHomePage'
import { bonusSentence, latestBonusCredit } from '@/features/client-home/bonusSentence'
import { FinishSessionPage } from '@/features/session/FinishSessionPage'
import { SessionModePage } from '@/features/session/SessionModePage'
import { VisitsPage } from '@/features/visits/VisitsPage'
import { fmtTime, minutesLabel } from '@/lib/formatting/time'
import { demoAuth, renderPage, resetDemoStore } from '@/test/renderWithDemo'

/** Tuesday 24 Nov 2026, 12:00 on the test machine's clock (the practice time zone in tests). */
const NOW = new Date(2026, 10, 24, 12, 0, 0)
const pratana = DEMO_THERAPIST_IDS.amara
const wassana = DEMO_THERAPIST_IDS.sora
const mira = DEMO_CLIENT_IDS.mira
const noa = DEMO_CLIENT_IDS.noa

const store = () => useDemoStore.getState()
const at = (minutesFromNow: number) => new Date(NOW.getTime() + minutesFromNow * 60_000)
const daysAgoAt = (days: number, hour: number, minute = 0, second = 0) =>
  new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - days, hour, minute, second)
const plus = (date: Date, minutes: number) => new Date(date.getTime() + minutes * 60_000)

function book(clientId: string, therapistId: string, startsAt: Date, durationMinutes = 90) {
  return store().addAppointment({
    clientId,
    therapistId,
    startsAt: startsAt.toISOString(),
    durationMinutes,
    sessionType: 'Deep restorative massage',
    status: 'confirmed',
    intakeStatus: 'complete',
    room: 'Garden room',
  })
}

function runSession(id: string, start: Date, finish?: Date) {
  store().startSession(id, start.toISOString())
  if (finish) store().finishSession(id, finish.toISOString())
}

const appointment = (id: string) => store().appointments.find((item) => item.id === id)
const creditFor = (id: string) => store().bonusCredits.find((credit) => credit.id === bonusCreditId(id))

const renderFinish = (id: string, therapistId: string = pratana) =>
  renderPage(createElement(FinishSessionPage), {
    path: '/therapist/session/:appointmentId/finish',
    url: `/therapist/session/${id}/finish`,
    auth: demoAuth('therapist', therapistId),
  })

const renderSession = (id: string, therapistId: string = pratana) =>
  renderPage(createElement(SessionModePage), {
    path: '/therapist/session/:appointmentId',
    url: `/therapist/session/${id}`,
    auth: demoAuth('therapist', therapistId),
  })

const renderHome = (clientId: string) =>
  renderPage(createElement(ClientHomePage), { path: '/client/home', url: '/client/home', auth: demoAuth('client', clientId) })

const renderVisits = (clientId: string) =>
  renderPage(createElement(VisitsPage), { path: '/client/visits', url: '/client/visits', auth: demoAuth('client', clientId) })

const nextVisitHero = () => screen.getByText('Your next visit').closest('section')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  resetDemoStore(NOW)
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('FINDINGS: session timing, Bonus Care and follow-ups', () => {
  it('F1 the finish page renders for a session left running past 240 extra minutes', () => {
    const start = at(-360)
    const id = book(mira, pratana, start, 90)
    runSession(id, start, NOW)
    expect(appointment(id)?.session?.summary?.extraMinutes).toBe(270)

    let thrown: unknown
    try {
      renderFinish(id)
    } catch (error) {
      thrown = error
    }
    expect(thrown).toBeUndefined()
    expect(screen.getByRole('heading', { name: 'Session time' })).toBeInTheDocument()
  })

  it('F2 Bonus Care never exceeds the time the session actually ran past its booking', async () => {
    const user = userEvent.setup()
    const start = at(-90)
    const id = book(mira, pratana, start, 90)
    runSession(id, start, NOW)
    renderFinish(id)
    expect(screen.getByRole('region', { name: 'Session time' })).toHaveTextContent('Extra0minutes')

    for (let tap = 0; tap < 30; tap += 1) await user.click(screen.getByRole('button', { name: 'One minute more' }))
    await user.click(screen.getByRole('button', { name: /^Confirm \d/ }))

    const credit = creditFor(id)
    expect(credit?.actualMinutes).toBe(90)
    expect(credit?.minutes).toBeLessThanOrEqual(Math.max(0, (credit?.actualMinutes ?? 0) - (credit?.bookedMinutes ?? 0)))
  })

  it('F3a the client sees the sentence the finish page says they will see', async () => {
    const user = userEvent.setup()
    const start = at(-90)
    const id = book(mira, pratana, start, 90)
    runSession(id, start, NOW)
    const finish = renderFinish(id)
    const promised = screen.getByText('Mira will see').nextElementSibling?.textContent ?? ''
    await user.click(screen.getByRole('button', { name: /^Confirm \d/ }))
    finish.unmount()

    renderHome(mira)
    expect(document.body.textContent).toContain(promised)
  })

  it('F3b the finish preview names the visit day instead of always saying "today"', () => {
    const start = daysAgoAt(1, 10)
    const id = book(noa, pratana, start, 90)
    runSession(id, start, plus(start, 90))
    renderFinish(id)
    expect(screen.getByText('Noa will see').nextElementSibling).not.toHaveTextContent(/today/)
  })

  it('F4 Home and Visits agree on whether a follow-up is still open', () => {
    const start = daysAgoAt(3, 10)
    const id = book(noa, pratana, start, 90)
    runSession(id, start, plus(start, 90))
    store().confirmBonus(id, 0)

    const visits = renderVisits(noa)
    const onVisits = screen
      .queryAllByRole('link', { name: /How are you feeling since/ })
      .some((link) => link.getAttribute('href')?.endsWith(id))
    visits.unmount()
    renderHome(noa)
    const onHome = screen.queryByRole('link', { name: /How do you feel after your visit/ }) !== null

    expect({ onHome, onVisits }).toEqual({ onHome: onVisits, onVisits: onHome })
  })

  it('F5a a session started yesterday and never finished is not "Your next visit"', () => {
    const start = daysAgoAt(1, 10)
    const id = book(mira, pratana, start, 60)
    runSession(id, start)
    renderHome(mira)
    const hero = nextVisitHero()
    expect(hero).toHaveTextContent('Tomorrow')
    expect(hero).toHaveTextContent('with Wassana')
  })

  it('F5b a visit the therapist has finished is not still "Your next visit"', () => {
    const start = at(-100)
    const id = book(noa, pratana, start, 90)
    runSession(id, start, at(-5))
    const realNext = appointment('appointment-noa-today')
    renderHome(noa)
    const hero = nextVisitHero()
    expect(hero).not.toHaveTextContent(fmtTime(start))
    expect(hero).toHaveTextContent(fmtTime(realNext?.startsAt ?? ''))
  })

  it('F6 the per-therapist extra care breakdown leaves out therapists who gave none', () => {
    const start = daysAgoAt(2, 10)
    const id = book(noa, wassana, start, 60)
    runSession(id, start, plus(start, 60))
    store().confirmBonus(id, 0)
    renderPage(createElement(ClientProfilePage), {
      path: '/therapist/clients/:clientId',
      url: `/therapist/clients/${noa}`,
      auth: demoAuth('therapist', pratana),
    })
    expect(screen.getByText(/Extra care across visits/)).not.toHaveTextContent('Wassana')
    expect(bonusSummary(store().bonusCredits, noa).byTherapist.map((item) => item.minutes)).not.toContain(0)
  })

  it('F7 a therapist who may run Session Mode can also finish it', () => {
    const start = at(-90)
    const id = book(mira, pratana, start, 90)
    const session = renderSession(id, wassana)
    expect(screen.getByRole('button', { name: /Start session/ })).toBeInTheDocument()
    session.unmount()
    runSession(id, start, NOW)
    renderFinish(id, wassana)
    expect(screen.queryByText('This session isn’t available to you.')).toBeNull()
  })

  it('F8 a stale second tab tapping Finish does not erase a confirmed credit', async () => {
    localStorage.clear()
    vi.resetModules()
    const { useDemoStore: tabA } = await import('@/data/demo/store')
    await tabA.persist.rehydrate()
    const start = at(-105)
    const id = tabA.getState().addAppointment({
      clientId: mira,
      therapistId: pratana,
      startsAt: start.toISOString(),
      durationMinutes: 90,
      sessionType: 'Deep restorative massage',
      status: 'confirmed',
      intakeStatus: 'complete',
      room: 'Garden room',
    })
    tabA.getState().startSession(id, start.toISOString())

    vi.resetModules()
    const { useDemoStore: tabB } = await import('@/data/demo/store')
    await tabB.persist.rehydrate()
    expect(tabB.getState().appointments.find((item) => item.id === id)?.session?.startedAt).toBe(start.toISOString())

    tabA.getState().finishSession(id, plus(start, 102).toISOString())
    tabA.getState().confirmBonus(id, 12)
    tabB.getState().finishSession(id, plus(start, 105).toISOString())

    vi.resetModules()
    const { useDemoStore: reloaded } = await import('@/data/demo/store')
    await reloaded.persist.rehydrate()
    const credit = reloaded.getState().bonusCredits.find((item) => item.id === bonusCreditId(id))
    expect(credit?.minutes).toBe(12)
  })

  it('F9 the pre-filled Bonus Care follows the documented 3-minute threshold rule', () => {
    const start = new Date(NOW.getTime() - 90.5 * 60_000)
    const id = book(mira, pratana, start, 90)
    runSession(id, start, NOW)
    const summary = appointment(id)?.session?.summary
    expect(summary).toMatchObject({ actualMinutes: 91, extraMinutes: 1 })
    renderFinish(id)
    const suggested = suggestBonusCareMinutes(91, 90).suggestedConfirmationMinutes
    expect(screen.getByRole('button', { name: /^Confirm \d/ })).toHaveTextContent(`Confirm ${minutesLabel(suggested)}`)
  })

  it('F10 the finish header time range agrees with the Actual minutes', () => {
    const start = daysAgoAt(0, 10, 0, 50)
    const finish = daysAgoAt(0, 11, 42, 10)
    const id = book(mira, pratana, start, 90)
    runSession(id, start, finish)
    const view = renderFinish(id)
    const header = view.container.querySelector('.finish header .eyebrow')?.textContent ?? ''
    const match = /(\d\d):(\d\d)–(\d\d):(\d\d)/.exec(header)
    const [h1, m1, h2, m2] = (match?.slice(1) ?? []).map(Number)
    const headerMinutes = ((h2 ?? 0) * 60 + (m2 ?? 0)) - ((h1 ?? 0) * 60 + (m1 ?? 0))
    const actual = appointment(id)?.session?.summary?.actualMinutes
    expect({ header, headerMinutes }).toEqual({ header, headerMinutes: actual })
  })
})

describe('CHECKED: behaviour that holds', () => {
  it('clock counts down, crosses into extra care at 90:01 and is the same after a reload', () => {
    const start = '2026-11-24T09:00:00.000Z'
    expect(sessionClock(start, 90, Date.parse(start) + (89 * 60 + 59) * 1000).display).toBe('00:01')
    expect(sessionClock(start, 90, Date.parse(start) + 90 * 60_000).display).toBe('00:00')
    expect(sessionClock(start, 90, Date.parse(start) + (90 * 60 + 1) * 1000).display).toBe('+00:01')
    expect(sessionClock(start, 120, Date.parse(start)).display).toBe('120:00')
  })

  it('a session crossing midnight keeps counting from its timestamps', () => {
    const start = daysAgoAt(1, 23, 30)
    const clock = sessionClock(start.toISOString(), 90, plus(start, 95).getTime())
    expect(clock.display).toBe('+05:00')
    expect(finishSummary(start.toISOString(), plus(start, 102).toISOString(), 90)).toEqual({
      bookedMinutes: 90,
      actualMinutes: 102,
      extraMinutes: 12,
    })
  })

  it('finishing early gives zero extra minutes and no client sentence', () => {
    expect(finishSummary('2026-11-24T09:00:00.000Z', '2026-11-24T09:45:00.000Z', 90)).toEqual({
      bookedMinutes: 90,
      actualMinutes: 45,
      extraMinutes: 0,
    })
  })

  it('double Finish, double Confirm and resume-then-refinish credit the visit exactly once', () => {
    const start = at(-110)
    const id = book(mira, pratana, start, 90)
    runSession(id, start, plus(start, 100))
    store().finishSession(id, plus(start, 104).toISOString())
    expect(appointment(id)?.session?.summary?.actualMinutes).toBe(100)
    store().resumeSession(id)
    store().finishSession(id, plus(start, 102).toISOString())
    expect(appointment(id)?.session?.summary).toEqual({ bookedMinutes: 90, actualMinutes: 102, extraMinutes: 12 })
    store().confirmBonus(id, 12)
    store().confirmBonus(id, 15)
    store().resumeSession(id)
    expect(store().bonusCredits.filter((credit) => credit.appointmentId === id)).toHaveLength(1)
    expect(creditFor(id)?.minutes).toBe(12)
    expect(appointment(id)?.session?.finishedAt).toBe(plus(start, 102).toISOString())
  })

  it('two running sessions keep separate clocks', () => {
    const a = book(mira, pratana, at(-30), 60)
    const b = book(noa, pratana, at(-10), 90)
    runSession(a, at(-30))
    runSession(b, at(-10))
    expect(sessionClock(appointment(a)?.session?.startedAt ?? '', 60, NOW.getTime()).display).toBe('30:00')
    expect(sessionClock(appointment(b)?.session?.startedAt ?? '', 90, NOW.getTime()).display).toBe('80:00')
  })

  it('the sentence total, card total and per-therapist sum agree and exclude other clients', () => {
    const start = at(-102)
    const id = book(mira, pratana, start, 90)
    runSession(id, start, NOW)
    store().confirmBonus(id, 12)
    const summary = bonusSummary(store().bonusCredits, mira)
    expect(summary.lifetimeMinutes).toBe(57)
    expect(summary.byTherapist.reduce((sum, item) => sum + item.minutes, 0)).toBe(57)
    const credit = latestBonusCredit(summary)
    expect(credit?.appointmentId).toBe(id)
    if (!credit) return
    expect(bonusSentence(credit, summary, { preferredName: 'Pratana', possessive: 'her' }, NOW.getTime())).toBe(
      'Pratana gave you 12 extra minutes today, bringing her total to 47 minutes across your visits.',
    )
  })

  it('the sentence says "1 extra minute", "yesterday", and "the first" correctly', () => {
    const base = { clientId: 'c', bookedMinutes: 60, actualMinutes: 61, confirmedAt: '2026-11-23T11:00:00.000Z' }
    const credits = confirmBonusCredit([], { ...base, appointmentId: 'a', therapistId: 'w', minutes: 1, visitDate: daysAgoAt(1, 10).toISOString() })
    const summary = bonusSummary(credits, 'c')
    const credit = latestBonusCredit(summary)
    if (!credit) throw new Error('missing credit')
    expect(bonusSentence(credit, summary, { preferredName: 'Wassana' }, NOW.getTime())).toBe(
      'Wassana gave you 1 extra minute yesterday — the first extra care from Wassana across your visits.',
    )
  })

  it('the follow-up prompt asks about the right visit and disappears once answered', () => {
    const start = daysAgoAt(1, 10)
    const id = book(noa, pratana, start, 90)
    runSession(id, start, plus(start, 95))
    store().confirmBonus(id, 5)
    const first = renderHome(noa)
    expect(screen.getByRole('link', { name: /How do you feel after your visit with Pratana/ })).toHaveAttribute(
      'href',
      `/client/follow-up/${id}`,
    )
    first.unmount()
    store().recordFollowUp({ appointmentId: id, response: 1, selections: [] })
    store().recordFollowUp({ appointmentId: id, response: -1, selections: [] })
    expect(store().followUps.filter((item) => item.appointmentId === id)).toHaveLength(1)
    renderHome(noa)
    expect(screen.queryByRole('link', { name: /How do you feel after your visit/ })).toBeNull()
    const card = screen.getByRole('list', { name: 'Free extra care by therapist' })
    expect(card).toHaveTextContent('+12 minutes')
  })
})
