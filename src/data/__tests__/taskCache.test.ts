import { describe, expect, it, vi } from 'vitest'
import type { Task } from '@/core/tasks'
import { createQueryClient } from '@/data/queries/client'
import { listOfKey, taskKeys } from '@/data/queries/keys'
import { newTask, settleTasks, writeTaskToCache } from '@/data/queries/tasks'

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
