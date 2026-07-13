import {
  errorResponse,
  handlePreflight,
  HttpError,
  jsonResponse,
  readJson,
  requestOriginAllowed,
} from '../_shared/http.ts'
import { authenticate, requireTherapist } from '../_shared/supabase.ts'
import { narrationIsSafe } from '../_shared/narration-safety.ts'
import { z } from 'zod'

const Pattern = z.enum([
  'building_baseline',
  'improving',
  'mixed',
  'limited_change',
  'maintenance',
  'sustained_worsening',
  'medical_review_consideration',
])

const NarrationRequest = z.object({
  pattern: Pattern,
  metrics: z
    .record(z.string().min(1).max(80), z.number().finite())
    .refine((metrics) => Object.keys(metrics).length <= 24),
  confidence: z.number().min(0).max(1),
  allowedVocabulary: z.array(z.string().min(1).max(80)).max(80),
  missingDataStatement: z.string().max(500),
  audience: z.enum(['therapist', 'client', 'both']),
  ruleVersion: z.string().min(1).max(80),
})

const ProviderOutput = z.object({
  therapistNarration: z.string().min(1).max(1_500),
  clientNarration: z.string().min(1).max(1_500),
})

type NarrationInput = z.infer<typeof NarrationRequest>
type Narration = z.infer<typeof ProviderOutput>

const patternLabels: Record<NarrationInput['pattern'], string> = {
  building_baseline: 'building a baseline',
  improving: 'an improving pattern',
  mixed: 'a mixed pattern',
  limited_change: 'a limited-change pattern',
  maintenance: 'a maintenance pattern',
  sustained_worsening: 'a sustained-worsening pattern',
  medical_review_consideration: 'a medical-review consideration',
}

function formatMetrics(metrics: Record<string, number>): string {
  const entries = Object.entries(metrics).sort(([a], [b]) => a.localeCompare(b))
  if (!entries.length) return 'No exact numeric metrics were supplied'
  return entries.map(([key, value]) => `${key}: ${value}`).join(', ')
}

function fallback(input: NarrationInput): Narration {
  const label = patternLabels[input.pattern]
  const metrics = formatMetrics(input.metrics)
  const missing =
    input.missingDataStatement.trim() || 'No additional missing-data statement was supplied.'
  return {
    therapistNarration:
      `The deterministic ${input.ruleVersion} rules identify ${label} from the supplied observations (${metrics}). ` +
      `Confidence is ${input.confidence}. ${missing} Review the exact evidence and apply professional judgment; this assigns neither a medical label nor a cause.`,
    clientNarration:
      `Your approved recorded measures currently show ${label} (${metrics}). ` +
      `Confidence is ${input.confidence}. ${missing} This summary describes observations and identifies neither a medical label nor a cause.`,
  }
}

async function providerNarration(input: NarrationInput): Promise<Narration | null> {
  const provider = Deno.env.get('AI_PROVIDER')?.toLowerCase()
  const apiKey = Deno.env.get('AI_API_KEY')
  const endpoint = Deno.env.get('AI_PROVIDER_URL')
  if (!provider || provider === 'disabled' || !apiKey || !endpoint) return null

  // Provider-neutral JSON contract. A gateway/adapter may translate this request
  // to any model provider; AURA never grants it database access.
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        task: 'aura-insight-narration-v1',
        constraints: {
          noDiagnosis: true,
          noCausalClaims: true,
          noTreatmentNecessity: true,
          preserveUncertainty: true,
          noNewNumbers: true,
        },
        evidence: input,
        outputSchema: {
          therapistNarration: 'string',
          clientNarration: 'string',
        },
      }),
    })
    if (!response.ok) return null
    const parsed = ProviderOutput.safeParse(await response.json())
    if (!parsed.success || !narrationIsSafe(parsed.data, input)) return null
    return parsed.data
  } catch {
    return null
  } finally {
    clearTimeout(timeout)
  }
}

Deno.serve(async (request) => {
  const preflight = handlePreflight(request)
  if (preflight) return preflight
  if (request.method !== 'POST' || !requestOriginAllowed(request)) {
    return jsonResponse(request, 404, { error: 'Request unavailable.' })
  }

  try {
    const actor = await authenticate(request)
    requireTherapist(actor)
    const parsed = NarrationRequest.safeParse(await readJson(request, 16_384))
    if (!parsed.success) {
      throw new HttpError(400, 'Narration evidence is invalid.')
    }

    const generated = await providerNarration(parsed.data)
    const narration = generated ?? fallback(parsed.data)
    return jsonResponse(request, 200, {
      ...narration,
      source: generated ? 'provider' : 'deterministic-fallback',
      requiresTherapistApproval: true,
    })
  } catch (error) {
    return errorResponse(request, error)
  }
})
