/**
 * Repeat rules for recurring tasks (PLAN.md T12).
 *
 * Rules are stored in `tasks.repeat_rule` as a small RFC 5545 RRULE subset, for example
 * `FREQ=DAILY`, `FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH`, `FREQ=MONTHLY`. The series' first date is the
 * task's `date`, and `repeat_until` (inclusive) optionally ends it.
 *
 * - Weekly: on the chosen weekdays, every `interval` weeks counted in Monday-based weeks from the
 *   start's week. No weekdays means the start's weekday.
 * - Monthly and yearly: on the start's day of the month. A month without that day uses its last
 *   day (the 31st becomes the 30th or the 28th/29th), unlike RFC 5545, which would skip it.
 */

import {
  addDays,
  dayOfWeek,
  diffDays,
  formatDateLabel,
  isISODate,
  parseISODate,
  type ISODate,
} from './dates.ts'

export type RepeatFreq = 'daily' | 'weekly' | 'monthly' | 'yearly'

export interface RepeatRule {
  freq: RepeatFreq
  /** Every `interval` days, weeks, months or years: 1..MAX_INTERVAL. */
  interval: number
  /** Weekly only: weekdays 0 (Sunday) .. 6 (Saturday), sorted and unique. Empty otherwise. */
  weekdays: number[]
}

export const MAX_INTERVAL = 99

/** RRULE weekday codes, indexed like `Date.getDay()` (0 = Sunday). */
const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
const FREQS: Record<string, RepeatFreq> = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly',
}
const UNITS: Record<RepeatFreq, string> = {
  daily: 'day',
  weekly: 'week',
  monthly: 'month',
  yearly: 'year',
}
export const WEEKDAYS_MON_FRI: readonly number[] = [1, 2, 3, 4, 5]

function sortedDays(days: readonly number[]): number[] {
  return [...new Set(days)].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort()
}

/** Parses a stored rule; null for no rule or anything this app cannot represent. */
export function parseRule(text: string | null | undefined): RepeatRule | null {
  if (!text) return null
  const parts = new Map<string, string>()
  for (const part of text.trim().toUpperCase().split(';')) {
    const [key, value, extra] = part.split('=')
    if (!key || value === undefined || extra !== undefined || parts.has(key)) return null
    parts.set(key, value)
  }
  const freq = FREQS[parts.get('FREQ') ?? '']
  if (!freq) return null
  for (const key of parts.keys()) if (!['FREQ', 'INTERVAL', 'BYDAY'].includes(key)) return null
  const intervalText = parts.get('INTERVAL') ?? '1'
  const interval = /^\d{1,2}$/.test(intervalText) ? Number(intervalText) : 0
  if (interval < 1 || interval > MAX_INTERVAL) return null
  let weekdays: number[] = []
  const byDay = parts.get('BYDAY')
  if (byDay !== undefined) {
    if (freq !== 'weekly') return null
    const codes = byDay.split(',')
    const days = codes.map((c) => DAY_CODES.indexOf(c as (typeof DAY_CODES)[number]))
    if (days.some((d) => d < 0)) return null
    weekdays = sortedDays(days)
  }
  return { freq, interval, weekdays }
}

/** The stored form of a rule (the inverse of parseRule). */
export function formatRule(rule: RepeatRule): string {
  let text = `FREQ=${rule.freq.toUpperCase()}`
  if (rule.interval !== 1) text += `;INTERVAL=${rule.interval}`
  const days = rule.freq === 'weekly' ? sortedDays(rule.weekdays) : []
  if (days.length > 0) text += `;BYDAY=${days.map((d) => DAY_CODES[d]).join(',')}`
  return text
}

/** Problems with a rule the editor built; empty when it can be saved. */
export function validateRule(rule: RepeatRule): string[] {
  const problems: string[] = []
  if (!Number.isInteger(rule.interval) || rule.interval < 1 || rule.interval > MAX_INTERVAL) {
    problems.push(`Repeat every 1 to ${MAX_INTERVAL}`)
  }
  if (rule.freq === 'weekly' && sortedDays(rule.weekdays).length === 0) {
    problems.push('Pick at least one weekday')
  }
  return problems
}

