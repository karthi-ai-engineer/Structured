// Focus sessions (PLAN.md F1, F2): one row per finished focus or break segment, for the stats in
// a later phase. `task_id` must be a real row: an occurrence of a recurring task logs its series.
import { parseOccurrenceId } from '@/core/series'
import { toDbErrorCode } from '@/data/errors'
import { DataError } from '@/data/repo/tasks'
import type { Db } from '@/data/supabase'

export interface FocusSessionInput {
  taskId: string | null
  kind: 'focus' | 'break'
  startedAt: string
  endedAt: string
  plannedMin: number
}

export interface FocusRepo {
  log(session: FocusSessionInput): Promise<void>
}

/** The row id behind a task id: the series for an occurrence, the id itself otherwise. */
export function rowIdOf(taskId: string | null): string | null {
  if (taskId === null) return null
  return parseOccurrenceId(taskId)?.seriesId ?? taskId
}

export function createFocusRepo(db: Db): FocusRepo {
  return {
    async log(session) {
      const { error, status } = await db.from('focus_sessions').insert({
        task_id: rowIdOf(session.taskId),
        kind: session.kind,
        started_at: session.startedAt,
        ended_at: session.endedAt,
        planned_min: session.plannedMin,
      })
      if (error) throw new DataError(toDbErrorCode({ status, error }))
    },
  }
}
