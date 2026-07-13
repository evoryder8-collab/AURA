import { hmacHex, randomToken } from '../_shared/crypto.ts'
import { buildAppHashUrl } from '../_shared/app-url.ts'
import { handoffStateIsUsable } from '../_shared/handoff-security.ts'
import { narrationIsSafe } from '../_shared/narration-safety.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

const now = Date.parse('2026-07-13T12:00:00.000Z')
const active = {
  status: 'shared',
  expiresAt: '2026-07-14T12:00:00.000Z',
  revokedAt: null,
  hasConsent: true,
  hasApproval: true,
  hasStoragePath: true,
}

Deno.test('active shared handoff is usable', () => {
  assert(handoffStateIsUsable(active, now), 'expected active handoff to be usable')
})

Deno.test('expired handoff token is rejected', () => {
  assert(
    !handoffStateIsUsable({ ...active, expiresAt: '2026-07-13T11:59:59.000Z' }, now),
    'expired handoff must be rejected',
  )
})

Deno.test('revoked handoff token is rejected', () => {
  assert(
    !handoffStateIsUsable({ ...active, revokedAt: '2026-07-13T11:00:00.000Z' }, now),
    'revoked handoff must be rejected',
  )
})

Deno.test('handoff without active consent is rejected', () => {
  assert(
    !handoffStateIsUsable({ ...active, hasConsent: false }, now),
    'handoff without consent must be rejected',
  )
})

Deno.test('handoff without per-export approval is rejected', () => {
  assert(
    !handoffStateIsUsable({ ...active, hasApproval: false }, now),
    'standing consent alone must never authorize a handoff',
  )
})

Deno.test('opaque tokens are random and HMAC hashes are deterministic', async () => {
  const first = randomToken(32)
  const second = randomToken(32)
  assert(first !== second, 'opaque tokens should not repeat')
  assert(!first.includes('='), 'opaque tokens should be unpadded base64url')
  const hashA = await hmacHex('a'.repeat(32), first)
  const hashB = await hmacHex('a'.repeat(32), first)
  assert(hashA === hashB, 'same token and pepper must produce the same digest')
  assert(/^[0-9a-f]{64}$/.test(hashA), 'digest must be 64 lowercase hex characters')
})

Deno.test('GitHub Pages handoff links preserve the repository base path', () => {
  const link = buildAppHashUrl(
    'https://owner.github.io/AURA/',
    ['https://owner.github.io'],
    '/handoff/opaque-token',
  )
  assert(
    link === 'https://owner.github.io/AURA/#/handoff/opaque-token',
    'expected repository path in secure link',
  )
})

Deno.test('handoff link base must share an exact allowed CORS origin', () => {
  assert(
    buildAppHashUrl(
      'https://attacker.example/AURA/',
      ['https://owner.github.io'],
      '/handoff/opaque-token',
    ) === null,
    'cross-origin handoff base must be rejected',
  )
})

const narrationEvidence = {
  metrics: { painDelta: 20 },
  confidence: 0.8,
  allowedVocabulary: ['pain', 'recorded measures'],
  ruleVersion: 'prototype-v1',
  missingDataStatement: 'No stiffness data were supplied.',
}

Deno.test('narration validation rejects diagnostic or causal output', () => {
  assert(
    !narrationIsSafe(
      {
        therapistNarration: 'The pain is caused by arthritis with confidence 0.8.',
        clientNarration: 'The recorded data show painDelta 20.',
      },
      narrationEvidence,
    ),
    'diagnostic and causal output must be rejected',
  )
})

Deno.test('narration validation rejects invented numbers', () => {
  assert(
    !narrationIsSafe(
      {
        therapistNarration: 'The supplied painDelta is 35 with confidence 0.8.',
        clientNarration: 'The recorded observations remain uncertain.',
      },
      narrationEvidence,
    ),
    'numbers absent from evidence must be rejected',
  )
})

Deno.test('narration validation accepts scoped evidence-only output', () => {
  assert(
    narrationIsSafe(
      {
        therapistNarration: 'The supplied painDelta is 20 with confidence 0.8.',
        clientNarration: 'The recorded pain observations remain uncertain.',
      },
      narrationEvidence,
    ),
    'safe evidence-only narration should pass',
  )
})
