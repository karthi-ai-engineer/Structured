/**
 * Task alerts (PLAN.md N1, N2). A task's `alerts` are minutes before its start (0 = at the start);
 * `ALERT_AT_END` means at its end. A task without its own list uses the settings' defaults.
 * Only timed, unfinished tasks alert.
 */

import { toMinutes } from './dates.ts'
import { isAllDayLike, type Task } from './tasks.ts'

/** The stored value for "at the end of the task". */
export const ALERT_AT_END = -1

/** The choices the editor and the settings offer. */
export const ALERT_CHOICES = [0, 5, 10, 15, 30, 60, ALERT_AT_END] as const

export function alertLabel(minutes: number): string {
  if (minutes === ALERT_AT_END) return 'At end'
  if (minutes === 0) return 'At start'
  if (minutes % 60 === 0) return `${minutes / 60} h before`
  return `${minutes} min before`
}

/** Valid alert values, sorted and unique; null stays null (use the defaults). */
export function toAlerts(value: unknown): number[] | null {
  if (!Array.isArray(value)) return null
  const valid = value.filter(
    (m): m is number => Number.isInteger(m) && (m === ALERT_AT_END || (m >= 0 && m <= 1440)),
  )
  return [...new Set(valid)].sort((a, b) => a - b)
}

export interface DueAlert {
  /** Unique per task, day and alert, so an alert fires once. */
  key: string
  taskId: string
  title: string
  /** Minutes of the day when it fires. */
  at: number
  /** The task's start, 'HH:mm'. */
  start: string
  minutes: number
}

/** Every alert of a day's timed, unfinished tasks, in time order. Alerts that would fall on the
 *  day before (a task at 00:10 with a 30-minute alert) are dropped. */
export function alertsForDay(tasks: readonly Task[], defaults: readonly number[]): DueAlert[] {
  const out: DueAlert[] = []
  for (const task of tasks) {
    if (task.completedAt !== null || isAllDayLike(task) || !task.startTime || !task.date) continue
    const start = toMinutes(task.startTime)
    for (const minutes of task.alerts ?? defaults) {
      const at = minutes === ALERT_AT_END ? start + task.durationMin : start - minutes
      if (at < 0 || at >= 1440) continue
      out.push({
        key: `${task.id}|${task.date}|${minutes}`,
        taskId: task.id,
        title: task.title,
        at,
        start: task.startTime,
        minutes,
      })
    }
  }
  return out.sort((a, b) => a.at - b.at)
}

/** The alerts that fire after `from` and up to `to` (minutes of the day). */
export function dueBetween(alerts: readonly DueAlert[], from: number, to: number): DueAlert[] {
  return alerts.filter((a) => a.at > from && a.at <= to)
}

/** The notification text: the title, and when the task starts or ends. */
export function alertText(alert: DueAlert, formatTime: (minutes: number) => string): string {
  if (alert.minutes === ALERT_AT_END) return `Time is up for "${alert.title}"`
  if (alert.minutes === 0) return `"${alert.title}" starts now`
  return `"${alert.title}" starts at ${formatTime(toMinutes(alert.start))} (${alertLabel(alert.minutes)})`
}
