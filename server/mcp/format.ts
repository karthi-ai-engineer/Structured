// Tool result helpers and the compact task view Claude reads (PLAN.md section 10.3: a short human
// summary line followed by compact JSON).

import type { CallToolResult } from '@modelcontextprotocol/server'
import { isAllDayLike, taskEnd, type Task } from '../../src/core/tasks.ts'

export function ok(summary: string, data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: `${summary}\n${JSON.stringify(data)}` }] }
}

export function fail(message: string, data?: unknown): CallToolResult {
  const text = data === undefined ? message : `${message}\n${JSON.stringify(data)}`
  return { isError: true, content: [{ type: 'text', text }] }
}

export function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** A task as Claude sees it: only the fields that carry information. */
export function view(task: Task, warnings?: readonly string[]): Record<string, unknown> {
  const v: Record<string, unknown> = { id: task.id, title: task.title }
  if (task.date === null) {
    v.inbox = true
    v.duration_min = task.durationMin
  } else {
    v.date = task.date
    if (isAllDayLike(task)) {
      v.all_day = true
    } else {
      const end = taskEnd(task)
      v.start = task.startTime
      v.end = end?.time
      if (end && end.dayOffset > 0) v.ends_next_day = true
      v.duration_min = task.durationMin
    }
  }
  v.color = task.color
  if (task.icon) v.icon = task.icon
  if (task.completedAt) v.done = true
  if (task.subtasks.length > 0) v.subtasks = task.subtasks
  if (task.notes) v.notes = task.notes
  if (warnings && warnings.length > 0) v.warnings = warnings
  return v
}
