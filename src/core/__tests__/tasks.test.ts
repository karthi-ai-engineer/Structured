import { describe, expect, it } from 'vitest'
import {
  applyPatch,
  belongsTo,
  colorHex,
  firstEmoji,
  isAllDayLike,
  isTaskColor,
  layoutDay,
  nextStartTime,
  normalizeTitle,
  nowLineIndex,
  parseSubtasks,
  pillHeight,
  sortInbox,
  taskEnd,
  taskProgress,
  TASK_COLORS,
  validateDraft,
  type Task,
  type TaskDraft,
} from '../tasks.ts'

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: 'id-1',
    title: 'Task',
    notes: null,
    icon: null,
    color: 'coral',
    subtasks: [],
    date: '2026-10-01',
    startTime: '09:00',
    durationMin: 30,
    isAllDay: false,
    energy: null,
    alerts: null,
    priority: null,
    dueDate: null,
    completedAt: null,
    inboxOrder: 0,
    createdAt: '2026-09-30T00:00:00.000Z',
    updatedAt: '2026-09-30T00:00:00.000Z',
    recurrence: null,
    ...overrides,
  }
}

const draft: TaskDraft = {
  title: 'Deep work',
  notes: null,
  icon: 'laptop',
  color: 'blue',
  subtasks: [],
  date: '2026-10-01',
  startTime: '09:00',
  durationMin: 90,
  isAllDay: false,
  energy: null,
  alerts: null,
  priority: null,
  dueDate: null,
}

describe('colors', () => {
  it('knows the ten palette colors', () => {
    expect(TASK_COLORS).toHaveLength(10)
    expect(isTaskColor('teal')).toBe(true)
    expect(isTaskColor('magenta')).toBe(false)
    expect(isTaskColor(3)).toBe(false)
  })

  it('maps a color to its hex value', () => {
    expect(colorHex('blue')).toBe('#54A0FF')
    // Defensive fallback for a value that slipped past the type system.
    expect(colorHex('nope' as never)).toBe('#FF6B6B')
  })
})

describe('parseSubtasks', () => {
  it('keeps well-formed entries and drops malformed ones', () => {
    expect(
      parseSubtasks([
        { id: 'a', title: 'One', done: true },
        { id: 'b', title: 'Two' },
        { id: '', title: 'no id' },
        { id: 'c', title: 5 },
        null,
        'text',
      ]),
    ).toEqual([
      { id: 'a', title: 'One', done: true },
      { id: 'b', title: 'Two', done: false },
    ])
  })

  it('returns [] for anything that is not an array', () => {
    expect(parseSubtasks(null)).toEqual([])
    expect(parseSubtasks({ id: 'a' })).toEqual([])
  })
})

describe('titles and validation', () => {
  it('normalizes whitespace', () => {
    expect(normalizeTitle('  Gym   at  7 ')).toBe('Gym at 7')
  })

  it('accepts a valid draft', () => {
    expect(validateDraft(draft)).toEqual([])
    expect(validateDraft({ ...draft, date: null, startTime: null })).toEqual([])
  })

  it('reports every problem', () => {
    expect(
      validateDraft({
        ...draft,
        title: '   ',
        durationMin: 1.5,
        date: '2026-13-01',
        startTime: '25:00',
        color: 'magenta' as never,
      }),
    ).toEqual([
      'Title is required',
      'Duration must be a whole number of minutes from 0 to 1440',
      'Date is invalid',
      'Start time is invalid',
      'Color is invalid',
    ])
    expect(validateDraft({ ...draft, title: 'x'.repeat(201) })).toEqual([
      'Title must be at most 200 characters',
    ])
    expect(validateDraft({ ...draft, durationMin: -1 })).toHaveLength(1)
    expect(validateDraft({ ...draft, durationMin: 1441 })).toHaveLength(1)
  })
})

