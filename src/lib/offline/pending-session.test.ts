import { describe, expect, it } from 'vitest'

import { createMinimalPendingSessionState, isMinimalPendingSessionState } from './pending-session'

const validState = {
  sessionId: 'session-1',
  appointmentId: 'appointment-1',
  startedAt: '2026-07-13T10:00:00.000Z',
  updatedAt: '2026-07-13T10:02:00.000Z',
  elapsedSeconds: 120,
  paused: false,
  selectedRegionIds: ['left-shoulder'],
} as const

describe('minimal pending session state', () => {
  it('creates a versioned, resumable minimal state', () => {
    expect(createMinimalPendingSessionState(validState)).toEqual({
      ...validState,
      version: 1,
    })
  })

  it('rejects invalid elapsed time and timestamps', () => {
    expect(isMinimalPendingSessionState({ ...validState, version: 1, elapsedSeconds: -1 })).toBe(
      false,
    )
    expect(isMinimalPendingSessionState({ ...validState, version: 1, updatedAt: 'invalid' })).toBe(
      false,
    )
  })

  it('rejects additional private detail outside the minimal schema', () => {
    expect(
      isMinimalPendingSessionState({
        ...validState,
        version: 1,
        clientName: 'Must not be stored here',
      }),
    ).toBe(false)
  })
})
