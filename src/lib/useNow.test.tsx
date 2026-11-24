import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useNow } from './useNow'

describe('useNow', () => {
  afterEach(() => vi.useRealTimers())

  it('moves on every minute while the page stays open', () => {
    vi.useFakeTimers()
    vi.setSystemTime(Date.parse('2026-11-24T08:00:00Z'))
    const { result } = renderHook(() => useNow())
    expect(result.current).toBe(Date.parse('2026-11-24T08:00:00Z'))
    act(() => vi.advanceTimersByTime(60_000))
    expect(result.current).toBe(Date.parse('2026-11-24T08:01:00Z'))
  })

  it('catches up as soon as a sleeping tab becomes visible again', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.parse('2026-11-24T08:00:00Z'))
    const { result } = renderHook(() => useNow())
    vi.setSystemTime(Date.parse('2026-11-24T10:30:00Z'))
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(result.current).toBe(Date.parse('2026-11-24T10:30:00Z'))
  })
})
