// Opt-in integration tests against the real Supabase project (docs/phases/phase-0/PLAN.md 13.2).
// Run with `npm run test:integration`; never in CI (CI has no secrets).
//
// Rules (CLAUDE.md, data conventions): there is one database for development and production, so
// these tests touch only rows whose title or name starts with `__test__` and delete them again.
// They never create or update `settings`; the only settings write is the constraint probe (e),
// which the database rejects.

import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import {
  createClient,
  REALTIME_SUBSCRIBE_STATES as STATES,
  type SupabaseClient,
} from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Database } from '@/data/database.types'

type Db = SupabaseClient<Database>
type TableName = keyof Database['public']['Tables']

const PREFIX = '__test__'
/** Every public table (keep in sync with the migrations: CLAUDE.md new-table checklist). */
const TABLES = [
  'settings',
  'goals',
  'tasks',
  'focus_sessions',
  'day_notes',
  'templates',
] as const satisfies readonly TableName[]

const REQUIRED_ENV = [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
] as const
const PLACEHOLDERS = ['SENSITIVE_ENV_VALUE_PLACEHOLDER', '[SENSITIVE]']
const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const

/** A LIKE pattern for the test prefix: `_` is a LIKE wildcard, so it is escaped. */
const PREFIX_LIKE = `${PREFIX.replace(/_/g, '\\_')}%`

let anon: Db
let admin: Db
const runId = randomUUID()
const createdGoalIds: string[] = []
const createdTemplateIds: string[] = []
let triggerGoalId: string | undefined

function readEnv(): Record<(typeof REQUIRED_ENV)[number], string> {
  const problems: string[] = []
  const values: Partial<Record<(typeof REQUIRED_ENV)[number], string>> = {}
  for (const key of REQUIRED_ENV) {
    const value = process.env[key]?.trim()
    if (!value) problems.push(`${key} is missing`)
    else if (PLACEHOLDERS.includes(value)) problems.push(`${key} is a Vercel Secret placeholder`)
    else values[key] = value
  }
  if (problems.length > 0) {
    throw new Error(
      `Integration tests need .env.local (see HANDOFF.md): ${problems.join('; ')}. Values are never printed.`,
    )
  }
  return values as Record<(typeof REQUIRED_ENV)[number], string>
}

/** Deletes this run's rows and any stale `__test__` rows (verified in JS before deleting). */
async function cleanUp(): Promise<void> {
  if (createdGoalIds.length > 0) await anon.from('goals').delete().in('id', createdGoalIds)
  if (createdTemplateIds.length > 0) {
    await anon.from('templates').delete().in('id', createdTemplateIds)
  }
  const goals = await admin.from('goals').select('id, title').like('title', PREFIX_LIKE)
  const staleGoals = (goals.data ?? []).filter((g) => g.title.startsWith(PREFIX)).map((g) => g.id)
  if (staleGoals.length > 0) await admin.from('goals').delete().in('id', staleGoals)
  const templates = await admin.from('templates').select('id, name').like('name', PREFIX_LIKE)
  const staleTemplates = (templates.data ?? [])
    .filter((t) => t.name.startsWith(PREFIX))
    .map((t) => t.id)
  if (staleTemplates.length > 0) await admin.from('templates').delete().in('id', staleTemplates)
}

async function remainingTestRows(): Promise<{ goals: number; templates: number }> {
  const goals = await admin.from('goals').select('id, title').like('title', PREFIX_LIKE)
  const templates = await admin.from('templates').select('id, name').like('name', PREFIX_LIKE)
  expect(goals.error).toBeNull()
  expect(templates.error).toBeNull()
  return {
    goals: (goals.data ?? []).filter((g) => g.title.startsWith(PREFIX)).length,
    templates: (templates.data ?? []).filter((t) => t.name.startsWith(PREFIX)).length,
  }
}

// A missing or placeholder variable fails every test with the variable names (never "skipped").
let envError: Error | undefined
beforeAll(() => {
  try {
    const env = readEnv()
    anon = createClient<Database>(
      env.VITE_SUPABASE_URL,
      env.VITE_SUPABASE_PUBLISHABLE_KEY,
      clientOptions,
    )
    admin = createClient<Database>(env.VITE_SUPABASE_URL, env.SUPABASE_SECRET_KEY, clientOptions)
  } catch (error) {
    envError = error instanceof Error ? error : new Error(String(error))
  }
})

/** `it` that first fails when the environment is incomplete. */
function test(name: string, body: () => Promise<void>): void {
  it(name, async () => {
    if (envError) throw envError
    await body()
  })
}

afterAll(async () => {
  // Safety net for failed runs; the last test does the same and asserts the result.
  if (envError) return
  await anon.removeAllChannels()
  await anon.realtime.disconnect()
  await cleanUp()
})

