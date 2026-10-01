/**
 * Time-zone-aware date and time helpers (PLAN.md section 8; docs/phases/phase-0/PLAN.md 6.1).
 *
 * Conventions (PLAN.md section 10.3):
 * - Calendar dates are ISO strings 'YYYY-MM-DD' (`ISODate`) from 1900-01-01 to 2999-12-31.
 * - Times of day are 'HH:mm' (24 h) wall-clock times in the user's zone; '24:00' is allowed only
 *   as an end of day (`{ endOfDay: true }`).
 * - Durations are integer minutes.
 *
 * Timeline maths is WALL-CLOCK time. A DST day has 23 or 25 hours, so a 01:00 to 03:00 task on a
 * spring-forward day is 2 h on the timeline but 1 h of elapsed time. Only
 * `zonedDateTimeToInstant`, `startOfDayInstant` and `msUntilNextDayIn` convert to real instants.
 * Their DST rule is "compatible": a wall time inside a gap moves forward by the gap, and an
 * ambiguous wall time (a repeated hour) resolves to the EARLIER instant.
 *
 * Rules:
 * - This is the only module that reads the clock. Every function that takes `now` defaults it to
 *   `new Date()`; tests always pass an explicit instant.
 * - Invalid input raises a `RangeError` whose message names the function and the problem.
 *   The `is*` guards never throw.
 * - Pure: imports only date-fns and @date-fns/tz, no module-level side effects (the zone
 *   formatter cache fills lazily), and it loads in plain Node (`npm run check:core`).
 * - Zone offsets are computed here from Intl wall-clock parts, exactly (to the second), instead
 *   of with `tzOffset()`/`TZDate`: those return a wrong sign for offsets between -01:00 and 00:00
 *   (Europe/Dublin before 1916) and resolve ambiguous times inconsistently (Pacific/Chatham,
 *   Australia/Lord_Howe). See docs/phases/phase-0/DEVLOG.md, WP4.
 * - Display helpers never use Intl, so their output is identical on every runtime.
 */

import { TZDate } from '@date-fns/tz'
import { format as formatDate } from 'date-fns'
import { enUS } from 'date-fns/locale/en-US'

/** A calendar date 'YYYY-MM-DD' within MIN_ISO_DATE..MAX_ISO_DATE. */
export type ISODate = string
export type TimeFormat = '12h' | '24h'
/** 0 = Sunday ... 6 = Saturday (settings.week_start). */
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6
/** `endOfDay: true` also accepts '24:00' (= 1440), for end times and day_end. */
export interface TimeOptions {
  endOfDay?: boolean
}
/** Seven consecutive days; `end` is inclusive. */
export interface WeekRange {
  start: ISODate
  end: ISODate
  days: readonly ISODate[]
}
/** A wall-clock time plus the number of days it moved (negative = earlier days). */
export interface ShiftedTime {
  time: string
  dayOffset: number
}

export const MINUTES_PER_DAY = 1440
export const MIN_ISO_DATE = '1900-01-01'
export const MAX_ISO_DATE = '2999-12-31'

const MS_PER_MINUTE = 60_000
const MS_PER_DAY = 86_400_000
const MIN_DAY_MS = Date.UTC(1900, 0, 1)
const MAX_DAY_MS = Date.UTC(2999, 11, 31)
// Instants whose local date can fall inside the supported range (UTC offsets stay below a day).
const MIN_INSTANT_MS = MIN_DAY_MS - MS_PER_DAY
const MAX_INSTANT_MS = MAX_DAY_MS + 2 * MS_PER_DAY
// The offsets 36 h before and after a wall time bracket the transition next to it. This needs
// transitions to be more than 72 h apart, which holds for every Intl zone from 1900 to 2039
// (scanned in WP4, docs/phases/phase-0/DEVLOG.md); later years only repeat yearly DST rules.
const PROBE_MS = 36 * 60 * MS_PER_MINUTE

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
// 'HH:mm', 'HH:mm:ss' or 'HH:mm:ss.fff...' (the Postgres `time` output shapes).
const TIME_RE = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/
const ZEROS_RE = /^0+$/
// UTC offsets such as '+05:30' or '-03:30' are not zones (no DST rules); Intl accepts them.
const OFFSET_RE = /^[+-]/

