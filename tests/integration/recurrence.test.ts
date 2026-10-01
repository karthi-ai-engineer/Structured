// Phase 3 integration test against the real Supabase project: recurring tasks end to end through
// the app's repository: series expansion, overrides (complete, move, cancel), "all" edits, the
// atomic "this and future" split (the `split_series` function) and deletes. Only `__test__` rows
// on far-future dates, removed again (overrides go with their series: on delete cascade).

import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { parseRule } from '@/core/recurrence'
import { planDelete, planEdit, type RepeatSpec } from '@/core/seriesEdits'
import type { Task, TaskDraft } from '@/core/tasks'
import type { Database } from '@/data/database.types'
import { DataError, createTasksRepo, type TasksRepo } from '@/data/repo/tasks'
import { createDb, type Db } from '@/data/supabase'

const PREFIX = '__test__'
const START = '2099-02-01'
const created: string[] = []
let repo: TasksRepo
let admin: Db

const rule = parseRule('FREQ=DAILY')
if (!rule) throw new Error('rule')
const DAILY: RepeatSpec = { rule, until: null }

function env(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Integration tests need ${name} in .env.local (value never printed)`)
  return value
}

function draftOf(task: Task, extra: Partial<TaskDraft> = {}): TaskDraft {
  const { title, notes, icon, color, subtasks, date, startTime, durationMin, isAllDay } = task
  return { title, notes, icon, color, subtasks, date, startTime, durationMin, isAllDay, ...extra }
}

beforeAll(() => {
  const url = env('VITE_SUPABASE_URL')
  repo = createTasksRepo(createDb(url, env('VITE_SUPABASE_PUBLISHABLE_KEY')))
  admin = createClient<Database>(url, env('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
})

afterAll(async () => {
  if (created.length === 0) return
  const rows = await admin.from('tasks').select('id, title').in('id', created)
  const ours = (rows.data ?? []).filter((r) => r.title.startsWith(PREFIX)).map((r) => r.id)
  if (ours.length > 0) await admin.from('tasks').delete().in('id', ours)
})

describe('recurring tasks (real project)', () => {
  it('expands, overrides, edits, splits and deletes a series', async () => {
    const seriesId = randomUUID()
    created.push(seriesId)
    const title = `${PREFIX} series ${seriesId.slice(0, 8)}`
    await repo.create(
      seriesId,
      {
        title,
        notes: null,
        icon: 'dumbbell',
        color: 'green',
        subtasks: [{ id: 's1', title: 'Stretch', done: true }],
        date: START,
        startTime: '07:00',
        durationMin: 30,
        isAllDay: false,
      },
      DAILY,
    )
    const ours = (tasks: Task[]) => tasks.filter((t) => t.title.startsWith(PREFIX))
    const day = async (date: string) => ours(await repo.listDay(date))
    const one = async (date: string) => {
      const [task] = await day(date)
      if (!task) throw new Error(`no occurrence on ${date}`)
      return task
    }

    // A week of occurrences from the template: subtasks start undone.
    const week = ours(await repo.listRange(START, '2099-02-07'))
    expect(week.map((t) => t.date).sort()).toEqual([
      '2099-02-01',
      '2099-02-02',
      '2099-02-03',
      '2099-02-04',
      '2099-02-05',
      '2099-02-06',
      '2099-02-07',
    ])
    expect(week[0]?.subtasks).toEqual([{ id: 's1', title: 'Stretch', done: false }])

    // This only: complete the 2nd, move the 3rd to the 4th, cancel the 5th.
    const second = await one('2099-02-02')
    await repo.applySeriesWrite({
      kind: 'occurrence',
      task: { ...second, completedAt: '2099-02-02T08:00:00.000Z' },
    })
    expect(await one('2099-02-02')).toMatchObject({
      id: second.id,
      completedAt: expect.any(String),
    })
    const third = await one('2099-02-03')
    await repo.applySeriesWrite(
      planEdit(
        third,
        draftOf(third, { date: '2099-02-04', startTime: '10:00' }),
        DAILY,
        'this',
        '',
      ),
    )
    expect(await day('2099-02-03')).toEqual([])
    expect((await day('2099-02-04')).map((t) => t.startTime).sort()).toEqual(['07:00', '10:00'])
    await repo.applySeriesWrite(planDelete(await one('2099-02-05'), 'this'))
    expect(await day('2099-02-05')).toEqual([])

    // All: a new title reaches the template and the completed override alike, in one
    // transaction (update_series). The moved occurrence keeps its own time (only the title
    // was edited).
    const sixth = await one('2099-02-06')
    await repo.applySeriesWrite(
      planEdit(sixth, draftOf(sixth, { title: `${title} renamed` }), DAILY, 'all', ''),
    )
    expect((await one('2099-02-06')).title).toBe(`${title} renamed`)
    expect(await one('2099-02-02')).toMatchObject({
      title: `${title} renamed`,
      completedAt: expect.any(String),
    })
    expect((await day('2099-02-04')).map((t) => t.startTime).sort()).toEqual(['07:00', '10:00'])

    // All, with a new end date only: the cancelled 5th stays cancelled, nothing after the end.
    const until = { ...DAILY, until: '2099-03-31' }
    const sixthAgain = await one('2099-02-06')
    await repo.applySeriesWrite(planEdit(sixthAgain, draftOf(sixthAgain), until, 'all', ''))
    expect(await day('2099-02-05')).toEqual([])
    expect(await day('2099-04-01')).toEqual([])
    expect(await day('2099-03-31')).toHaveLength(1)

    // This and future, from the 6th: the 7th was completed before, and stays completed.
    await repo.applySeriesWrite({
      kind: 'occurrence',
      task: { ...(await one('2099-02-07')), completedAt: '2099-02-07T08:00:00.000Z' },
    })
    const nextId = randomUUID()
    created.push(nextId)
    const sixthNow = await one('2099-02-06')
    await repo.applySeriesWrite(
      planEdit(sixthNow, draftOf(sixthNow, { startTime: '06:00' }), until, 'future', nextId),
    )
    expect(await one('2099-02-05').catch(() => null)).toBeNull()
    expect(await one('2099-02-06')).toMatchObject({
      id: `${nextId}:2099-02-06`,
      startTime: '06:00',
    })
    // The completed 7th moved to the new series, with the edit (06:00).
    expect(await one('2099-02-07')).toMatchObject({
      id: `${nextId}:2099-02-07`,
      startTime: '06:00',
      completedAt: expect.any(String),
    })
    expect((await one('2099-02-01')).startTime).toBe('07:00') // the old series is untouched

    // Delete this and future (new series, from the 9th); then all of the old series.
    await repo.applySeriesWrite(planDelete(await one('2099-02-09'), 'future'))
    expect(await day('2099-02-09')).toEqual([])
    expect(await day('2099-02-08')).toHaveLength(1)
    await repo.applySeriesWrite(planDelete(await one('2099-02-01'), 'all'))
    expect(ours(await repo.listRange(START, '2099-02-05'))).toEqual([])

    // The split refuses a date that is not after the series start (atomic: nothing changes).
    await expect(
      repo.applySeriesWrite({
        kind: 'split',
        seriesId: nextId,
        from: '2099-02-06',
        shift: 0,
        next: null,
      }),
    ).rejects.toBeInstanceOf(DataError)
    expect(await day('2099-02-08')).toHaveLength(1)
  })

  it('moves a weekly series with its completed occurrence ("this and future", a day later)', async () => {
    const seriesId = randomUUID()
    const nextId = randomUUID()
    created.push(seriesId, nextId)
    const title = `${PREFIX} weekly ${seriesId.slice(0, 8)}`
    const mondays = parseRule('FREQ=WEEKLY;BYDAY=MO')
    if (!mondays) throw new Error('rule')
    const weekly: RepeatSpec = { rule: mondays, until: null }
    await repo.create(
      seriesId,
      {
        title,
        notes: null,
        icon: null,
        color: 'blue',
        subtasks: [],
        date: '2099-03-02', // a Monday
        startTime: '18:00',
        durationMin: 45,
        isAllDay: false,
      },
      weekly,
    )
    const on = async (date: string) =>
      (await repo.listDay(date)).filter((t) => t.title.startsWith(PREFIX))

    // Complete Monday the 9th, then move it to Tuesday the 10th for this and future.
    const [ninth] = await on('2099-03-09')
    if (!ninth) throw new Error('no occurrence on the 9th')
    await repo.applySeriesWrite({
      kind: 'occurrence',
      task: { ...ninth, completedAt: '2099-03-09T19:00:00.000Z' },
    })
    const [done] = await on('2099-03-09')
    if (!done) throw new Error('no completed occurrence')
    await repo.applySeriesWrite(
      planEdit(done, draftOf(done, { date: '2099-03-10' }), weekly, 'future', nextId),
    )

    expect(await on('2099-03-02')).toHaveLength(1) // history stays on Monday
    expect(await on('2099-03-09')).toEqual([])
    expect(await on('2099-03-10')).toMatchObject([
      { id: `${nextId}:2099-03-10`, completedAt: expect.any(String) },
    ])
    expect(await on('2099-03-16')).toEqual([])
    expect(await on('2099-03-17')).toMatchObject([
      { id: `${nextId}:2099-03-17`, completedAt: null },
    ])
  })
})
