/**
 * Quick add with natural language (PLAN.md T15): "Gym tomorrow 7am 1h !high ~2" becomes a title
 * plus a date, a start time, a duration, a priority and an energy level. A small deterministic
 * parser, not AI: what it recognises is removed from the title, everything else stays.
 *
 * Dates:
 * - today, tomorrow
 * - a full weekday name ("friday": the next one, today included); a short one ("fri") only
 *   after "on", "next" or "this"; "next <weekday>" is after today
 * - "in 3 days" or "in 2 weeks"
 * - "5 oct", "oct 5" (the next one), 2026-10-05
 * Times: 7am, 7:30pm, 19:00, noon, "at 7". "at 1" to "at 7" mean the afternoon (17:00 for
 * "at 5"); "at 8" to "at 23" are as written.
 * Durations: 45m (up to 90), 1h, 1h30, 1.5h, 120min (with an optional "for").
 * Priority: !1 to !3 or !high, !med, !low. Energy: ~-1 to ~3.
 * Text in "double quotes" is kept as typed, quotes removed: "Sun salutation" stays a title.
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
/** Words after which a short weekday ("fri") is a date. */
const WEEKDAY_LEADS = new Set(['on', 'next', 'this'])

/** The index of a name that `word` (3 letters or more) starts, or -1. */
function prefixOf(names: readonly string[], word: string): number {
  const w = word.toLowerCase().replace(/[.,]$/, '')
  return w.length >= 3 ? names.findIndex((name) => name.startsWith(w)) : -1
}

/** 0 (Sunday) .. 6 for a weekday: the full name, or (`short`) any 3-letter-or-longer start. */
function weekdayOf(word: string, short: boolean): number | null {
  const w = word.toLowerCase().replace(/[.,]$/, '')
  const index = prefixOf(WEEKDAY_NAMES, w)
  if (index < 0) return null
  return short || WEEKDAY_NAMES[index] === w ? index : null
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

/** "at 5" means 17:00: a bare hour from 1 to 7 is in the afternoon. */
function parseAtHour(text: string): string | null {
  if (!/^\d{1,2}$/.test(text)) return null
  const hour = Number(text)
  if (hour > 23) return null
  return fromMinutes((hour >= 1 && hour <= 7 ? hour + 12 : hour) * 60)
}

function parseDuration(text: string): number | null {
  const t = text.toLowerCase()
  let m = /^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)$/.exec(t)
  if (m) return Math.round(Number(m[1]) * 60)
  // A bare "m" stops at 90 ("Run 100m" is a distance); longer needs "min".
  m = /^(\d+)m$/.exec(t)
  if (m) return Number(m[1]) <= 90 ? Number(m[1]) : null
  m = /^(\d+)\s*(min|mins|minute|minutes)$/.exec(t)
  if (m) return Number(m[1])
  m = /^(\d+)h(\d{1,2})m?$/.exec(t)
  if (m) return Number(m[1]) * 60 + Number(m[2])
  return null
}

/** Splits into words; "quoted text" stays one literal word (quotes removed). */
function tokenize(input: string): { word: string; literal: boolean }[] {
  const out: { word: string; literal: boolean }[] = []
  for (const match of input.matchAll(/"([^"]*)"|(\S+)/g)) {
    if (match[1] !== undefined) {
      if (match[1].trim() !== '') out.push({ word: match[1].trim(), literal: true })
    } else if (match[2]) {
      out.push({ word: match[2], literal: false })
    }
  }
  return out
}

/** A date starting at word `i`: its value and how many words it uses. */
function dateAt(
  words: readonly string[],
  i: number,
  today: ISODate,
  lead: string | null,
): { date: ISODate; length: number } | null {
  const word = words[i] ?? ''
  const lower = word.toLowerCase()
  const next = words[i + 1] ?? ''
  const after = words[i + 2] ?? ''
  if (lower === 'today' || lower === 'tod') return { date: today, length: 1 }
  if (lower === 'tomorrow' || lower === 'tmr' || lower === 'tmrw') {
    return { date: addDays(today, 1), length: 1 }
  }
  if (isISODate(word)) return { date: word, length: 1 }
  const weekday = weekdayOf(word, lead !== null && WEEKDAY_LEADS.has(lead))
  if (weekday !== null) {
    const ahead = (weekday - dayOfWeek(today) + 7) % 7
    return { date: addDays(today, lead === 'next' && ahead === 0 ? 7 : ahead), length: 1 }
  }
  if (lower === 'in' && /^\d{1,3}$/.test(next) && /^(day|days|week|weeks)$/i.test(after)) {
    return { date: addDays(today, Number(next) * (/^week/i.test(after) ? 7 : 1)), length: 3 }
  }
  const monthFirst = monthOf(word)
  if (monthFirst !== null && /^\d{1,2}(st|nd|rd|th)?$/i.test(next)) {
    const date = nextMonthDay(today, monthFirst, parseInt(next, 10))
    if (date) return { date, length: 2 }
  }
  const monthAfter = monthOf(next)
  if (monthAfter !== null && /^\d{1,2}(st|nd|rd|th)?$/i.test(word)) {
    const date = nextMonthDay(today, monthAfter, parseInt(word, 10))
    if (date) return { date, length: 2 }
  }
  return null
}

export function parseQuickAdd(input: string, today: ISODate): QuickAdd {
  const tokens = tokenize(input)
  const words = tokens.map((t) => (t.literal ? '' : t.word))
  const result: QuickAdd = { title: '', found: [] }
  const keep: string[] = []
  const take = (kind: QuickAddToken, from: number, length: number) =>
    result.found.push({
      kind,
      text: tokens
        .slice(from, from + length)
        .map((t) => t.word)
        .join(' '),
    })

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (!token) continue
    if (token.literal) {
      keep.push(token.word)
      continue
    }
    const word = token.word
    const lower = word.toLowerCase()
    const next = words[i + 1] ?? ''

    if (result.date === undefined) {
      // "on friday", "next fri", "this sat": the lead word goes with the date.
      if (WEEKDAY_LEADS.has(lower)) {
        const led = dateAt(words, i + 1, today, lower)
        if (led) {
          result.date = led.date
          take('date', i, led.length + 1)
          i += led.length
          continue
        }
      }
      const found = dateAt(words, i, today, null)
      if (found) {
        result.date = found.date
        take('date', i, found.length)
        i += found.length - 1
        continue
      }
    }

    if (result.startTime === undefined) {
      if (lower === 'at') {
        const time = parseTime(next) ?? parseAtHour(next)
        if (time) {
          result.startTime = time
          take('time', i, 2)
          i += 1
          continue
        }
      }
      const time = parseTime(word)
      if (time) {
        result.startTime = time
        take('time', i, 1)
        continue
      }
    }

    if (result.durationMin === undefined) {
      const forDuration = lower === 'for' ? parseDuration(next) : null
      const duration = forDuration ?? parseDuration(word)
      if (duration !== null && duration >= 0 && duration <= 1440) {
        result.durationMin = duration
        take('duration', i, forDuration !== null ? 2 : 1)
        if (forDuration !== null) i += 1
        continue
      }
    }

    if (result.priority === undefined && word.startsWith('!')) {
      const priority = PRIORITY_WORDS[lower.slice(1)]
      if (priority) {
        result.priority = priority
        take('priority', i, 1)
        continue
      }
    }

    if (result.energy === undefined && /^~(-1|[0-3])$/.test(word)) {
      result.energy = Number(word.slice(1)) as EnergyLevel
      take('energy', i, 1)
      continue
    }

    keep.push(word)
  }

  result.title = keep.join(' ')
  return result
}
