// Maps database rows to the domain types in src/core and back (PLAN.md section 7).
// Postgres `time` columns come back as 'HH:mm:ss'; the app uses 'HH:mm'.
import type { Tables, TablesInsert, TablesUpdate } from '@/data/database.types'
import { isValidTimeZone } from '@/core/dates'
import { toAlerts } from '@/core/alerts'
import { taskFromRow, toStartTime } from '@/core/rows'
import { detectTimeZone } from '@/platform/timezone'
import type { Task, TaskDraft, TaskPatch } from '@/core/tasks'
import { toSafeWeekStart, toTheme, toTimeFormat } from '@/core/settings'
import type { Settings, SettingsPatch } from '@/core/settings'
import type { Json } from '@/data/database.types'

export type TaskRow = Tables<'tasks'>
export type SettingsRow = Tables<'settings'>

export { toHHmm, toStartTime } from '@/core/rows'

/** A stored zone the date helpers accept, kept as spelled (Intl would rename 'Asia/Kolkata' to
 *  'Asia/Calcutta' on some runtimes); anything unusable falls back to the device's zone. */
export function toSafeTimeZone(zone: string): string {
  return isValidTimeZone(zone) ? zone : detectTimeZone()
}

/** Row -> task, shared with the MCP server (src/core/rows.ts). */
export function rowToTask(row: TaskRow): Task {
  return taskFromRow(row)
}

function subtasksJson(subtasks: TaskDraft['subtasks']): Json {
  return subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done }))
}

/** The insert row for a draft; without an `id` the database generates one. */
export function draftToInsert(id: string | undefined, draft: TaskDraft): TablesInsert<'tasks'> {
  return {
    ...(id === undefined ? {} : { id }),
    title: draft.title,
    notes: draft.notes,
    icon: draft.icon,
    color: draft.color,
    subtasks: subtasksJson(draft.subtasks),
    date: draft.date,
    start_time: draft.startTime,
    duration_min: draft.durationMin,
    is_all_day: draft.isAllDay,
    energy: draft.energy,
    alerts: draft.alerts,
    priority: draft.priority,
    due_date: draft.dueDate,
    source: 'app',
  }
}

export function patchToUpdate(patch: TaskPatch): TablesUpdate<'tasks'> {
  const update: TablesUpdate<'tasks'> = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.notes !== undefined) update.notes = patch.notes
  if (patch.icon !== undefined) update.icon = patch.icon
  if (patch.color !== undefined) update.color = patch.color
  if (patch.subtasks !== undefined) update.subtasks = subtasksJson(patch.subtasks)
  if (patch.date !== undefined) update.date = patch.date
  if (patch.startTime !== undefined) update.start_time = patch.startTime
  if (patch.durationMin !== undefined) update.duration_min = patch.durationMin
  if (patch.isAllDay !== undefined) update.is_all_day = patch.isAllDay
  if (patch.energy !== undefined) update.energy = patch.energy
  if (patch.alerts !== undefined) update.alerts = patch.alerts
  if (patch.priority !== undefined) update.priority = patch.priority
  if (patch.dueDate !== undefined) update.due_date = patch.dueDate
  if (patch.completedAt !== undefined) update.completed_at = patch.completedAt
  return update
}

export function rowToSettings(row: SettingsRow): Settings {
  return {
    timezone: toSafeTimeZone(row.timezone),
    timeFormat: toTimeFormat(row.time_format),
    weekStart: toSafeWeekStart(row.week_start),
    dayStart: toStartTime(row.day_start) ?? '07:00',
    dayEnd: toStartTime(row.day_end) ?? '22:00',
    defaultDuration: row.default_duration,
    theme: toTheme(row.theme),
    energyEnabled: row.energy_enabled,
    energyLimit: row.energy_limit,
    focusMinutes: row.focus_minutes,
    breakMinutes: row.break_minutes,
    defaultAlerts: toAlerts(row.default_alerts) ?? [0],
    updatedAt: row.updated_at,
  }
}

export function settingsPatchToUpdate(patch: SettingsPatch): TablesUpdate<'settings'> {
  const update: TablesUpdate<'settings'> = {}
  if (patch.timezone !== undefined) update.timezone = patch.timezone
  if (patch.timeFormat !== undefined) update.time_format = patch.timeFormat
  if (patch.weekStart !== undefined) update.week_start = patch.weekStart
  if (patch.dayStart !== undefined) update.day_start = patch.dayStart
  if (patch.dayEnd !== undefined) update.day_end = patch.dayEnd
  if (patch.defaultDuration !== undefined) update.default_duration = patch.defaultDuration
  if (patch.theme !== undefined) update.theme = patch.theme
  if (patch.energyEnabled !== undefined) update.energy_enabled = patch.energyEnabled
  if (patch.energyLimit !== undefined) update.energy_limit = patch.energyLimit
  if (patch.focusMinutes !== undefined) update.focus_minutes = patch.focusMinutes
  if (patch.breakMinutes !== undefined) update.break_minutes = patch.breakMinutes
  if (patch.defaultAlerts !== undefined) update.default_alerts = patch.defaultAlerts
  return update
}
