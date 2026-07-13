import { describe, expect, it } from 'vitest'

import {
  initialQuoteRotationState,
  rotateQuote,
  selectNextQuote,
  type CuratedQuote,
} from './quote-rotation'

const quotes: readonly CuratedQuote[] = [
  { id: 'q-1', text: 'Steady attention creates room for change.' },
  { id: 'q-2', text: 'Small observations can make progress visible.' },
  { id: 'q-3', text: 'Recovery can have more than one rhythm.' },
]

describe('quote rotation', () => {
  it('is deterministic for a client and session count', () => {
    expect(selectNextQuote(quotes, 'client-a', 4)).toEqual(selectNextQuote(quotes, 'client-a', 4))
  })

  it('does not immediately repeat a quote when alternatives exist', () => {
    const first = rotateQuote(quotes, { cursor: 0, lastQuoteId: null })
    const second = rotateQuote(quotes, {
      cursor: 3,
      lastQuoteId: first.quote?.id ?? null,
    })
    expect(first.quote?.id).toBe('q-1')
    expect(second.quote?.id).not.toBe(first.quote?.id)
    expect(second.immediateRepeatWasUnavoidable).toBe(false)
  })

  it('reports when a repeat is unavoidable for a one-quote library', () => {
    const result = rotateQuote([quotes[0]!], {
      cursor: 1,
      lastQuoteId: 'q-1',
    })
    expect(result.quote?.id).toBe('q-1')
    expect(result.immediateRepeatWasUnavoidable).toBe(true)
  })

  it('returns an explicit empty result for an empty library', () => {
    const state = initialQuoteRotationState('client-a')
    expect(rotateQuote([], state)).toEqual({
      quote: null,
      state,
      immediateRepeatWasUnavoidable: false,
    })
  })

  it('rejects duplicate ids and invalid session counts', () => {
    expect(() => rotateQuote([quotes[0]!, quotes[0]!], { cursor: 0, lastQuoteId: null })).toThrow(
      TypeError,
    )
    expect(() => selectNextQuote(quotes, 'client-a', -1)).toThrow(RangeError)
  })
})
