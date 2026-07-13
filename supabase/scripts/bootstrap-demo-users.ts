// Development-only credential bootstrap for the fixed synthetic seed users.
// Usage:
// deno run --env-file=supabase/scripts/.env.local --allow-env --allow-net \
//   supabase/scripts/bootstrap-demo-users.ts
//
// Required environment variables (keep in an uncommitted local env file):
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_THERAPIST_PASSWORD,
// DEMO_IRIS_PASSWORD, DEMO_MIKA_PASSWORD, DEMO_SOL_PASSWORD.

import { createClient } from 'npm:@supabase/supabase-js@2.110.3'

function required(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing ${name}.`)
  return value
}

function password(name: string): string {
  const value = required(name)
  if (value.length < 14) {
    throw new Error(`${name} must contain at least 14 characters.`)
  }
  return value
}

const supabaseUrl = required('SUPABASE_URL')
const target = new URL(supabaseUrl)
if (!new Set(['localhost', '127.0.0.1', '::1']).has(target.hostname)) {
  throw new Error('Demo credential bootstrap is restricted to a local Supabase target.')
}

const users = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    label: 'synthetic therapist',
    password: password('DEMO_THERAPIST_PASSWORD'),
  },
  {
    id: '30000000-0000-4000-8000-000000000001',
    label: 'synthetic Iris client',
    password: password('DEMO_IRIS_PASSWORD'),
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    label: 'synthetic Mika client',
    password: password('DEMO_MIKA_PASSWORD'),
  },
  {
    id: '30000000-0000-4000-8000-000000000003',
    label: 'synthetic Sol client',
    password: password('DEMO_SOL_PASSWORD'),
  },
] as const

const admin = createClient(supabaseUrl, required('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { autoRefreshToken: false, persistSession: false },
})

for (const user of users) {
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    password: user.password,
    email_confirm: true,
  })
  if (error) {
    throw new Error(`Could not update ${user.label}; run the SQL seed first.`)
  }
  // Deliberately never print the password or any service credential.
  console.info(`Updated local credentials for ${user.label}.`)
}
