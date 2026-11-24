import { describe, expect, it } from 'vitest'
import {
  anatomicalLeftScreenDirection,
  areaKeyLabel,
  areaSeries,
  areasToReview,
  bonusSummary,
  buildReportContent,
  choosableSides,
  confirmBonusCredit,
  figureViews,
  finishSummary,
  hiddenAreas,
  maxBonusMinutes,
  painEntriesFromSelections,
  parseAreaKey,
  reportIsExportable,
  reportNoteChoices,
  rotateTable,
  sessionClock,
  sessionPainPoints,
  updatesBetween,
  visitMeasures,
  type ArrivalConfirmation,
  type BonusCredit,
  type CareObservation,
  type DoctorReport,
  type TherapistNote,
} from './index'

const client = { role: 'client' as const, id: 'client-1' }

const homeShoulder: CareObservation = {
  id: 'obs-home',
  clientId: 'client-1',
  source: 'home',
  observedAt: '2026-11-22T18:40:00.000Z',
  recordedAt: '2026-11-22T18:42:00.000Z',
  recordedBy: client,
  entries: [{ region: 'shoulder', side: 'left', pain: 7 }],
  note: 'Turning to look behind the car still hurts.',
}

describe('regions and sides', () => {
  it('labels areas by the client’s own side', () => {
    expect(areaKeyLabel('shoulder:left')).toBe('Left shoulder')
    expect(areaKeyLabel('calf:right')).toBe('Right calf')
    expect(areaKeyLabel('lower_back:centre')).toBe('Lower back')
  })

  it('stores "both" as one entry per side and rejects impossible sides', () => {
    expect(painEntriesFromSelections([{ region: 'calf', side: 'both', pain: 3 }])).toEqual([
      { region: 'calf', side: 'left', pain: 3 },
      { region: 'calf', side: 'right', pain: 3 },
    ])
    expect(() => painEntriesFromSelections([{ region: 'abdomen', side: 'left', pain: 2 }])).toThrow()
    expect(() => painEntriesFromSelections([{ region: 'calf', side: 'left', pain: 11 }])).toThrow()
    expect(choosableSides('shoulder')).toEqual(['left', 'right', 'both'])
    expect(parseAreaKey('abdomen:left')).toBeNull()
  })

  it('accepts zero as a real score', () => {
    expect(painEntriesFromSelections([{ region: 'shoulder', side: 'left', pain: 0 }])[0]?.pain).toBe(0)
  })

  it('keeps anatomical left fixed through every table rotation and flip', () => {
    expect(anatomicalLeftScreenDirection('face_up', 0)).toBe('right')
    expect(anatomicalLeftScreenDirection('face_down', 0)).toBe('left')
    expect(anatomicalLeftScreenDirection('face_up', 90)).toBe('down')
    expect(anatomicalLeftScreenDirection('face_down', 270)).toBe('down')
    expect(rotateTable(0, -1)).toBe(270)
    expect(rotateTable(270, 1)).toBe(0)
  })
})

describe('arrival confirmation', () => {
  const appointment = { id: 'appt-8', startsAt: '2026-11-23T10:00:00.000Z' }
  const confirmation: ArrivalConfirmation = {
    id: 'confirm-1',
    clientId: 'client-1',
    appointmentId: appointment.id,
    observationId: homeShoulder.id,
    area: 'shoulder:left',
    confirmedAt: '2026-11-23T09:55:00.000Z',
  }
  const arrival: CareObservation = {
    id: 'obs-arrival',
    clientId: 'client-1',
    source: 'arrival',
    observedAt: '2026-11-23T09:55:00.000Z',
    recordedAt: '2026-11-23T09:55:00.000Z',
    recordedBy: client,
    appointmentId: appointment.id,
    entries: [{ region: 'calf', side: 'right', pain: 3 }],
  }

  it('shows the therapist what changed since the previous visit', () => {
    const updates = updatesBetween([homeShoulder], '2026-11-16T10:00:00.000Z', appointment.startsAt)
    expect(updates.map((item) => item.id)).toEqual(['obs-home'])
    expect(areasToReview([homeShoulder], appointment.startsAt)[0]?.area).toBe('shoulder:left')
  })

  it('never turns a confirmation into a second chart point', () => {
    const series = areaSeries([homeShoulder, arrival], [confirmation], 'shoulder:left')
    expect(series).toHaveLength(1)
    expect(series[0]?.pain).toBe(7)
    expect(series[0]?.observedAt).toBe(homeShoulder.observedAt)
    expect(series[0]?.confirmedAt).toEqual([{ at: confirmation.confirmedAt, appointmentId: appointment.id }])
  })

  it('maps confirmed and newly added areas for Session Mode, keeping yesterday’s date', () => {
    const points = sessionPainPoints({
      observations: [homeShoulder, arrival],
      confirmations: [confirmation],
      appointmentId: appointment.id,
      appointmentStartsAt: appointment.startsAt,
      arrivalCompleted: true,
    })
    expect(points.map((point) => [point.area, point.pain, point.status])).toEqual([
      ['shoulder:left', 7, 'confirmed'],
      ['calf:right', 3, 'new'],
    ])
    expect(points[0]?.observedAt).toBe(homeShoulder.observedAt)
  })

  it('before arrival, shows the latest report as unconfirmed with its date', () => {
    const points = sessionPainPoints({
      observations: [homeShoulder],
      confirmations: [],
      appointmentId: appointment.id,
      appointmentStartsAt: appointment.startsAt,
      arrivalCompleted: false,
    })
    expect(points).toHaveLength(1)
    expect(points[0]).toMatchObject({ status: 'unconfirmed', observedAt: homeShoulder.observedAt })
  })
})

