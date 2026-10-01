/**
 * Recurring series as the timeline sees them (PLAN.md T12).
 *
 * Storage, in the `tasks` table:
 * - A **series** row has a `repeat_rule`. Its `date` is the first occurrence and its fields are
 *   the template for every occurrence (subtasks start undone, nothing starts completed).
 * - An **override** row (`series_id` + `occurrence_date`) replaces one occurrence: it is a full
 *   copy with that occurrence's own values (moved, renamed, completed, or `is_cancelled`).
 * - Occurrences themselves are never stored. Their id is `<seriesId>:<occurrenceDate>`, which
 *   stays the same when the occurrence is moved to another day.
 */

import { isISODate, type ISODate } from './dates.ts'
import { occurrencesIn, parseRule, type RepeatRule } from './recurrence.ts'
import { taskFromRow, type TaskRowShape } from './rows.ts'
import type { Recurrence, Task } from './tasks.ts'

export interface SeriesMaster {
  /** The series row; `task.date` is the first occurrence. */
  task: Task & { date: ISODate }
  rule: RepeatRule
  until: ISODate | null
}

export interface SeriesOverride {
  task: Task
  seriesId: string
  occurrenceDate: ISODate
  cancelled: boolean
}

/** The columns that tell plain tasks, series and overrides apart. */
export interface SeriesRowShape extends TaskRowShape {
  repeat_rule: string | null
  repeat_until: string | null
  series_id: string | null
  occurrence_date: string | null
  is_cancelled: boolean
}

export function occurrenceId(seriesId: string, date: ISODate): string {
  return `${seriesId}:${date}`
}

const OCCURRENCE_ID = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}):(.+)$/i

/** The series and date in an occurrence id, or null for any other id. */
export function parseOccurrenceId(id: string): { seriesId: string; date: ISODate } | null {
  const match = OCCURRENCE_ID.exec(id)
  if (!match?.[1] || !match[2] || !isISODate(match[2])) return null
  return { seriesId: match[1], date: match[2] }
}

/** A series row, or null when it has no start date or a rule this app cannot read. */
export function masterFromRow(row: SeriesRowShape): SeriesMaster | null {
  const rule = parseRule(row.repeat_rule)
  const task = taskFromRow(row)
  if (rule === null || task.date === null || row.series_id !== null) return null
  const until = row.repeat_until !== null && isISODate(row.repeat_until) ? row.repeat_until : null
  return { task: { ...task, date: task.date }, rule, until }
}

export function overrideFromRow(row: SeriesRowShape): SeriesOverride | null {
  if (row.series_id === null || row.occurrence_date === null) return null
  return {
    task: taskFromRow(row),
    seriesId: row.series_id,
    occurrenceDate: row.occurrence_date,
    cancelled: row.is_cancelled,
  }
}

function recurrenceOf(master: SeriesMaster, occurrenceDate: ISODate): Recurrence {
  return {
    seriesId: master.task.id,
    occurrenceDate,
    rule: master.rule,
    start: master.task.date,
    until: master.until,
  }
}

/** One occurrence as the series template produces it. */
export function generatedOccurrence(master: SeriesMaster, date: ISODate): Task {
  return {
    ...master.task,
    id: occurrenceId(master.task.id, date),
    date,
    completedAt: null,
    subtasks: master.task.subtasks.map((s) => ({ ...s, done: false })),
    recurrence: recurrenceOf(master, date),
  }
}

/**
 * The occurrences dated `from`..`to` (inclusive). An override replaces its occurrence: it shows
 * on its own date (possibly another day, possibly outside the range) unless it is cancelled.
 * Overrides whose series is missing (deleted) are dropped.
 */
export function expandSeries(
  masters: readonly SeriesMaster[],
  overrides: readonly SeriesOverride[],
  from: ISODate,
  to: ISODate,
): Task[] {
  const replaced = new Set(overrides.map((o) => occurrenceId(o.seriesId, o.occurrenceDate)))
  const byId = new Map(masters.map((m) => [m.task.id, m]))
  const out: Task[] = []
  for (const master of masters) {
    for (const date of occurrencesIn(master.rule, master.task.date, master.until, from, to)) {
      if (!replaced.has(occurrenceId(master.task.id, date))) {
        out.push(generatedOccurrence(master, date))
      }
    }
  }
  for (const o of overrides) {
    const master = byId.get(o.seriesId)
    const date = o.task.date
    if (!master || o.cancelled || date === null || date < from || date > to) continue
    out.push({
      ...o.task,
      id: occurrenceId(o.seriesId, o.occurrenceDate),
      recurrence: recurrenceOf(master, o.occurrenceDate),
    })
  }
  return out
}

/** Splits fetched series and override rows and expands them over `from`..`to`. */
export function expandSeriesRows(
  rows: readonly SeriesRowShape[],
  from: ISODate,
  to: ISODate,
): Task[] {
  const masters: SeriesMaster[] = []
  const overrides: SeriesOverride[] = []
  for (const row of rows) {
    if (row.series_id !== null) {
      const o = overrideFromRow(row)
      if (o) overrides.push(o)
    } else {
      const m = masterFromRow(row)
      if (m) masters.push(m)
    }
  }
  return expandSeries(masters, overrides, from, to)
}

/** The series ids that overrides refer to but that are not among the fetched series rows. */
export function missingSeriesIds(rows: readonly SeriesRowShape[]): string[] {
  const have = new Set(rows.filter((r) => r.series_id === null).map((r) => r.id))
  return [...new Set(rows.flatMap((r) => (r.series_id !== null ? [r.series_id] : [])))].filter(
    (id) => !have.has(id),
  )
}
