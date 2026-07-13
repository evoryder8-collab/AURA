import { createClient } from '@supabase/supabase-js'
import { env } from '@/config/env'

export const supabaseAuthOptions = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
  flowType: 'pkce' as const,
}

export const supabase = env.supabase
  ? createClient(env.supabase.url, env.supabase.publishableKey, {
      auth: supabaseAuthOptions,
    })
  : null
