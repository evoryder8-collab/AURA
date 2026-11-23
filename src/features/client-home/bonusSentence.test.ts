import { describe, expect, it } from 'vitest'
import { bonusSummary, confirmBonusCredit, type BonusCredit } from '@/domain/care'
import { bonusSentence, latestBonusCredit } from './bonusSentence'

const base = { clientId: 'c', bookedMinutes: 90, actualMinutes: 102, confirmedAt: '2026-11-23T10:43:00.000Z' }

describe('bonus sentence', () => {
  it('matches the owner’s wording and agrees with the ledger', () => {
    let credits: BonusCredit[] = [
      { ...base, id: 'bonus-a', appointmentId: 'a', therapistId: 'p', minutes: 35, visitDate: '2026-11-01T09:00:00.000Z' },
    ]
    credits = confirmBonusCredit(credits, { ...base, appointmentId: 'b', therapistId: 'p', minutes: 12, visitDate: '2026-11-23T09:00:00.000Z' })
    const summary = bonusSummary(credits, 'c')
    const credit = latestBonusCredit(summary)
    if (!credit) throw new Error('missing credit')
    expect(bonusSentence(credit, summary, { preferredName: 'Pratana', possessive: 'her' }, Date.parse('2026-11-23T12:00:00.000Z'))).toBe(
      'Pratana gave you 12 extra minutes today, bringing her total to 47 minutes across your visits.',
    )
    expect(bonusSentence(credit, summary, { preferredName: 'Wassana' }, Date.parse('2026-11-23T12:00:00.000Z'))).toContain(
      'bringing Wassana’s total',
    )
  })
})
