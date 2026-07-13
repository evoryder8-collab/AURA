export interface CuratedQuote {
  readonly id: string
  readonly text: string
  readonly attribution?: string
}

export interface QuoteRotationState {
  readonly cursor: number
  readonly lastQuoteId: string | null
}

export interface QuoteRotationResult {
  readonly quote: CuratedQuote | null
  readonly state: QuoteRotationState
  readonly immediateRepeatWasUnavoidable: boolean
}

function stableHash(value: string): number {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function assertUniqueQuotes(quotes: readonly CuratedQuote[]): void {
  const ids = new Set<string>()
  for (const quote of quotes) {
    if (quote.id.trim().length === 0 || quote.text.trim().length === 0) {
      throw new TypeError('Curated quotes require a non-empty id and text.')
    }
    if (ids.has(quote.id)) {
      throw new TypeError(`Curated quote ids must be unique: ${quote.id}`)
    }
    ids.add(quote.id)
  }
}

export function initialQuoteRotationState(clientId: string): QuoteRotationState {
  if (clientId.trim().length === 0) {
    throw new TypeError('A client id is required for quote rotation.')
  }
  return { cursor: stableHash(clientId), lastQuoteId: null }
}

export function rotateQuote(
  quotes: readonly CuratedQuote[],
  state: QuoteRotationState,
): QuoteRotationResult {
  assertUniqueQuotes(quotes)
  if (!Number.isSafeInteger(state.cursor) || state.cursor < 0) {
    throw new RangeError('Quote rotation cursor must be a non-negative integer.')
  }
  if (quotes.length === 0) {
    return {
      quote: null,
      state,
      immediateRepeatWasUnavoidable: false,
    }
  }

  let index = state.cursor % quotes.length
  let selected = quotes[index]
  if (selected == null) {
    throw new RangeError('Quote rotation could not resolve the cursor.')
  }
  if (quotes.length > 1 && selected.id === state.lastQuoteId) {
    index = (index + 1) % quotes.length
    const next = quotes[index]
    if (next != null) selected = next
  }

  return {
    quote: selected,
    state: {
      cursor: state.cursor + 1,
      lastQuoteId: selected.id,
    },
    immediateRepeatWasUnavoidable: quotes.length === 1 && selected.id === state.lastQuoteId,
  }
}

export function selectNextQuote(
  quotes: readonly CuratedQuote[],
  clientId: string,
  completedSessionCount: number,
  previousQuoteId: string | null = null,
): CuratedQuote | null {
  if (!Number.isSafeInteger(completedSessionCount) || completedSessionCount < 0) {
    throw new RangeError('Completed session count must be a non-negative integer.')
  }
  const initial = initialQuoteRotationState(clientId)
  return rotateQuote(quotes, {
    cursor: initial.cursor + completedSessionCount,
    lastQuoteId: previousQuoteId,
  }).quote
}
