import {
  errorResponse,
  handlePreflight,
  HttpError,
  jsonResponse,
  readJson,
  requestOriginAllowed,
} from '../_shared/http.ts'
import { hmacHex } from '../_shared/crypto.ts'
import { publicAuthClient, serviceClient } from '../_shared/supabase.ts'
import { z } from 'zod'

const LoginRequest = z.object({
  identifier: z.string().trim().min(3).max(254),
  password: z.string().min(1).max(1024),
})

const GENERIC_LOGIN_ERROR = 'Unable to sign in with those credentials.'

function requesterAddress(request: Request): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}

Deno.serve(async (request) => {
  const preflight = handlePreflight(request)
  if (preflight) return preflight
  if (request.method !== 'POST' || !requestOriginAllowed(request)) {
    return jsonResponse(request, 404, { error: 'Request unavailable.' })
  }

  try {
    const parsed = LoginRequest.safeParse(await readJson(request, 4_096))
    if (!parsed.success) throw new HttpError(401, GENERIC_LOGIN_ERROR)

    const identifier = parsed.data.identifier.toLowerCase()
    const service = serviceClient()
    const rateSecret =
      Deno.env.get('RATE_LIMIT_PEPPER') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!rateSecret) throw new HttpError(503, 'Sign-in service unavailable.')

    const address = requesterAddress(request)
    const [addressBucket, accountBucket] = await Promise.all([
      hmacHex(rateSecret, `aura-login-ip:${address}`),
      hmacHex(rateSecret, `aura-login-account:${address}:${identifier}`),
    ])
    const [addressLimit, accountLimit] = await Promise.all([
      service.rpc('consume_auth_rate_limit', {
        rate_bucket_key: addressBucket,
        max_attempts: 30,
        window_seconds: 900,
      }),
      service.rpc('consume_auth_rate_limit', {
        rate_bucket_key: accountBucket,
        max_attempts: 8,
        window_seconds: 900,
      }),
    ])
    if (
      addressLimit.error ||
      accountLimit.error ||
      addressLimit.data !== true ||
      accountLimit.data !== true
    ) {
      // Same response for any rate-limit bucket; no account-existence signal.
      throw new HttpError(429, GENERIC_LOGIN_ERROR)
    }

    let email = identifier
    if (!identifier.includes('@')) {
      const { data } = await service.rpc('resolve_login_email', {
        normalized_username: identifier,
      })
      // Still run the password flow for unknown aliases to reduce timing signal.
      email = typeof data === 'string' ? data : `${randomUUID()}@invalid.local`
    }

    const { data, error } = await publicAuthClient().auth.signInWithPassword({
      email,
      password: parsed.data.password,
    })
    // Never log identifier, password, resolved email, provider error, or tokens.
    if (error || !data.session || !data.user) {
      throw new HttpError(401, GENERIC_LOGIN_ERROR)
    }

    return jsonResponse(request, 200, {
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at,
        expires_in: data.session.expires_in,
        token_type: data.session.token_type,
      },
      user: { id: data.user.id },
    })
  } catch (error) {
    return errorResponse(request, error)
  }
})

function randomUUID(): string {
  return crypto.randomUUID()
}
