import { afterEach, describe, expect, it, vi } from 'vitest'

const load = async (zone: string) => {
  vi.resetModules()
  vi.stubEnv('VITE_PRACTICE_TIMEZONE', zone)
  return (await import('./env')).env
}

describe('practice time zone', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('uses a valid configured zone without a warning', async () => {
    const env = await load('Pacific/Auckland')
    expect(env.practiceTimeZone).toBe('Pacific/Auckland')
    expect(env.setupErrors.some((error) => error.includes('VITE_PRACTICE_TIMEZONE'))).toBe(false)
  })

  it('falls back to UTC and says so when the configured zone is misspelt', async () => {
    const env = await load('Europe/Zuerich')
    expect(env.practiceTimeZone).toBe('UTC')
    expect(env.setupErrors).toContain(
      'VITE_PRACTICE_TIMEZONE is not a recognised IANA time zone; times are shown in UTC until it is corrected.',
    )
  })
})
