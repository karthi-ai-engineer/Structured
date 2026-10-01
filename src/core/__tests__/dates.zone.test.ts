import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  nowMs,
  assertTimeZone,
  isValidTimeZone,
  msUntilNextDayIn,
  normalizeTimeZone,
  nowMinutesIn,
  startOfDayInstant,
  todayIn,
  zonedDateTimeToInstant,
} from '../dates.ts'

// docs/phases/phase-0/PLAN.md section 13.1. Every call passes an explicit instant; the process
// zone is America/St_Johns (vitest.config.ts), so any use of the machine zone would fail here.

const at = (iso: string): Date => new Date(iso)
const iso = (date: Date): string => date.toISOString()
// U+2212 MINUS SIGN: Intl accepts it in an offset and resolves it to '-05:30'.
const UNICODE_MINUS = String.fromCharCode(0x2212)

describe('todayIn / nowMinutesIn', () => {
  it.each`
    instant                       | tz                       | today           | minutes | why
    ${'2026-09-28T18:40:00Z'}     | ${'Asia/Kolkata'}        | ${'2026-09-29'} | ${10}   | ${'UTC+05:30, already tomorrow'}
    ${'2026-09-28T18:40:00Z'}     | ${'America/New_York'}    | ${'2026-09-28'} | ${880}  | ${'UTC-4 (EDT)'}
    ${'2026-09-28T18:40:00Z'}     | ${'Pacific/Chatham'}     | ${'2026-09-29'} | ${505}  | ${'UTC+13:45 (DST)'}
    ${'2026-09-28T18:40:00Z'}     | ${'Europe/London'}       | ${'2026-09-28'} | ${1180} | ${'UTC+1 (BST)'}
    ${'2026-09-28T18:40:00Z'}     | ${'UTC'}                 | ${'2026-09-28'} | ${1120} | ${'UTC'}
    ${'2026-09-28T18:29:59.999Z'} | ${'Asia/Kolkata'}        | ${'2026-09-28'} | ${1439} | ${'last millisecond before midnight'}
    ${'2026-09-28T18:30:00Z'}     | ${'Asia/Kolkata'}        | ${'2026-09-29'} | ${0}    | ${'exactly midnight'}
    ${'2026-03-08T06:59:00Z'}     | ${'America/New_York'}    | ${'2026-03-08'} | ${119}  | ${'spring forward, before'}
    ${'2026-03-08T07:00:00Z'}     | ${'America/New_York'}    | ${'2026-03-08'} | ${180}  | ${'spring forward, after (02:00 to 03:00 skipped)'}
    ${'2026-11-01T05:30:00Z'}     | ${'America/New_York'}    | ${'2026-11-01'} | ${90}   | ${'repeated hour, first 01:30'}
    ${'2026-11-01T06:30:00Z'}     | ${'America/New_York'}    | ${'2026-11-01'} | ${90}   | ${'repeated hour, second 01:30'}
    ${'2026-03-29T00:59:00Z'}     | ${'Europe/London'}       | ${'2026-03-29'} | ${59}   | ${'spring forward, before'}
    ${'2026-03-29T01:00:00Z'}     | ${'Europe/London'}       | ${'2026-03-29'} | ${120}  | ${'spring forward, after'}
    ${'2026-10-25T00:30:00Z'}     | ${'Europe/London'}       | ${'2026-10-25'} | ${90}   | ${'repeated hour, first 01:30'}
    ${'2026-10-25T01:30:00Z'}     | ${'Europe/London'}       | ${'2026-10-25'} | ${90}   | ${'repeated hour, second 01:30'}
    ${'2026-09-26T13:59:00Z'}     | ${'Pacific/Chatham'}     | ${'2026-09-27'} | ${164}  | ${'spring forward at 02:45, before'}
    ${'2026-09-26T14:00:00Z'}     | ${'Pacific/Chatham'}     | ${'2026-09-27'} | ${225}  | ${'spring forward at 02:45, after'}
    ${'2026-04-04T13:59:00Z'}     | ${'Pacific/Chatham'}     | ${'2026-04-05'} | ${224}  | ${'fall back at 03:45, before'}
    ${'2026-04-04T14:00:00Z'}     | ${'Pacific/Chatham'}     | ${'2026-04-05'} | ${165}  | ${'fall back at 03:45, after'}
    ${'2026-12-31T11:00:00Z'}     | ${'Pacific/Chatham'}     | ${'2027-01-01'} | ${45}   | ${'year boundary'}
    ${'2026-09-06T03:59:00Z'}     | ${'America/Santiago'}    | ${'2026-09-05'} | ${1439} | ${'before a midnight gap'}
    ${'2026-09-06T04:00:00Z'}     | ${'America/Santiago'}    | ${'2026-09-06'} | ${60}   | ${'midnight does not exist; the day starts at 01:00'}
    ${'2026-10-03T15:29:00Z'}     | ${'Australia/Lord_Howe'} | ${'2026-10-04'} | ${119}  | ${'30-minute gap, before'}
    ${'2026-10-03T15:30:00Z'}     | ${'Australia/Lord_Howe'} | ${'2026-10-04'} | ${150}  | ${'30-minute gap, after'}
    ${'2026-04-04T14:45:00Z'}     | ${'Australia/Lord_Howe'} | ${'2026-04-05'} | ${105}  | ${'repeated half hour, first 01:45'}
    ${'2026-04-04T15:15:00Z'}     | ${'Australia/Lord_Howe'} | ${'2026-04-05'} | ${105}  | ${'repeated half hour, second 01:45'}
  `(
    '$instant in $tz is $today, minute $minutes ($why)',
    ({
      instant,
      tz,
      today,
      minutes,
    }: {
      instant: string
      tz: string
      today: string
      minutes: number
    }) => {
      expect(todayIn(tz, at(instant))).toBe(today)
      expect(nowMinutesIn(tz, at(instant))).toBe(minutes)
    },
  )

  it('accepts any spelling Intl accepts (case, aliases)', () => {
    expect(todayIn('asia/kolkata', at('2026-09-28T18:40:00Z'))).toBe('2026-09-29')
    expect(nowMinutesIn('Asia/Calcutta', at('2026-09-28T18:40:00Z'))).toBe(10)
  })

  it('floors seconds for nowMinutesIn', () => {
    expect(nowMinutesIn('UTC', at('2026-09-28T18:40:59.999Z'))).toBe(1120)
  })

  it('reads historical offsets exactly, including negative offsets under an hour', () => {
    // Europe/Dublin used Dublin Mean Time (UTC-00:25:21) until 1916; tzOffset() gets its sign wrong.
    expect(todayIn('Europe/Dublin', at('1910-06-01T00:10:00Z'))).toBe('1910-05-31')
    expect(nowMinutesIn('Europe/Dublin', at('1910-06-01T12:00:00Z'))).toBe(11 * 60 + 34)
  })

  it('rejects local dates outside the supported range', () => {
    expect(() => todayIn('UTC', at('1899-12-31T12:00:00Z'))).toThrow(RangeError)
    expect(() => todayIn('Pacific/Kiritimati', at('2999-12-31T12:00:00Z'))).toThrow(
      /outside 1900-01-01 to 2999-12-31/,
    )
    expect(todayIn('Asia/Tokyo', at('1899-12-31T18:00:00Z'))).toBe('1900-01-01')
    expect(todayIn('Pacific/Pago_Pago', at('3000-01-01T06:00:00Z'))).toBe('2999-12-31')
  })
})

