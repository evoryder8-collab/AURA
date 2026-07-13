import {
  errorResponse,
  handlePreflight,
  HttpError,
  jsonResponse,
  readJson,
  requestOriginAllowed,
  responseHeaders,
} from '../_shared/http.ts'
import { buildAppHashUrl } from '../_shared/app-url.ts'
import { hmacHex, randomToken } from '../_shared/crypto.ts'
import { handoffStateIsUsable } from '../_shared/handoff-security.ts'
import {
  authenticate,
  requireFreshAuth,
  requireTherapist,
  serviceClient,
} from '../_shared/supabase.ts'
import { z } from 'zod'

const RequestBody = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('issue'),
    handoffId: z.string().uuid(),
    expiresInHours: z.number().int().min(1).max(168).default(24),
  }),
  z.object({ action: z.literal('revoke'), handoffId: z.string().uuid() }),
  z.object({
    action: z.literal('inspect'),
    token: z.string().min(40).max(180),
  }),
  z.object({
    action: z.literal('download'),
    token: z.string().min(40).max(180),
  }),
  z.object({
    action: z.literal('respond'),
    token: z.string().min(40).max(180),
    response: z.object({
      respondentName: z.string().trim().min(1).max(120).optional(),
      organization: z.string().trim().min(1).max(160).optional(),
      message: z.string().trim().min(1).max(2_000),
      contactPreference: z.enum(['none', 'email', 'phone']).default('none'),
    }),
  }),
])

type Service = ReturnType<typeof serviceClient>

interface ValidHandoff {
  id: string
  practiceId: string
  clientId: string
  recipientName: string
  recipientOrganization: string | null
  purpose: string
  includedSections: unknown
  expiresAt: string
  storagePath: string
}

const UNAVAILABLE = 'Link unavailable or expired.'

function requesterAddress(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}

async function enforcePublicRateLimit(
  request: Request,
  action: 'inspect' | 'download' | 'respond',
  token: string,
) {
  const rateSecret = Deno.env.get('RATE_LIMIT_PEPPER') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!rateSecret) throw new HttpError(503, UNAVAILABLE)

  const service = serviceClient()
  const address = requesterAddress(request)
  const [addressBucket, tokenBucket] = await Promise.all([
    hmacHex(rateSecret, `aura-handoff:${action}:ip:${address}`),
    hmacHex(rateSecret, `aura-handoff:${action}:token:${token}`),
  ])
  const isResponse = action === 'respond'
  const [addressLimit, tokenLimit] = await Promise.all([
    service.rpc('consume_auth_rate_limit', {
      rate_bucket_key: addressBucket,
      max_attempts: isResponse ? 20 : 100,
      window_seconds: isResponse ? 3600 : 900,
    }),
    service.rpc('consume_auth_rate_limit', {
      rate_bucket_key: tokenBucket,
      max_attempts: isResponse ? 5 : 60,
      window_seconds: isResponse ? 3600 : 900,
    }),
  ])

  if (
    addressLimit.error ||
    tokenLimit.error ||
    addressLimit.data !== true ||
    tokenLimit.data !== true
  ) {
    throw new HttpError(429, UNAVAILABLE)
  }
}

function publicHandoffLink(token: string): string {
  const allowedOrigins = (Deno.env.get('APP_ORIGIN') ?? '').split(',')
  const baseUrl = Deno.env.get('APP_BASE_URL') ?? allowedOrigins[0] ?? ''
  const link = buildAppHashUrl(baseUrl, allowedOrigins, `/handoff/${encodeURIComponent(token)}`)
  if (!link) throw new HttpError(503, 'Handoff service unavailable.')
  return link
}

function pepper(): string {
  const value = Deno.env.get('HANDOFF_TOKEN_PEPPER')
  if (!value || value.length < 32) {
    throw new HttpError(503, 'Handoff service unavailable.')
  }
  return value
}

async function activeConsent(service: Service, practiceId: string, clientId: string) {
  const { data, error } = await service
    .from('consents')
    .select('id')
    .eq('practice_id', practiceId)
    .eq('client_id', clientId)
    .eq('consent_type', 'handoff')
    .eq('granted', true)
    .is('revoked_at', null)
    .limit(1)
  return !error && (data?.length ?? 0) > 0
}

async function activeHandoffApproval(service: Service, handoffId: string): Promise<boolean> {
  const { data, error } = await service.rpc('has_active_handoff_approval', {
    target_handoff_export_id: handoffId,
  })
  return !error && data === true
}

async function approvedMaximumExpiry(service: Service, handoffId: string): Promise<string | null> {
  const { data, error } = await service
    .from('handoff_export_approvals')
    .select('approved_expires_at')
    .eq('handoff_export_id', handoffId)
    .is('revoked_at', null)
    .maybeSingle()
  return error ? null : (data?.approved_expires_at ?? null)
}

