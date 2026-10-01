/**
 * Quick add with natural language (PLAN.md T15): "Gym tomorrow 7am 1h !high ~2" becomes a title
 * plus a date, a start time, a duration, a priority and an energy level. A small deterministic
 * parser, not AI: what it recognises is removed from the title, everything else stays.
 *
 * Dates:
 * - today, tomorrow
 * - a weekday name (the next one, today included); "next <weekday>" (after today)
 * - "in 3 days" or "in 2 weeks"
 * - "5 oct", "oct 5" (the next one), 2026-10-05
 * Times: 7am, 7:30pm, 19:00, "at 7" (24 h), noon. Durations: 45m, 1h, 1h30, 1.5h, 90min (with
 * an optional "for"). Priority: !1 to !3 or !high, !med, !low. Energy: ~-1 to ~3.
 */

import { addDays, dayOfWeek, fromMinutes, isISODate, parseISODate, type ISODate } from './dates.ts'
import type { EnergyLevel } from './energy.ts'
import type { Priority } from './tasks.ts'

export type QuickAddToken = 'date' | 'time' | 'duration' | 'priority' | 'energy'

export interface QuickAdd {
  title: string
  date?: ISODate
  startTime?: string
  durationMin?: number
  priority?: Priority
  energy?: EnergyLevel
  /** What was recognised, in order, for the editor's preview. */
  found: { kind: QuickAddToken; text: string }[]
}

const WEEKDAY_NAMES = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const
const MONTH_NAMES = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
] as const
const PRIORITY_WORDS: Record<string, Priority> = {
  '1': 1,
  high: 1,
  h: 1,
  '2': 2,
  med: 2,
  medium: 2,
  m: 2,
  '3': 3,
  low: 3,
  l: 3,
}

/** The index of a name that `word` (3 letters or more) starts, or -1. */
function prefixOf(names: readonly string[], word: string): number {
  const w = word.toLowerCase().replace(/[.,]$/, '')
  return w.length >= 3 ? names.findIndex((name) => name.startsWith(w)) : -1
}

/** 0 (Sunday) .. 6 for "mon", "tues", "thursday" …; null otherwise. */
function weekdayOf(word: string): number | null {
  const index = prefixOf(WEEKDAY_NAMES, word)
  return index >= 0 ? index : null
}

/** 1 .. 12 for "oct", "sept", "december" …; null otherwise. */
function monthOf(word: string): number | null {
  const index = prefixOf(MONTH_NAMES, word)
  return index >= 0 ? index + 1 : null
}

