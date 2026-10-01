import { describe, expect, it } from 'vitest'
import { TASK_ICON_NAMES } from '../icons.ts'
import { parseQuickAdd } from '../quickadd.ts'
import { keywordStyle, suggestStyle } from '../suggest.ts'

const TODAY = '2026-10-01' // a Thursday

describe('parseQuickAdd', () => {
  it('reads the full example', () => {
    expect(parseQuickAdd('Gym tomorrow 7am 1h !high ~2', TODAY)).toEqual({
      title: 'Gym',
      date: '2026-10-02',
      startTime: '07:00',
      durationMin: 60,
      priority: 1,
      energy: 2,
      found: [
        { kind: 'date', text: 'tomorrow' },
        { kind: 'time', text: '7am' },
        { kind: 'duration', text: '1h' },
        { kind: 'priority', text: '!high' },
        { kind: 'energy', text: '~2' },
      ],
    })
  })

  it('leaves plain text alone', () => {
    expect(parseQuickAdd('  Read  the paper ', TODAY)).toEqual({
      title: 'Read the paper',
      found: [],
    })
    // A bare number is not a time; "at 7" is.
    expect(parseQuickAdd('Call 3 people', TODAY).startTime).toBeUndefined()
    // "at 1" to "at 7" are in the afternoon.
    expect(parseQuickAdd('Call at 7', TODAY)).toMatchObject({ title: 'Call', startTime: '19:00' })
    expect(parseQuickAdd('Call at 8', TODAY).startTime).toBe('08:00')
  })

  it('reads dates', () => {
    const date = (text: string) => parseQuickAdd(`x ${text}`, TODAY).date
    expect(date('today')).toBe('2026-10-01')
    expect(date('tmrw')).toBe('2026-10-02')
    expect(date('thursday')).toBe('2026-10-01') // today counts
    expect(date('next thu')).toBe('2026-10-08')
    expect(date('mon')).toBeUndefined() // short names need "on", "next" or "this"
    expect(date('on mon')).toBe('2026-10-05')
    expect(date('this sat')).toBe('2026-10-03')
    expect(date('next monday')).toBe('2026-10-05')
    expect(date('in 3 days')).toBe('2026-10-04')
    expect(date('in 2 weeks')).toBe('2026-10-15')
    expect(date('oct 5')).toBe('2026-10-05')
    expect(date('5th october')).toBe('2026-10-05')
    expect(date('sep 30')).toBe('2027-09-30') // already past this year
    expect(date('feb 29')).toBe('2028-02-29')
    expect(date('2026-12-24')).toBe('2026-12-24')
    expect(date('on friday')).toBe('2026-10-02')
    expect(date('feb 30')).toBeUndefined()
    expect(parseQuickAdd('Mo night', TODAY).date).toBeUndefined() // too short for a weekday
  })

  it('reads times', () => {
    const time = (text: string) => parseQuickAdd(`x ${text}`, TODAY).startTime
    expect(time('7:30pm')).toBe('19:30')
    expect(time('12am')).toBe('00:00')
    expect(time('12pm')).toBe('12:00')
    expect(time('19:05')).toBe('19:05')
    expect(time('noon')).toBe('12:00')
    expect(time('at 18')).toBe('18:00')
    expect(time('at 9:15am')).toBe('09:15')
    expect(time('13pm')).toBeUndefined()
    expect(time('7:75')).toBeUndefined()
    expect(time('25:00')).toBeUndefined()
  })

  it('reads durations, priority and energy', () => {
    const p = (text: string) => parseQuickAdd(`x ${text}`, TODAY)
    expect(p('45m').durationMin).toBe(45)
    expect(p('90min').durationMin).toBe(90)
    expect(p('1h30').durationMin).toBe(90)
    expect(p('1.5h').durationMin).toBe(90)
    expect(p('for 2 hours').durationMin).toBeUndefined() // "2 hours" is two words
    expect(p('for 2h')).toMatchObject({ title: 'x', durationMin: 120 })
    expect(p('2000m').durationMin).toBeUndefined()
    expect(p('!3').priority).toBe(3)
    expect(p('!med').priority).toBe(2)
    expect(p('!urgent')).toMatchObject({ title: 'x !urgent' })
    expect(p('~-1').energy).toBe(-1)
    expect(p('~4')).toMatchObject({ title: 'x ~4' })
  })

  it('takes each kind once; the rest stays in the title', () => {
    expect(parseQuickAdd('Lunch today tomorrow 12pm 1pm', TODAY)).toMatchObject({
      title: 'Lunch tomorrow 1pm',
      date: '2026-10-01',
      startTime: '12:00',
    })
  })
})

