// Task repository (PLAN.md sections 7.3 and 12). Deletes are soft (`deleted_at`).
//
// Recurring tasks (src/core/series.ts): a series row holds the rule, override rows hold the
// occurrences that differ, and day lists expand both into occurrences. Writes for one
// occurrence upsert its override; "this and future" runs the `split_series` database function,
// so it is atomic.
import { addDays, nowIso, type ISODate } from '@/core/dates'
import { occurrencesIn } from '@/core/recurrence'
import { searchPattern } from '@/core/search'
import { formatRule } from '@/core/recurrence'
import {
  expandSeriesRows,
  generatedOccurrence,
  masterFromRow,
  missingSeriesIds,
} from '@/core/series'
import { sharedPatch, type NextTask, type RepeatSpec, type SeriesWrite } from '@/core/seriesEdits'
import type { Task, TaskDraft, TaskPatch } from '@/core/tasks'
import type { Json, TablesUpdate } from '@/data/database.types'
import { toDbErrorCode } from '@/data/errors'
import { draftToInsert, patchToUpdate, rowToTask, type TaskRow } from '@/data/mappers'
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
  listRange(from: ISODate, to: ISODate): Promise<Task[]>
  listInbox(): Promise<Task[]>
  /** Unfinished one-off tasks dated `since` up to the day before `before`, oldest first. */
  listOverdue(before: ISODate, since: ISODate): Promise<Task[]>
  /** A one-off task, or a new series when `repeat` is given. */
  create(id: string, draft: TaskDraft, repeat?: RepeatSpec | null): Promise<void>
  /** A one-off task; `repeat` turns it into a series. */
  update(id: string, patch: TaskPatch, repeat?: RepeatSpec | null): Promise<void>
  remove(id: string): Promise<void>
  /** Undoes a soft delete. */
  restore(id: string): Promise<void>
  /** Executes an edit or delete of a recurring occurrence (src/core/seriesEdits.ts). */
  applySeriesWrite(write: SeriesWrite): Promise<void>
  /**
   * Tasks whose title or notes contain `query` (PLAN.md T17): one-off tasks (newest date first,
   * inbox included) and, for repeating series, their next occurrence from `today` (or the last
   * one, for a series that has ended). The occurrence is the series template, without overrides.
   */
  search(query: string, today: ISODate): Promise<Task[]>
  /** Creates the default daily series once; true when this call created them. */
  seedDefaults(today: ISODate, rise: string, wind: string): Promise<boolean>
}

function repeatColumns(repeat: RepeatSpec | null): TablesUpdate<'tasks'> {
  return {
    repeat_rule: repeat ? formatRule(repeat.rule) : null,
    repeat_until: repeat?.until ?? null,
  }
}

/** The override row that stores one occurrence's own values. */
function overrideRow(task: Task, cancelled: boolean) {
  if (!task.recurrence) throw new DataError('not-an-occurrence')
  return {
    ...draftToInsert(undefined, task),
    completed_at: task.completedAt,
    series_id: task.recurrence.seriesId,
    occurrence_date: task.recurrence.occurrenceDate,
    is_cancelled: cancelled,
    deleted_at: null,
  }
}

function nextJson(next: NextTask) {
  return {
    ...draftToInsert(next.id, next.draft),
    ...repeatColumns(next.repeat),
    completed_at: next.completedAt,
  }
}