async function audit(
  service: Service,
  practiceId: string,
  actorUserId: string | null,
  action: string,
  resourceId: string,
  safeMetadata: Record<string, unknown> = {},
) {
  // Audit failure is a security failure for handoff operations.
  const { error } = await service.from('audit_events').insert({
    practice_id: practiceId,
    actor_user_id: actorUserId,
    action,
    resource_type: 'handoff_export',
    resource_id: resourceId,
    safe_metadata: safeMetadata,
  })
  if (error) throw new HttpError(500, 'Request unavailable.')
}

async function validateToken(service: Service, token: string): Promise<ValidHandoff> {
  const digest = await hmacHex(pepper(), token)
  const { data: secret, error: secretError } = await service
    .from('handoff_secrets')
    .select('handoff_export_id, practice_id, storage_path')
    .eq('token_hash', digest)
    .maybeSingle()
  if (secretError || !secret?.storage_path) {
    throw new HttpError(404, UNAVAILABLE)
  }

  const { data: handoff, error: handoffError } = await service
    .from('handoff_exports')
    .select(
      'id, practice_id, client_id, recipient_name, recipient_organization, purpose, included_sections, expires_at, status, revoked_at',
    )
    .eq('id', secret.handoff_export_id)
    .eq('practice_id', secret.practice_id)
    .maybeSingle()
  if (handoffError || !handoff) throw new HttpError(404, UNAVAILABLE)

  const expired = !handoff.expires_at || Date.parse(handoff.expires_at) <= Date.now()
  if (expired) {
    await service.from('handoff_exports').update({ status: 'expired' }).eq('id', handoff.id)
    await service
      .from('handoff_secrets')
      .update({ token_hash: null })
      .eq('handoff_export_id', handoff.id)
  }

  const hasConsent = await activeConsent(service, handoff.practice_id, handoff.client_id)
  const hasApproval = await activeHandoffApproval(service, handoff.id)
  if (
    !hasApproval ||
    !handoffStateIsUsable({
      status: handoff.status,
      expiresAt: handoff.expires_at,
      revokedAt: handoff.revoked_at,
      hasConsent,
      hasApproval,
      hasStoragePath: !!secret.storage_path,
    })
  ) {
    throw new HttpError(404, UNAVAILABLE)
  }

  return {
    id: handoff.id,
    practiceId: handoff.practice_id,
    clientId: handoff.client_id,
    recipientName: handoff.recipient_name,
    recipientOrganization: handoff.recipient_organization,
    purpose: handoff.purpose,
    includedSections: handoff.included_sections,
    expiresAt: handoff.expires_at,
    storagePath: secret.storage_path,
  }
}

async function issue(request: Request, handoffId: string, expiresInHours: number) {
  const actor = await authenticate(request)
  requireTherapist(actor)
  requireFreshAuth(actor)
  const service = serviceClient()
  const { data: handoff, error } = await service
    .from('handoff_exports')
    .select('id, practice_id, client_id, status, revoked_at, expires_at')
    .eq('id', handoffId)
    .eq('practice_id', actor.practiceId)
    .maybeSingle()
  if (
    error ||
    !handoff ||
    handoff.revoked_at ||
    !['consented', 'generated', 'shared'].includes(handoff.status)
  ) {
    throw new HttpError(404, 'Handoff unavailable.')
  }
  if (!(await activeConsent(service, handoff.practice_id, handoff.client_id))) {
    throw new HttpError(409, 'Active handoff consent is required.')
  }
  if (!(await activeHandoffApproval(service, handoff.id))) {
    throw new HttpError(409, 'Per-export client approval is required.')
  }

  const approvedExpiresAt = await approvedMaximumExpiry(service, handoff.id)
  const approvedExpiryMs = approvedExpiresAt ? Date.parse(approvedExpiresAt) : Number.NaN
  const proposedExpiryMs = handoff.expires_at ? Date.parse(handoff.expires_at) : Number.NaN
  if (!Number.isFinite(approvedExpiryMs) || !Number.isFinite(proposedExpiryMs)) {
    throw new HttpError(409, 'Per-export client approval is required.')
  }

  const { data: secretRow } = await service
    .from('handoff_secrets')
    .select('storage_path')
    .eq('handoff_export_id', handoffId)
    .maybeSingle()
  if (!secretRow?.storage_path) {
    throw new HttpError(409, 'Generate the handoff document first.')
  }

  const token = randomToken(32)
  const tokenHash = await hmacHex(pepper(), token)
  const expiresAtMs = Math.min(
    Date.now() + expiresInHours * 3_600_000,
    approvedExpiryMs,
    proposedExpiryMs,
  )
  if (expiresAtMs <= Date.now()) {
    throw new HttpError(409, 'Per-export client approval has expired.')
  }
  const expiresAt = new Date(expiresAtMs).toISOString()

  const { error: secretUpdateError } = await service.from('handoff_secrets').upsert(
    {
      handoff_export_id: handoffId,
      practice_id: handoff.practice_id,
      storage_path: secretRow.storage_path,
      token_hash: tokenHash,
      token_created_at: new Date().toISOString(),
    },
    { onConflict: 'handoff_export_id' },
  )
  if (secretUpdateError) throw new HttpError(500, 'Request unavailable.')

  const { error: updateError } = await service
    .from('handoff_exports')
    .update({ expires_at: expiresAt, status: 'shared', revoked_at: null })
    .eq('id', handoffId)
    .eq('practice_id', actor.practiceId)
  if (updateError) throw new HttpError(500, 'Request unavailable.')

  await audit(service, actor.practiceId, actor.userId, 'handoff.link_issued', handoffId, {
    expiresInHours,
  })

  return jsonResponse(request, 200, {
    link: publicHandoffLink(token),
    expiresAt,
  })
}

