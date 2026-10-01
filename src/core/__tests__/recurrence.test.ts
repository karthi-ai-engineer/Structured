import { describe, expect, it } from 'vitest'
import {
  describeRule,
  formatRule,
  isValidUntil,
  occurrencesIn,
  occursOn,
  ordinal,
  parseRule,
  presetOf,
  presetRule,
  sameRule,
  shiftWeekdays,
  validateRule,
  type RepeatRule,
} from '../recurrence.ts'

const daily: RepeatRule = { freq: 'daily', interval: 1, weekdays: [] }
const rule = (text: string): RepeatRule => {
  const r = parseRule(text)
  if (!r) throw new Error(`bad rule ${text}`)
  return r
}

describe('parseRule / formatRule', () => {
  it('round-trips the supported subset', () => {
    for (const text of [
      'FREQ=DAILY',
      'FREQ=DAILY;INTERVAL=3',
      'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
      'FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,SA',
      'FREQ=MONTHLY',
      'FREQ=YEARLY;INTERVAL=99',
    ]) {
      expect(formatRule(rule(text))).toBe(text)
    }
  })

  it('normalizes case, order, duplicates and interval 1', () => {
    expect(parseRule('freq=weekly;byday=fr,mo,fr;interval=1')).toEqual({
      freq: 'weekly',
      interval: 1,
      weekdays: [1, 5],
    })
    expect(formatRule({ freq: 'monthly', interval: 1, weekdays: [3] })).toBe('FREQ=MONTHLY')
  })

  it('rejects anything it cannot represent', () => {
    for (const text of [
      null,
      undefined,
      '',
      'FREQ=HOURLY',
      'INTERVAL=2',
      'FREQ=DAILY;INTERVAL=0',
      'FREQ=DAILY;INTERVAL=100',
      'FREQ=DAILY;INTERVAL=x',
      'FREQ=DAILY;COUNT=5',
      'FREQ=DAILY;FREQ=WEEKLY',
      'FREQ=DAILY;BYDAY=MO',
      'FREQ=WEEKLY;BYDAY=XX',
      'FREQ=DAILY;INTERVAL',
      'FREQ=DAILY=1',
    ]) {
      expect(parseRule(text), String(text)).toBeNull()
    }
  })
})

describe('validateRule / sameRule / isValidUntil', () => {
  it('reports bad intervals and empty weekly rules', () => {
    expect(validateRule(daily)).toEqual([])
    expect(validateRule({ ...daily, interval: 0 })).toEqual(['Repeat every 1 to 99'])
    expect(validateRule({ ...daily, interval: 1.5 })).toEqual(['Repeat every 1 to 99'])
    expect(validateRule({ freq: 'weekly', interval: 1, weekdays: [] })).toEqual([
      'Pick at least one weekday',
    ])
  })

  it('compares rules by meaning', () => {
    expect(sameRule(null, null)).toBe(true)
    expect(sameRule(daily, null)).toBe(false)
    expect(sameRule(rule('FREQ=WEEKLY;BYDAY=MO,FR'), rule('FREQ=WEEKLY;BYDAY=FR,MO'))).toBe(true)
    expect(sameRule(daily, { ...daily, interval: 2 })).toBe(false)
  })

  it('accepts no end or an end on or after the start', () => {
    expect(isValidUntil(null, '2026-10-01')).toBe(true)
    expect(isValidUntil('2026-10-01', '2026-10-01')).toBe(true)
    expect(isValidUntil('2026-09-30', '2026-10-01')).toBe(false)
    expect(isValidUntil('2026-02-30', '2026-01-01')).toBe(false)
  })
})