export function createTasksRepo(db: Db): TasksRepo {
  const live = () => db.from('tasks').select('*').is('deleted_at', null)
  const plain = () => live().is('repeat_rule', null).is('series_id', null)

  async function check(request: PromiseLike<{ error: unknown; status: number }>): Promise<void> {
    const { error, status } = await request
    if (error) fail(status, error)
  }

  /** Occurrences dated from..to: the series active then, plus overrides from or moved into it. */
  async function listOccurrences(from: ISODate, to: ISODate): Promise<Task[]> {
    const [series, overrides] = await Promise.all([
      live()
        .not('repeat_rule', 'is', null)
        .is('series_id', null)
        .lte('date', to)
        .or(`repeat_until.is.null,repeat_until.gte.${from}`),
      live()
        .not('series_id', 'is', null)
        .or(
          `and(occurrence_date.gte.${from},occurrence_date.lte.${to}),and(date.gte.${from},date.lte.${to})`,
        ),
    ])
    if (series.error) fail(series.status, series.error)
    if (overrides.error) fail(overrides.status, overrides.error)
    const rows: TaskRow[] = [...series.data, ...overrides.data]
    const missing = missingSeriesIds(rows)
    if (missing.length > 0) {
      const extra = await live().not('repeat_rule', 'is', null).in('id', missing)
      if (extra.error) fail(extra.status, extra.error)
      rows.push(...extra.data)
    }
    return expandSeriesRows(rows, from, to)
  }

  async function listRange(from: ISODate, to: ISODate): Promise<Task[]> {
    const [plainRows, occurrences] = await Promise.all([
      plain().gte('date', from).lte('date', to),
      listOccurrences(from, to),
    ])
    if (plainRows.error) fail(plainRows.status, plainRows.error)
    return [...plainRows.data.map(rowToTask), ...occurrences]
  }

  /** "All" (or a rewrite from the first occurrence): one transaction in `update_series`. */
  async function updateSeries(write: Extract<SeriesWrite, { kind: 'series' }>) {
    const patch: TablesUpdate<'tasks'> = patchToUpdate(write.patch)
    if (write.repeat !== undefined) Object.assign(patch, repeatColumns(write.repeat))
    // Only a series that stops repeating (becoming one task) keeps a completion.
    if (write.repeat !== null) delete patch.completed_at
    await check(
      db.rpc('update_series', {
        p_series_id: write.seriesId,
        p_patch: patch as Json,
        p_shared: patchToUpdate(sharedPatch(write.shared)) as Json,
        p_reset: write.reset,
      }),
    )
  }

  return {
    listDay: (date) => listRange(date, date),
    listRange,

    async listOverdue(before, since) {
      const { data, error, status } = await plain()
        .gte('date', since)
        .lt('date', before)
        .is('completed_at', null)
        .order('date')
        .order('start_time')
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

    async create(id, draft, repeat = null) {
      // A series is a template: its subtasks start undone in every occurrence.
      const subtasks = repeat ? draft.subtasks.map((s) => ({ ...s, done: false })) : draft.subtasks
      await check(
        db
          .from('tasks')
          .insert({ ...draftToInsert(id, { ...draft, subtasks }), ...repeatColumns(repeat) }),
      )
    },

    async update(id, patch, repeat) {
      const update: TablesUpdate<'tasks'> = patchToUpdate(patch)
      if (repeat) Object.assign(update, repeatColumns(repeat), { completed_at: null })
      await check(db.from('tasks').update(update).eq('id', id))
    },

    async remove(id) {
      await check(db.from('tasks').update({ deleted_at: nowIso() }).eq('id', id))
    },

    async restore(id) {
      await check(db.from('tasks').update({ deleted_at: null }).eq('id', id))
    },

    async applySeriesWrite(write) {
      switch (write.kind) {
        case 'occurrence':
        case 'cancel':
          await check(
            db.from('tasks').upsert(overrideRow(write.task, write.kind === 'cancel'), {
              onConflict: 'series_id,occurrence_date',
            }),
          )
          return
        case 'series':
          await updateSeries(write)
          return
        case 'split':
          await check(
            db.rpc('split_series', {
              p_series_id: write.seriesId,
              p_from: write.from,
              ...(write.keep ? { p_keep: write.keep } : {}),
              ...(write.next ? { p_new: nextJson(write.next) } : {}),
            }),
          )
          return
        case 'remove-series':
          await check(
            db
              .from('tasks')
              .update({ deleted_at: nowIso() })
              .or(`id.eq.${write.seriesId},series_id.eq.${write.seriesId}`)
              .is('deleted_at', null),
          )
          return
      }
    },

    async search(query, today) {
      const pattern = searchPattern(query)
      if (pattern === null) return []
      const match = `title.ilike.${pattern},notes.ilike.${pattern}`
      const [found, series] = await Promise.all([
        plain().or(match).order('date', { ascending: false, nullsFirst: true }).limit(50),
        live().not('repeat_rule', 'is', null).is('series_id', null).or(match).limit(20),
      ])
      if (found.error) fail(found.status, found.error)
      if (series.error) fail(series.status, series.error)
      const next = series.data.flatMap((row) => {
        const master = masterFromRow(row)
        if (!master) return []
        const start = master.task.date
        const from = today > start ? today : start
        const [upcoming] = occurrencesIn(master.rule, start, master.until, from, addDays(from, 400))
        // Ended (or rarer than every 400 days): its last occurrence before today, else its first.
        const before = occurrencesIn(
          master.rule,
          start,
          master.until,
          addDays(from, -400),
          addDays(from, -1),
        )
        const date = upcoming ?? before.at(-1) ?? start
        return [generatedOccurrence(master, date)]
      })
      return [...next, ...found.data.map(rowToTask)]
    },

    async seedDefaults(today, rise, wind) {
      const { data, error, status } = await db.rpc('seed_default_tasks', {
        p_today: today,
        p_rise: rise,
        p_wind: wind,
      })
      if (error) fail(status, error)
      return data
    },
  }
}