// ---------------------------------------------------------------------------------------------
// Internal helpers

interface CalendarDay {
  year: number
  month: number
  day: number
}

interface WallClock extends CalendarDay {
  hour: number
  minute: number
  second: number
}

/** Short, quoted rendering of a bad input for error messages. */
function show(value: unknown): string {
  const text = typeof value === 'string' ? JSON.stringify(value) : String(value)
  return text.length > 40 ? `${text.slice(0, 40)}...` : text
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0')
}

// One formatter per zone spelling; it validates the zone and reads wall-clock parts.
const zoneFormats = new Map<string, Intl.DateTimeFormat>()

function zoneFormat(tz: unknown): Intl.DateTimeFormat | undefined {
  if (typeof tz !== 'string') return undefined
  const cached = zoneFormats.get(tz)
  if (cached !== undefined) return cached
  if (tz === '' || tz.trim() !== tz || OFFSET_RE.test(tz)) return undefined
  let format: Intl.DateTimeFormat
  try {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
  } catch {
    return undefined
  }
  // Catches offsets Intl rewrites, such as U+2212 (minus sign) + '05:30', resolved as '-05:30'.
  if (OFFSET_RE.test(format.resolvedOptions().timeZone)) return undefined
  zoneFormats.set(tz, format)
  return format
}

function requireZone(tz: string, fn: string): Intl.DateTimeFormat {
  const format = zoneFormat(tz)
  if (format === undefined) {
    throw new RangeError(
      `${fn}: invalid time zone ${show(tz)}; expected an IANA zone name such as ` +
        '"Asia/Kolkata" (not an offset such as "+05:30", no surrounding spaces)',
    )
  }
  return format
}

function requireInstant(now: Date, fn: string): number {
  const ms = now instanceof Date ? now.getTime() : Number.NaN
  if (!(ms >= MIN_INSTANT_MS && ms <= MAX_INSTANT_MS)) {
    throw new RangeError(
      `${fn}: now must be a valid Date within the supported years ${MIN_ISO_DATE.slice(0, 4)} ` +
        `to ${MAX_ISO_DATE.slice(0, 4)}; got ${show(now)}`,
    )
  }
  return ms
}

/** Wall-clock parts of an instant in a zone. */
function wallClock(format: Intl.DateTimeFormat, ms: number): WallClock {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {}
  for (const part of format.formatToParts(ms)) parts[part.type] = part.value
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour) % 24, // 'h23' already gives 0..23; guards engines that print 24
    minute: Number(parts.minute),
    second: Number(parts.second),
  }
}

/** Exact UTC offset (wall clock minus UTC) in ms, to the second. */
function offsetMs(format: Intl.DateTimeFormat, ms: number): number {
  const wall = wallClock(format, ms)
  const local = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second)
  return local - Math.floor(ms / 1000) * 1000
}

interface WallResolution {
  /** Offset in force 36 h before the wall time. */
  before: number
  /** Offset in force 36 h after the wall time. */
  after: number
  /** Every instant whose wall clock shows the wall time, ascending: none in a gap, one
   *  normally, two in a repeated hour. */
  instants: number[]
}

/** Resolves a wall-clock time (written as a UTC timestamp) in a zone. */
function resolveWall(format: Intl.DateTimeFormat, wall: number): WallResolution {
  const before = offsetMs(format, wall - PROBE_MS)
  const after = offsetMs(format, wall + PROBE_MS)
  const offsets = before === after ? [before] : [before, after]
  const instants = offsets
    .map((offset) => wall - offset)
    .filter((instant) => offsetMs(format, instant) === wall - instant)
    .sort((a, b) => a - b)
  return { before, after, instants }
}

