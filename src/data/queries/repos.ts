// The app's repository instances. `null` Supabase (no .env.local) makes every call fail with
// the 'not-configured' code, which the UI shows as a banner instead of crashing.
import { createAppSettingsRepo, type AppSettingsRepo } from '@/data/repo/appSettings'
import { createTasksRepo, DataError, type TasksRepo } from '@/data/repo/tasks'
import { supabase } from '@/data/supabase'

const tasksRepo = supabase ? createTasksRepo(supabase) : null
const settingsRepo = supabase ? createAppSettingsRepo(supabase) : null

export const isDbConfigured = supabase !== null

export function tasks(): TasksRepo {
  if (!tasksRepo) throw new DataError('not-configured')
  return tasksRepo
}

export function settings(): AppSettingsRepo {
  if (!settingsRepo) throw new DataError('not-configured')
  return settingsRepo
}
