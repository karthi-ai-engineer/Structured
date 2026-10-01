// Phase 1 integration tests against the real Supabase project: the app's task repository end to
// end, and realtime delivery between two independent clients (the "edit on one device shows up
// on the other" promise). Same rules as supabase.test.ts: only `__test__` rows, removed again.

import { randomUUID } from 'node:crypto'
import { createClient, REALTIME_SUBSCRIBE_STATES as STATES } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { TaskDraft } from '@/core/tasks'
import type { Database } from '@/data/database.types'
import { createTasksRepo, type TasksRepo } from '@/data/repo/tasks'
import { createDb, type Db } from '@/data/supabase'

const PREFIX = '__test__'
const DAY = '2099-01-15' // far future: never collides with real plans
const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const

let repo: TasksRepo
let reader: Db
let admin: Db
const created: string[] = []

function env(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Integration tests need ${name} in .env.local (value never printed)`)
  return value
}

function draft(overrides: Partial<TaskDraft> = {}): TaskDraft {
  return {
    title: `${PREFIX} repo ${randomUUID().slice(0, 8)}`,
    notes: null,
    icon: 'laptop',
    color: 'blue',
    subtasks: [{ id: 's1', title: 'step', done: false }],
    date: DAY,
    startTime: '09:30',
    durationMin: 45,
    isAllDay: false,
    ...overrides,
  }
}

beforeAll(() => {
  const url = env('VITE_SUPABASE_URL')
  const key = env('VITE_SUPABASE_PUBLISHABLE_KEY')
  repo = createTasksRepo(createDb(url, key))
  reader = createDb(url, key)
  admin = createClient<Database>(url, env('SUPABASE_SECRET_KEY'), clientOptions)
})

afterAll(async () => {
  await reader.removeAllChannels()
  await reader.realtime.disconnect()
  if (created.length > 0) {
    const rows = await admin.from('tasks').select('id, title').in('id', created)
    const ours = (rows.data ?? []).filter((r) => r.title.startsWith(PREFIX)).map((r) => r.id)
    if (ours.length > 0) await admin.from('tasks').delete().in('id', ours)
  }
})

describe('task repository (real project)', () => {
  it('creates, lists, updates, moves to the inbox and soft-deletes a task', async () => {
    const id = randomUUID()
    created.push(id)

    const read = async () => (await repo.listDay(DAY)).find((t) => t.id === id)

    await repo.create(id, draft())
    const task = await read()
    expect(task).toMatchObject({ id, startTime: '09:30', durationMin: 45, color: 'blue' })
    expect(task?.subtasks).toEqual([{ id: 's1', title: 'step', done: false }])

    await repo.update(id, { completedAt: '2099-01-15T10:00:00.000Z', startTime: '11:00' })
    const done = await read()
    expect(done?.completedAt).not.toBeNull()
    expect(done?.startTime).toBe('11:00')
    // The database trigger stamps updated_at; the client never sets it.
    expect((done?.updatedAt ?? '') >= (task?.updatedAt ?? '~')).toBe(true)

    await repo.update(id, { date: null, startTime: null, completedAt: null })
    expect((await repo.listDay(DAY)).map((t) => t.id)).not.toContain(id)
    expect((await repo.listInbox()).map((t) => t.id)).toContain(id)

    await repo.remove(id)
    expect((await repo.listInbox()).map((t) => t.id)).not.toContain(id)
    const row = await admin.from('tasks').select('deleted_at').eq('id', id).single()
    expect(row.data?.deleted_at).not.toBeNull()
  })

  it('delivers inserts and updates to another client in realtime', async () => {
    const events: { type: string; id: string }[] = []
    await new Promise<void>((resolve, reject) => {
      reader
        .channel(`it-${randomUUID()}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, (payload) => {
          const row = (payload.new ?? {}) as { id?: string }
          if (row.id) events.push({ type: payload.eventType, id: row.id })
        })
        .subscribe((status) => {
          if (status === STATES.SUBSCRIBED) resolve()
          else if (status === STATES.CHANNEL_ERROR || status === STATES.TIMED_OUT) {
            reject(new Error(`realtime subscribe failed: ${status}`))
          }
        })
    })

    const id = randomUUID()
    created.push(id)
    const started = performance.now()
    await repo.create(id, draft({ title: `${PREFIX} realtime ${id.slice(0, 8)}` }))
    await expect
      .poll(() => events.some((e) => e.id === id && e.type === 'INSERT'), { timeout: 5_000 })
      .toBe(true)
    const insertLatencyMs = performance.now() - started

    await repo.update(id, { completedAt: '2099-01-15T12:00:00.000Z' })
    await expect
      .poll(() => events.some((e) => e.id === id && e.type === 'UPDATE'), { timeout: 5_000 })
      .toBe(true)

    // Phase 1 promise: an edit shows up on the other device within about a second.
    expect(insertLatencyMs).toBeLessThan(3_000)
  })
})
