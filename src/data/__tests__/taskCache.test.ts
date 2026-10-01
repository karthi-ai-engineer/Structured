import { describe, expect, it, vi } from 'vitest'
import type { Task } from '@/core/tasks'
import { createQueryClient } from '@/data/queries/client'
import { listOfKey, taskKeys } from '@/data/queries/keys'
import {
  newTask,
  settleTasks,
  shownAs,
  writeSeriesToCache,
  writeTaskToCache,
} from '@/data/queries/tasks'

const NOW = '2026-09-30T00:00:00.000Z'

function task(overrides: Partial<Task>): Task {
  return {
    ...newTask(
      'id',
      {
        title: 'T',
        notes: null,
        icon: null,
        color: 'coral',
        subtasks: [],
        date: '2026-10-01',
        startTime: '09:00',
        durationMin: 30,
        isAllDay: false,
      },
      NOW,
    ),
    ...overrides,
  }
}

describe('listOfKey', () => {
  it('recognizes day and inbox keys only', () => {
    expect(listOfKey(taskKeys.day('2026-10-01'))).toEqual({ kind: 'day', date: '2026-10-01' })
    expect(listOfKey(taskKeys.inbox())).toEqual({ kind: 'inbox' })
    expect(listOfKey(['tasks', 'other'])).toBeNull()
    expect(listOfKey(['settings'])).toBeNull()
  })
})

describe('newTask', () => {
  it('builds a complete, open task stamped with the given time', () => {
    const t = newTask('n1', { ...task({}), title: '  Hi  ' }, NOW)
    expect(t).toMatchObject({ id: 'n1', title: 'Hi', completedAt: null, createdAt: NOW })
  })
})

describe('writeTaskToCache', () => {
  it('moves a task between cached lists', () => {
    const qc = createQueryClient()
    const a = task({ id: 'a' })
    qc.setQueryData(taskKeys.day('2026-10-01'), [a])
    qc.setQueryData(taskKeys.day('2026-10-02'), [])
    qc.setQueryData(taskKeys.inbox(), [])

    // Rescheduled to the next day.
    writeTaskToCache(qc, 'a', { ...a, date: '2026-10-02' })
    expect(qc.getQueryData<Task[]>(taskKeys.day('2026-10-01'))).toEqual([])
    expect(qc.getQueryData<Task[]>(taskKeys.day('2026-10-02'))?.map((t) => t.id)).toEqual(['a'])

    // Moved to the inbox.
    writeTaskToCache(qc, 'a', { ...a, date: null, startTime: null })
    expect(qc.getQueryData<Task[]>(taskKeys.inbox())?.map((t) => t.id)).toEqual(['a'])
    expect(qc.getQueryData<Task[]>(taskKeys.day('2026-10-02'))).toEqual([])

    // Deleted.
    writeTaskToCache(qc, 'a', null)
    expect(qc.getQueryData<Task[]>(taskKeys.inbox())).toEqual([])
  })

  it('leaves lists that were never loaded alone', () => {
    const qc = createQueryClient()
    qc.setQueryData(taskKeys.day('2026-10-01'), undefined)
    writeTaskToCache(qc, 'a', task({ id: 'a' }))
    expect(qc.getQueryData(taskKeys.day('2026-10-01'))).toBeUndefined()
  })
})

describe('settleTasks', () => {
  it('refetches only when the last pending task mutation settles', async () => {
    const qc = createQueryClient()
    const invalidate = vi.spyOn(qc, 'invalidateQueries').mockResolvedValue()
    const pending = vi.spyOn(qc, 'isMutating')

    pending.mockReturnValue(2) // another write is still in flight
    await settleTasks(qc)
    expect(invalidate).not.toHaveBeenCalled()

    pending.mockReturnValue(1) // only the settling write itself
    await settleTasks(qc)
    expect(invalidate).toHaveBeenCalledWith({ queryKey: taskKeys.all })
  })
})

