function assertScore(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 10) {
    throw new RangeError(`${label} must be a finite number from 0 through 10.`)
  }
}

export function normalizePain(pain: number): number {
  assertScore(pain, 'Pain')
  return 100 - pain * 10
}

export function normalizeStiffness(stiffness: number): number {
  assertScore(stiffness, 'Stiffness')
  return 100 - stiffness * 10
}

export function normalizeRom(rom: number): number {
  assertScore(rom, 'ROM')
  return rom * 10
}

export function normalizeFunctionalAbility(score: number): number {
  assertScore(score, 'Functional ability')
  return score * 10
}

export function isValidScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10
}
