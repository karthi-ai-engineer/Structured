// Reads and updates the single settings row (id 1) for the app. The Phase 0 health check
// (repo/settings.ts) creates the row on first load, so a missing row here is an error.
import type { Settings, SettingsPatch } from '@/core/settings'
import { toDbErrorCode } from '@/data/errors'
import { rowToSettings, settingsPatchToUpdate } from '@/data/mappers'
import { DataError } from '@/data/repo/tasks'
import type { Db } from '@/data/supabase'

const SETTINGS_ID = 1

export interface AppSettingsRepo {
  get(): Promise<Settings | null>
  update(patch: SettingsPatch): Promise<Settings>
}

export function createAppSettingsRepo(db: Db): AppSettingsRepo {
  return {
    async get() {
      const { data, error, status } = await db
        .from('settings')
        .select('*')
        .eq('id', SETTINGS_ID)
        .maybeSingle()
      if (error) throw new DataError(toDbErrorCode({ status, error }))
      return data ? rowToSettings(data) : null
    },

    async update(patch) {
      const { data, error, status } = await db
        .from('settings')
        .update(settingsPatchToUpdate(patch))
        .eq('id', SETTINGS_ID)
        .select('*')
        .single()
      if (error) throw new DataError(toDbErrorCode({ status, error }))
      return rowToSettings(data)
    },
  }
}
