import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayOfWeek,
  diffDays,
  isISODate,
  parseISODate,
  startOfWeek,
  toWeekStart,
  weekRange,
} from '../dates.ts'
import type { WeekStart } from '../dates.ts'

// docs/phases/phase-0/PLAN.md section 13.1 (dates.calendar.test.ts). Calendar arithmetic must
// not depend on the process zone (America/St_Johns has DST on 2026-03-08 and 2026-11-01).

describe('isISODate', () => {
  it.each([
    '2028-02-29',
    '1900-01-01',
    '2999-12-31',
    '2000-02-29',
    '2026-09-29',
    '2026-04-30',
    '2026-12-31',
  ])('accepts %j', (value) => {
    expect(isISODate(value)).toBe(true)
  })

  it.each([
    '2026-02-29',
    '2026-02-30',
    '2026-13-01',
    '2026-1-1',
    '26-01-01',
    '0026-01-01',
    '1899-12-31',
    '3000-01-01',
    '2026-01-01T00:00',
    '',
    '1900-02-29',
    '2026-04-31',
    '2026-00-10',
    '2026-01-00',
    ' 2026-01-01',
    '2026-01-01 ',
    '2026/01/01',
    String.fromCharCode(0xff12) + '026-01-01', // a fullwidth digit two: \d must not match it
  ])('rejects %j', (value) => {
    expect(isISODate(value)).toBe(false)
  })

  it('never throws on non-string input', () => {
    expect(isISODate(undefined as unknown as string)).toBe(false)
    expect(isISODate(20260101 as unknown as string)).toBe(false)
  })
})

describe('parseISODate', () => {
  it('returns the numeric parts', () => {
    expect(parseISODate('2026-09-29')).toEqual({ year: 2026, month: 9, day: 29 })
    expect(parseISODate('1900-01-01')).toEqual({ year: 1900, month: 1, day: 1 })
  })

  it('names the problem', () => {
    expect(() => parseISODate('2026-02-30')).toThrow(
      /parseISODate: invalid date "2026-02-30"; expected a real calendar day/,
    )
  })
})

describe('addDays', () => {
  it.each`
    date            | days   | result          | why
    ${'2026-01-31'} | ${1}   | ${'2026-02-01'} | ${'month end'}
    ${'2028-02-28'} | ${1}   | ${'2028-02-29'} | ${'leap day'}
    ${'2026-12-31'} | ${1}   | ${'2027-01-01'} | ${'year end'}
    ${'2026-03-08'} | ${1}   | ${'2026-03-09'} | ${'the process zone springs forward that day'}
    ${'2026-11-01'} | ${-1}  | ${'2026-10-31'} | ${'the process zone falls back that day'}
    ${'2026-09-29'} | ${0}   | ${'2026-09-29'} | ${'+ 0 is the same date'}
    ${'2026-09-29'} | ${365} | ${'2027-09-29'} | ${'one year later'}
    ${'2028-02-29'} | ${366} | ${'2029-03-01'} | ${'366 days after a leap day'}
    ${'1900-01-01'} | ${0}   | ${'1900-01-01'} | ${'first supported day'}
    ${'2999-12-30'} | ${1}   | ${'2999-12-31'} | ${'last supported day'}
    ${'2026-09-29'} | ${-0}  | ${'2026-09-29'} | ${'negative zero'}
  `(
    '$date + $days is $result ($why)',
    ({ date, days, result }: { date: string; days: number; result: string }) => {
      expect(addDays(date, days)).toBe(result)
    },
  )

  it.each`
    date            | days          | why
    ${'2026-02-30'} | ${1}          | ${'invalid date'}
    ${'2026-09-29'} | ${1.5}        | ${'fractional days'}
    ${'2026-09-29'} | ${Number.NaN} | ${'NaN'}
    ${'2999-12-31'} | ${1}          | ${'after the last supported day'}
    ${'1900-01-01'} | ${-1}         | ${'before the first supported day'}
    ${'2026-09-29'} | ${1e9}        | ${'far out of range'}
    ${'2026-09-29'} | ${2 ** 60}    | ${'not a safe integer'}
  `('$date + $days is a RangeError ($why)', ({ date, days }: { date: string; days: number }) => {
    expect(() => addDays(date, days)).toThrow(RangeError)
  })

  it('names the range in the message', () => {
    expect(() => addDays('2999-12-31', 1)).toThrow(
      /addDays: 2999-12-31 \+ 1 days is outside 1900-01-01 to 2999-12-31/,
    )
    expect(() => addDays('1900-01-01', -1)).toThrow(/1900-01-01 - 1 days is outside/)
  })
})