describe('Supabase integration (real project)', () => {
  test('(a) anon can select every public table (grants, RLS, schema cache)', async () => {
    // The first request retries PGRST205 for up to 30 s while PostgREST reloads its schema cache.
    const deadline = performance.now() + 30_000
    for (;;) {
      const first = await anon.from('settings').select('*').limit(1)
      if (first.error?.code !== 'PGRST205' || performance.now() > deadline) {
        expect(first.error).toBeNull()
        break
      }
      await delay(2_000)
    }
    for (const table of TABLES) {
      const { error } = await anon.from(table).select('*').limit(1)
      expect(error, `select on ${table}`).toBeNull()
    }
  })

  test('(b) anon has full CRUD on a __test__ templates row', async () => {
    const name = `${PREFIX}${runId}-template`
    const inserted = await anon
      .from('templates')
      .insert({ name, items: [] })
      .select('id, name, items')
      .single()
    expect(inserted.error).toBeNull()
    const id = inserted.data?.id
    expect(id).toEqual(expect.any(String))
    if (!id) return
    createdTemplateIds.push(id)
    expect(inserted.data).toMatchObject({ name, items: [] })

    const read = await anon.from('templates').select('id, name').eq('id', id).maybeSingle()
    expect(read.error).toBeNull()
    expect(read.data).toEqual({ id, name })

    const items = [{ title: 'Integration test item', duration_min: 15 }]
    const updated = await anon
      .from('templates')
      .update({ items })
      .eq('id', id)
      .select('items')
      .single()
    expect(updated.error).toBeNull()
    expect(updated.data?.items).toEqual(items)

    const deleted = await anon.from('templates').delete().eq('id', id).select('id')
    expect(deleted.error).toBeNull()
    expect(deleted.data).toEqual([{ id }])
    const gone = await anon.from('templates').select('id').eq('id', id)
    expect(gone.data).toEqual([])
  })

  test('(c) the updated_at trigger fires for an anon update of a __test__ goal', async () => {
    const title = `${PREFIX}${runId}-goal`
    const inserted = await anon.from('goals').insert({ title }).select('id, updated_at').single()
    expect(inserted.error).toBeNull()
    const id = inserted.data?.id
    const before = inserted.data?.updated_at
    expect(id).toEqual(expect.any(String))
    if (!id || !before) return
    createdGoalIds.push(id)
    triggerGoalId = id

    await delay(1_100)
    const updated = await anon
      .from('goals')
      .update({ title: `${title}-renamed` })
      .eq('id', id)
      .select('updated_at')
      .single()
    expect(updated.error).toBeNull()
    const after = updated.data?.updated_at ?? ''
    expect(Date.parse(after)).toBeGreaterThan(Date.parse(before))
  })

  test('(d) a realtime UPDATE event for that goal arrives', async () => {
    const id = triggerGoalId
    expect(id, 'test (c) must create the goal first').toEqual(expect.any(String))
    if (!id) return

    let events = 0
    const subscribed = new Promise<void>((resolve, reject) => {
      anon
        .channel(`it-goals-${runId}`)
        .on(
          'postgres_changes',
          { event: 'UPDATE', schema: 'public', table: 'goals', filter: `id=eq.${id}` },
          () => {
            events += 1
          },
        )
        .subscribe((status) => {
          if (status === STATES.SUBSCRIBED) resolve()
          else if (
            status === STATES.CHANNEL_ERROR ||
            status === STATES.TIMED_OUT ||
            status === STATES.CLOSED
          ) {
            reject(new Error(`realtime channel status ${status}`))
          }
        })
    })
    await subscribed

    // Resend every 2 s until an event arrives (at most 20 s; duplicates are fine).
    const deadline = performance.now() + 20_000
    let n = 0
    while (events === 0 && performance.now() < deadline) {
      n += 1
      const { error } = await anon
        .from('goals')
        .update({ description: `realtime probe ${n}` })
        .eq('id', id)
      expect(error).toBeNull()
      const waitUntil = performance.now() + 2_000
      while (events === 0 && performance.now() < waitUntil) await delay(100)
    }
    await anon.removeAllChannels()
    expect(events).toBeGreaterThan(0)
  })

  test('(e) settings accepts only id 1 (check constraint 23514)', async () => {
    const { error } = await anon.from('settings').insert({ id: 2 })
    expect(error?.code).toBe('23514')
    const probe = await admin.from('settings').select('id').eq('id', 2)
    expect(probe.error).toBeNull()
    expect(probe.data).toEqual([])
  })

  test('(f) the secret key works from Node', async () => {
    const { count, error } = await admin.from('tasks').select('*', { count: 'exact', head: true })
    expect(error).toBeNull()
    expect(count).toBeGreaterThanOrEqual(0)
  })

  test('(g) cleanup leaves no __test__ rows in goals or templates', async () => {
    await cleanUp()
    expect(await remainingTestRows()).toEqual({ goals: 0, templates: 0 })
  })
})
