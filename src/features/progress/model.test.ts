import { describe, expect, it } from 'vitest'
import type { CareObservation, RomMeasurement } from '@/domain/care'
import {
  DAY_MS,
  endsEarly,
  findGaps,
  lineSegments,
  painAnswer,
  painSeries,
  rangeWindow,
  romGroups,
  type TimeWindow,
  type Visit,
} from './model'

const NOW = Date.parse('2026-11-23T12:00:00Z')
const at = (daysAgo: number, hour = 10) => NOW - daysAgo * DAY_MS + (hour - 12) * 3_600_000
const iso = (time: number) => new Date(time).toISOString()

function observation(id: string, daysAgo: number, pain: number, source: CareObservation['source'], extra: Partial<CareObservation> = {}): CareObservation {
  const time = iso(at(daysAgo))
  return {
    id,
    clientId: 'c',
    source,
    observedAt: time,
    recordedAt: time,
    recordedBy: { role: 'client', id: 'c' },
    entries: [{ region: 'shoulder', side: 'left', pain }],
    ...extra,
  }
}

const visit = (id: string, daysAgo: number, therapistName = 'Pratana'): Visit => ({
  id,
  at: at(daysAgo),
  end: at(daysAgo) + 3_600_000,
  therapistId: `t-${therapistName}`,
  therapistName,
})

const window: TimeWindow = { from: at(30, 0), to: NOW, startsAtFirstEntry: false }

describe('findGaps', () => {
  it('marks every stretch longer than eight days, including the end of the window', () => {
    const gaps = findGaps([at(28), at(26), at(17), at(15)], window)
    expect(gaps.map((gap) => Math.round((gap.to - gap.from) / DAY_MS))).toEqual([9, 15])
    expect(gaps.at(-1)?.trailing).toBe(true)
    expect(gaps.every((gap) => gap.label === 'No entries')).toBe(true)
  })

  it('does not mark a weekly rhythm', () => {
    expect(findGaps([at(29), at(22), at(15), at(8), at(1)], window)).toEqual([])
  })
})

describe('lineSegments', () => {
  it('never bridges a gap', () => {
    const points = [at(28), at(26), at(17), at(15)].map((time) => ({ at: time }))
    const segments = lineSegments(points, findGaps(points.map((point) => point.at), window))
    expect(segments.map((segment) => segment.length)).toEqual([2, 2])
  })
})

describe('rangeWindow', () => {
  const visits = [40, 33, 26, 19, 12, 5, 1].map((daysAgo, index) => visit(`v${index}`, daysAgo))

  it('starts the visit range at the day of the sixth-last visit and always ends today', () => {
    const range = rangeWindow('visits', visits, at(40), NOW)
    expect(new Date(range.from).getDate()).toBe(new Date(at(33)).getDate())
    expect(range.to).toBe(NOW)
  })

  it('starts at the first entry when the range reaches back further than anything recorded', () => {
    const range = rangeWindow('days90', visits, at(40), NOW)
    expect(range.startsAtFirstEntry).toBe(true)
    expect(range.from).toBeLessThanOrEqual(at(40))
    expect(range.from).toBeGreaterThan(at(41))
  })
})

describe('painSeries and painAnswer', () => {
  const visits = [visit('v1', 14, 'Wassana'), visit('v2', 7)]
  const observations = [
    observation('a1', 14, 6, 'arrival', { appointmentId: 'v1' }),
    observation('h1', 10, 5, 'home', { note: 'Desk day.' }),
    observation('f2', 6, 4, 'follow_up', { appointmentId: 'v2' }),
  ]
  // v2 had no arrival score: the client confirmed the home entry instead.
  const confirmations = [{ id: 'k', clientId: 'c', appointmentId: 'v2', observationId: 'h1', area: 'shoulder:left' as const, confirmedAt: iso(at(7)) }]

  it('keeps a confirmed entry as one point that carries its confirmation', () => {
    const points = painSeries(observations, confirmations, 'shoulder:left', window, visits)
    expect(points.map((point) => point.observationId)).toEqual(['a1', 'h1', 'f2'])
    expect(points[1]?.confirmations).toHaveLength(1)
    expect(points[1]?.confirmations[0]?.visit?.id).toBe('v2')
  })

  it('answers from the same series: the score that stood at the last visit, then the latest entry', () => {
    const points = painSeries(observations, confirmations, 'shoulder:left', window, visits)
    const { answer, summary } = painAnswer({
      points,
      area: 'shoulder:left',
      visits,
      window,
      phrase: 'over the last 30 days',
      audience: 'client',
      clientName: 'Mira',
      now: NOW,
    })
    expect(answer).toMatch(/^Your left shoulder was 5\/10 at your last visit on\sMon\s16\sNov and 4\/10 on\sTue\s17\sNov in your next.day follow.up\.$/)
    expect(summary.replace(/\s/g, ' ')).toBe('3 entries over the last 30 days, between 4/10 and 6/10.')
  })

  it('says so when nothing was recorded in the range', () => {
    const { answer } = painAnswer({
      points: [],
      area: 'shoulder:left',
      visits,
      window,
      phrase: 'over the last 30 days',
      audience: 'therapist',
      clientName: 'Mira',
      now: NOW,
    })
    expect(answer).toBe('No left shoulder entries over the last 30 days.')
  })

  it('reports when the series stops before today', () => {
    expect(endsEarly(at(6), window)?.replace(/\s/g, ' ')).toBe('No entries since Tue 17 Nov')
    expect(endsEarly(NOW - 3_600_000, window)).toBeNull()
  })
})

describe('romGroups', () => {
  const measurement = (id: string, daysAgo: number, method: RomMeasurement['method'], degrees: number): RomMeasurement => ({
    id,
    clientId: 'c',
    therapistId: 't',
    recordedAt: iso(at(daysAgo)),
    movement: 'neck_rotation',
    side: 'left',
    degrees,
    method,
  })

  it('never mixes a goniometer reading with a visual estimate', () => {
    const groups = romGroups(
      [measurement('g1', 20, 'goniometer', 55), measurement('e1', 13, 'visual_estimate', 70), measurement('g2', 6, 'goniometer', 58)],
      window,
    )
    expect(groups.map((group) => group.method)).toEqual(['goniometer', 'visual_estimate'])
    for (const group of groups) expect(new Set(group.points.map((point) => point.method)).size).toBe(1)
    expect(groups[0]?.points.map((point) => point.degrees)).toEqual([55, 58])
  })
})
