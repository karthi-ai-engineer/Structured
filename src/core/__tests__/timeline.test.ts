import { describe, expect, it } from 'vitest'
import type { Task } from '../tasks.ts'
import {
  editorWarnings,
  movedStart,
  nowItemIndex,
  resizedDuration,
  snapMinutes,
  timelineItems,
  type TimelineItem,
} from '../timeline.ts'

function timed(id: string, startTime: string, durationMin: number): Task {
  return {
    id,
    title: id,
    notes: null,
    icon: null,
    color: 'blue',
    subtasks: [],
    date: '2026-10-01',
    startTime,
    durationMin,
    isAllDay: false,
    completedAt: null,
    inboxOrder: 0,
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
    recurrence: null,
  }
}

const DAY = { start: 7 * 60, end: 22 * 60 }
const describeItems = (items: TimelineItem[]) =>
  items.map((i) =>
    i.kind === 'gap' ? `gap ${i.start}-${i.end}` : `${i.task.id}${i.overlaps ? ' (overlaps)' : ''}`,
  )

describe('timelineItems', () => {
  it('puts free time before, between and after tasks, inside the day hours', () => {
    const items = timelineItems([timed('a', '09:00', 60), timed('b', '10:00', 30)], DAY)
    expect(describeItems(items)).toEqual(['gap 07:00-09:00', 'a', 'b', 'gap 10:30-22:00'])
  })

  it('skips gaps shorter than 15 minutes and flags overlaps', () => {
    const items = timelineItems(
      [timed('a', '07:00', 50), timed('b', '08:00', 60), timed('c', '08:30', 60)],
      DAY,
    )
    expect(describeItems(items)).toEqual(['a', 'b (overlaps)', 'c (overlaps)', 'gap 09:30-22:00'])
  })

  it('hides free time that has passed, starting the next one at the next 5 minutes', () => {
    const items = timelineItems([timed('a', '12:00', 60)], DAY, 10 * 60 + 2)
    expect(describeItems(items)).toEqual(['gap 10:05-12:00', 'a', 'gap 13:00-22:00'])
    expect(timelineItems([timed('a', '12:00', 60)], DAY, 23 * 60)).toHaveLength(1)
  })

  it('keeps tasks outside the day hours and zero-length tasks in order', () => {
    const items = timelineItems(
      [timed('early', '06:00', 30), timed('ping', '08:00', 0), timed('late', '23:00', 30)],
      { start: 7 * 60, end: 9 * 60 },
    )
    expect(describeItems(items)).toEqual(['early', 'gap 07:00-09:00', 'ping', 'late'])
  })

  it('puts a task before free time that starts at the same minute', () => {
    const items = timelineItems([timed('ping', '07:00', 0)], { start: 7 * 60, end: 8 * 60 })
    expect(describeItems(items)).toEqual(['ping', 'gap 07:00-08:00'])
  })
})

describe('nowItemIndex', () => {
  const items = timelineItems([timed('a', '09:00', 60)], DAY, 8 * 60)
  it('places the line before the first item starting after now', () => {
    expect(describeItems(items)).toEqual(['gap 08:00-09:00', 'a', 'gap 10:00-22:00'])
    expect(nowItemIndex(items, 8 * 60)).toBe(0)
    expect(nowItemIndex(items, 9 * 60)).toBe(2)
    expect(nowItemIndex(items, 23 * 60)).toBe(3)
  })
})

describe('drag maths', () => {
  it('snaps to 5 minutes and stays on the day', () => {
    expect(snapMinutes(7)).toBe(5)
    expect(snapMinutes(-8)).toBe(-10)
    expect(movedStart('09:00', 62)).toBe('10:00')
    expect(movedStart('00:10', -60)).toBe('00:00')
    expect(movedStart('23:00', 120)).toBe('23:55')
  })

  it('resizes between 5 minutes and a day', () => {
    expect(resizedDuration(30, 14)).toBe(45)
    expect(resizedDuration(30, -60)).toBe(5)
    expect(resizedDuration(1400, 100)).toBe(1440)
  })

  it('a drag that ends where it started changes nothing (a 0-minute task stays 0)', () => {
    expect(resizedDuration(0, 2)).toBe(0)
    expect(resizedDuration(0, -2)).toBe(0)
    expect(resizedDuration(0, 5)).toBe(5)
    expect(movedStart('09:02', 1)).toBe('09:02')
  })
})

describe('editorWarnings', () => {
  it('drops the warnings about the past', () => {
    expect(
      editorWarnings([
        'Is on a past date (2026-01-01)',
        'Overlaps "a" (09:00–10:00)',
        'Starts earlier than now',
        'Runs past midnight',
      ]),
    ).toEqual(['Overlaps "a" (09:00–10:00)', 'Runs past midnight'])
  })
})
