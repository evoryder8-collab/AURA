import { createClient } from '@supabase/supabase-js'
import { env } from '@/config/env'

export const supabase = env.supabase
  ? createClient(env.supabase.url, env.supabase.publishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
