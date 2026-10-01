// TanStack Query keys. Every task list lives under ['tasks'], so one invalidation refreshes all.
import { OVERDUE_DAYS } from '@/core/calendar'
import { addDays, isISODate, type ISODate } from '@/core/dates'
import type { TaskList } from '@/core/tasks'

export const taskKeys = {
  all: ['tasks'] as const,
  day: (date: ISODate) => ['tasks', 'day', date] as const,
  range: (from: ISODate, to: ISODate) => ['tasks', 'range', from, to] as const,
  inbox: () => ['tasks', 'inbox'] as const,
  /** Unfinished one-off tasks from the OVERDUE_DAYS before `today`. */
  overdue: (today: ISODate) => ['tasks', 'overdue', today] as const,
}

export const settingsKey = ['settings'] as const

/** Mutation keys: they let a settling write (or a realtime echo) see whether other writes of
 *  the same kind are still in flight, and refetch only once the last one has settled. */
export const taskMutationKey = ['tasks'] as const
export const settingsMutationKey = ['settings'] as const

export type TaskListRef = TaskList

const isDate = (value: unknown): value is ISODate => typeof value === 'string' && isISODate(value)

/** Which list a cached query key holds, or null for keys that are not task lists. */
export function listOfKey(key: readonly unknown[]): TaskListRef | null {
  if (key[0] !== 'tasks') return null
  if (key[1] === 'inbox') return { kind: 'inbox' }
  if (key[1] === 'day' && isDate(key[2])) return { kind: 'day', date: key[2] }
  if (key[1] === 'range' && isDate(key[2]) && isDate(key[3])) {
    return { kind: 'range', from: key[2], to: key[3] }
  }
  if (key[1] === 'overdue' && isDate(key[2])) {
    return { kind: 'overdue', since: addDays(key[2], -OVERDUE_DAYS), before: key[2] }
  }
  return null
}

/** The dates a cached list covers (for adding new occurrences), or none for undated lists. */
export function datesOfList(list: TaskListRef): ISODate[] {
  if (list.kind === 'day') return [list.date]
  if (list.kind !== 'range') return []
  const dates: ISODate[] = []
  for (let d = list.from; d <= list.to; d = addDays(d, 1)) dates.push(d)
  return dates
}