describe('zonedDateTimeToInstant / startOfDayInstant', () => {
  it.each`
    date            | time          | tz                       | instant                       | why
    ${'2026-03-08'} | ${'02:30'}    | ${'America/New_York'}    | ${'2026-03-08T07:30:00.000Z'} | ${'gap, shifted forward'}
    ${'2026-11-01'} | ${'01:30'}    | ${'America/New_York'}    | ${'2026-11-01T05:30:00.000Z'} | ${'ambiguous, earlier'}
    ${'2026-03-29'} | ${'01:30'}    | ${'Europe/London'}       | ${'2026-03-29T01:30:00.000Z'} | ${'gap'}
    ${'2026-10-25'} | ${'01:30'}    | ${'Europe/London'}       | ${'2026-10-25T00:30:00.000Z'} | ${'ambiguous, earlier'}
    ${'2026-09-27'} | ${'03:00'}    | ${'Pacific/Chatham'}     | ${'2026-09-26T14:15:00.000Z'} | ${'gap'}
    ${'2026-04-05'} | ${'03:00'}    | ${'Pacific/Chatham'}     | ${'2026-04-04T13:15:00.000Z'} | ${'ambiguous, earlier (TZDate says 14:15Z)'}
    ${'2026-09-29'} | ${'09:00'}    | ${'Asia/Kolkata'}        | ${'2026-09-29T03:30:00.000Z'} | ${'no DST'}
    ${'2026-09-06'} | ${'00:00'}    | ${'America/Santiago'}    | ${'2026-09-06T04:00:00.000Z'} | ${'midnight gap = start of day'}
    ${'2026-10-04'} | ${'02:15'}    | ${'Australia/Lord_Howe'} | ${'2026-10-03T15:45:00.000Z'} | ${'30-minute gap'}
    ${'2026-04-05'} | ${'01:45'}    | ${'Australia/Lord_Howe'} | ${'2026-04-04T14:45:00.000Z'} | ${'ambiguous, earlier (TZDate says 15:15Z)'}
    ${'2026-09-29'} | ${'24:00'}    | ${'Asia/Kolkata'}        | ${'2026-09-29T18:30:00.000Z'} | ${'end of day = next midnight'}
    ${'2026-04-04'} | ${'23:30'}    | ${'America/Santiago'}    | ${'2026-04-05T02:30:00.000Z'} | ${'repeated hour before midnight, earlier'}
    ${'2010-11-07'} | ${'00:00'}    | ${'America/St_Johns'}    | ${'2010-11-07T02:30:00.000Z'} | ${'midnight repeats (fall back at 00:01), earlier'}
    ${'2026-09-29'} | ${'09:30:45'} | ${'UTC'}                 | ${'2026-09-29T09:30:00.000Z'} | ${'seconds are floored away'}
    ${'1910-06-01'} | ${'12:00'}    | ${'Europe/Dublin'}       | ${'1910-06-01T12:25:21.000Z'} | ${'historical offset UTC-00:25:21'}
    ${'2999-12-31'} | ${'24:00'}    | ${'UTC'}                 | ${'3000-01-01T00:00:00.000Z'} | ${'end of the last supported day'}
  `(
    '$date $time in $tz is $instant ($why)',
    ({ date, time, tz, instant }: { date: string; time: string; tz: string; instant: string }) => {
      expect(iso(zonedDateTimeToInstant(date, time, tz))).toBe(instant)
    },
  )

  it.each`
    date            | tz                    | instant                       | why
    ${'2026-09-30'} | ${'Asia/Tokyo'}       | ${'2026-09-29T15:00:00.000Z'} | ${'plain midnight'}
    ${'2026-09-06'} | ${'America/Santiago'} | ${'2026-09-06T04:00:00.000Z'} | ${'gap starting at midnight: the day starts at 01:00'}
    ${'1919-03-31'} | ${'America/Toronto'}  | ${'1919-03-31T04:30:00.000Z'} | ${'gap 23:30 to 00:30: the day starts at 00:30'}
    ${'2010-11-07'} | ${'America/St_Johns'} | ${'2010-11-07T02:30:00.000Z'} | ${'midnight repeats: the earlier one'}
    ${'2011-12-30'} | ${'Pacific/Apia'}     | ${'2011-12-30T10:00:00.000Z'} | ${'skipped day: the moment it was skipped'}
    ${'2011-12-31'} | ${'Pacific/Apia'}     | ${'2011-12-30T10:00:00.000Z'} | ${'the day after the skipped one'}
  `(
    'startOfDayInstant($date, $tz) is $instant ($why)',
    ({ date, tz, instant }: { date: string; tz: string; instant: string }) => {
      expect(iso(startOfDayInstant(date, tz))).toBe(instant)
    },
  )

  it('differs from 00:00 only when a gap began before midnight', () => {
    // 'compatible' moves 00:00 forward by the whole gap (to 01:00); the day began at 00:30.
    expect(iso(zonedDateTimeToInstant('1919-03-31', '00:00', 'America/Toronto'))).toBe(
      '1919-03-31T05:00:00.000Z',
    )
    expect(todayIn('America/Toronto', at('1919-03-31T04:30:00Z'))).toBe('1919-03-31')
    expect(nowMinutesIn('America/Toronto', at('1919-03-31T04:30:00Z'))).toBe(30)
    expect(todayIn('America/Toronto', at('1919-03-31T04:29:59Z'))).toBe('1919-03-30')
  })

  it('startOfDayInstant rejects invalid input', () => {
    expect(() => startOfDayInstant('2026-02-30', 'UTC')).toThrow(/startOfDayInstant: invalid date/)
    expect(() => startOfDayInstant('2026-09-30', '+09:00')).toThrow(RangeError)
  })

  it('round-trips with todayIn / nowMinutesIn outside transitions', () => {
    const instant = zonedDateTimeToInstant('2026-09-29', '09:00', 'Pacific/Chatham')
    expect(todayIn('Pacific/Chatham', instant)).toBe('2026-09-29')
    expect(nowMinutesIn('Pacific/Chatham', instant)).toBe(540)
  })
})

