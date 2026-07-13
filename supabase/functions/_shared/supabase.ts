import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { HttpError } from './http.ts'

export interface Actor {
  userId: string
  role: 'therapist' | 'client'
  practiceId: string
  clientId: string | null
  issuedAt: number
  authenticatedAt: number
  assuranceLevel: string | null
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) {
    throw new Error(`Missing required Edge Function configuration: ${name}`)
  }
  return value
}

export function serviceClient(): SupabaseClient {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'aura-edge-function' } },
  })
}

export function publicAuthClient(): SupabaseClient {
  return createClient(requiredEnv('SUPABASE_URL'), requiredEnv('SUPABASE_ANON_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { 'X-Client-Info': 'aura-edge-function' } },
  })
}

function bearerToken(request: Request): string {
  const authorization = request.headers.get('authorization') ?? ''
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    throw new HttpError(401, 'Authentication required.')
  }
  const token = authorization.slice(7).trim()
  if (!token) throw new HttpError(401, 'Authentication required.')
  return token
}

function decodeClaims(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1]
    if (!payload) return {}
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    return JSON.parse(atob(padded)) as Record<string, unknown>
  } catch {
    return {}
  }
}

export async function authenticate(request: Request): Promise<Actor> {
  const token = bearerToken(request)
  const admin = serviceClient()
  const { data, error } = await admin.auth.getUser(token)
  if (error || !data.user) throw new HttpError(401, 'Authentication required.')

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, role, practice_id')
    .eq('id', data.user.id)
    .maybeSingle()
  if (profileError || !profile) throw new HttpError(403, 'Access denied.')

  let clientId: string | null = null
  if (profile.role === 'client') {
    const { data: client } = await admin
      .from('clients')
      .select('id')
      .eq('auth_user_id', data.user.id)
      .eq('practice_id', profile.practice_id)
      .maybeSingle()
    clientId = client?.id ?? null
  }

  const claims = decodeClaims(token)
  const amr = Array.isArray(claims.amr) ? claims.amr : []
  const authenticatedAt = amr.reduce((latest, entry) => {
    if (!entry || typeof entry !== 'object') return latest
    const method = 'method' in entry ? entry.method : null
    const timestamp = 'timestamp' in entry ? entry.timestamp : null
    if (method === 'token_refresh' || method === 'anonymous' || typeof timestamp !== 'number') {
      return latest
    }
    return Math.max(latest, timestamp)
  }, 0)
  return {
    userId: data.user.id,
    role: profile.role,
    practiceId: profile.practice_id,
    clientId,
    issuedAt: typeof claims.iat === 'number' ? claims.iat : 0,
    authenticatedAt,
    assuranceLevel: typeof claims.aal === 'string' ? claims.aal : null,
  }
}

export function requireTherapist(actor: Actor): void {
  if (actor.role !== 'therapist') throw new HttpError(403, 'Access denied.')
}

export function requireFreshAuth(actor: Actor, maxAgeSeconds = 300): void {
  const now = Math.floor(Date.now() / 1000)
  if (!actor.authenticatedAt || actor.authenticatedAt < now - maxAgeSeconds) {
    throw new HttpError(401, 'Fresh authentication required.')
  }
}
