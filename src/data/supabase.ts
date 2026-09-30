// The typed Supabase client (docs/phases/phase-0/PLAN.md 6.3). Only src/data may import
// @supabase/* (ESLint); everything else goes through the repositories in src/data.
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/data/database.types'
import { readSupabaseEnv, type SupabaseEnv } from '@/data/env'

export type Db = SupabaseClient<Database>

export interface CreateDbOptions {
  /** Custom fetch (unit tests stub the network with it). */
  fetch?: typeof fetch
}

/** Single user, no login: no session is stored, refreshed or read from the URL. */
export function createDb(url: string, publishableKey: string, options: CreateDbOptions = {}): Db {
  return createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    ...(options.fetch ? { global: { fetch: options.fetch } } : {}),
  })
}

// Each variable is referenced by its full name, so Vite inlines exactly these two values.
export const supabaseEnv: SupabaseEnv = readSupabaseEnv({
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
})

/** `null` means "not configured" (a CI build or a clone without .env.local). */
export const supabase: Db | null = supabaseEnv.ok
  ? createDb(supabaseEnv.url, supabaseEnv.publishableKey)
  : null
