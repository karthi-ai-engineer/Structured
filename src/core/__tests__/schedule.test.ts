import { describe, expect, it } from 'vitest'
import {
  findFreeSlots,
  overlappingPairs,
  plannedTaskWarnings,
  taskInterval,
  windowOf,
  type PlannedTask,
  type WarningContext,
} from '../schedule.ts'
import type { Task } from '../tasks.ts'

function task(
  id: string,
  startTime: string | null,
  durationMin: number,
  extra: Partial<Task> = {},
): Task {
  return {
    id,
    title: id,
    notes: null,
    icon: null,
    color: 'blue',
    subtasks: [],
    date: '2099-03-10',
    startTime,
    durationMin,
    isAllDay: false,
    completedAt: null,
    inboxOrder: 0,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    recurrence: null,
    ...extra,
  }
}

describe('taskInterval', () => {
  it('returns minutes for timed tasks, clamped at midnight', () => {
    expect(taskInterval(task('a', '09:00', 90))).toEqual({ start: 540, end: 630 })
    expect(taskInterval(task('b', '23:30', 90))).toEqual({ start: 1410, end: 1440 })
    expect(taskInterval(task('c', null, 30))).toBeNull()
    expect(taskInterval(task('d', '09:00', 30, { isAllDay: true }))).toBeNull()
  })
})

describe('findFreeSlots', () => {
  const window = { start: 7 * 60, end: 22 * 60 }

  it('finds the gaps between busy intervals, respecting the minimum', () => {
    const busy = [
      { start: 9 * 60, end: 10 * 60 },
      { start: 8 * 60, end: 8 * 60 + 30 },
      { start: 10 * 60 + 10, end: 12 * 60 },
    ]
    expect(findFreeSlots(busy, window, 30)).toEqual([
      { start: '07:00', end: '08:00', minutes: 60 },
      { start: '08:30', end: '09:00', minutes: 30 },
      { start: '12:00', end: '22:00', minutes: 600 },
    ])
  })

  it('merges overlapping busy time and ignores time outside the window', () => {
    const busy = [
      { start: 6 * 60, end: 7 * 60 + 30 },
      { start: 7 * 60 + 15, end: 9 * 60 },
      { start: 21 * 60 + 30, end: 23 * 60 },
    ]
    expect(findFreeSlots(busy, window, 15)).toEqual([
      { start: '09:00', end: '21:30', minutes: 750 },
    ])
  })

  it('returns the whole window when nothing is planned, and nothing when fully busy', () => {
    expect(findFreeSlots([], window, 30)).toEqual([{ start: '07:00', end: '22:00', minutes: 900 }])
    expect(findFreeSlots([{ start: 0, end: 1440 }], window, 1)).toEqual([])
  })

  it('ignores zero-length tasks, which take no time', () => {
    const busy = [{ start: 10 * 60, end: 10 * 60 }]
    expect(findFreeSlots(busy, { start: 9 * 60, end: 12 * 60 }, 150)).toEqual([
      { start: '09:00', end: '12:00', minutes: 180 },
    ])
  })

  it('reports a window that reaches midnight as ending at 24:00', () => {
    expect(findFreeSlots([], { start: 23 * 60, end: 1440 }, 30)).toEqual([
      { start: '23:00', end: '24:00', minutes: 60 },
    ])
  })
})

describe('windowOf', () => {
  it('reads day hours, treating an end at or before the start as midnight', () => {
    expect(windowOf({ dayStart: '07:00', dayEnd: '22:00' })).toEqual({ start: 420, end: 1320 })
    expect(windowOf({ dayStart: '07:00', dayEnd: '07:00' })).toEqual({ start: 420, end: 1440 })
  })
})

describe('overlappingPairs', () => {
  it('lists every overlapping pair of timed tasks, touching ends excluded', () => {
    const tasks = [
      task('a', '09:00', 60),
      task('b', '09:30', 60),
      task('c', '10:00', 30), // touches a's end, overlaps b
      task('d', '12:00', 0), // zero length: never overlaps
      task('e', null, 30), // all-day
      task('f', '11:55', 30),
    ]
    expect(overlappingPairs(tasks)).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ])
  })
})

describe('plannedTaskWarnings', () => {
  const ctx: WarningContext = {
    sameDay: [
      { title: 'Standup', isAllDay: false, startTime: '09:30', durationMin: 15, completedAt: null },
      {
        title: 'Done call',
        isAllDay: false,
        startTime: '09:00',
        durationMin: 60,
        completedAt: 'x',
      },
      { title: 'Holiday', isAllDay: true, startTime: null, durationMin: 0, completedAt: null },
    ],
    window: { dayStart: '07:00', dayEnd: '22:00' },
    today: '2099-03-10',
    nowMinutes: 8 * 60,
  }
  const planned = (p: Partial<PlannedTask>): PlannedTask => ({
    title: 'Deep work',
    date: '2099-03-10',
    startTime: '09:00',
    durationMin: 60,
    isAllDay: false,
    ...p,
  })

  it('warns about overlaps with open tasks only', () => {
    expect(plannedTaskWarnings(planned({}), ctx)).toEqual(['Overlaps "Standup" (09:30–09:45)'])
  })

  it('warns about day hours, the past and midnight', () => {
    expect(plannedTaskWarnings(planned({ startTime: '06:30', durationMin: 30 }), ctx)).toEqual([
      'Outside your day hours (07:00–22:00)',
      'Starts earlier than now',
    ])
    expect(plannedTaskWarnings(planned({ startTime: '23:30', durationMin: 60 }), ctx)).toEqual([
      'Outside your day hours (07:00–22:00)',
      'Runs past midnight',
    ])
    expect(plannedTaskWarnings(planned({ date: '2099-03-09', startTime: '12:00' }), ctx)).toEqual([
      'Is on a past date (2099-03-09)',
    ])
  })

  it('has nothing to say about inbox and clean all-day tasks', () => {
    expect(plannedTaskWarnings(planned({ date: null, startTime: null }), ctx)).toEqual([])
    expect(plannedTaskWarnings(planned({ isAllDay: true, startTime: null }), ctx)).toEqual([])
    expect(plannedTaskWarnings(planned({ startTime: '12:00' }), ctx)).toEqual([])
  })
})