describe('msUntilNextDayIn', () => {
  it.each`
    tz                    | now                           | ms            | why
    ${'Asia/Kolkata'}     | ${'2026-09-28T18:40:00Z'}     | ${85_800_000} | ${'23 h 50 min'}
    ${'America/New_York'} | ${'2026-11-01T04:00:00Z'}     | ${90_000_000} | ${'25-hour day'}
    ${'America/New_York'} | ${'2026-03-08T05:00:00Z'}     | ${82_800_000} | ${'23-hour day'}
    ${'America/Santiago'} | ${'2026-09-05T12:00:00Z'}     | ${57_600_000} | ${'next midnight is in a gap: the day starts at 01:00'}
    ${'America/Santiago'} | ${'2026-04-05T02:30:00Z'}     | ${5_400_000}  | ${'first 23:30 of a repeated hour before midnight'}
    ${'America/Santiago'} | ${'2026-04-05T03:30:00Z'}     | ${1_800_000}  | ${'second 23:30 of a repeated hour before midnight'}
    ${'America/St_Johns'} | ${'2010-11-07T02:00:00Z'}     | ${1_800_000}  | ${'23:30 before a midnight that repeats (fall back at 00:01)'}
    ${'America/St_Johns'} | ${'2010-11-07T03:00:00Z'}     | ${1_800_000}  | ${'second 23:30, after the first midnight: the second midnight is next'}
    ${'America/St_Johns'} | ${'2010-11-07T02:30:30Z'}     | ${89_970_000} | ${'00:00:30 on the first pass: today is already Nov 7'}
    ${'America/Toronto'}  | ${'1919-03-31T04:00:00Z'}     | ${1_800_000}  | ${'23:00 before a 23:30 to 00:30 gap: the day starts at 00:30'}
    ${'Pacific/Apia'}     | ${'2011-12-29T09:00:00Z'}     | ${3_600_000}  | ${'23:00 on Dec 29; Dec 30 was skipped'}
    ${'UTC'}              | ${'2026-09-28T23:59:59.999Z'} | ${1}          | ${'one millisecond to go'}
    ${'UTC'}              | ${'2026-09-29T00:00:00Z'}     | ${86_400_000} | ${'exactly midnight: a whole day to go'}
  `('$tz at $now: $ms ms ($why)', ({ tz, now, ms }: { tz: string; now: string; ms: number }) => {
    expect(msUntilNextDayIn(tz, at(now))).toBe(ms)
  })

  it('fails on the last supported day, which has no next day', () => {
    expect(() => msUntilNextDayIn('UTC', at('2999-12-31T12:00:00Z'))).toThrow(RangeError)
  })
})

