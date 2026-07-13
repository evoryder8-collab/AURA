import { supabaseAuthOptions } from './client'

describe('Supabase browser auth configuration', () => {
  it('uses PKCE so auth codes do not collide with the HashRouter fragment', () => {
    expect(supabaseAuthOptions).toMatchObject({
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
    })
  })
})
