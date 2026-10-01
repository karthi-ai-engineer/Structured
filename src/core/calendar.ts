/**
 * Week and month views (PLAN.md T13) and the Replan screen (T14): calendar grids, tasks grouped
 * by day, and fitting unfinished tasks into today's free time.
 */

import {
  addDays,
  isISODate,
  startOfWeek,
  toMinutes,
  fromMinutes,
  type ISODate,
  type WeekStart,
} from './dates.ts'
import { findFreeSlots, taskInterval, type Interval } from './schedule.ts'
import { layoutDay, type Task } from './tasks.ts'

/** How far back unfinished tasks count as "overdue" (the Replan screen and the MCP tools). */
export const OVERDUE_DAYS = 14

/** 'YYYY-MM' */
export type ISOMonth = string

export function isISOMonth(value: string): value is ISOMonth {
  return /^\d{4}-\d{2}$/.test(value) && isISODate(`${value}-01`)
}

export function monthOf(date: ISODate): ISOMonth {
  return date.slice(0, 7)
}

export function addMonths(month: ISOMonth, n: number): ISOMonth {
  const year = Number(month.slice(0, 4))
  const index = year * 12 + Number(month.slice(5, 7)) - 1 + n
  return `${String(Math.floor(index / 12)).padStart(4, '0')}-${String((index % 12) + 1).padStart(2, '0')}`
}

/** The seven days of the week containing `date`. */
export function weekDays(date: ISODate, weekStart: WeekStart): ISODate[] {
  const first = startOfWeek(date, weekStart)
  return Array.from({ length: 7 }, (_, i) => addDays(first, i))
}

/** Six full weeks covering the month (always 42 days, so the grid never changes height). */
export function monthGrid(month: ISOMonth, weekStart: WeekStart): ISODate[] {
  const first = startOfWeek(`${month}-01`, weekStart)
  return Array.from({ length: 42 }, (_, i) => addDays(first, i))
}

/** Each day's tasks in display order: all-day first, then by start time. */
export function tasksByDay(tasks: readonly Task[]): Map<ISODate, Task[]> {
  const byDay = new Map<ISODate, Task[]>()
  for (const task of tasks) {
    if (task.date === null) continue
    const list = byDay.get(task.date) ?? []
    list.push(task)
    byDay.set(task.date, list)
  }
  for (const [date, list] of byDay) {
    const { allDay, timed } = layoutDay(list)
    byDay.set(date, [...allDay, ...timed])
  }
  return byDay
}

export interface ReplanPlacement {
  task: Task
  startTime: string
}

/**
 * Fits unfinished tasks into today's free time, oldest first, each at the earliest gap from now
 * (rounded up to 5 minutes) that is long enough. Returns what fits and what does not.
 */
export function fitIntoDay(
  tasks: readonly Task[],
  today: readonly Task[],
  window: Interval,
  nowMinutes: number,
): { placed: ReplanPlacement[]; unplaced: Task[] } {
  const busy: Interval[] = today.flatMap((t) => {
    const interval = taskInterval(t)
    return interval ? [interval] : []
  })
  const from = Math.max(window.start, Math.ceil(nowMinutes / 5) * 5)
  const placed: ReplanPlacement[] = []
  const unplaced: Task[] = []
  for (const task of tasks) {
    const need = task.isAllDay ? 0 : task.durationMin
    const slot =
      from < window.end
        ? findFreeSlots(busy, { start: from, end: window.end }, Math.max(need, 1))[0]
        : undefined
    if (!slot) {
      unplaced.push(task)
      continue
    }
    const start = toMinutes(slot.start)
    placed.push({ task, startTime: fromMinutes(start) })
    // All-day and zero-length tasks take no time, so they never push the next one along.
    if (need > 0) busy.push({ start, end: start + need })
  }
  return { placed, unplaced }
}