describe('session clock', () => {
  const start = '2026-11-23T09:00:00.000Z'
  it('counts down from the booking, then switches to extra care', () => {
    expect(sessionClock(start, 90, start).display).toBe('90:00')
    expect(sessionClock(start, 90, '2026-11-23T09:00:01.000Z').display).toBe('89:59')
    expect(sessionClock(start, 90, '2026-11-23T10:30:00.000Z')).toMatchObject({ display: '00:00', phase: 'booked' })
    expect(sessionClock(start, 90, '2026-11-23T10:30:01.000Z')).toMatchObject({ display: '+00:01', phase: 'extra' })
    expect(sessionClock(start, 90, '2026-11-23T10:30:02.000Z').display).toBe('+00:02')
  })

  it('derives a 12-minute extra from a 102-minute session on a 90-minute booking', () => {
    expect(finishSummary(start, '2026-11-23T10:42:00.000Z', 90)).toEqual({
      bookedMinutes: 90,
      actualMinutes: 102,
      extraMinutes: 12,
    })
    expect(() => finishSummary(start, '2026-11-23T08:00:00.000Z', 90)).toThrow()
  })

  it('counts the clock minutes the finish screen shows, so 10:00:50–11:42:10 is 102', () => {
    expect(finishSummary('2026-11-23T10:00:50.000Z', '2026-11-23T11:42:10.000Z', 90).actualMinutes).toBe(102)
    expect(finishSummary('2026-11-23T10:00:10.000Z', '2026-11-23T10:00:50.000Z', 90).actualMinutes).toBe(0)
  })
})

describe('bonus care ledger', () => {
  const base = {
    clientId: 'client-1',
    bookedMinutes: 90,
    actualMinutes: 102,
    visitDate: '2026-11-23T09:00:00.000Z',
    confirmedAt: '2026-11-23T10:43:00.000Z',
  }
  it('counts each visit once, even when confirmation is retried', () => {
    let credits: BonusCredit[] = [
      { ...base, id: 'bonus-old', appointmentId: 'old', therapistId: 'pratana', minutes: 35, visitDate: '2026-11-01T09:00:00.000Z' },
      { ...base, id: 'bonus-w', appointmentId: 'w', therapistId: 'wassana', minutes: 10, visitDate: '2026-11-02T09:00:00.000Z' },
    ]
    credits = confirmBonusCredit(credits, { ...base, appointmentId: 'today', therapistId: 'pratana', minutes: 12 })
    credits = confirmBonusCredit(credits, { ...base, appointmentId: 'today', therapistId: 'pratana', minutes: 12 })
    const summary = bonusSummary(credits, 'client-1')
    expect(summary.lifetimeMinutes).toBe(57)
    expect(summary.byTherapist).toEqual([
      { therapistId: 'pratana', minutes: 47, visits: 2 },
      { therapistId: 'wassana', minutes: 10, visits: 1 },
    ])
    expect(() => confirmBonusCredit([], { ...base, appointmentId: 'x', therapistId: 'p', minutes: -1 })).toThrow()
  })

  it('never credits more than the time given past the booking, and never more than 240', () => {
    expect(maxBonusMinutes({ bookedMinutes: 90, actualMinutes: 102 })).toBe(12)
    expect(maxBonusMinutes({ bookedMinutes: 90, actualMinutes: 80 })).toBe(0)
    expect(maxBonusMinutes({ bookedMinutes: 90, actualMinutes: 400 })).toBe(240)
    expect(confirmBonusCredit([], { ...base, appointmentId: 'x', therapistId: 'p', minutes: 12 })).toHaveLength(1)
    expect(() => confirmBonusCredit([], { ...base, appointmentId: 'x', therapistId: 'p', minutes: 13 })).toThrow(RangeError)
    expect(() => confirmBonusCredit([], { ...base, actualMinutes: 90, appointmentId: 'x', therapistId: 'p', minutes: 1 })).toThrow(RangeError)
  })

  it('leaves therapists who gave no extra care out of the breakdown', () => {
    const credits = confirmBonusCredit([], { ...base, actualMinutes: 90, appointmentId: 'x', therapistId: 'wassana', minutes: 0 })
    expect(bonusSummary(credits, 'client-1')).toMatchObject({ lifetimeMinutes: 0, byTherapist: [] })
  })
})

