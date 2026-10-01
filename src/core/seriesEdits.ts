/**
 * What an edit or delete of a recurring occurrence writes, per scope (PLAN.md T12). Pure: the
 * data layer executes the returned plan.
 *
 * - `this`:   an override for this occurrence (or a cancelled one, for a delete).
 * - `future`: the series ends the day before, and the edited values start a new series (or a
 *             one-off task when repeating was turned off). From the first occurrence it is `all`.
 * - `all`:    the series template changes; edits of shared fields reach existing overrides too,
 *             and a date change shifts the whole series by the same number of days.
 */

import { addDays, diffDays, type ISODate } from './dates.ts'
import { sameRule, type RepeatRule } from './recurrence.ts'
import { applyPatch, type Task, type TaskDraft, type TaskPatch } from './tasks.ts'

export type EditScope = 'this' | 'future' | 'all'

export interface RepeatSpec {
  rule: RepeatRule
  until: ISODate | null
}

/** The task that continues after a split: a new series (with `repeat`) or a one-off task. */
export interface NextTask {
  id: string
  draft: TaskDraft
  repeat: RepeatSpec | null
  completedAt: string | null
}

export type SeriesWrite =
  | { kind: 'occurrence'; task: Task }
  | { kind: 'cancel'; task: Task }
  /** `repeat`: undefined keeps the rule, null stops repeating (the series becomes one task). */
  | { kind: 'series'; seriesId: string; patch: TaskPatch; repeat?: RepeatSpec | null }
  | { kind: 'split'; seriesId: string; from: ISODate; next: NextTask | null }
  | { kind: 'remove-series'; seriesId: string }

/** The fields an "all" or "future" edit carries over to occurrences that already have their
 *  own values. Dates, completion and subtask progress stay per occurrence. */
export const SHARED_FIELDS = [
  'title',
  'notes',
  'icon',
  'color',
  'startTime',
  'durationMin',
  'isAllDay',
] as const satisfies readonly (keyof TaskDraft)[]

export function sharedPatch(patch: TaskPatch): TaskPatch {
  const out: Record<string, unknown> = {}
  for (const key of SHARED_FIELDS) if (patch[key] !== undefined) out[key] = patch[key]
  return out
}

function recurrenceOf(task: Task) {
  if (!task.recurrence) throw new Error('Not an occurrence of a recurring task')
  return task.recurrence
}

/** Whether the repeat settings differ from the occurrence's series. */
export function repeatChanged(task: Task, repeat: RepeatSpec | null): boolean {
  const r = recurrenceOf(task)
  return !sameRule(repeat?.rule ?? null, r.rule) || (repeat !== null && repeat.until !== r.until)
}

/** The scopes the editor offers for saving `draft` / `repeat` on an occurrence. */
export function scopesFor(task: Task, repeat: RepeatSpec | null): EditScope[] {
  if (!repeatChanged(task, repeat)) return ['this', 'future', 'all']
  // A rule change cannot apply to one occurrence; stopping the repeat applies from here on.
  return repeat === null ? ['future'] : ['future', 'all']
}

/** Subtasks of a series template start undone in every occurrence. */
function template(draft: TaskDraft): TaskDraft {
  return { ...draft, subtasks: draft.subtasks.map((s) => ({ ...s, done: false })) }
}

export function planEdit(
  task: Task,
  draft: TaskDraft,
  repeat: RepeatSpec | null,
  scope: EditScope,
  newId: string,
): SeriesWrite {
  const r = recurrenceOf(task)
  if (scope === 'this') return { kind: 'occurrence', task: applyPatch(task, draft) }

  if (scope === 'future') {
    const from =
      draft.date !== null && draft.date < r.occurrenceDate ? draft.date : r.occurrenceDate
    if (from > r.start) {
      return {
        kind: 'split',
        seriesId: r.seriesId,
        from,
        next: {
          id: newId,
          draft: repeat ? template(draft) : draft,
          repeat,
          completedAt: repeat ? null : task.completedAt,
        },
      }
    }
  }

  // "All" (or "future" from the first occurrence).
  const changed = repeatChanged(task, repeat)
  if (repeat === null) {
    return {
      kind: 'series',
      seriesId: r.seriesId,
      patch: { ...draft, completedAt: task.completedAt },
      repeat: null,
    }
  }
  const start =
    draft.date === null ? r.start : addDays(r.start, diffDays(draft.date, r.occurrenceDate))
  return {
    kind: 'series',
    seriesId: r.seriesId,
    patch: { ...template(draft), date: start },
    ...(changed ? { repeat } : {}),
  }
}

export function planDelete(task: Task, scope: EditScope): SeriesWrite {
  const r = recurrenceOf(task)
  if (scope === 'this') return { kind: 'cancel', task }
  if (scope === 'future' && r.occurrenceDate > r.start) {
    return { kind: 'split', seriesId: r.seriesId, from: r.occurrenceDate, next: null }
  }
  return { kind: 'remove-series', seriesId: r.seriesId }
}
