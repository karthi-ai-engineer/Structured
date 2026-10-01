/**
 * What an edit or delete of a recurring occurrence writes, per scope (PLAN.md T12). Pure: the
 * data layer executes the returned plan.
 *
 * - `this`:   an override for this occurrence (or a cancelled one, for a delete).
 * - `future`: the series ends before this occurrence, and a new series starts here with the
 *             edited values (or a one-off task, when repeating was turned off). From the first
 *             occurrence it rewrites the whole series instead.
 * - `all`:    the edited fields (and the end date) for the whole series. Dates and rules never
 *             change retroactively: those edits are offered as `future` only, so the history
 *             before the edited occurrence stays as it was.
 *
 * Moving an occurrence by N days in a `future` edit moves the new series by N days too (weekly
 * rules shift their weekdays). Only fields the user actually changed reach occurrences that have
 * their own values; completed ones keep their completion.
 */

import { addDays, diffDays, type ISODate } from './dates.ts'
import { sameRule, shiftWeekdays, type RepeatRule } from './recurrence.ts'
import { applyPatch, type Subtask, type Task, type TaskDraft, type TaskPatch } from './tasks.ts'

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
  /**
   * The series row gets `patch` (and `repeat`, when given: null stops repeating). Overrides get
   * `shared`. `reset` drops the open overrides, because their dates no longer line up.
   */
  | {
      kind: 'series'
      seriesId: string
      patch: TaskPatch
      shared: TaskPatch
      reset: boolean
      repeat?: RepeatSpec | null
    }
  /** Ends the series before `from`; completed overrides move to `next`, shifted by `shift` days. */
  | { kind: 'split'; seriesId: string; from: ISODate; shift: number; next: NextTask | null }
  | { kind: 'remove-series'; seriesId: string }

/** The fields an edit carries over to occurrences that already have their own values. Dates,
 *  completion and subtask progress stay per occurrence. */
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

export interface EditChanges {
  /** The occurrence moved to another day. */
  date: boolean
  /** A new rule, or repeating turned off. */
  rule: boolean
  /** A new end date (same rule). */
  until: boolean
}

export function changesOf(task: Task, draft: TaskDraft, repeat: RepeatSpec | null): EditChanges {
  const r = recurrenceOf(task)
  return {
    date: draft.date !== task.date,
    rule: repeat === null || !sameRule(repeat.rule, r.rule),
    until: repeat !== null && repeat.until !== r.until,
  }
}

/** The scopes the editor offers for saving `draft` / `repeat` on an occurrence. */
export function scopesFor(task: Task, draft: TaskDraft, repeat: RepeatSpec | null): EditScope[] {
  const c = changesOf(task, draft, repeat)
  if (c.rule || (c.date && c.until)) return ['future']
  if (c.date) return ['this', 'future']
  if (c.until) return ['all']
  return ['this', 'future', 'all']
}

/** Subtasks of a series template start undone in every occurrence. */
function template(draft: TaskDraft): TaskDraft {
  return { ...draft, subtasks: draft.subtasks.map((s) => ({ ...s, done: false })) }
}

const subtaskShape = (subtasks: readonly Subtask[]) =>
  JSON.stringify(subtasks.map((s) => [s.id, s.title]))

/** The fields the user changed: shared fields, plus the subtask list (as a template). */
export function changedFields(task: Task, draft: TaskDraft): TaskPatch {
  const out: Record<string, unknown> = {}
  for (const key of SHARED_FIELDS) if (draft[key] !== task[key]) out[key] = draft[key]
  if (subtaskShape(draft.subtasks) !== subtaskShape(task.subtasks)) {
    out.subtasks = template(draft).subtasks
  }
  return out
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

  const c = changesOf(task, draft, repeat)
  const changed = changedFields(task, draft)
  if (scope === 'all') {
    return {
      kind: 'series',
      seriesId: r.seriesId,
      patch: changed,
      shared: sharedPatch(changed),
      reset: false,
      ...(c.until && repeat ? { repeat } : {}),
    }
  }

  // This and future, with repeating turned off: this occurrence becomes a one-off task.
  if (repeat === null) {
    if (r.occurrenceDate <= r.start) {
      return {
        kind: 'series',
        seriesId: r.seriesId,
        patch: { ...draft, completedAt: task.completedAt },
        shared: {},
        reset: true,
        repeat: null,
      }
    }
    return {
      kind: 'split',
      seriesId: r.seriesId,
      from: r.occurrenceDate,
      shift: 0,
      next: { id: newId, draft, repeat: null, completedAt: task.completedAt },
    }
  }

  // A move by N days moves the new series by N days, counted from this occurrence's own slot.
  const shift = draft.date !== null && task.date !== null ? diffDays(draft.date, task.date) : 0
  const anchor = addDays(r.occurrenceDate, shift)
  const spec: RepeatSpec = {
    rule: c.rule ? repeat.rule : shiftWeekdays(repeat.rule, shift),
    until: repeat.until,
  }
  const from = anchor < r.occurrenceDate ? anchor : r.occurrenceDate
  if (from <= r.start) {
    // From the first occurrence: the whole series changes.
    const reset = c.rule || shift !== 0
    return {
      kind: 'series',
      seriesId: r.seriesId,
      patch: reset ? { ...template(draft), date: anchor } : changed,
      shared: reset ? {} : sharedPatch(changed),
      reset,
      ...(reset || c.until ? { repeat: spec } : {}),
    }
  }
  return {
    kind: 'split',
    seriesId: r.seriesId,
    from,
    shift,
    next: {
      id: newId,
      draft: { ...template(draft), date: anchor },
      repeat: spec,
      completedAt: null,
    },
  }
}

export function planDelete(task: Task, scope: EditScope): SeriesWrite {
  const r = recurrenceOf(task)
  if (scope === 'this') return { kind: 'cancel', task }
  if (scope === 'future' && r.occurrenceDate > r.start) {
    return { kind: 'split', seriesId: r.seriesId, from: r.occurrenceDate, shift: 0, next: null }
  }
  return { kind: 'remove-series', seriesId: r.seriesId }
}