async function revoke(request: Request, handoffId: string) {
  const actor = await authenticate(request)
  requireTherapist(actor)
  requireFreshAuth(actor)
  const service = serviceClient()
  const revokedAt = new Date().toISOString()
  const { data, error } = await service
    .from('handoff_exports')
    .update({ status: 'revoked', revoked_at: revokedAt })
    .eq('id', handoffId)
    .eq('practice_id', actor.practiceId)
    .select('id')
    .maybeSingle()
  if (error || !data) throw new HttpError(404, 'Handoff unavailable.')

  const { error: secretError } = await service
    .from('handoff_secrets')
    .update({ token_hash: null })
    .eq('handoff_export_id', handoffId)
    .eq('practice_id', actor.practiceId)
  if (secretError) throw new HttpError(500, 'Request unavailable.')
  await audit(service, actor.practiceId, actor.userId, 'handoff.link_revoked', handoffId)
  return jsonResponse(request, 200, { revoked: true, revokedAt })
}

async function inspect(request: Request, token: string) {
  const service = serviceClient()
  const handoff = await validateToken(service, token)
  await service
    .from('handoff_exports')
    .update({ accessed_at: new Date().toISOString() })
    .eq('id', handoff.id)
  await audit(service, handoff.practiceId, null, 'handoff.link_inspected', handoff.id)
  return jsonResponse(request, 200, {
    recipientName: handoff.recipientName,
    recipientOrganization: handoff.recipientOrganization,
    purpose: handoff.purpose,
    includedSections: handoff.includedSections,
    expiresAt: handoff.expiresAt,
    downloadAvailable: true,
  })
}

async function download(request: Request, token: string) {
  const service = serviceClient()
  const handoff = await validateToken(service, token)
  const { data, error } = await service.storage
    .from('handoff-documents')
    .download(handoff.storagePath)
  if (error || !data) throw new HttpError(404, UNAVAILABLE)

  await service
    .from('handoff_exports')
    .update({ accessed_at: new Date().toISOString() })
    .eq('id', handoff.id)
  await audit(service, handoff.practiceId, null, 'handoff.document_accessed', handoff.id)

  const headers = responseHeaders(request)
  headers.set('Content-Type', 'application/pdf')
  headers.set('Content-Disposition', 'attachment; filename="aura-handoff.pdf"')
  return new Response(data, { status: 200, headers })
}

async function respond(
  request: Request,
  token: string,
  response: {
    respondentName?: string
    organization?: string
    message: string
    contactPreference: 'none' | 'email' | 'phone'
  },
) {
  const service = serviceClient()
  const handoff = await validateToken(service, token)
  const { error } = await service.from('handoff_responses').insert({
    practice_id: handoff.practiceId,
    handoff_export_id: handoff.id,
    response_data: response,
  })
  if (error) throw new HttpError(500, 'Request unavailable.')
  await audit(service, handoff.practiceId, null, 'handoff.response_submitted', handoff.id)
  return jsonResponse(request, 201, { submitted: true })
}

Deno.serve(async (request) => {
  const preflight = handlePreflight(request)
  if (preflight) return preflight
  if (request.method !== 'POST' || !requestOriginAllowed(request)) {
    return jsonResponse(request, 404, { error: 'Request unavailable.' })
  }

  try {
    const parsed = RequestBody.safeParse(await readJson(request, 16_384))
    if (!parsed.success) throw new HttpError(400, 'Request unavailable.')
    switch (parsed.data.action) {
      case 'issue':
        return await issue(request, parsed.data.handoffId, parsed.data.expiresInHours)
      case 'revoke':
        return await revoke(request, parsed.data.handoffId)
      case 'inspect':
        await enforcePublicRateLimit(request, parsed.data.action, parsed.data.token)
        return await inspect(request, parsed.data.token)
      case 'download':
        await enforcePublicRateLimit(request, parsed.data.action, parsed.data.token)
        return await download(request, parsed.data.token)
      case 'respond':
        await enforcePublicRateLimit(request, parsed.data.action, parsed.data.token)
        return await respond(request, parsed.data.token, parsed.data.response)
    }
  } catch (error) {
    return errorResponse(request, error)
  }
})