/** The next date (today included) with this month and day; null if it never exists. */
function nextMonthDay(today: ISODate, month: number, day: number): ISODate | null {
  const { year } = parseISODate(today)
  for (const y of [year, year + 1, year + 2, year + 3, year + 4]) {
    const date = `${String(y).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    if (isISODate(date) && date >= today) return date
  }
  return null
}

function parseTime(text: string): string | null {
  const t = text.toLowerCase()
  if (t === 'noon') return '12:00'
  const m = /^(\d{1,2})(?::(\d{2}))?(am|pm)?$/.exec(t)
  if (!m) return null
  let hour = Number(m[1])
  const minute = m[2] === undefined ? 0 : Number(m[2])
  if (minute > 59) return null
  if (m[3]) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (m[3] === 'pm' ? 12 : 0)
  } else if (m[2] === undefined || hour > 23) {
    return null // a bare number is not a time (unless after "at")
  }
  return fromMinutes(hour * 60 + minute)
}

function parseDuration(text: string): number | null {
  const t = text.toLowerCase()
  let m = /^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)$/.exec(t)
  if (m) return Math.round(Number(m[1]) * 60)
  m = /^(\d+)\s*(m|min|mins|minute|minutes)$/.exec(t)
  if (m) return Number(m[1])
  m = /^(\d+)h(\d{1,2})m?$/.exec(t)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  return null
}

export function parseQuickAdd(input: string, today: ISODate): QuickAdd {
  const words = input.trim().split(/\s+/).filter(Boolean)
  const result: QuickAdd = { title: '', found: [] }
  const keep: string[] = []
  const take = (kind: QuickAddToken, text: string) => result.found.push({ kind, text })

  for (let i = 0; i < words.length; i++) {
    const word = words[i] ?? ''
    const lower = word.toLowerCase()
    const next = words[i + 1] ?? ''
    const after = words[i + 2] ?? ''

    if (result.date === undefined) {
      if (lower === 'today' || lower === 'tod') {
        result.date = today
        take('date', word)
        continue
      }
      if (lower === 'tomorrow' || lower === 'tmr' || lower === 'tmrw') {
        result.date = addDays(today, 1)
        take('date', word)
        continue
      }
      if (isISODate(word)) {
        result.date = word
        take('date', word)
        continue
      }
      const isNext = lower === 'next' && weekdayOf(next) !== null
      const weekday = isNext ? weekdayOf(next) : weekdayOf(word)
      if (weekday !== null) {
        const ahead = (weekday - dayOfWeek(today) + 7) % 7
        result.date = addDays(today, isNext && ahead === 0 ? 7 : ahead)
        take('date', isNext ? `${word} ${next}` : word)
        if (isNext) i += 1
        continue
      }
      if (lower === 'in' && /^\d{1,3}$/.test(next) && /^(day|days|week|weeks)$/i.test(after)) {
        const n = Number(next) * (/^week/i.test(after) ? 7 : 1)
        result.date = addDays(today, n)
        take('date', `${word} ${next} ${after}`)
        i += 2
        continue
      }
      const monthFirst = monthOf(word)
      if (monthFirst !== null && /^\d{1,2}(st|nd|rd|th)?$/i.test(next)) {
        const date = nextMonthDay(today, monthFirst, parseInt(next, 10))
        if (date) {
          result.date = date
          take('date', `${word} ${next}`)
          i += 1
          continue
        }
      }
      const monthAfter = monthOf(next)
      if (monthAfter !== null && /^\d{1,2}(st|nd|rd|th)?$/i.test(word)) {
        const date = nextMonthDay(today, monthAfter, parseInt(word, 10))
        if (date) {
          result.date = date
          take('date', `${word} ${next}`)
          i += 1
          continue
        }
      }
      if (lower === 'on' && (weekdayOf(next) !== null || monthOf(next) !== null)) continue
    }

    if (result.startTime === undefined) {
      if (lower === 'at' && /^\d{1,2}(:\d{2})?(am|pm)?$/i.test(next)) {
        const time =
          parseTime(next) ??
          (/^\d{1,2}$/.test(next) && Number(next) < 24 ? fromMinutes(Number(next) * 60) : null)
        if (time) {
          result.startTime = time
          take('time', `${word} ${next}`)
          i += 1
          continue
        }
      }
      const time = parseTime(word)
      if (time) {
        result.startTime = time
        take('time', word)
        continue
      }
    }

    if (result.durationMin === undefined) {
      const forDuration = lower === 'for' ? parseDuration(next) : null
      const duration = forDuration ?? parseDuration(word)
      if (duration !== null && duration >= 0 && duration <= 1440) {
        result.durationMin = duration
        take('duration', forDuration !== null ? `${word} ${next}` : word)
        if (forDuration !== null) i += 1
        continue
      }
    }

    if (result.priority === undefined && word.startsWith('!')) {
      const priority = PRIORITY_WORDS[lower.slice(1)]
      if (priority) {
        result.priority = priority
        take('priority', word)
        continue
      }
    }

    if (result.energy === undefined && /^~(-1|[0-3])$/.test(word)) {
      result.energy = Number(word.slice(1)) as EnergyLevel
      take('energy', word)
      continue
    }

    keep.push(word)
  }

  result.title = keep.join(' ')
  return result
}
