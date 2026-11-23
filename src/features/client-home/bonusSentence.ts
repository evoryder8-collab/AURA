import type { BonusCredit, BonusSummary } from '@/domain/care'
import type { DemoTherapist } from '@/data/demo/model'
import { minutesLabel, relativeDay } from '@/lib/formatting/time'

/**
 * "Pratana gave you 12 extra minutes today, bringing her total to 47 minutes across your visits."
 * Every number comes from the same Bonus Care ledger summary.
 */
export function bonusSentence(
  credit: BonusCredit,
  summary: BonusSummary,
  therapist: Pick<DemoTherapist, 'preferredName' | 'possessive'>,
  now: number = Date.now(),
): string {
  const total = summary.byTherapist.find((item) => item.therapistId === credit.therapistId)?.minutes ?? credit.minutes
  const day = relativeDay(credit.visitDate, now)
  const when = day === 'Today' || day === 'Yesterday' ? day.toLocaleLowerCase() : `on ${day}`
  const owner = therapist.possessive ? therapist.possessive : `${therapist.preferredName}’s`
  const gave = `${therapist.preferredName} gave you ${minutesLabel(credit.minutes).replace('minute', 'extra minute')} ${when}`
  if (total === credit.minutes) return `${gave} — the first extra care from ${therapist.preferredName} across your visits.`
  return `${gave}, bringing ${owner} total to ${minutesLabel(total)} across your visits.`
}

/** The most recent visit that came with extra care. */
export function latestBonusCredit(summary: BonusSummary): BonusCredit | undefined {
  return summary.credits.find((credit) => credit.minutes > 0)
}
