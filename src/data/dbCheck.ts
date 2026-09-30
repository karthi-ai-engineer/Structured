// Binds the health check to the real client. The only data module the home page uses.
import { checkDatabase, singleflight, type DbStatus } from '@/data/health'
import { createSettingsStore } from '@/data/repo/settings'
import { supabase, supabaseEnv } from '@/data/supabase'

export interface DbCheckInput {
  timezone: string
  online: boolean
}

const store = supabase === null ? null : createSettingsStore(supabase)

/**
 * Starts a database check, or joins the one in flight (singleflight). Never rejects: even a
 * synchronous throw becomes an error state, so the page never shows a white screen.
 */
export const startDbCheck: (input: DbCheckInput) => Promise<DbStatus> = singleflight(
  async (input: DbCheckInput): Promise<DbStatus> => {
    try {
      return await checkDatabase({ env: supabaseEnv, store, ...input })
    } catch {
      return { state: 'error', code: 'unexpected' }
    }
  },
)