/**
 * The transition instant of the gap that contains `wall`: the first instant with the new
 * offset. `wall - after` is still before it and `wall - before` already after it (otherwise the
 * wall time would exist), so a binary search on whole seconds finds it.
 */
function gapEnd(format: Intl.DateTimeFormat, wall: number, gap: WallResolution): number {
  let early = wall - gap.after
  let late = wall - gap.before
  while (late - early > 1000) {
    const middle = early + Math.floor((late - early) / 2000) * 1000
    if (offsetMs(format, middle) === gap.before) early = middle
    else late = middle
  }
  return late
}

/**
 * Every instant at which calendar day `day` (its 00:00 as a UTC timestamp) begins in the zone:
 * its midnight (twice when a fall-back repeats midnight), or, when midnight falls in a gap, the
 * end of the gap. The end of the gap can be earlier than 00:00 moved forward by the gap, when the
 * gap began before midnight (America/Toronto 1919-03-30: 23:30 jumped to 00:30).
 */
function dayStarts(format: Intl.DateTimeFormat, day: number): [number, ...number[]] {
  const resolution = resolveWall(format, day)
  const [first, ...rest] = resolution.instants
  return first === undefined ? [gapEnd(format, day, resolution)] : [first, ...rest]
}

function calendarDay(value: unknown): CalendarDay | undefined {
  if (typeof value !== 'string') return undefined
  const match = ISO_DATE_RE.exec(value)
  if (match === null || value < MIN_ISO_DATE || value > MAX_ISO_DATE) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth
    ? { year, month, day }
    : undefined
}

function requireDay(date: ISODate, fn: string): CalendarDay {
  const parsed = calendarDay(date)
  if (parsed === undefined) {
    throw new RangeError(
      `${fn}: invalid date ${show(date)}; expected a real calendar day YYYY-MM-DD from ` +
        `${MIN_ISO_DATE} to ${MAX_ISO_DATE}`,
    )
  }
  return parsed
}

/** The UTC timestamp of the calendar day's 00:00 (calendar arithmetic only, not an instant). */
function dayMs(date: ISODate, fn: string): number {
  const { year, month, day } = requireDay(date, fn)
  return Date.UTC(year, month - 1, day)
}

function isoFromDayMs(ms: number): ISODate {
  const date = new Date(ms)
  return `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1, 2)}-${pad(date.getUTCDate(), 2)}`
}

/** Minutes for a valid time string, otherwise undefined. */
function timeMinutes(value: unknown, endOfDay: boolean): number | undefined {
  if (typeof value !== 'string') return undefined
  const match = TIME_RE.exec(value)
  if (match === null) return undefined
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const seconds = Number(match[3] ?? '0')
  if (minutes > 59 || seconds > 59) return undefined
  if (hours < 24) return hours * 60 + minutes
  const fractionIsZero = match[4] === undefined || ZEROS_RE.test(match[4])
  return endOfDay && hours === 24 && minutes === 0 && seconds === 0 && fractionIsZero
    ? MINUTES_PER_DAY
    : undefined
}

function requireMinutesOfDay(minutes: number, fn: string): number {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > MINUTES_PER_DAY) {
    throw new RangeError(
      `${fn}: minutes must be an integer from 0 to ${MINUTES_PER_DAY}; got ${show(minutes)}`,
    )
  }
  return minutes
}