describe('scheduling rules', () => {
  it('requires a start time for a timed task on a date', () => {
    expect(validateDraft({ ...draft, startTime: null })).toEqual([
      'Pick a start time or turn on All day',
    ])
    expect(validateDraft({ ...draft, startTime: null, isAllDay: true })).toEqual([])
    expect(validateDraft({ ...draft, date: null, startTime: null })).toEqual([])
  })

  it('rejects a blank custom duration (NaN) instead of saving 0 minutes', () => {
    expect(validateDraft({ ...draft, durationMin: Number.NaN })).toEqual([
      'Duration must be a whole number of minutes from 0 to 1440',
    ])
  })
})

describe('firstEmoji', () => {
  it('keeps the first emoji grapheme whole and rejects text', () => {
    expect(firstEmoji('🏋️ gym')).toBe('🏋️')
    expect(firstEmoji('👩‍💻')).toBe('👩‍💻')
    expect(firstEmoji('👍🏽x')).toBe('👍🏽')
    expect(firstEmoji('  🎉 ')).toBe('🎉')
    expect(firstEmoji('hello')).toBeNull()
    expect(firstEmoji('sun')).toBeNull()
    expect(firstEmoji('')).toBeNull()
  })
})

describe('timeline logic', () => {
  it('treats all-day and time-less tasks as all-day', () => {
    expect(isAllDayLike({ isAllDay: true, startTime: '09:00' })).toBe(true)
    expect(isAllDayLike({ isAllDay: false, startTime: null })).toBe(true)
    expect(isAllDayLike({ isAllDay: false, startTime: '09:00' })).toBe(false)
  })

  it('computes the end of a timed task, spilling past midnight', () => {
    expect(taskEnd(task({ startTime: '09:00', durationMin: 90 }))).toEqual({
      time: '10:30',
      dayOffset: 0,
    })
    expect(taskEnd(task({ startTime: '23:30', durationMin: 60 }))).toEqual({
      time: '00:30',
      dayOffset: 1,
    })
    expect(taskEnd(task({ isAllDay: true }))).toBeNull()
  })

  it('lays out a day: all-day by creation, timed by start then creation', () => {
    const a = task({ id: 'a', startTime: '10:00', createdAt: '2026-09-30T01:00:00Z' })
    const b = task({ id: 'b', startTime: '08:00' })
    const c = task({ id: 'c', startTime: '10:00', createdAt: '2026-09-30T00:30:00Z' })
    const d = task({ id: 'd', isAllDay: true, createdAt: '2026-09-30T02:00:00Z' })
    const e = task({ id: 'e', startTime: null, createdAt: '2026-09-30T01:00:00Z' })
    const same1 = task({ id: 's1', startTime: '12:00' })
    const same2 = task({ id: 's2', startTime: '12:00' })
    const layout = layoutDay([a, b, c, d, e, same2, same1])
    expect(layout.allDay.map((t) => t.id)).toEqual(['e', 'd'])
    expect(layout.timed.map((t) => t.id)).toEqual(['b', 'c', 'a', 's1', 's2'])
  })

  it('sorts the inbox by manual order, then oldest first', () => {
    const x = task({ id: 'x', inboxOrder: 2 })
    const y = task({ id: 'y', inboxOrder: 1, createdAt: '2026-09-30T05:00:00Z' })
    const z = task({ id: 'z', inboxOrder: 1, createdAt: '2026-09-30T04:00:00Z' })
    expect(sortInbox([x, y, z]).map((t) => t.id)).toEqual(['z', 'y', 'x'])
  })

  it('sizes pills between 44 and 220 px', () => {
    expect(pillHeight(1)).toBe(44)
    expect(pillHeight(15)).toBe(44)
    expect(pillHeight(60)).toBe(85)
    expect(pillHeight(600)).toBe(220)
  })

  it('computes progress only for today’s timed tasks', () => {
    const t = task({ date: '2026-10-01', startTime: '09:00', durationMin: 60 })
    expect(taskProgress(t, '2026-10-01', 8 * 60)).toBe(0)
    expect(taskProgress(t, '2026-10-01', 9 * 60 + 30)).toBe(0.5)
    expect(taskProgress(t, '2026-10-01', 11 * 60)).toBe(1)
    expect(taskProgress(t, '2026-10-02', 9 * 60 + 30)).toBe(0)
    expect(taskProgress(task({ isAllDay: true }), '2026-10-01', 600)).toBe(0)
    // Zero-length task: done once its start has passed.
    const zero = task({ startTime: '09:00', durationMin: 0 })
    expect(taskProgress(zero, '2026-10-01', 9 * 60 + 1)).toBe(1)
    // Crossing midnight: clamped to the end of the day.
    const late = task({ startTime: '23:00', durationMin: 120 })
    expect(taskProgress(late, '2026-10-01', 23 * 60 + 30)).toBe(0.5)
  })

  it('places the now line before the first later task', () => {
    const timed = [task({ startTime: '08:00' }), task({ startTime: '12:00' })]
    expect(nowLineIndex(timed, 7 * 60)).toBe(0)
    expect(nowLineIndex(timed, 10 * 60)).toBe(1)
    expect(nowLineIndex(timed, 13 * 60)).toBe(2)
  })
})

