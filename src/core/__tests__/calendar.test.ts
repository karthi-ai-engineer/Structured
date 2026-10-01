import { describe, expect, it } from 'vitest'
import {
  addMonths,
  fitIntoDay,
  isISOMonth,
  monthGrid,
  monthOf,
  tasksByDay,
  weekDays,
} from '../calendar.ts'
import type { Task } from '../tasks.ts'

function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    notes: null,
    icon: null,
    color: 'blue',
    subtasks: [],
    date: '2026-10-01',
    startTime: '09:00',
    durationMin: 30,
    isAllDay: false,
    completedAt: null,
    inboxOrder: 0,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    recurrence: null,
    ...extra,
  }
}

describe('months', () => {
  it('validates, derives and steps months across years', () => {
    expect(isISOMonth('2026-10')).toBe(true)
    expect(isISOMonth('2026-13')).toBe(false)
    expect(isISOMonth('2026-1')).toBe(false)
    expect(monthOf('2026-10-31')).toBe('2026-10')
    expect(addMonths('2026-12', 1)).toBe('2027-01')
    expect(addMonths('2026-01', -1)).toBe('2025-12')
    expect(addMonths('2026-10', -22)).toBe('2024-12')
  })

  it('builds six full weeks from the configured week start', () => {
    const grid = monthGrid('2026-10', 1) // October 2026 starts on a Thursday
    expect(grid).toHaveLength(42)
    expect(grid[0]).toBe('2026-09-28')
    expect(grid[41]).toBe('2026-11-08')
    expect(monthGrid('2026-10', 0)[0]).toBe('2026-09-27')
  })

  it('lists the week of a date', () => {
    expect(weekDays('2026-10-01', 1)).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ])
  })
})

describe('tasksByDay', () => {
  it('groups by date in display order and skips inbox tasks', () => {
    const byDay = tasksByDay([
      task('late', { startTime: '18:00' }),
      task('allday', { isAllDay: true, startTime: null }),
      task('early', { startTime: '07:00' }),
      task('other', { date: '2026-10-02' }),
      task('inbox', { date: null, startTime: null }),
    ])
    expect(byDay.get('2026-10-01')?.map((t) => t.id)).toEqual(['allday', 'early', 'late'])
    expect(byDay.get('2026-10-02')?.map((t) => t.id)).toEqual(['other'])
    expect([...byDay.keys()]).toHaveLength(2)
  })
})

describe('fitIntoDay', () => {
  const DAY = { start: 7 * 60, end: 22 * 60 }

  it('fills free time from now on, oldest first, around existing tasks', () => {
    const today = [task('meeting', { startTime: '10:00', durationMin: 60 })]
    const overdue = [
      task('a', { durationMin: 45 }),
      task('b', { durationMin: 30 }),
      task('c', { durationMin: 60 }),
    ]
    const { placed, unplaced } = fitIntoDay(overdue, today, DAY, 9 * 60 + 2)
    expect(placed.map((p) => `${p.task.id} ${p.startTime}`)).toEqual([
      'a 09:05', // 09:05-10:00 holds 45 minutes
      'b 11:00', // what is left before the meeting (09:50-10:00) is too short
      'c 11:30',
    ])
    expect(unplaced).toEqual([])
  })

  it('reports what does not fit, and places all-day or zero-length tasks anywhere', () => {
    const { placed, unplaced } = fitIntoDay(
      [
        task('big', { durationMin: 120 }),
        task('ping', { durationMin: 0 }),
        task('day', { isAllDay: true }),
      ],
      [],
      DAY,
      21 * 60,
    )
    expect(unplaced.map((t) => t.id)).toEqual(['big'])
    expect(placed.map((p) => `${p.task.id} ${p.startTime}`)).toEqual(['ping 21:00', 'day 21:01'])
  })

  it('places nothing after the day is over', () => {
    expect(fitIntoDay([task('a')], [], DAY, 22 * 60).unplaced).toHaveLength(1)
  })
})