describe('time-zone validation', () => {
  it.each`
    tz                         | valid
    ${''}                      | ${false}
    ${' Asia/Kolkata'}         | ${false}
    ${'Asia/Kolkata '}         | ${false}
    ${'+05:30'}                | ${false}
    ${'-03:30'}                | ${false}
    ${'+0530'}                 | ${false}
    ${UNICODE_MINUS + '05:30'} | ${false}
    ${'Mars/Olympus'}          | ${false}
    ${'asia/kolkata'}          | ${true}
    ${'Asia/Kolkata'}          | ${true}
    ${'UTC'}                   | ${true}
    ${'Etc/GMT-14'}            | ${true}
    ${'America/Nuuk'}          | ${true}
  `('isValidTimeZone($tz) is $valid', ({ tz, valid }: { tz: string; valid: boolean }) => {
    expect(isValidTimeZone(tz)).toBe(valid)
    expect(isValidTimeZone(tz)).toBe(valid) // cached path
    if (valid) expect(() => assertTimeZone(tz)).not.toThrow()
    else expect(() => assertTimeZone(tz)).toThrow(RangeError)
  })

  it('never throws on non-string input', () => {
    expect(isValidTimeZone(undefined as unknown as string)).toBe(false)
    expect(isValidTimeZone(5 as unknown as string)).toBe(false)
  })

  it('normalizes to an Intl spelling without asserting one exact alias', () => {
    expect(normalizeTimeZone('asia/kolkata')).toMatch(/^Asia\/(Kolkata|Calcutta)$/)
    expect(normalizeTimeZone('utc')).toBe('UTC')
    expect(() => normalizeTimeZone('Mars/X')).toThrow(RangeError)
  })

  it('names the problem in the error message', () => {
    expect(() => assertTimeZone('+05:30')).toThrow(/assertTimeZone: invalid time zone "\+05:30"/)
  })
})

