import {
  errorResponse,
  handlePreflight,
  HttpError,
  jsonResponse,
  readJson,
  requestOriginAllowed,
} from '../_shared/http.ts'
import {
  authenticate,
  requireFreshAuth,
  requireTherapist,
  serviceClient,
} from '../_shared/supabase.ts'
import { z } from 'zod'

const normalizedUsername = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .transform((value) => value.toLowerCase())
  .refine((value) => /^[a-z][a-z0-9._-]{2,31}$/.test(value))

const AdminRequest = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('invite-client'),
    email: z.string().email().max(254),
    username: normalizedUsername,
    displayName: z.string().trim().min(1).max(120),
    clientId: z.string().uuid(),
    redirectTo: z.string().url().max(500).optional(),
  }),
  z.object({
    action: z.literal('invite-therapist'),
    email: z.string().email().max(254),
    username: normalizedUsername,
    displayName: z.string().trim().min(1).max(120),
    professionalName: z.string().trim().min(1).max(160),
    redirectTo: z.string().url().max(500).optional(),
  }),
])

function safeRedirect(requested: string | undefined): string | undefined {
  if (!requested) return undefined
  const allowed = new Set(
    (Deno.env.get('APP_ORIGIN') ?? '')
      .split(',')
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  )
  const url = new URL(requested)
  if (!allowed.has(url.origin)) {
    throw new HttpError(400, 'Redirect URL is unavailable.')
  }
  return requested
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
    requireFreshAuth(actor)
    const parsed = AdminRequest.safeParse(await readJson(request, 8_192))
    if (!parsed.success) {
      throw new HttpError(400, 'User invitation is invalid.')
    }

    if (parsed.data.action === 'invite-therapist' && actor.assuranceLevel !== 'aal2') {
      throw new HttpError(401, 'MFA verification is required.')
    }

    const service = serviceClient()
    if (parsed.data.action === 'invite-client') {
      const { data: client, error: clientError } = await service
        .from('clients')
        .select('id, auth_user_id')
        .eq('id', parsed.data.clientId)
        .eq('practice_id', actor.practiceId)
        .maybeSingle()
      if (clientError || !client || client.auth_user_id) {
        throw new HttpError(409, 'Client invitation is unavailable.')
      }

      const { data, error } = await service.auth.admin.inviteUserByEmail(parsed.data.email, {
        redirectTo: safeRedirect(parsed.data.redirectTo),
        data: { synthetic: false },
      })
      if (error || !data.user) {
        throw new HttpError(409, 'User invitation is unavailable.')
      }

      const { error: profileError } = await service.from('profiles').insert({
        id: data.user.id,
        practice_id: actor.practiceId,
        role: 'client',
        username: parsed.data.username,
        display_name: parsed.data.displayName,
      })
      if (profileError) {
        await service.auth.admin.deleteUser(data.user.id)
        throw new HttpError(409, 'User invitation is unavailable.')
      }

      const { error: linkError } = await service
        .from('clients')
        .update({ auth_user_id: data.user.id })
        .eq('id', client.id)
        .eq('practice_id', actor.practiceId)
      if (linkError) {
        await service.auth.admin.deleteUser(data.user.id)
        throw new HttpError(409, 'User invitation is unavailable.')
      }

      await service.from('audit_events').insert({
        practice_id: actor.practiceId,
        actor_user_id: actor.userId,
        action: 'client.invited',
        resource_type: 'client',
        resource_id: client.id,
        safe_metadata: {},
      })
      return jsonResponse(request, 201, {
        userId: data.user.id,
        role: 'client',
      })
    }

    const { data, error } = await service.auth.admin.inviteUserByEmail(parsed.data.email, {
      redirectTo: safeRedirect(parsed.data.redirectTo),
      data: { synthetic: false },
    })
    if (error || !data.user) {
      throw new HttpError(409, 'User invitation is unavailable.')
    }

    const { error: profileError } = await service.from('profiles').insert({
      id: data.user.id,
      practice_id: actor.practiceId,
      role: 'therapist',
      username: parsed.data.username,
      display_name: parsed.data.displayName,
    })
    if (profileError) {
      await service.auth.admin.deleteUser(data.user.id)
      throw new HttpError(409, 'User invitation is unavailable.')
    }

    const { error: therapistError } = await service.from('therapist_profiles').insert({
      user_id: data.user.id,
      practice_id: actor.practiceId,
      professional_name: parsed.data.professionalName,
    })
    if (therapistError) {
      await service.auth.admin.deleteUser(data.user.id)
      throw new HttpError(409, 'User invitation is unavailable.')
    }

    await service.from('audit_events').insert({
      practice_id: actor.practiceId,
      actor_user_id: actor.userId,
      action: 'therapist.invited',
      resource_type: 'profile',
      resource_id: data.user.id,
      safe_metadata: {},
    })
    return jsonResponse(request, 201, {
      userId: data.user.id,
      role: 'therapist',
    })
  } catch (error) {
    return errorResponse(request, error)
  }
})