describe('diffDays', () => {
  it.each`
    later           | earlier         | days
    ${'2027-01-01'} | ${'2026-12-31'} | ${1}
    ${'2026-12-31'} | ${'2027-01-01'} | ${-1}
    ${'2026-11-02'} | ${'2026-10-31'} | ${2}
    ${'2026-09-29'} | ${'2026-09-29'} | ${0}
    ${'2999-12-31'} | ${'1900-01-01'} | ${401_766}
  `(
    '$later - $earlier is $days',
    ({ later, earlier, days }: { later: string; earlier: string; days: number }) => {
      expect(diffDays(later, earlier)).toBe(days)
    },
  )

  it('is the inverse of addDays', () => {
    for (const days of [-400, -31, -1, 0, 1, 29, 365, 1461]) {
      expect(diffDays(addDays('2026-09-29', days), '2026-09-29')).toBe(days)
    }
  })

  it('rejects invalid dates', () => {
    expect(() => diffDays('2026-02-30', '2026-01-01')).toThrow(RangeError)
    expect(() => diffDays('2026-01-01', 'yesterday')).toThrow(RangeError)
  })
})

describe('dayOfWeek', () => {
  it.each`
    date            | day
    ${'2026-09-29'} | ${2}
    ${'2027-01-01'} | ${5}
    ${'2026-09-27'} | ${0}
    ${'2026-10-03'} | ${6}
    ${'1900-01-01'} | ${1}
  `('$date is day $day', ({ date, day }: { date: string; day: number }) => {
    expect(dayOfWeek(date)).toBe(day)
  })

  it('rejects an invalid date', () => {
    expect(() => dayOfWeek('2026-02-30')).toThrow(RangeError)
  })
})

describe('toWeekStart', () => {
  it.each([0, 1, 2, 3, 4, 5, 6])('accepts %i', (n) => {
    expect(toWeekStart(n)).toBe(n)
  })

  it.each([7, 1.5, -1, Number.NaN])('rejects %s', (n) => {
    expect(() => toWeekStart(n)).toThrow(RangeError)
  })
})

describe('weekRange / startOfWeek', () => {
  it.each`
    date            | weekStart | start           | end
    ${'2026-09-29'} | ${1}      | ${'2026-09-28'} | ${'2026-10-04'}
    ${'2026-09-29'} | ${0}      | ${'2026-09-27'} | ${'2026-10-03'}
    ${'2026-09-29'} | ${6}      | ${'2026-09-26'} | ${'2026-10-02'}
    ${'2027-01-01'} | ${1}      | ${'2026-12-28'} | ${'2027-01-03'}
    ${'2026-09-28'} | ${1}      | ${'2026-09-28'} | ${'2026-10-04'}
    ${'2026-10-04'} | ${1}      | ${'2026-09-28'} | ${'2026-10-04'}
    ${'2026-09-26'} | ${6}      | ${'2026-09-26'} | ${'2026-10-02'}
    ${'2026-11-01'} | ${0}      | ${'2026-11-01'} | ${'2026-11-07'}
  `(
    '$date with week start $weekStart is $start to $end',
    ({
      date,
      weekStart,
      start,
      end,
    }: {
      date: string
      weekStart: WeekStart
      start: string
      end: string
    }) => {
      const range = weekRange(date, weekStart)
      expect(range.start).toBe(start)
      expect(range.end).toBe(end)
      expect(range.days).toHaveLength(7)
      expect(range.days[0]).toBe(start)
      expect(range.days[6]).toBe(end)
      range.days.forEach((day, index) => {
        expect(diffDays(day, start)).toBe(index)
      })
      expect(range.days).toContain(date)
      expect(startOfWeek(date, weekStart)).toBe(start)
    },
  )

  it('returns an immutable days list', () => {
    expect(Object.isFrozen(weekRange('2026-09-29', 1).days)).toBe(true)
  })

  it('agrees with startOfWeek for every week start over two months', () => {
    for (let offset = 0; offset < 60; offset += 1) {
      const date = addDays('2026-09-01', offset)
      for (const weekStart of [0, 1, 2, 3, 4, 5, 6] as const) {
        const range = weekRange(date, weekStart)
        expect(range.start).toBe(startOfWeek(date, weekStart))
        expect(dayOfWeek(range.start)).toBe(weekStart)
        expect(diffDays(date, range.start)).toBeGreaterThanOrEqual(0)
        expect(diffDays(date, range.start)).toBeLessThan(7)
      }
    }
  })

  it('rejects an invalid week start or date, and weeks that leave the range', () => {
    expect(() => weekRange('2026-09-29', 7 as WeekStart)).toThrow(RangeError)
    expect(() => startOfWeek('2026-09-29', 1.5 as WeekStart)).toThrow(RangeError)
    expect(() => weekRange('2026-02-30', 1)).toThrow(RangeError)
    expect(() => weekRange('2999-12-31', 1)).toThrow(RangeError)
    expect(() => weekRange('1900-01-01', 0)).toThrow(RangeError)
  })
})
