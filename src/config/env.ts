import { z } from 'zod'

const bool = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value === 'true')

const rawSchema = z.object({
  VITE_APP_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  VITE_DEMO_MODE: bool,
  VITE_BASE_PATH: z.string().default('/'),
  VITE_SUPABASE_URL: z.string().optional(),
  VITE_SUPABASE_PUBLISHABLE_KEY: z.string().optional(),
  VITE_ENABLE_PASSKEYS: bool,
  VITE_ENABLE_AI_NARRATION: bool,
  VITE_ENABLE_TRANSCRIPTION: bool,
  VITE_ENABLE_SECURE_HANDOFF_LINKS: bool,
  VITE_ENABLE_BROWSER_NOTIFICATIONS: bool,
})

const result = rawSchema.safeParse(import.meta.env)
const fallback = rawSchema.parse({
  VITE_APP_ENV: 'development',
  VITE_DEMO_MODE: 'true',
  VITE_BASE_PATH: '/',
})
const raw = result.success ? result.data : fallback
const parseErrors = result.success
  ? []
  : ['Public build configuration was invalid, so AURA entered safe synthetic demo mode.']
const credentialsComplete = Boolean(raw.VITE_SUPABASE_URL && raw.VITE_SUPABASE_PUBLISHABLE_KEY)
const credentialsPartial =
  Boolean(raw.VITE_SUPABASE_URL) !== Boolean(raw.VITE_SUPABASE_PUBLISHABLE_KEY)
const demoMode = !result.success || raw.VITE_DEMO_MODE || !credentialsComplete
const basePathValid = raw.VITE_BASE_PATH.startsWith('/') && raw.VITE_BASE_PATH.endsWith('/')
const basePath = basePathValid ? raw.VITE_BASE_PATH : '/'

export const env = {
  appEnv: raw.VITE_APP_ENV,
  mode: demoMode ? ('demo' as const) : ('supabase' as const),
  demoMode,
  isProduction: raw.VITE_APP_ENV === 'production' && !demoMode,
  basePath,
  supabase: credentialsComplete
    ? { url: raw.VITE_SUPABASE_URL!, publishableKey: raw.VITE_SUPABASE_PUBLISHABLE_KEY! }
    : null,
  setupErrors: [
    ...parseErrors,
    ...(credentialsPartial
      ? ['Set both VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY, or leave both empty.']
      : []),
    ...(!basePathValid
      ? ['VITE_BASE_PATH must begin and end with a slash; safe fallback / is active.']
      : []),
  ],
  flags: {
    passkeys: raw.VITE_ENABLE_PASSKEYS,
    aiNarration: raw.VITE_ENABLE_AI_NARRATION,
    transcription: raw.VITE_ENABLE_TRANSCRIPTION,
    secureHandoffLinks: raw.VITE_ENABLE_SECURE_HANDOFF_LINKS,
    browserNotifications: raw.VITE_ENABLE_BROWSER_NOTIFICATIONS,
  },
}

export type AuraEnvironment = typeof env