describe('occursOn / occurrencesIn', () => {
  it('daily, every n days, from the start and up to the end', () => {
    expect(occurrencesIn(daily, '2026-10-01', '2026-10-03', '2026-09-28', '2026-10-09')).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ])
    expect(
      occurrencesIn(rule('FREQ=DAILY;INTERVAL=3'), '2026-10-01', null, '2026-10-02', '2026-10-10'),
    ).toEqual(['2026-10-04', '2026-10-07', '2026-10-10'])
    expect(occursOn(daily, '2026-10-01', null, '2026-09-30')).toBe(false)
  })

  it('weekly on chosen days, every n weeks counted from the start week (Monday-based)', () => {
    // 2026-10-01 is a Thursday. Every 2 weeks on Mon and Thu.
    const r = rule('FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,TH')
    expect(occurrencesIn(r, '2026-10-01', null, '2026-09-28', '2026-10-19')).toEqual([
      '2026-10-01',
      '2026-10-12',
      '2026-10-15',
    ])
    // Sunday belongs to the week that started on the Monday before it.
    const sundays = rule('FREQ=WEEKLY;INTERVAL=2;BYDAY=SU')
    expect(occurrencesIn(sundays, '2026-10-01', null, '2026-10-01', '2026-10-31')).toEqual([
      '2026-10-04',
      '2026-10-18',
    ])
  })

  it('weekly without weekdays uses the start weekday', () => {
    const r: RepeatRule = { freq: 'weekly', interval: 1, weekdays: [] }
    expect(occurrencesIn(r, '2026-10-01', null, '2026-10-01', '2026-10-15')).toEqual([
      '2026-10-01',
      '2026-10-08',
      '2026-10-15',
    ])
  })

  it('monthly on the 31st falls back to the last day of shorter months', () => {
    const r = rule('FREQ=MONTHLY')
    expect(occurrencesIn(r, '2026-01-31', null, '2026-01-01', '2026-05-31')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ])
    expect(occurrencesIn(r, '2028-01-30', null, '2028-02-01', '2028-02-29')).toEqual(['2028-02-29'])
    const quarterly = rule('FREQ=MONTHLY;INTERVAL=3')
    expect(occurrencesIn(quarterly, '2026-01-15', null, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-15',
      '2026-04-15',
      '2026-07-15',
      '2026-10-15',
    ])
  })

  it('yearly on Feb 29 falls on Feb 28 in other years', () => {
    const r = rule('FREQ=YEARLY')
    expect(occurrencesIn(r, '2028-02-29', null, '2028-01-01', '2032-12-31')).toEqual([
      '2028-02-29',
      '2029-02-28',
      '2030-02-28',
      '2031-02-28',
      '2032-02-29',
    ])
    expect(occursOn(rule('FREQ=YEARLY;INTERVAL=2'), '2026-03-05', null, '2027-03-05')).toBe(false)
    expect(occursOn(rule('FREQ=YEARLY;INTERVAL=2'), '2026-03-05', null, '2028-03-05')).toBe(true)
    expect(occursOn(r, '2026-03-05', null, '2027-04-05')).toBe(false)
  })

  it('returns nothing for a range before the start or after the end', () => {
    expect(occurrencesIn(daily, '2026-10-10', null, '2026-10-01', '2026-10-09')).toEqual([])
    expect(occurrencesIn(daily, '2026-10-01', '2026-10-05', '2026-10-06', '2026-10-09')).toEqual([])
  })
})

describe('describeRule', () => {
  it('reads like a sentence', () => {
    const start = '2026-10-01' // a Thursday
    expect(describeRule(daily, start)).toBe('Every day')
    expect(describeRule(rule('FREQ=DAILY;INTERVAL=2'), start)).toBe('Every 2 days')
    expect(describeRule(rule('FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'), start)).toBe('Every weekday')
    expect(describeRule(rule('FREQ=WEEKLY;BYDAY=SU,MO,TU,WE,TH,FR,SA'), start)).toBe('Every day')
    expect(describeRule(rule('FREQ=WEEKLY;INTERVAL=2;BYDAY=SU,MO'), start)).toBe(
      'Every 2 weeks on Mon, Sun',
    )
    expect(describeRule({ freq: 'weekly', interval: 1, weekdays: [] }, start)).toBe(
      'Every week on Thu',
    )
    expect(describeRule(rule('FREQ=MONTHLY'), start)).toBe('Every month on the 1st')
    expect(describeRule(rule('FREQ=MONTHLY;INTERVAL=2'), '2026-10-31')).toBe(
      'Every 2 months on the 31st (or the last day)',
    )
    expect(describeRule(rule('FREQ=YEARLY'), '2026-03-05')).toBe('Every year on 5 March')
  })

  it('formats ordinals', () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31, 111].map(ordinal)).toEqual([
      '1st',
      '2nd',
      '3rd',
      '4th',
      '11th',
      '12th',
      '13th',
      '21st',
      '22nd',
      '23rd',
      '31st',
      '111th',
    ])
  })
})

describe('presets', () => {
  const start = '2026-10-01' // Thursday
  it('maps presets to rules and back', () => {
    for (const p of ['daily', 'weekdays', 'weekly', 'monthly', 'yearly'] as const) {
      expect(presetOf(presetRule(p, start), start)).toBe(p)
    }
    expect(presetRule('weekly', start)).toEqual({ freq: 'weekly', interval: 1, weekdays: [4] })
    expect(presetRule('never', start)).toBeNull()
    expect(presetRule('custom', start)).toBeNull()
    expect(presetOf(null, start)).toBe('never')
    expect(presetOf(rule('FREQ=DAILY;INTERVAL=2'), start)).toBe('custom')
    // Weekly on another weekday than the start's is custom.
    expect(presetOf(rule('FREQ=WEEKLY;BYDAY=MO'), start)).toBe('custom')
  })
})

describe('shiftWeekdays', () => {
  it('moves weekly days, wrapping around the week; other rules stay', () => {
    expect(shiftWeekdays(rule('FREQ=WEEKLY;BYDAY=MO,SA'), 1).weekdays).toEqual([0, 2])
    expect(shiftWeekdays(rule('FREQ=WEEKLY;BYDAY=MO'), -1).weekdays).toEqual([0])
    const weekly = rule('FREQ=WEEKLY;BYDAY=WE')
    expect(shiftWeekdays(weekly, 14)).toBe(weekly)
    expect(shiftWeekdays(daily, 3)).toBe(daily)
    const implicit: RepeatRule = { freq: 'weekly', interval: 1, weekdays: [] }
    expect(shiftWeekdays(implicit, 2)).toBe(implicit)
  })
})
