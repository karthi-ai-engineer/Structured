// Task repository (PLAN.md sections 7.3 and 12). Phase 1 reads plain one-off rows only:
// recurring series and their overrides arrive in Phase 3. Deletes are soft (`deleted_at`).
import { nowIso, type ISODate } from '@/core/dates'
import type { Task, TaskDraft, TaskPatch } from '@/core/tasks'
import { toDbErrorCode } from '@/data/errors'
import { draftToInsert, patchToUpdate, rowToTask } from '@/data/mappers'
import type { Db } from '@/data/supabase'

/** A failed database call, carrying a short code (never a server message). */
export class DataError extends Error {
  readonly code: string
  constructor(code: string) {
    super(`Database error: ${code}`)
    this.name = 'DataError'
    this.code = code
  }
}

function fail(status: number, error: { code?: string; message?: string }): never {
  throw new DataError(toDbErrorCode({ status, error }))
}

export interface TasksRepo {
  listDay(date: ISODate): Promise<Task[]>
  listInbox(): Promise<Task[]>
  create(id: string, draft: TaskDraft): Promise<Task>
  update(id: string, patch: TaskPatch): Promise<Task>
  remove(id: string): Promise<void>
}

export function createTasksRepo(db: Db): TasksRepo {
  const plain = () =>
    db
      .from('tasks')
      .select('*')
      .is('deleted_at', null)
      .is('repeat_rule', null)
      .is('series_id', null)

  return {
    async listDay(date) {
      const { data, error, status } = await plain().eq('date', date)
      if (error) fail(status, error)
      return data.map(rowToTask)
    },

    async listInbox() {
      const { data, error, status } = await plain()
        .is('date', null)
        .is('completed_at', null)
        .order('inbox_order')
        .order('created_at')
      if (error) fail(status, error)
      return data.map(rowToTask)
    },

    async create(id, draft) {
      const { data, error, status } = await db
        .from('tasks')
        .insert(draftToInsert(id, draft))
        .select('*')
        .single()
      if (error) fail(status, error)
      return rowToTask(data)
    },

    async update(id, patch) {
      const { data, error, status } = await db
        .from('tasks')
        .update(patchToUpdate(patch))
        .eq('id', id)
        .select('*')
        .single()
      if (error) fail(status, error)
      return rowToTask(data)
    },

    async remove(id) {
      const { error, status } = await db.from('tasks').update({ deleted_at: nowIso() }).eq('id', id)
      if (error) fail(status, error)
    },
  }
}
