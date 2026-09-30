import { describe, expect, it } from 'vitest'
import { formatDateLabel, formatDuration, formatTime } from '../dates.ts'
import type { TimeFormat } from '../dates.ts'

// docs/phases/phase-0/PLAN.md section 13.1 (dates.format.test.ts). The display helpers never use
// Intl, so these strings are identical on every Node, ICU and browser build.

describe('formatTime', () => {
  it.each`
    minutes | h24        | h12
    ${570}  | ${'09:30'} | ${'9:30 AM'}
    ${0}    | ${'00:00'} | ${'12:00 AM'}
    ${720}  | ${'12:00'} | ${'12:00 PM'}
    ${1439} | ${'23:59'} | ${'11:59 PM'}
    ${1440} | ${'24:00'} | ${'12:00 AM'}
    ${60}   | ${'01:00'} | ${'1:00 AM'}
    ${719}  | ${'11:59'} | ${'11:59 AM'}
    ${780}  | ${'13:00'} | ${'1:00 PM'}
  `(
    '$minutes is $h24 / $h12',
    ({ minutes, h24, h12 }: { minutes: number; h24: string; h12: string }) => {
      expect(formatTime(minutes, '24h')).toBe(h24)
      expect(formatTime(minutes, '12h')).toBe(h12)
    },
  )

  it('uses a plain ASCII space before AM/PM', () => {
    expect(formatTime(570, '12h')).toMatch(/^9:30 AM$/)
    expect([...formatTime(570, '12h')].every((char) => char.charCodeAt(0) < 128)).toBe(true)
  })

  it.each([-1, 1441, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    '%s minutes is a RangeError',
    (minutes) => {
      expect(() => formatTime(minutes, '24h')).toThrow(RangeError)
      expect(() => formatTime(minutes, '12h')).toThrow(RangeError)
    },
  )

  it('rejects an unknown format', () => {
    expect(() => formatTime(570, '36h' as TimeFormat)).toThrow(/format must be '12h' or '24h'/)
  })
})

describe('formatDuration', () => {
  it.each`
    minutes | label
    ${0}    | ${'0m'}
    ${1}    | ${'1m'}
    ${45}   | ${'45m'}
    ${60}   | ${'1h'}
    ${90}   | ${'1h 30m'}
    ${1440} | ${'24h'}
    ${1500} | ${'25h'}
    ${2.5}  | ${'3m'}
    ${90.4} | ${'1h 30m'}
    ${59.6} | ${'1h'}
    ${0.4}  | ${'0m'}
    ${-0}   | ${'0m'}
    ${6001} | ${'100h 1m'}
  `('$minutes is $label', ({ minutes, label }: { minutes: number; label: string }) => {
    expect(formatDuration(minutes)).toBe(label)
  })

  it.each([-5, -0.4, Number.NaN, Number.POSITIVE_INFINITY])('%s is a RangeError', (minutes) => {
    expect(() => formatDuration(minutes)).toThrow(RangeError)
  })
})

describe('formatDateLabel', () => {
  it('uses the default pattern EEE, d MMM', () => {
    expect(formatDateLabel('2026-09-29')).toBe('Tue, 29 Sep')
  })

  it.each`
    date            | pattern              | label
    ${'2026-09-29'} | ${'d MMMM yyyy'}     | ${'29 September 2026'}
    ${'2026-09-29'} | ${'EEEE'}            | ${'Tuesday'}
    ${'1900-01-01'} | ${'EEE, d MMM yyyy'} | ${'Mon, 1 Jan 1900'}
    ${'2999-12-31'} | ${'yyyy-MM-dd'}      | ${'2999-12-31'}
    ${'2026-03-08'} | ${'d MMM HH:mm'}     | ${'8 Mar 00:00'}
  `(
    '$date with $pattern is $label',
    ({ date, pattern, label }: { date: string; pattern: string; label: string }) => {
      expect(formatDateLabel(date, pattern)).toBe(label)
    },
  )

  it('is independent of the process zone (America/St_Johns in tests)', () => {
    // St_Johns springs forward on 2026-03-08 and is behind UTC: a local-time Date would show the
    // previous day for a UTC midnight. The label must still be the calendar day itself.
    expect(new Date(Date.UTC(2026, 2, 8)).getDate()).toBe(7)
    expect(formatDateLabel('2026-03-08')).toBe('Sun, 8 Mar')
    expect(formatDateLabel('2026-11-01')).toBe('Sun, 1 Nov')
  })

  it('rejects an invalid date', () => {
    expect(() => formatDateLabel('2026-02-30')).toThrow(RangeError)
  })
})
