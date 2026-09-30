// Maps database rows to the domain types in src/core and back (PLAN.md section 7).
// Postgres `time` columns come back as 'HH:mm:ss'; the app uses 'HH:mm'.
import type { Tables, TablesInsert, TablesUpdate } from '@/data/database.types'
import { DEFAULT_TASK_COLOR, isTaskColor, parseSubtasks } from '@/core/tasks'
import type { Task, TaskDraft, TaskPatch } from '@/core/tasks'
import { toSafeWeekStart, toTheme, toTimeFormat } from '@/core/settings'
import type { Settings, SettingsPatch } from '@/core/settings'
import type { Json } from '@/data/database.types'

export type TaskRow = Tables<'tasks'>
export type SettingsRow = Tables<'settings'>

/** 'HH:mm:ss' or 'HH:mm' to 'HH:mm'; null stays null. */
export function toHHmm(time: string | null): string | null {
  return time === null ? null : time.slice(0, 5)
}

export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    icon: row.icon,
    color: isTaskColor(row.color) ? row.color : DEFAULT_TASK_COLOR,
    subtasks: parseSubtasks(row.subtasks),
    date: row.date,
    startTime: toHHmm(row.start_time),
    durationMin: row.duration_min,
    isAllDay: row.is_all_day,
    completedAt: row.completed_at,
    inboxOrder: row.inbox_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function subtasksJson(subtasks: TaskDraft['subtasks']): Json {
  return subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done }))
}

export function draftToInsert(id: string, draft: TaskDraft): TablesInsert<'tasks'> {
  return {
    id,
    title: draft.title,
    notes: draft.notes,
    icon: draft.icon,
    color: draft.color,
    subtasks: subtasksJson(draft.subtasks),
    date: draft.date,
    start_time: draft.startTime,
    duration_min: draft.durationMin,
    is_all_day: draft.isAllDay,
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
  if (patch.completedAt !== undefined) update.completed_at = patch.completedAt
  return update
}

export function rowToSettings(row: SettingsRow): Settings {
  return {
    timezone: row.timezone,
    timeFormat: toTimeFormat(row.time_format),
    weekStart: toSafeWeekStart(row.week_start),
    dayStart: toHHmm(row.day_start) ?? '07:00',
    dayEnd: toHHmm(row.day_end) ?? '22:00',
    defaultDuration: row.default_duration,
    theme: toTheme(row.theme),
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
  return update
}
