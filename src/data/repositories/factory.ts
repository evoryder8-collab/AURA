import type { SupabaseClient } from '@supabase/supabase-js'
import { env } from '@/config/env'
import { supabase } from '@/data/supabase/client'
import type { AuraRepositories, RepositoryMode } from './contracts'
import { createDemoRepositories, type DemoStorePort } from './demo'
import { repositoryError } from './errors'
import { createSupabaseRepositories } from './supabase'

export interface RepositoryFactoryOptions {
  readonly mode?: RepositoryMode
  readonly demoStore?: DemoStorePort
  readonly supabaseClient?: SupabaseClient | null
}

/** Selects one data implementation once; feature code can depend only on the contracts. */
export function createAuraRepositories(options: RepositoryFactoryOptions = {}): AuraRepositories {
  const mode = options.mode ?? env.mode
  if (mode === 'demo') return createDemoRepositories(options.demoStore)
  const connectedClient = options.supabaseClient === undefined ? supabase : options.supabaseClient
  if (!connectedClient) throw repositoryError('configuration', 'repositories.create')
  return createSupabaseRepositories(connectedClient)
}
