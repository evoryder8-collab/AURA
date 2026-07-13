export interface NarrationSafetyInput {
  metrics: Record<string, number>
  confidence: number
  allowedVocabulary: string[]
  ruleVersion: string
  missingDataStatement: string
}

export interface NarrationOutput {
  therapistNarration: string
  clientNarration: string
}

const BANNED =
  /\b(diagnos(?:is|ed|tic)|arthritis|cancer|tend(?:initis|onosis)|nerve damage|fracture|infection|disease|syndrome|pathology|lesion|inflammation|disc injury|sprain|tear|caused? by|because of|due to|result(?:s|ed)? from|responsible for|cure[sd]?|guarantee[sd]?|must buy|treatment package|medically necessary|structural healing|will heal|requires? treatment)\b/i

const CONTROLLED_TERMS = [
  'pain',
  'stiffness',
  'range of motion',
  'rom',
  'functional',
  'function',
  'recovery',
] as const

function numericTokens(text: string): string[] {
  return text.match(/-?\d+(?:\.\d+)?/g) ?? []
}

function containsWholeTerm(text: string, term: string): boolean {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`\\b${escaped}\\b`).test(text)
}

export function narrationIsSafe(output: NarrationOutput, input: NarrationSafetyInput): boolean {
  const combined = `${output.therapistNarration} ${output.clientNarration}`
  if (BANNED.test(combined)) return false

  const normalizedAllowed = input.allowedVocabulary.map((term) => term.trim().toLowerCase())
  const lowerOutput = combined.toLowerCase()
  if (
    CONTROLLED_TERMS.some(
      (term) =>
        containsWholeTerm(lowerOutput, term) &&
        !normalizedAllowed.some(
          (allowed) => allowed === term || allowed.includes(term) || term.includes(allowed),
        ),
    )
  )
    return false

  const supplied = new Set([
    ...Object.values(input.metrics).map(String),
    String(input.confidence),
    ...numericTokens(input.ruleVersion),
    ...numericTokens(input.missingDataStatement),
  ])
  if (numericTokens(combined).some((number) => !supplied.has(number))) {
    return false
  }

  return /\b(confidence|uncertain|missing|observation|recorded|supplied|data)\b/i.test(combined)
}
