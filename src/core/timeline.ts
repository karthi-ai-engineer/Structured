/**
 * The day timeline as rows: timed tasks in order, with free-time gaps between them (PLAN.md T8)
 * and overlap flags (T9), plus the snapping maths for dragging a task to move or resize it (T10).
 */

import { fromMinutes, toMinutes } from './dates.ts'
import { findFreeSlots, overlappingPairs, taskInterval, type Interval } from './schedule.ts'
import type { Task } from './tasks.ts'

export type TimelineItem =
  | { kind: 'task'; task: Task; overlaps: boolean }
  | { kind: 'gap'; start: string; end: string; minutes: number }

/** Gaps shorter than this are not worth a row. */
export const MIN_GAP_MINUTES = 15

/** Drags snap to this many minutes. */
export const SNAP_MINUTES = 5

function startOf(item: TimelineItem): number {
  return item.kind === 'gap' ? toMinutes(item.start) : toMinutes(item.task.startTime ?? '00:00')
}

/**
 * Timed tasks (in display order) interleaved with the free time inside `window`. `notBefore`
 * (minutes) hides free time that has already passed: on today, pass the current time.
 */
export function timelineItems(
  timed: readonly Task[],
  window: Interval,
  notBefore = 0,
): TimelineItem[] {
  const overlapping = new Set(overlappingPairs(timed).flat())
  const busy = timed.flatMap((t) => {
    const interval = taskInterval(t)
    return interval ? [interval] : []
  })
  const from = Math.max(window.start, snapUp(notBefore))
  const gaps: TimelineItem[] =
    from >= window.end
      ? []
      : findFreeSlots(busy, { start: from, end: window.end }, MIN_GAP_MINUTES).map((slot) => ({
          kind: 'gap',
          ...slot,
        }))
  const tasks: TimelineItem[] = timed.map((task) => ({
    kind: 'task',
    task,
    overlaps: overlapping.has(task.id),
  }))
  // Stable merge by start; at the same minute a task comes before free time.
  return [...tasks, ...gaps].sort((a, b) => {
    const diff = startOf(a) - startOf(b)
    return diff !== 0 ? diff : a.kind === b.kind ? 0 : a.kind === 'task' ? -1 : 1
  })
}

/** Where the current-time line goes: before the first item that starts after now (free time
 *  starting right now counts as after). `items.length` means after all of them. */
export function nowItemIndex(items: readonly TimelineItem[], nowMinutes: number): number {
  const index = items.findIndex((item) =>
    item.kind === 'gap' ? startOf(item) >= nowMinutes : startOf(item) > nowMinutes,
  )
  return index === -1 ? items.length : index
}

/** Rounds up to the next snap step. */
function snapUp(minutes: number): number {
  return Math.ceil(minutes / SNAP_MINUTES) * SNAP_MINUTES
}

/** Rounds a dragged distance (in minutes) to the snap step. */
export function snapMinutes(minutes: number): number {
  return Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES
}

/** A dragged start time: snapped, and kept on the same day. */
export function movedStart(startTime: string, deltaMinutes: number): string {
  const delta = snapMinutes(deltaMinutes)
  if (delta === 0) return startTime
  const next = toMinutes(startTime) + delta
  return fromMinutes(Math.min(Math.max(next, 0), 1440 - SNAP_MINUTES))
}

/** A dragged duration: snapped, at least one snap step, at most a day. A drag that ends where
 *  it started keeps the duration (a 0-minute reminder stays 0). */
export function resizedDuration(durationMin: number, deltaMinutes: number): number {
  const delta = snapMinutes(deltaMinutes)
  if (delta === 0) return durationMin
  return Math.min(Math.max(durationMin + delta, SNAP_MINUTES), 1440)
}

/** The editor warnings worth showing while planning: overlaps, day hours and midnight. The
 *  user already knows when they edit a task in the past. */
export function editorWarnings(warnings: readonly string[]): string[] {
  return warnings.filter(
    (w) => !w.startsWith('Is on a past date') && w !== 'Starts earlier than now',
  )
}
