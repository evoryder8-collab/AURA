import { describe, expect, it } from 'vitest'

import {
  evaluateConsentGuard,
  getActiveConsent,
  hasActiveConsent,
  type ConsentRecord,
} from './consent'

const NOW = '2026-07-13T12:00:00.000Z'

function consent(overrides: Partial<ConsentRecord> = {}): ConsentRecord {
  return {
    id: 'consent-1',
    clientId: 'client-1',
    consentType: 'photography',
    version: 1,
    granted: true,
    grantedAt: '2026-07-01T09:00:00.000Z',
    revokedAt: null,
    ...overrides,
  }
}

describe('active consent resolution', () => {
  it('finds a granted, unrevoked consent at the evaluation time', () => {
    const record = consent()
    expect(getActiveConsent([record], 'client-1', 'photography', NOW)).toBe(record)
    expect(hasActiveConsent([record], 'client-1', 'photography', NOW)).toBe(true)
  })

  it('treats a newer denial or revocation as inactive', () => {
    const records = [
      consent(),
      consent({
        id: 'consent-2',
        version: 2,
        granted: false,
        grantedAt: null,
        revokedAt: '2026-07-10T09:00:00.000Z',
      }),
    ]
    expect(getActiveConsent(records, 'client-1', 'photography', NOW)).toBeNull()
  })

  it('rejects expired, malformed, and future grants', () => {
    expect(
      hasActiveConsent(
        [consent({ expiresAt: '2026-07-12T00:00:00.000Z' })],
        'client-1',
        'photography',
        NOW,
      ),
    ).toBe(false)
    expect(
      hasActiveConsent([consent({ grantedAt: 'not-a-date' })], 'client-1', 'photography', NOW),
    ).toBe(false)
    expect(
      hasActiveConsent(
        [consent({ grantedAt: '2026-08-01T00:00:00.000Z' })],
        'client-1',
        'photography',
        NOW,
      ),
    ).toBe(false)
  })
})

describe('consent guard', () => {
  it('does not let a therapist bypass photography consent', () => {
    const result = evaluateConsentGuard({
      action: 'create_photo',
      actorRole: 'therapist',
      actorClientId: null,
      targetClientId: 'client-1',
      consents: [],
      freshAuthenticationAt: '2026-07-13T11:55:00.000Z',
      now: NOW,
    })
    expect(result).toMatchObject({
      allowed: false,
      reason: 'consent_missing_or_inactive',
      requiredConsent: 'photography',
    })
  })

  it('allows authorized photo access only with consent and fresh authentication', () => {
    const result = evaluateConsentGuard({
      action: 'view_photo',
      actorRole: 'client',
      actorClientId: 'client-1',
      targetClientId: 'client-1',
      consents: [consent()],
      freshAuthenticationAt: '2026-07-13T11:50:00.000Z',
      now: NOW,
    })
    expect(result).toEqual({
      allowed: true,
      reason: 'allowed',
      requiredConsent: 'photography',
      activeConsentId: 'consent-1',
      requiresFreshAuthentication: true,
    })
  })

  it('requires fresh authentication for a sensitive action', () => {
    const result = evaluateConsentGuard({
      action: 'view_photo',
      actorRole: 'client',
      actorClientId: 'client-1',
      targetClientId: 'client-1',
      consents: [consent()],
      freshAuthenticationAt: '2026-07-13T11:30:00.000Z',
      now: NOW,
    })
    expect(result.reason).toBe('fresh_authentication_required')
  })

  it('denies a client targeting another client before evaluating consent', () => {
    const result = evaluateConsentGuard({
      action: 'view_photo',
      actorRole: 'client',
      actorClientId: 'client-2',
      targetClientId: 'client-1',
      consents: [consent()],
      freshAuthenticationAt: NOW,
      now: NOW,
    })
    expect(result.reason).toBe('wrong_client')
  })

  it('honors a backend-derived therapist/client access decision', () => {
    const result = evaluateConsentGuard({
      action: 'read_health_data',
      actorRole: 'therapist',
      actorClientId: null,
      targetClientId: 'client-1',
      therapistCanAccessClient: false,
      consents: [consent({ consentType: 'health_data' })],
      freshAuthenticationAt: null,
      now: NOW,
    })
    expect(result.reason).toBe('client_access_not_authorized')
  })

  it('does not require fresh authentication for reminder consent checks', () => {
    const result = evaluateConsentGuard({
      action: 'send_reminder',
      actorRole: 'therapist',
      actorClientId: null,
      targetClientId: 'client-1',
      consents: [consent({ consentType: 'reminders' })],
      freshAuthenticationAt: null,
      now: NOW,
    })
    expect(result.allowed).toBe(true)
    expect(result.requiresFreshAuthentication).toBe(false)
  })

  it('requires handoff consent and fresh authentication for generation', () => {
    const context = {
      action: 'generate_handoff' as const,
      actorRole: 'therapist' as const,
      actorClientId: null,
      targetClientId: 'client-1',
      freshAuthenticationAt: NOW,
      now: NOW,
    }
    expect(evaluateConsentGuard({ ...context, consents: [] }).allowed).toBe(false)
    expect(
      evaluateConsentGuard({
        ...context,
        consents: [consent({ consentType: 'handoff' })],
      }).allowed,
    ).toBe(true)
  })
})