function requireInteger(value: number, name: string, fn: string): number {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${fn}: ${name} must be a (safe) integer; got ${show(value)}`)
  }
  return value
}

// ---------------------------------------------------------------------------------------------
// Zones

/** True for an IANA zone name Intl accepts ('Asia/Kolkata', 'asia/kolkata', 'UTC'); false for
 *  '', padded names and UTC offsets ('+05:30', '-03:30'). Never throws. */
export function isValidTimeZone(tz: string): boolean {
  return zoneFormat(tz) !== undefined
}

/** Throws a RangeError unless `isValidTimeZone(tz)`. */
export function assertTimeZone(tz: string): void {
  requireZone(tz, 'assertTimeZone')
}

/** Intl's canonical spelling of a zone (case and aliases; 'Asia/Kolkata' may become
 *  'Asia/Calcutta' depending on the runtime). RangeError if invalid. */
export function normalizeTimeZone(tz: string): string {
  return requireZone(tz, 'normalizeTimeZone').resolvedOptions().timeZone
}

// ---------------------------------------------------------------------------------------------
// Calendar dates (UTC arithmetic on the calendar day; the range guarantees 4-digit years)

/** 'YYYY-MM-DD', a real calendar day, within MIN_ISO_DATE..MAX_ISO_DATE. Never throws. */
export function isISODate(value: string): boolean {
  return calendarDay(value) !== undefined
}

/** Year, month (1..12) and day of a valid ISO date. RangeError otherwise. */
export function parseISODate(value: string): { year: number; month: number; day: number } {
  return requireDay(value, 'parseISODate')
}

/** `date` plus an integer number of days. RangeError if the result leaves the range. */
export function addDays(date: ISODate, days: number): ISODate {
  const start = dayMs(date, 'addDays')
  requireInteger(days, 'days', 'addDays')
  const result = start + days * MS_PER_DAY
  if (!(result >= MIN_DAY_MS && result <= MAX_DAY_MS)) {
    throw new RangeError(
      `addDays: ${date} ${days < 0 ? '-' : '+'} ${Math.abs(days)} days is outside ` +
        `${MIN_ISO_DATE} to ${MAX_ISO_DATE}`,
    )
  }
  return isoFromDayMs(result)
}

/** Whole days from `earlier` to `later` (negative when `later` is before `earlier`). */
export function diffDays(later: ISODate, earlier: ISODate): number {
  return (dayMs(later, 'diffDays') - dayMs(earlier, 'diffDays')) / MS_PER_DAY
}

/** Day of the week, 0 = Sunday ... 6 = Saturday. */
export function dayOfWeek(date: ISODate): WeekStart {
  return new Date(dayMs(date, 'dayOfWeek')).getUTCDay() as WeekStart
}

/** Validates a week start (settings.week_start): an integer 0..6. */
export function toWeekStart(n: number): WeekStart {
  if (!Number.isInteger(n) || n < 0 || n > 6) {
    throw new RangeError(
      `toWeekStart: expected an integer from 0 (Sunday) to 6 (Saturday); got ${show(n)}`,
    )
  }
  return n as WeekStart
}

/** The first day of the week that contains `date`. */
export function startOfWeek(date: ISODate, weekStart: WeekStart): ISODate {
  const first = toWeekStart(weekStart)
  return addDays(date, -((dayOfWeek(date) - first + 7) % 7))
}

/** The week (7 days, `end` inclusive) that contains `date`. RangeError if it leaves the range. */
export function weekRange(date: ISODate, weekStart: WeekStart): WeekRange {
  const start = startOfWeek(date, weekStart)
  const days = Object.freeze(Array.from({ length: 7 }, (_, index) => addDays(start, index)))
  return { start, end: addDays(start, 6), days }
}

// ---------------------------------------------------------------------------------------------
// Clock (time-zone aware)

/** The calendar date in `tz` at `now`. RangeError on an invalid zone or an Invalid Date. */
export function todayIn(tz: string, now: Date = new Date()): ISODate {
  const format = requireZone(tz, 'todayIn')
  const wall = wallClock(format, requireInstant(now, 'todayIn'))
  const date = `${pad(wall.year, 4)}-${pad(wall.month, 2)}-${pad(wall.day, 2)}`
  if (!isISODate(date)) {
    throw new RangeError(
      `todayIn: the local date ${date} is outside ${MIN_ISO_DATE} to ${MAX_ISO_DATE}`,
    )
  }
  return date
}

/** `now` as an ISO 8601 UTC timestamp, for columns such as `completed_at` and `deleted_at`.
 *  RangeError on an Invalid Date. */
export function nowIso(now: Date = new Date()): string {
  requireInstant(now, 'nowIso')
  return now.toISOString()
}

/** The current instant in milliseconds (timers such as focus mode). */
export function nowMs(): number {
  return Date.now()
}

/** Wall-clock minutes since local midnight in `tz` at `now`, 0..1439 (seconds are floored).
 *  The value jumps forward in a DST gap and repeats in a repeated hour. */
export function nowMinutesIn(tz: string, now: Date = new Date()): number {
  const format = requireZone(tz, 'nowMinutesIn')
  const wall = wallClock(format, requireInstant(now, 'nowMinutesIn'))
  return wall.hour * 60 + wall.minute
}

/**
 * Milliseconds from `now` until the day after `todayIn(tz, now)` begins in `tz` (always > 0),
 * for the day rollover. DST-aware: a spring-forward day is 23 h long, a fall-back day 25 h, and
 * a midnight inside a gap is replaced by the end of the gap (see `startOfDayInstant`). When a
 * fall-back crosses midnight (America/St_Johns fell back at 00:01 from 1987 to 2010), midnight
 * happens twice; between the two, `todayIn` is the earlier date again and the second midnight is
 * next.
 */
export function msUntilNextDayIn(tz: string, now: Date = new Date()): number {
  const nowMs = requireInstant(now, 'msUntilNextDayIn')
  const format = requireZone(tz, 'msUntilNextDayIn')
  const tomorrow = addDays(todayIn(tz, now), 1)
  const next = dayStarts(format, dayMs(tomorrow, 'msUntilNextDayIn')).find(
    (instant) => instant > nowMs,
  )
  // Unreachable while transitions are more than 72 h apart (PROBE_MS); kept so that the result
  // can never be zero or negative.
  if (next === undefined) {
    throw new RangeError(`msUntilNextDayIn: no local midnight ahead in ${show(tz)}`)
  }
  return next - nowMs
}

// ---------------------------------------------------------------------------------------------
// Times of day

/** True when `toMinutes(value, options)` would succeed. Never throws. */
export function isTime(value: string, options?: TimeOptions): boolean {
  return timeMinutes(value, options?.endOfDay === true) !== undefined
}

/**
 * Minutes since midnight of 'HH:mm', 'HH:mm:ss' or 'HH:mm:ss.fff...' (Postgres `time` output;
 * seconds are floored away). Hours 00..23, minutes and seconds 00..59. '24:00' (also
 * '24:00:00' and '24:00:00.000...') is 1440, and only with `{ endOfDay: true }`.
 */
export function toMinutes(time: string, options?: TimeOptions): number {
  const endOfDay = options?.endOfDay === true
  const minutes = timeMinutes(time, endOfDay)
  if (minutes !== undefined) return minutes
  if (!endOfDay && timeMinutes(time, true) !== undefined) {
    throw new RangeError(
      `toMinutes: ${show(time)} is the end of the day; it is only valid with { endOfDay: true }`,
    )
  }
  throw new RangeError(
    `toMinutes: invalid time ${show(time)}; expected HH:mm (00:00 to 23:59), optionally with ` +
      ':ss or :ss.fff',
  )
}

/** 'HH:mm' for an integer 0..1440; 1440 gives '24:00'. */
export function fromMinutes(minutes: number): string {
  requireMinutesOfDay(minutes, 'fromMinutes')
  return `${pad(Math.floor(minutes / 60), 2)}:${pad(minutes % 60, 2)}`
}

/** Moves a wall-clock time by an integer number of minutes, wrapping around midnight.
 *  '23:30' + 60 gives { time: '00:30', dayOffset: 1 }; '24:00' + 0 gives { '00:00', 1 }. */
export function addMinutesToTime(time: string, delta: number): ShiftedTime {
  const start = toMinutes(time, { endOfDay: true })
  requireInteger(delta, 'delta', 'addMinutesToTime')
  // Split first so that every step stays exact for any safe-integer delta.
  const rest = delta % MINUTES_PER_DAY
  const total = start + rest
  const carry = Math.floor(total / MINUTES_PER_DAY)
  return {
    time: fromMinutes(total - carry * MINUTES_PER_DAY),
    dayOffset: (delta - rest) / MINUTES_PER_DAY + carry,
  }
}

// ---------------------------------------------------------------------------------------------
// Wall clock -> instant

/**
 * The instant at which the wall clock in `tz` shows `time` on `date`. `time` is read with
 * `toMinutes(time, { endOfDay: true })`, so '24:00' is 00:00 of the next day. DST rule
 * ('compatible'): a wall time in a gap moves forward by the gap; an ambiguous one resolves to
 * the earlier instant.
 */
export function zonedDateTimeToInstant(date: ISODate, time: string, tz: string): Date {
  const day = dayMs(date, 'zonedDateTimeToInstant')
  const minutes = toMinutes(time, { endOfDay: true })
  const format = requireZone(tz, 'zonedDateTimeToInstant')
  const wall = day + minutes * MS_PER_MINUTE
  const { before, instants } = resolveWall(format, wall)
  return new Date(instants[0] ?? wall - before)
}

/**
 * The first instant of `date` in `tz`: its midnight (the earlier one if midnight repeats), or,
 * when midnight falls in a DST gap, the end of the gap. That equals
 * `zonedDateTimeToInstant(date, '00:00', tz)` except when the gap began before midnight
 * (America/Toronto 1919-03-30, 23:30 to 00:30): the day then began at 00:30, while 00:00 moved
 * forward by the whole gap is 01:00.
 */
export function startOfDayInstant(date: ISODate, tz: string): Date {
  const day = dayMs(date, 'startOfDayInstant')
  return new Date(dayStarts(requireZone(tz, 'startOfDayInstant'), day)[0])
}

// ---------------------------------------------------------------------------------------------
// Display (never uses Intl: the output is identical on every runtime)

/** 570 gives '09:30' (24h) or '9:30 AM' (12h, plain ASCII space). 1440 gives '24:00' or
 *  '12:00 AM'. Minutes must be an integer 0..1440. */
export function formatTime(minutes: number, format: TimeFormat): string {
  requireMinutesOfDay(minutes, 'formatTime')
  if (format === '24h') return fromMinutes(minutes)
  if (format !== '12h') {
    throw new RangeError(`formatTime: format must be '12h' or '24h'; got ${show(format)}`)
  }
  const hour = Math.floor(minutes / 60) % 24
  const hour12 = hour % 12 === 0 ? 12 : hour % 12
  return `${hour12}:${pad(minutes % 60, 2)} ${hour < 12 ? 'AM' : 'PM'}`
}

/** '0m', '45m', '1h', '1h 30m', '25h'. Finite minutes >= 0, rounded to the nearest minute. */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) {
    throw new RangeError(`formatDuration: minutes must be finite and >= 0; got ${show(minutes)}`)
  }
  const rounded = Math.round(minutes)
  const hours = Math.floor(rounded / 60)
  const rest = rounded % 60
  if (hours === 0) return `${rest}m`
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`
}

/** A date-fns pattern (en-US, no Intl) applied to the calendar day; 'EEE, d MMM' by default,
 *  which gives 'Tue, 29 Sep'. Independent of the process zone. */
export function formatDateLabel(date: ISODate, pattern = 'EEE, d MMM'): string {
  const { year, month, day } = parseISODate(date)
  return formatDate(new TZDate(year, month - 1, day, 'UTC'), pattern, { locale: enUS })
}
