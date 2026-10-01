import { dayOfWeek, type ISODate } from '@/core/dates'
import {
  isValidUntil,
  presetOf,
  presetRule,
  validateRule,
  type RepeatPreset,
  type RepeatRule,
} from '@/core/recurrence'
import type { RepeatSpec } from '@/core/seriesEdits'
import type { Task } from '@/core/tasks'

/**
 * The editor's repeat settings. Until the user touches them, an existing series keeps its rule
 * exactly (so moving one occurrence to another weekday does not look like a new weekly rule).
 */
export interface RepeatState {
  touched: boolean
  preset: RepeatPreset
  custom: RepeatRule
  until: ISODate | null
  /** The series' own settings and first date, for an occurrence. */
  original: RepeatSpec | null
  originalStart: ISODate | null
}

export function initialRepeat(task: Task | null, start: ISODate): RepeatState {
  const r = task?.recurrence ?? null
  const original = r ? { rule: r.rule, until: r.until } : null
  return {
    touched: false,
    preset: r ? presetOf(r.rule, start) : 'never',
    custom: r?.rule ?? { freq: 'weekly', interval: 1, weekdays: [dayOfWeek(start)] },
    until: r?.until ?? null,
    original,
    originalStart: r?.start ?? null,
  }
}

/** The repeat settings to save, for a task (or new series) starting on `start`. */
export function repeatSpecOf(state: RepeatState, start: ISODate): RepeatSpec | null {
  if (!state.touched) return state.original
  if (state.preset === 'never') return null
  const rule = state.preset === 'custom' ? state.custom : presetRule(state.preset, start)
  return rule ? { rule, until: state.until } : null
}

export function repeatProblems(state: RepeatState, start: ISODate): string[] {
  const spec = repeatSpecOf(state, start)
  if (!state.touched || spec === null) return []
  const problems = validateRule(spec.rule)
  if (!isValidUntil(spec.until, start)) problems.push('The end date must be on or after the start')
  return problems
}
