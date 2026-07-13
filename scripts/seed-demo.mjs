import { createClient } from '@supabase/supabase-js'

function required(name) {
  const value = process.env[name]
  if (!value)
    throw new Error(
      `Missing ${name}. Copy supabase/scripts/.env.example to .env.local and provide a local value.`,
    )
  return value
}

function password(name) {
  const value = required(name)
  if (value.length < 14) throw new Error(`${name} must contain at least 14 characters.`)
  return value
}

const supabaseUrl = required('SUPABASE_URL')
const hostname = new URL(supabaseUrl).hostname
if (!new Set(['localhost', '127.0.0.1', '::1']).has(hostname)) {
  throw new Error('Demo credential bootstrap is restricted to a local Supabase target.')
}

const users = [
  ['20000000-0000-4000-8000-000000000001', 'synthetic therapist', 'DEMO_THERAPIST_PASSWORD'],
  ['30000000-0000-4000-8000-000000000001', 'synthetic Iris client', 'DEMO_IRIS_PASSWORD'],
  ['30000000-0000-4000-8000-000000000002', 'synthetic Mika client', 'DEMO_MIKA_PASSWORD'],
  ['30000000-0000-4000-8000-000000000003', 'synthetic Sol client', 'DEMO_SOL_PASSWORD'],
]

const admin = createClient(supabaseUrl, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})

for (const [id, label, passwordName] of users) {
  const { error } = await admin.auth.admin.updateUserById(id, {
    password: password(passwordName),
    email_confirm: true,
  })
  if (error)
    throw new Error(`Could not update ${label}; start Supabase and apply the SQL seed first.`)
  console.info(`Updated local credentials for ${label}.`)
}