export function sameRule(a: RepeatRule | null, b: RepeatRule | null): boolean {
  if (a === null || b === null) return a === b
  return a.freq === b.freq && a.interval === b.interval && formatRule(a) === formatRule(b)
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

/** The Monday on or before `date`. */
function mondayOf(date: ISODate): ISODate {
  return addDays(date, -((dayOfWeek(date) + 6) % 7))
}

/** Whether the series (`rule` from `start`, optionally ending on `until`) has an occurrence on
 *  `date`. Dates are 'YYYY-MM-DD', so string comparison is chronological. */
export function occursOn(
  rule: RepeatRule,
  start: ISODate,
  until: ISODate | null,
  date: ISODate,
): boolean {
  if (date < start || (until !== null && date > until)) return false
  switch (rule.freq) {
    case 'daily':
      return diffDays(date, start) % rule.interval === 0
    case 'weekly': {
      const days = rule.weekdays.length > 0 ? rule.weekdays : [dayOfWeek(start)]
      if (!days.includes(dayOfWeek(date))) return false
      return (diffDays(mondayOf(date), mondayOf(start)) / 7) % rule.interval === 0
    }
    case 'monthly':
    case 'yearly': {
      const s = parseISODate(start)
      const d = parseISODate(date)
      if (d.day !== Math.min(s.day, daysInMonth(d.year, d.month))) return false
      if (rule.freq === 'yearly') {
        return d.month === s.month && (d.year - s.year) % rule.interval === 0
      }
      return ((d.year - s.year) * 12 + (d.month - s.month)) % rule.interval === 0
    }
  }
}

/** Every occurrence date from `from` to `to` (inclusive), in order. */
export function occurrencesIn(
  rule: RepeatRule,
  start: ISODate,
  until: ISODate | null,
  from: ISODate,
  to: ISODate,
): ISODate[] {
  const first = from > start ? from : start
  const last = until !== null && until < to ? until : to
  const out: ISODate[] = []
  for (let date = first; date <= last; date = addDays(date, 1)) {
    if (occursOn(rule, start, until, date)) out.push(date)
  }
  return out
}

const SUFFIXES: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' }

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 31st. */
export function ordinal(n: number): string {
  const tens = n % 100
  return `${n}${tens >= 11 && tens <= 13 ? 'th' : (SUFFIXES[n % 10] ?? 'th')}`
}

/** A short description, e.g. "Every weekday", "Every 2 weeks on Mon, Thu", "Every month on the
 *  31st (or the last day)". */
export function describeRule(rule: RepeatRule, start: ISODate): string {
  const every =
    rule.interval === 1
      ? `Every ${UNITS[rule.freq]}`
      : `Every ${rule.interval} ${UNITS[rule.freq]}s`
  switch (rule.freq) {
    case 'daily':
      return every
    case 'weekly': {
      const days = rule.weekdays.length > 0 ? sortedDays(rule.weekdays) : [dayOfWeek(start)]
      if (rule.interval === 1 && days.length === 7) return 'Every day'
      if (rule.interval === 1 && days.join() === WEEKDAYS_MON_FRI.join()) return 'Every weekday'
      // Monday first, the way people read a week.
      const ordered = [...days.filter((d) => d !== 0), ...days.filter((d) => d === 0)]
      return `${every} on ${ordered.map((d) => DAY_NAMES[d]).join(', ')}`
    }
    case 'monthly': {
      const day = parseISODate(start).day
      return `${every} on the ${ordinal(day)}${day > 28 ? ' (or the last day)' : ''}`
    }
    case 'yearly':
      return `${every} on ${formatDateLabel(start, 'd MMMM')}`
  }
}

/** The simple choices in the editor; anything else is "custom". */
export type RepeatPreset =
  'never' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'yearly' | 'custom'

/** The rule a preset means for a series starting on `start` (null for never and custom). */
export function presetRule(preset: RepeatPreset, start: ISODate): RepeatRule | null {
  switch (preset) {
    case 'daily':
      return { freq: 'daily', interval: 1, weekdays: [] }
    case 'weekdays':
      return { freq: 'weekly', interval: 1, weekdays: [...WEEKDAYS_MON_FRI] }
    case 'weekly':
      return { freq: 'weekly', interval: 1, weekdays: [dayOfWeek(start)] }
    case 'monthly':
      return { freq: 'monthly', interval: 1, weekdays: [] }
    case 'yearly':
      return { freq: 'yearly', interval: 1, weekdays: [] }
    case 'never':
    case 'custom':
      return null
  }
}

/** The preset a stored rule matches for a series starting on `start`. */
export function presetOf(rule: RepeatRule | null, start: ISODate): RepeatPreset {
  if (rule === null) return 'never'
  const presets = ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const
  return presets.find((p) => sameRule(presetRule(p, start), rule)) ?? 'custom'
}

/** A valid end date: on or after the start. */
export function isValidUntil(until: ISODate | null, start: ISODate): boolean {
  return until === null || (isISODate(until) && until >= start)
}
