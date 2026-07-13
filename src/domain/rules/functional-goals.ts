export const GOAL_STATUSES = ['active', 'achieved', 'paused', 'revised', 'archived'] as const

export type GoalStatus = (typeof GOAL_STATUSES)[number]

export interface FunctionalGoalCandidate {
  readonly id: string
  readonly status: GoalStatus
  readonly importance: number
  readonly createdAt: string
  readonly lastRecordedAt: string | null
}

const DAY_IN_MS = 86_400_000

function parseTime(value: string | Date): number | null {
  const parsed = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function validateFunctionalGoalScore(score: number): number {
  if (!Number.isFinite(score) || score < 0 || score > 10) {
    throw new RangeError('Functional goal score must be from 0 through 10.')
  }
  return score
}

export function isFunctionalGoalUpdateDue(
  goal: FunctionalGoalCandidate,
  now: string | Date,
  intervalDays = 7,
): boolean {
  if (!Number.isFinite(intervalDays) || intervalDays < 0) {
    throw new RangeError('Goal update interval must be non-negative.')
  }
  if (goal.status !== 'active') return false
  const nowTime = parseTime(now)
  if (nowTime == null) return false
  const reference = parseTime(goal.lastRecordedAt ?? goal.createdAt)
  if (reference == null || reference > nowTime) return false
  return nowTime - reference >= intervalDays * DAY_IN_MS
}

export function selectFunctionalGoalForCheckIn(
  goals: readonly FunctionalGoalCandidate[],
  now: string | Date,
  intervalDays = 7,
): FunctionalGoalCandidate | null {
  const nowTime = parseTime(now)
  if (nowTime == null) return null
  return (
    goals
      .filter((goal) => isFunctionalGoalUpdateDue(goal, now, intervalDays))
      .sort((left, right) => {
        const leftTime = parseTime(left.lastRecordedAt ?? left.createdAt) ?? nowTime
        const rightTime = parseTime(right.lastRecordedAt ?? right.createdAt) ?? nowTime
        return (
          leftTime - rightTime ||
          right.importance - left.importance ||
          left.id.localeCompare(right.id)
        )
      })[0] ?? null
  )
}

export function computeFunctionalGoalDelta(
  previousScore: number | null | undefined,
  currentScore: number | null | undefined,
): number | null {
  if (previousScore == null || currentScore == null) return null
  return validateFunctionalGoalScore(currentScore) - validateFunctionalGoalScore(previousScore)
}
