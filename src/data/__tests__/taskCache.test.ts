import { describe, expect, it, vi } from 'vitest'
import type { Task } from '@/core/tasks'
import { createQueryClient } from '@/data/queries/client'
import { datesOfList, listOfKey, taskKeys } from '@/data/queries/keys'
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
        energy: null,
        alerts: null,
      },
      NOW,
    ),
    ...overrides,
  }
}

describe('listOfKey', () => {
  it('recognizes day, range, inbox and overdue keys only', () => {
    expect(listOfKey(taskKeys.day('2026-10-01'))).toEqual({ kind: 'day', date: '2026-10-01' })
    expect(listOfKey(taskKeys.range('2026-09-28', '2026-10-04'))).toEqual({
      kind: 'range',
      from: '2026-09-28',
      to: '2026-10-04',
    })
    expect(listOfKey(taskKeys.inbox())).toEqual({ kind: 'inbox' })
    expect(listOfKey(taskKeys.overdue('2026-10-15'))).toEqual({
      kind: 'overdue',
      since: '2026-10-01',
      before: '2026-10-15',
    })
    expect(listOfKey(['tasks', 'other'])).toBeNull()
    expect(listOfKey(['tasks', 'day', 'nope'])).toBeNull()
    expect(listOfKey(['tasks', 'range', '2026-10-01'])).toBeNull()
    expect(listOfKey(['settings'])).toBeNull()
  })

  it('lists the dates a cached list covers', () => {
    expect(datesOfList({ kind: 'day', date: '2026-10-01' })).toEqual(['2026-10-01'])
    expect(datesOfList({ kind: 'range', from: '2026-09-30', to: '2026-10-02' })).toEqual([
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
    ])
    expect(datesOfList({ kind: 'inbox' })).toEqual([])
  })

  it('moves a task between a day, a week and the overdue list in one write', () => {
    const qc = createQueryClient()
    const late = task({ id: 'late', date: '2026-10-01' })
    qc.setQueryData(taskKeys.overdue('2026-10-03'), [late])
    qc.setQueryData(taskKeys.range('2026-09-28', '2026-10-04'), [late])
    qc.setQueryData(taskKeys.day('2026-10-03'), [])
    writeTaskToCache(qc, 'late', { ...late, date: '2026-10-03' })
    expect(qc.getQueryData(taskKeys.overdue('2026-10-03'))).toEqual([])
    expect(qc.getQueryData<Task[]>(taskKeys.range('2026-09-28', '2026-10-04'))?.[0]?.date).toBe(
      '2026-10-03',
    )
    expect(qc.getQueryData<Task[]>(taskKeys.day('2026-10-03'))).toHaveLength(1)
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

    // A split: completed (and kept) occurrences stay with the new values; the others are
    // replaced by the new series' occurrences in every cached day.
    const { qc: qc2, day: day2 } = cacheWith(
      occ('2026-10-01'),
      occ('2026-10-02', { completedAt: NOW }),
      occ('2026-10-03'),
    )
    const next = {
      id: '22222222-2222-4222-8222-222222222222',
      draft: { ...occ('2026-10-02'), title: 'Later', startTime: '06:00' },
      repeat: daily,
      completedAt: null,
    }
    writeSeriesToCache(qc2, {
      kind: 'split',
      seriesId: SERIES,
      from: '2026-10-02',
      keep: null,
      next,
    })
    expect(day2('2026-10-01')[0]?.title).toBe('T')
    expect(day2('2026-10-02')).toMatchObject([
      { id: `${SERIES}:2026-10-02`, title: 'Later', completedAt: NOW },
    ])
    expect(day2('2026-10-03')).toMatchObject([
      { id: `${next.id}:2026-10-03`, title: 'Later', startTime: '06:00', completedAt: null },
    ])

    // Repeating turned off: the one-off task shows, with its completion.
    const { qc: qc3, day: day3 } = cacheWith(occ('2026-10-01'), occ('2026-10-02'))
    writeSeriesToCache(qc3, {
      kind: 'split',
      seriesId: SERIES,
      from: '2026-10-02',
      keep: null,
      next: { ...next, repeat: null, completedAt: NOW },
    })
    expect(day3('2026-10-02')).toMatchObject([{ id: next.id, completedAt: NOW, recurrence: null }])

    // Ending the series: nothing continues.
    writeSeriesToCache(qc3, {
      kind: 'split',
      seriesId: SERIES,
      from: '2026-10-01',
      keep: null,
      next: null,
    })
    expect(day3('2026-10-01')).toEqual([])

    writeSeriesToCache(qc, { kind: 'cancel', task: occ('2026-10-02') })
    expect(day('2026-10-02').map((t) => t.id)).toEqual(['plain'])

    writeSeriesToCache(qc, { kind: 'remove-series', seriesId: SERIES })
    expect(day('2026-10-01')).toEqual([])
    expect(day('2026-10-02').map((t) => t.id)).toEqual(['plain'])
  })
})

describe('a split shown in a cached week', () => {
  it('adds the new series to every day of a cached range', () => {
    const SERIES = '11111111-1111-4111-8111-111111111111'
    const daily = { rule: { freq: 'daily' as const, interval: 1, weekdays: [] }, until: null }
    const qc = createQueryClient()
    qc.setQueryData(taskKeys.range('2026-10-01', '2026-10-03'), [])
    writeSeriesToCache(qc, {
      kind: 'split',
      seriesId: SERIES,
      from: '2026-10-02',
      keep: null,
      next: {
        id: '22222222-2222-4222-8222-222222222222',
        draft: { ...task({ id: 'x' }), date: '2026-10-02' },
        repeat: daily,
        completedAt: null,
      },
    })
    expect(
      qc.getQueryData<Task[]>(taskKeys.range('2026-10-01', '2026-10-03'))?.map((t) => t.date),
    ).toEqual(['2026-10-02', '2026-10-03'])
  })
})