describe('recurring occurrences in the cache', () => {
  const SERIES = '11111111-1111-4111-8111-111111111111'
  const daily = { rule: { freq: 'daily' as const, interval: 1, weekdays: [] }, until: null }
  const occ = (date: string, extra: Partial<Task> = {}) =>
    task({
      id: `${SERIES}:${date}`,
      date,
      recurrence: {
        seriesId: SERIES,
        occurrenceDate: date,
        rule: daily.rule,
        start: '2026-10-01',
        until: null,
      },
      ...extra,
    })

  function cacheWith(...tasks: Task[]) {
    const qc = createQueryClient()
    for (const date of ['2026-10-01', '2026-10-02', '2026-10-03']) {
      qc.setQueryData(
        taskKeys.day(date),
        tasks.filter((t) => t.date === date),
      )
    }
    const day = (date: string) => qc.getQueryData<Task[]>(taskKeys.day(date)) ?? []
    return { qc, day }
  }

  it('shows a new series as its first occurrence, or nothing when the rule skips the start', () => {
    const base = task({ id: SERIES })
    expect(shownAs(base, null)).toBe(base)
    expect(shownAs({ ...base, date: null }, daily)).toEqual({ ...base, date: null })
    expect(shownAs(base, daily)).toMatchObject({
      id: `${SERIES}:2026-10-01`,
      recurrence: { seriesId: SERIES, start: '2026-10-01' },
    })
    // 2026-10-01 is a Thursday.
    const mondays = { rule: { freq: 'weekly' as const, interval: 1, weekdays: [1] }, until: null }
    expect(shownAs(base, mondays)).toBeNull()
  })

  it('applies one occurrence, a cancel, series edits, splits and removals', () => {
    const { qc, day } = cacheWith(
      occ('2026-10-01'),
      occ('2026-10-02'),
      occ('2026-10-03'),
      task({ id: 'plain', date: '2026-10-02' }),
    )

    writeSeriesToCache(qc, { kind: 'occurrence', task: occ('2026-10-01', { completedAt: NOW }) })
    expect(day('2026-10-01')[0]?.completedAt).toBe(NOW)

    // All: the shared fields show at once on every occurrence.
    writeSeriesToCache(qc, {
      kind: 'series',
      seriesId: SERIES,
      patch: { title: 'Run' },
      shared: { title: 'Run' },
      reset: false,
    })
    expect(
      day('2026-10-02')
        .map((t) => t.title)
        .sort(),
    ).toEqual(['Run', 'T'])

    // A reset (dates move) is left to the refetch; a new end date hides what lies beyond it.
    writeSeriesToCache(qc, {
      kind: 'series',
      seriesId: SERIES,
      patch: { title: 'Swim' },
      shared: {},
      reset: true,
      repeat: { ...daily, until: '2026-10-02' },
    })
    expect(day('2026-10-01')[0]?.title).toBe('Run')
    expect(day('2026-10-03')).toEqual([])

    // A split with the same rule and days: the occurrences stay, with the new values.
    const { qc: qc2, day: day2 } = cacheWith(
      occ('2026-10-01'),
      occ('2026-10-02'),
      occ('2026-10-03'),
    )
    const next = {
      id: '22222222-2222-4222-8222-222222222222',
      draft: { ...occ('2026-10-02'), title: 'Later', startTime: '06:00' },
      repeat: daily,
      completedAt: null,
    }
    writeSeriesToCache(qc2, { kind: 'split', seriesId: SERIES, from: '2026-10-02', shift: 0, next })
    expect(day2('2026-10-01')[0]?.title).toBe('T')
    expect(day2('2026-10-03')[0]).toMatchObject({ title: 'Later', startTime: '06:00' })

    // Moved by a day: replaced, and the new series' first occurrence shows at once.
    writeSeriesToCache(qc2, {
      kind: 'split',
      seriesId: SERIES,
      from: '2026-10-02',
      shift: 1,
      next: { ...next, draft: { ...next.draft, date: '2026-10-03' } },
    })
    expect(day2('2026-10-02')).toEqual([])
    expect(day2('2026-10-03').map((t) => t.id)).toEqual([`${next.id}:2026-10-03`])

    // Repeating turned off: the one-off task shows, with its completion.
    const { qc: qc3, day: day3 } = cacheWith(occ('2026-10-01'), occ('2026-10-02'))
    writeSeriesToCache(qc3, {
      kind: 'split',
      seriesId: SERIES,
      from: '2026-10-02',
      shift: 0,
      next: { ...next, repeat: null, completedAt: NOW },
    })
    expect(day3('2026-10-02')).toMatchObject([{ id: next.id, completedAt: NOW, recurrence: null }])

    writeSeriesToCache(qc, { kind: 'cancel', task: occ('2026-10-02') })
    expect(day('2026-10-02').map((t) => t.id)).toEqual(['plain'])

    writeSeriesToCache(qc, { kind: 'remove-series', seriesId: SERIES })
    expect(day('2026-10-01')).toEqual([])
    expect(day('2026-10-02').map((t) => t.id)).toEqual(['plain'])
  })
})