describe('suggestions', () => {
  it('maps keywords to known icons and colors', () => {
    expect(keywordStyle('Gym session')).toEqual({ icon: 'dumbbell', color: 'orange' })
    expect(keywordStyle('Call about the gym')).toEqual({ icon: 'phone', color: 'blue' })
    expect(keywordStyle('Pay bills')).toEqual({ icon: 'wallet', color: 'green' })
    expect(keywordStyle('Weekly meetings')).toEqual({ icon: 'users', color: 'purple' })
    expect(keywordStyle('Something else')).toEqual({ icon: null, color: null })
  })

  it('only suggests icons the app knows', () => {
    const names = new Set<string>(TASK_ICON_NAMES)
    for (const word of [
      'gym',
      'run',
      'bike',
      'yoga',
      'call',
      'mail',
      'chat',
      'meet',
      'zoom',
      'demo',
      'code',
      'work',
      'read',
      'study',
      'write',
      'plan',
      'goal',
      'lunch',
      'tea',
      'nap',
      'wake',
      'night',
      'bath',
      'laundry',
      'shop',
      'pay',
      'clean',
      'drive',
      'trip',
      'dog',
      'doctor',
      'water',
      'music',
      'paint',
      'game',
      'gift',
      'family',
    ]) {
      const { icon } = keywordStyle(word)
      expect(icon && names.has(icon), word).toBe(true)
    }
  })

  it('prefers the latest task with the same title', () => {
    const history = [
      { title: 'Gym', icon: 'flame', color: 'coral' as const, updatedAt: '2026-09-01' },
      { title: 'gym ', icon: 'zap', color: 'teal' as const, updatedAt: '2026-09-20' },
      { title: 'Gym class', icon: 'star', color: 'pink' as const, updatedAt: '2026-09-25' },
    ]
    expect(suggestStyle('GYM', history)).toEqual({ icon: 'zap', color: 'teal' })
    expect(suggestStyle('Gym later', history)).toEqual({ icon: 'dumbbell', color: 'orange' })
    expect(suggestStyle('  ', history)).toEqual({ icon: null, color: null })
  })
})

describe('parseQuickAdd keeps ordinary titles (code review)', () => {
  it('leaves short weekday and month words alone', () => {
    for (const title of [
      'Sun salutation',
      'SAT prep',
      'Wed planning',
      'May review',
      'Report on march madness',
    ]) {
      expect(parseQuickAdd(title, TODAY), title).toEqual({ title, found: [] })
    }
  })

  it('keeps "this", "on" and "next" unless a weekday follows', () => {
    expect(parseQuickAdd('Review this tomorrow', TODAY)).toMatchObject({
      title: 'Review this',
      date: '2026-10-02',
    })
    expect(parseQuickAdd('Plan next week', TODAY)).toEqual({ title: 'Plan next week', found: [] })
    expect(parseQuickAdd('Gym on wed 7am', TODAY)).toMatchObject({
      title: 'Gym',
      date: '2026-10-07',
      startTime: '07:00',
    })
  })

  it('keeps quoted text as typed', () => {
    expect(parseQuickAdd('"Gym tomorrow" class 6pm', TODAY)).toMatchObject({
      title: 'Gym tomorrow class',
      startTime: '18:00',
    })
    expect(parseQuickAdd('"" Read', TODAY)).toEqual({ title: 'Read', found: [] })
  })

  it('a bare m stops at 90 minutes; longer needs min', () => {
    expect(parseQuickAdd('Run 100m', TODAY)).toEqual({ title: 'Run 100m', found: [] })
    expect(parseQuickAdd('Study 120min', TODAY)).toMatchObject({ title: 'Study', durationMin: 120 })
  })
})
