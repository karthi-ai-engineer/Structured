import { describe, expect, it } from 'vitest'
import { addMinutesToTime, fromMinutes, isTime, toMinutes } from '../dates.ts'
import type { TimeOptions } from '../dates.ts'

// docs/phases/phase-0/PLAN.md section 13.1 (dates.time.test.ts).

const END: TimeOptions = { endOfDay: true }

const valid: [time: string, options: TimeOptions | undefined, minutes: number][] = [
  ['00:00', undefined, 0],
  ['09:30', undefined, 570],
  ['23:59', undefined, 1439],
  ['07:00:00', undefined, 420],
  ['23:59:59', undefined, 1439],
  ['09:30:00.5', undefined, 570],
  ['23:59:59.999', undefined, 1439],
  ['24:00', END, 1440],
  ['24:00:00', END, 1440],
  ['24:00:00.000000', END, 1440],
  ['09:30', END, 570],
  ['09:30:00.123456', undefined, 570],
]

const invalid: [time: string, options: TimeOptions | undefined][] = [
  ['24:00', undefined],
  ['24:00:00', undefined],
  ['24:00', { endOfDay: false }],
  ['24:01', END],
  ['24:00:01', END],
  ['24:00:00.5', END],
  ['24:30', END],
  ['24:01', undefined],
  ['24:30', undefined],
  ['', undefined],
  ['9:30', undefined],
  ['12:60', undefined],
  ['ab:cd', undefined],
  [' 09:30', undefined],
  ['09:30 ', undefined],
  ['09:30:60', undefined],
  ['-01:00', undefined],
  ['0930', undefined],
  ['25:00', END],
  ['09:30:', undefined],
  ['09:30:00.', undefined],
  ['09:30+05:30', undefined],
]

describe('toMinutes', () => {
  it.each(valid)('%j with %j is %i', (time, options, minutes) => {
    expect(toMinutes(time, options)).toBe(minutes)
  })

  it.each(invalid)('%j with %j is a RangeError', (time, options) => {
    expect(() => toMinutes(time, options)).toThrow(RangeError)
  })

  it('explains that 24:00 needs { endOfDay: true }', () => {
    expect(() => toMinutes('24:00')).toThrow(/only valid with \{ endOfDay: true \}/)
    expect(() => toMinutes('9:30')).toThrow(/toMinutes: invalid time "9:30"; expected HH:mm/)
  })

  it('shortens long inputs in the message', () => {
    expect(() => toMinutes('1'.repeat(100))).toThrow(/"1{39}\.\.\./)
  })

  it('rejects non-string input without a TypeError', () => {
    expect(() => toMinutes(930 as unknown as string)).toThrow(RangeError)
  })
})

describe('isTime', () => {
  it.each(valid)('%j with %j is true', (time, options) => {
    expect(isTime(time, options)).toBe(true)
  })

  it.each(invalid)('%j with %j is false', (time, options) => {
    expect(isTime(time, options)).toBe(false)
  })

  it('agrees with toMinutes for every case, with and without endOfDay', () => {
    const inputs = [...valid, ...invalid].map(([time]) => time)
    for (const time of inputs) {
      for (const options of [undefined, {}, END, { endOfDay: false }]) {
        let parses = true
        try {
          toMinutes(time, options)
        } catch {
          parses = false
        }
        expect(isTime(time, options), `${JSON.stringify(time)} ${JSON.stringify(options)}`).toBe(
          parses,
        )
      }
    }
  })

  it('never throws on non-string input', () => {
    expect(isTime(undefined as unknown as string)).toBe(false)
    expect(isTime(null as unknown as string, END)).toBe(false)
  })
})

describe('fromMinutes', () => {
  it.each`
    minutes | time
    ${0}    | ${'00:00'}
    ${570}  | ${'09:30'}
    ${1439} | ${'23:59'}
    ${1440} | ${'24:00'}
  `('$minutes is $time', ({ minutes, time }: { minutes: number; time: string }) => {
    expect(fromMinutes(minutes)).toBe(time)
  })

  it.each([-1, 1441, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    '%s is a RangeError',
    (minutes) => {
      expect(() => fromMinutes(minutes)).toThrow(RangeError)
    },
  )

  it('round-trips with toMinutes for every minute 0..1440', () => {
    for (let n = 0; n <= 1440; n += 1) {
      expect(toMinutes(fromMinutes(n), END)).toBe(n)
    }
  })
})

describe('addMinutesToTime', () => {
  it.each`
    time       | delta          | result     | dayOffset
    ${'23:30'} | ${60}          | ${'00:30'} | ${1}
    ${'00:15'} | ${-30}         | ${'23:45'} | ${-1}
    ${'09:00'} | ${0}           | ${'09:00'} | ${0}
    ${'10:00'} | ${2880}        | ${'10:00'} | ${2}
    ${'24:00'} | ${0}           | ${'00:00'} | ${1}
    ${'24:00'} | ${1439}        | ${'23:59'} | ${1}
    ${'00:00'} | ${-1440}       | ${'00:00'} | ${-1}
    ${'00:00'} | ${-1441}       | ${'23:59'} | ${-2}
    ${'12:00'} | ${-2880 - 720} | ${'00:00'} | ${-2}
    ${'09:30'} | ${1_000_000}   | ${'20:10'} | ${694}
  `(
    '$time + $delta is $result, day $dayOffset',
    ({
      time,
      delta,
      result,
      dayOffset,
    }: {
      time: string
      delta: number
      result: string
      dayOffset: number
    }) => {
      expect(addMinutesToTime(time, delta)).toEqual({ time: result, dayOffset })
    },
  )

  it('stays exact for the largest safe delta', () => {
    const { time, dayOffset } = addMinutesToTime('00:00', Number.MAX_SAFE_INTEGER)
    expect(time).toBe(fromMinutes(Number.MAX_SAFE_INTEGER % 1440))
    expect(dayOffset).toBe(Math.floor(Number.MAX_SAFE_INTEGER / 1440))
  })

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    'a delta of %s is a RangeError',
    (delta) => {
      expect(() => addMinutesToTime('09:00', delta)).toThrow(RangeError)
    },
  )

  it('rejects an invalid time', () => {
    expect(() => addMinutesToTime('24:01', 0)).toThrow(RangeError)
  })
})