describe('invalid input', () => {
  it('rejects an unknown zone', () => {
    expect(() => todayIn('Mars/Olympus', at('2026-09-28T18:40:00Z'))).toThrow(RangeError)
    expect(() => nowMinutesIn('Mars/Olympus', at('2026-09-28T18:40:00Z'))).toThrow(RangeError)
    expect(() => msUntilNextDayIn('Mars/Olympus', at('2026-09-28T18:40:00Z'))).toThrow(RangeError)
    expect(() => zonedDateTimeToInstant('2026-09-29', '09:00', 'Mars/Olympus')).toThrow(RangeError)
  })

  it('rejects an Invalid Date, a non-Date and instants far outside the range', () => {
    expect(() => todayIn('UTC', new Date(Number.NaN))).toThrow(/now must be a valid Date/)
    expect(() => nowMinutesIn('UTC', new Date(Number.NaN))).toThrow(RangeError)
    expect(() => msUntilNextDayIn('UTC', new Date(Number.NaN))).toThrow(RangeError)
    expect(() => todayIn('UTC', '2026-09-28' as unknown as Date)).toThrow(RangeError)
    expect(() => todayIn('UTC', at('1800-01-01T00:00:00Z'))).toThrow(RangeError)
    expect(() => todayIn('UTC', at('3001-01-01T00:00:00Z'))).toThrow(RangeError)
  })

  it('rejects an impossible date or time', () => {
    expect(() => zonedDateTimeToInstant('2026-02-30', '09:00', 'UTC')).toThrow(RangeError)
    expect(() => zonedDateTimeToInstant('2026-09-29', '9:00', 'UTC')).toThrow(RangeError)
    expect(() => startOfDayInstant('2026-13-01', 'UTC')).toThrow(RangeError)
  })
})

describe('default clock', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // The only test that relies on the implicit `now = new Date()`.
  it('reads the (faked) system clock when now is omitted', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-28T18:40:00Z'))
    expect(todayIn('Asia/Kolkata')).toBe('2026-09-29')
    expect(nowMinutesIn('Asia/Kolkata')).toBe(10)
    expect(msUntilNextDayIn('Asia/Kolkata')).toBe(85_800_000)
    expect(nowMs()).toBe(Date.parse('2026-09-28T18:40:00Z'))
  })
})
