/**
 * What an edit or delete of a recurring occurrence writes, per scope (PLAN.md T12). Pure: the
 * data layer executes the returned plan.
 *
 * - `this`:   an override for this occurrence (or a cancelled one, for a delete).
 * - `future`: the series ends before this occurrence, and a new series continues with the edited
 *             values (or a one-off task, when repeating was turned off). From the first
 *             occurrence it rewrites the whole series instead.
 * - `all`:    the edited fields (and the end date) for the whole series.
 *
 * Rules that keep history and dates unambiguous:
 * - A rule change applies from here on (`future`), starting on the date the user picked.
 * - Moving an occurrence of a daily, monthly or yearly series can also move the series from here
 *   on: their days follow the start date. A weekly series lists its weekdays, so moving one of
 *   its occurrences is `this` only; moving the series is a rule change ("every week on
 *   Tuesday").
 * - A new day and a new end date in one save are refused: save them one at a time.
 * - Only fields the user actually changed reach occurrences that have their own values.
 * - Completed occurrences stay completed. A split moves them to the new series, along with this
 *   occurrence's own changes (so a moved occurrence stays where it was put).
 */

import type { ISODate } from './dates.ts'
import { dayOfMonth, sameRule, type RepeatRule } from './recurrence.ts'
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
  /**
   * Ends the series before `from` and continues with `next`. Completed overrides from `from` on,
   * and the override of the occurrence on `keep`, move to `next` (a new series) with its values.
   */
  | {
      kind: 'split'
      seriesId: string
      from: ISODate
      keep: ISODate | null
      next: NextTask | null
    }
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
  'energy',
  'alerts',
  'priority',
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
/** Whether the series' days follow its start date (so moving the start moves them). */
function followsStart(rule: RepeatRule): boolean {
  return rule.freq !== 'weekly'
}

/** The scopes the editor offers for saving `draft` / `repeat` on an occurrence. Empty means
 *  the change cannot be saved in one go (a new day and a new end date). */
export function scopesFor(task: Task, draft: TaskDraft, repeat: RepeatSpec | null): EditScope[] {
  const c = changesOf(task, draft, repeat)
  if (c.rule) return ['future']
  if (c.date && c.until) return []
  if (c.date) return followsStart(recurrenceOf(task).rule) ? ['this', 'future'] : ['this']
  if (c.until) return ['all']
  return ['this', 'future', 'all']
}

/** Subtasks of a series template start undone in every occurrence. */
function template(draft: TaskDraft): TaskDraft {
  return { ...draft, subtasks: draft.subtasks.map((s) => ({ ...s, done: false })) }
}

const subtaskShape = (subtasks: readonly Subtask[]) =>
  JSON.stringify(subtasks.map((s) => [s.id, s.title]))

/** The fields the user changed: shared fields, the due date (series row only), and the subtask
 *  list (as a template). */
export function changedFields(task: Task, draft: TaskDraft): TaskPatch {
  const out: Record<string, unknown> = {}
  if (draft.dueDate !== task.dueDate) out.dueDate = draft.dueDate
  for (const key of SHARED_FIELDS) {
    if (JSON.stringify(draft[key]) !== JSON.stringify(task[key])) out[key] = draft[key]
  }
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
  if (!scopesFor(task, draft, repeat).includes(scope)) {
    throw new Error(`"${scope}" is not offered for this change`)
  }
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
      keep: null,
      next: { id: newId, draft, repeat: null, completedAt: task.completedAt },
    }
  }

  // A new series: on the date the user picked (a new rule, or a series that follows its start),
  // or on this occurrence's own slot, so the pattern continues.
  const start = c.date && draft.date !== null ? draft.date : r.occurrenceDate
  const from = start < r.occurrenceDate ? start : r.occurrenceDate
  if (from <= r.start) {
    // From the first occurrence: the whole series changes.
    const reset = c.rule || c.date
    return {
      kind: 'series',
      seriesId: r.seriesId,
      patch: reset ? { ...template(draft), date: start } : changed,
      shared: reset ? {} : sharedPatch(changed),
      reset,
      ...(reset ? { repeat } : {}),
    }
  }
  return {
    kind: 'split',
    seriesId: r.seriesId,
    from,
    keep: c.date ? null : r.occurrenceDate,
    next: {
      id: newId,
      draft: { ...template(draft), date: start },
      repeat: c.date || c.rule ? repeat : keepMonthDay(repeat, r.start, start),
      completedAt: null,
    },
  }
}

/** A monthly or yearly series continued from `start` keeps the day of the month it had from
 *  `seriesStart` (from Feb 28, a series on the 31st stays on the 31st). */
function keepMonthDay(repeat: RepeatSpec, seriesStart: ISODate, start: ISODate): RepeatSpec {
  const { rule } = repeat
  if (rule.freq !== 'monthly' && rule.freq !== 'yearly') return repeat
  const day = dayOfMonth(rule, seriesStart)
  return day === dayOfMonth({ ...rule, monthDay: undefined }, start)
    ? repeat
    : { ...repeat, rule: { ...rule, monthDay: day } }
}

export function planDelete(task: Task, scope: EditScope): SeriesWrite {
  const r = recurrenceOf(task)
  if (scope === 'this') return { kind: 'cancel', task }
  if (scope === 'future' && r.occurrenceDate > r.start) {
    return { kind: 'split', seriesId: r.seriesId, from: r.occurrenceDate, keep: null, next: null }
  }
  return { kind: 'remove-series', seriesId: r.seriesId }
}