describe('nextStartTime', () => {
  it('rounds up to the next quarter hour and stays on the same day', () => {
    expect(nextStartTime(9 * 60)).toBe('09:15')
    expect(nextStartTime(9 * 60 + 7)).toBe('09:15')
    expect(nextStartTime(9 * 60 + 50)).toBe('10:00')
    expect(nextStartTime(23 * 60 + 50)).toBe('23:45')
  })
})

describe('applyPatch', () => {
  it('moves a task to the inbox and clears its time', () => {
    const next = applyPatch(task(), { date: null })
    expect(next.date).toBeNull()
    expect(next.startTime).toBeNull()
    expect(next.isAllDay).toBe(false)
  })

  it('clears the start time of an all-day task and normalizes the title', () => {
    const next = applyPatch(task(), { isAllDay: true, title: '  Plan   day ' })
    expect(next.startTime).toBeNull()
    expect(next.title).toBe('Plan day')
  })

  it('keeps unrelated fields', () => {
    expect(applyPatch(task(), { completedAt: 'x' }).startTime).toBe('09:00')
  })
})

describe('belongsTo: ranges and the overdue list', () => {
  it('a range holds its dates; overdue holds open one-off tasks before today', () => {
    const range = { kind: 'range', from: '2026-09-28', to: '2026-10-04' } as const
    expect(belongsTo(task({ date: '2026-09-28' }), range)).toBe(true)
    expect(belongsTo(task({ date: '2026-10-05' }), range)).toBe(false)
    expect(belongsTo(task({ date: null }), range)).toBe(false)
    const overdue = { kind: 'overdue', since: '2026-09-17', before: '2026-10-01' } as const
    expect(belongsTo(task({ date: '2026-09-30' }), overdue)).toBe(true)
    expect(belongsTo(task({ date: '2026-10-01' }), overdue)).toBe(false)
    expect(belongsTo(task({ date: '2026-09-16' }), overdue)).toBe(false)
    expect(belongsTo(task({ date: '2026-09-30', completedAt: 'x' }), overdue)).toBe(false)
    expect(belongsTo(task({ date: null }), overdue)).toBe(false)
    const occurrence = task({
      date: '2026-09-30',
      energy: null,
      alerts: null,
      priority: null,
      dueDate: null,
      recurrence: {
        seriesId: 's',
        occurrenceDate: '2026-09-30',
        rule: { freq: 'daily', interval: 1, weekdays: [] },
        start: '2026-09-01',
        until: null,
      },
    })
    expect(belongsTo(occurrence, overdue)).toBe(false)
  })
})

describe('belongsTo', () => {
  it('matches day lists by date', () => {
    expect(belongsTo(task(), { kind: 'day', date: '2026-10-01' })).toBe(true)
    expect(belongsTo(task(), { kind: 'day', date: '2026-10-02' })).toBe(false)
  })

  it('keeps only open, undated tasks in the inbox', () => {
    expect(belongsTo(task({ date: null }), { kind: 'inbox' })).toBe(true)
    expect(belongsTo(task({ date: null, completedAt: 'x' }), { kind: 'inbox' })).toBe(false)
    expect(belongsTo(task(), { kind: 'inbox' })).toBe(false)
  })
})