describe('doctor report', () => {
  const report: DoctorReport = {
    id: 'report-1',
    clientId: 'client-1',
    preparedBy: 'wassana',
    createdAt: '2026-11-23T11:00:00.000Z',
    updatedAt: '2026-11-23T11:00:00.000Z',
    status: 'awaiting_consent',
    recipient: 'Family doctor',
    purpose: 'Discuss persistent left shoulder pain',
    dateFrom: '2026-10-01T00:00:00.000Z',
    dateTo: '2026-11-30T00:00:00.000Z',
    areas: ['shoulder:left', 'calf:right'],
    sections: ['bodyMap', 'painTrend'],
    view: 'auto',
    noteText: 'Recommend discussing the persistent left shoulder pain with your doctor.',
    recommendation: 'I recommend discussing the persistent left shoulder pain with your doctor.',
    includePhotos: false,
  }

  it('chooses views that show every selected area', () => {
    expect(figureViews(['shoulder:left'], 'auto')).toEqual(['front'])
    expect(figureViews(['calf:right'], 'auto')).toEqual(['back'])
    expect(figureViews(['chest:left', 'calf:right'], 'auto')).toEqual(['front', 'back'])
    expect(hiddenAreas(['calf:right'], ['front'])).toEqual(['calf:right'])
    expect(hiddenAreas(['shoulder:left'], ['back'])).toEqual([])
    expect(hiddenAreas(['neck:left', 'neck:centre'], ['front'])).toEqual(['neck:centre'])
  })

  it('offers only report notes, never private ones', () => {
    const notes: TherapistNote[] = [
      { id: 'n1', clientId: 'client-1', therapistId: 'w', createdAt: 'a', updatedAt: '2026-11-20', visibility: 'private', body: 'private' },
      { id: 'n2', clientId: 'client-1', therapistId: 'w', createdAt: 'a', updatedAt: '2026-11-21', visibility: 'report', body: 'for doctor' },
    ]
    expect(reportNoteChoices(notes, 'client-1').map((note) => note.id)).toEqual(['n2'])
  })

  it('collects the series in range and the client’s attributed words', () => {
    const content = buildReportContent({
      report,
      observations: [homeShoulder],
      confirmations: [],
      rom: [],
      goals: [],
      goalScores: [],
    })
    expect(content.areas[0]?.latest?.pain).toBe(7)
    expect(content.clientNotes).toEqual([
      { observedAt: homeShoulder.observedAt, text: homeShoulder.note, source: 'home' },
    ])
    // shoulder is visible from behind, the calf only from behind
    expect(content.views).toEqual(['back'])
  })

  it('exports only with consent matching recipient, purpose and photos', () => {
    expect(reportIsExportable(report)).toBe(false)
    const consented: DoctorReport = {
      ...report,
      status: 'consented',
      consent: { consentedAt: 'now', recipient: report.recipient, purpose: report.purpose, includesPhotos: false },
    }
    expect(reportIsExportable(consented)).toBe(true)
    expect(reportIsExportable({ ...consented, includePhotos: true })).toBe(false)
  })
})

describe('recovery measures', () => {
  it('builds one comparable row per visit without double counting confirmations', () => {
    const rows = visitMeasures({
      visits: [{ id: 'appt-8', startsAt: '2026-11-23T10:00:00.000Z', arrivalCompleted: true }],
      observations: [homeShoulder],
      confirmations: [
        {
          id: 'c',
          clientId: 'client-1',
          appointmentId: 'appt-8',
          observationId: 'obs-home',
          area: 'shoulder:left',
          confirmedAt: '2026-11-23T09:55:00.000Z',
        },
      ],
      stiffness: [],
      rom: [],
      goalScores: [],
    })
    expect(rows).toEqual([
      { visitId: 'appt-8', observedAt: '2026-11-23T10:00:00.000Z', pain: 7, stiffness: null, rom: null, functionalAbility: null },
    ])
  })
})
