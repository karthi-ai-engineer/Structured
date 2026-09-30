// The settings repository used by the health check (docs/phases/phase-0/PLAN.md 6.4).
//
// Every call takes the caller's AbortSignal and turns supabase-js retries off: the caller owns
// one deadline for the whole check, and supabase-js would otherwise retry a failed GET for up to
// 7 s. Nothing here throws, and no server message, detail or hint is returned (codes only).
import { toDbErrorCode, type DbErrorCode } from '@/data/errors'
import type { Db } from '@/data/supabase'

export type DbResult<T> = { ok: true; value: T } | { ok: false; code: DbErrorCode }

export interface SettingsStore {
  /** The id of the single settings row (always 1), or null when the row does not exist. */
  readSettingsId(signal: AbortSignal): Promise<DbResult<number | null>>
  /** Inserts `{ id: 1, timezone }`. `exists` means another tab or device created it first. */
  insertDefaultSettings(
    timezone: string,
    signal: AbortSignal,
  ): Promise<DbResult<'inserted' | 'exists'>>
}

const SETTINGS_ID = 1
const UNIQUE_VIOLATION = '23505'

export function createSettingsStore(db: Db): SettingsStore {
  return {
    async readSettingsId(signal) {
      try {
        const { data, error, status } = await db
          .from('settings')
          .select('id')
          .eq('id', SETTINGS_ID)
          .abortSignal(signal)
          .retry(false)
          .maybeSingle()
        if (error) return { ok: false, code: toDbErrorCode({ status, error }) }
        return { ok: true, value: data?.id ?? null }
      } catch {
        return { ok: false, code: 'unexpected' }
      }
    },

    async insertDefaultSettings(timezone, signal) {
      try {
        const { error, status } = await db
          .from('settings')
          .insert({ id: SETTINGS_ID, timezone })
          .abortSignal(signal)
          .retry(false)
        if (!error) return { ok: true, value: 'inserted' }
        if (error.code === UNIQUE_VIOLATION) return { ok: true, value: 'exists' }
        return { ok: false, code: toDbErrorCode({ status, error }) }
      } catch {
        return { ok: false, code: 'unexpected' }
      }
    },
  }
}
