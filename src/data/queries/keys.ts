// TanStack Query keys. Every task list lives under ['tasks'], so one invalidation refreshes all.
import type { ISODate } from '@/core/dates'

export const taskKeys = {
  all: ['tasks'] as const,
  day: (date: ISODate) => ['tasks', 'day', date] as const,
  inbox: () => ['tasks', 'inbox'] as const,
}

export const settingsKey = ['settings'] as const

export type TaskListRef = { kind: 'day'; date: ISODate } | { kind: 'inbox' }

/** Which list a cached query key holds, or null for keys that are not task lists. */
export function listOfKey(key: readonly unknown[]): TaskListRef | null {
  if (key[0] !== 'tasks') return null
  if (key[1] === 'inbox') return { kind: 'inbox' }
  if (key[1] === 'day' && typeof key[2] === 'string') return { kind: 'day', date: key[2] }
  return null
}
