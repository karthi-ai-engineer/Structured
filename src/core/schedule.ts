/**
 * Schedule maths shared by the MCP server (and later the UI's free-time rows): busy intervals,
 * free slots within the day hours, overlaps, and the warnings a planned task gets before it is
 * written. All times are wall-clock minutes of the task's own day; tasks crossing midnight are
 * clamped to 24:00 (PLAN.md section 8, slots.ts / schedule.ts).
 */

import { fromMinutes, toMinutes, type ISODate } from './dates.ts'
import { isAllDayLike, type Task } from './tasks.ts'

export interface Interval {
  start: number
  end: number
}

export interface FreeSlot {
  start: string
  end: string
  minutes: number
}

export interface DayWindow {
  /** 'HH:mm' */
  dayStart: string
  /** 'HH:mm' */
  dayEnd: string
}

type TimedLike = Pick<Task, 'isAllDay' | 'startTime' | 'durationMin'>

/** The busy interval of a timed task, or null for all-day and inbox tasks. */
export function taskInterval(task: TimedLike): Interval | null {
  if (isAllDayLike(task) || task.startTime === null) return null
  const start = toMinutes(task.startTime)
  return { start, end: Math.min(start + task.durationMin, 1440) }
}

/** Free gaps of at least `minMinutes` inside [from, to), given busy intervals (any order). */
export function findFreeSlots(
  busy: readonly Interval[],
  window: Interval,
  minMinutes: number,
): FreeSlot[] {
  const sorted = [...busy].sort((a, b) => a.start - b.start)
  const slots: FreeSlot[] = []
  let cursor = window.start
  const push = (start: number, end: number) => {
    if (end - start >= minMinutes) {
      slots.push({ start: fromMinutes(start), end: fromMinutes(end), minutes: end - start })
    }
  }
  for (const interval of sorted) {
    if (interval.end <= cursor) continue
    if (interval.start >= window.end) break
    if (interval.start > cursor) push(cursor, Math.min(interval.start, window.end))
    cursor = Math.max(cursor, interval.end)
  }
  if (cursor < window.end) push(cursor, window.end)
  return slots
}

/** Day hours as an interval; a day end at or before the start means "until midnight". */
export function windowOf(day: DayWindow): Interval {
  const start = toMinutes(day.dayStart)
  const end = toMinutes(day.dayEnd)
  return { start, end: end > start ? end : 1440 }
}

/** True when both intervals have length and share time (touching ends do not count). */
function intersects(a: Interval, b: Interval): boolean {
  return a.end > a.start && b.end > b.start && a.start < b.end && b.start < a.end
}

/** Pairs of task ids whose time slots overlap (timed tasks only; zero-length tasks never do). */
export function overlappingPairs(tasks: readonly Task[]): [string, string][] {
  const timed = tasks
    .map((t) => ({ id: t.id, interval: taskInterval(t) }))
    .filter((t): t is { id: string; interval: Interval } => t.interval !== null)
    .sort((a, b) => a.interval.start - b.interval.start)
  const pairs: [string, string][] = []
  for (let i = 0; i < timed.length; i++) {
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i]
      const b = timed[j]
      if (a === undefined || b === undefined) break
      if (b.interval.start >= a.interval.end && a.interval.end > a.interval.start) break
      if (intersects(a.interval, b.interval)) pairs.push([a.id, b.id])
    }
  }
  return pairs
}

export interface PlannedTask {
  title: string
  date: ISODate | null
  startTime: string | null
  durationMin: number
  isAllDay: boolean
}

export interface WarningContext {
  /** Other tasks on the same date (the planned task itself excluded). */
  sameDay: readonly Pick<Task, 'title' | 'isAllDay' | 'startTime' | 'durationMin' | 'completedAt'>[]
  window: DayWindow
  today: ISODate
  nowMinutes: number
}

/**
 * Human-readable warnings for a planned task: overlaps with open tasks, outside the day hours,
 * in the past, past midnight. Warnings never block a write; they are returned to the caller.
 */
export function plannedTaskWarnings(task: PlannedTask, ctx: WarningContext): string[] {
  const warnings: string[] = []
  if (task.date === null) return warnings
  if (task.date < ctx.today) warnings.push(`Is on a past date (${task.date})`)
  const interval = taskInterval(task)
  if (interval === null) return warnings

  const raw = toMinutes(task.startTime ?? '00:00') + task.durationMin
  const label = (i: Interval) => `${fromMinutes(i.start)}–${fromMinutes(i.end)}`
  for (const other of ctx.sameDay) {
    if (other.completedAt !== null) continue
    const otherInterval = taskInterval(other)
    if (otherInterval && intersects(interval, otherInterval)) {
      warnings.push(`Overlaps "${other.title}" (${label(otherInterval)})`)
    }
  }
  const window = windowOf(ctx.window)
  if (interval.start < window.start || raw > window.end) {
    warnings.push(`Outside your day hours (${ctx.window.dayStart}–${ctx.window.dayEnd})`)
  }
  if (task.date === ctx.today && interval.start < ctx.nowMinutes) {
    warnings.push('Starts earlier than now')
  }
  if (raw > 1440) warnings.push('Runs past midnight')
  return warnings
}
