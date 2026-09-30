import { describe, expect, expectTypeOf, it } from 'vitest'
import * as dates from '../dates.ts'
import type { ISODate, TimeFormat, TimeOptions, WeekStart } from '../dates.ts'

// The public surface of src/core/dates.ts (docs/phases/phase-0/PLAN.md section 6.1). A change
// here is an API change for every caller: update the plan and this file together.
describe('dates.ts API', () => {
  it('exports exactly the planned runtime values', () => {
    expect(Object.keys(dates).sort()).toEqual(
      [
        'MAX_ISO_DATE',
        'MINUTES_PER_DAY',
        'MIN_ISO_DATE',
        'addDays',
        'addMinutesToTime',
        'assertTimeZone',
        'dayOfWeek',
        'diffDays',
        'formatDateLabel',
        'formatDuration',
        'formatTime',
        'fromMinutes',
        'isISODate',
        'isTime',
        'isValidTimeZone',
        'msUntilNextDayIn',
        'normalizeTimeZone',
        'nowIso',
        'nowMinutesIn',
        'parseISODate',
        'startOfDayInstant',
        'startOfWeek',
        'toMinutes',
        'toWeekStart',
        'todayIn',
        'weekRange',
        'zonedDateTimeToInstant',
      ].sort(),
    )
  })

  it('has the planned constants', () => {
    expect(dates.MINUTES_PER_DAY).toBe(1440)
    expect(dates.MIN_ISO_DATE).toBe('1900-01-01')
    expect(dates.MAX_ISO_DATE).toBe('2999-12-31')
    expectTypeOf<typeof dates.MINUTES_PER_DAY>().toEqualTypeOf<1440>()
    expectTypeOf<typeof dates.MIN_ISO_DATE>().toEqualTypeOf<'1900-01-01'>()
    expectTypeOf<typeof dates.MAX_ISO_DATE>().toEqualTypeOf<'2999-12-31'>()
  })

  it('has the planned types', () => {
    expectTypeOf<ISODate>().toEqualTypeOf<string>()
    expectTypeOf<TimeFormat>().toEqualTypeOf<'12h' | '24h'>()
    expectTypeOf<WeekStart>().toEqualTypeOf<0 | 1 | 2 | 3 | 4 | 5 | 6>()
    expectTypeOf<TimeOptions>().toEqualTypeOf<{ endOfDay?: boolean }>()
    expectTypeOf<dates.WeekRange>().toEqualTypeOf<{
      start: ISODate
      end: ISODate
      days: readonly ISODate[]
    }>()
    expectTypeOf<dates.ShiftedTime>().toEqualTypeOf<{ time: string; dayOffset: number }>()
  })

  it('has the planned zone signatures', () => {
    expectTypeOf(dates.isValidTimeZone).toEqualTypeOf<(tz: string) => boolean>()
    expectTypeOf(dates.assertTimeZone).toEqualTypeOf<(tz: string) => void>()
    expectTypeOf(dates.normalizeTimeZone).toEqualTypeOf<(tz: string) => string>()
  })

  it('has the planned calendar signatures', () => {
    expectTypeOf(dates.isISODate).toEqualTypeOf<(value: string) => boolean>()
    expectTypeOf(dates.parseISODate).toEqualTypeOf<
      (value: string) => { year: number; month: number; day: number }
    >()
    expectTypeOf(dates.addDays).toEqualTypeOf<(date: ISODate, days: number) => ISODate>()
    expectTypeOf(dates.diffDays).toEqualTypeOf<(later: ISODate, earlier: ISODate) => number>()
    expectTypeOf(dates.dayOfWeek).toEqualTypeOf<(date: ISODate) => WeekStart>()
    expectTypeOf(dates.toWeekStart).toEqualTypeOf<(n: number) => WeekStart>()
    expectTypeOf(dates.startOfWeek).toEqualTypeOf<
      (date: ISODate, weekStart: WeekStart) => ISODate
    >()
    expectTypeOf(dates.weekRange).toEqualTypeOf<
      (
        date: ISODate,
        weekStart: WeekStart,
      ) => { start: ISODate; end: ISODate; days: readonly ISODate[] }
    >()
  })

  it('has the planned clock signatures (now is optional)', () => {
    expectTypeOf(dates.todayIn).toEqualTypeOf<(tz: string, now?: Date) => ISODate>()
    expectTypeOf(dates.nowMinutesIn).toEqualTypeOf<(tz: string, now?: Date) => number>()
    expectTypeOf(dates.msUntilNextDayIn).toEqualTypeOf<(tz: string, now?: Date) => number>()
  })

  it('has the planned time-of-day signatures', () => {
    expectTypeOf(dates.isTime).toEqualTypeOf<(value: string, options?: TimeOptions) => boolean>()
    expectTypeOf(dates.toMinutes).toEqualTypeOf<(time: string, options?: TimeOptions) => number>()
    expectTypeOf(dates.fromMinutes).toEqualTypeOf<(minutes: number) => string>()
    expectTypeOf(dates.addMinutesToTime).toEqualTypeOf<
      (time: string, delta: number) => { time: string; dayOffset: number }
    >()
  })

  it('has the planned instant signatures', () => {
    expectTypeOf(dates.zonedDateTimeToInstant).toEqualTypeOf<
      (date: ISODate, time: string, tz: string) => Date
    >()
    expectTypeOf(dates.startOfDayInstant).toEqualTypeOf<(date: ISODate, tz: string) => Date>()
  })

  it('has the planned display signatures', () => {
    expectTypeOf(dates.formatTime).toEqualTypeOf<(minutes: number, format: TimeFormat) => string>()
    expectTypeOf(dates.formatDuration).toEqualTypeOf<(minutes: number) => string>()
    expectTypeOf(dates.formatDateLabel).toEqualTypeOf<(date: ISODate, pattern?: string) => string>()
  })
})
