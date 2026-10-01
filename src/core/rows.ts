/**
 * Database row -> domain mapping shared by the app (src/data) and the MCP server (server/).
 * Structural types only: nothing here depends on Supabase, so plain Node can load it.
 */

import { isTime } from './dates.ts'
import { DEFAULT_TASK_COLOR, isTaskColor, parseSubtasks, type Task } from './tasks.ts'

/** The columns of a `tasks` row this mapping reads (a subset of the generated row type). */
export interface TaskRowShape {
  id: string
  title: string
  notes: string | null
  icon: string | null
  color: string
  subtasks: unknown
  date: string | null
  start_time: string | null
  duration_min: number
  is_all_day: boolean
  completed_at: string | null
  inbox_order: number
  created_at: string
  updated_at: string
}

/** 'HH:mm:ss' or 'HH:mm' to 'HH:mm'; null stays null. */
export function toHHmm(time: string | null): string | null {
  return time === null ? null : time.slice(0, 5)
}

/** A stored start time the timeline can use: 'HH:mm' in 00:00..23:59, otherwise null (the task
 *  then shows in the all-day row instead of crashing a render, e.g. Postgres '24:00:00'). */
export function toStartTime(time: string | null): string | null {
  const hhmm = toHHmm(time)
  return hhmm !== null && isTime(hhmm) ? hhmm : null
}

export function taskFromRow(row: TaskRowShape): Task {
  return {
    id: row.id,
    title: row.title,
    notes: row.notes,
    icon: row.icon,
    color: isTaskColor(row.color) ? row.color : DEFAULT_TASK_COLOR,
    subtasks: parseSubtasks(row.subtasks),
    date: row.date,
    startTime: toStartTime(row.start_time),
    durationMin: row.duration_min,
    isAllDay: row.is_all_day,
    completedAt: row.completed_at,
    inboxOrder: row.inbox_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    recurrence: null,
  }
}
