// The MCP server against the REAL database: the Supabase store behind the real handler and secret
// check, driven by the official MCP client (the protocol Claude speaks). Same rules as the other
// integration tests: only `__test__` titles on far-future dates, removed again afterwards.

import { randomUUID } from 'node:crypto'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readServerEnv } from '../../server/env.ts'
import { createEntry } from '../../server/mcp/entry.ts'
import { createAdminDb, type AdminDb } from '../../server/store.ts'

const PREFIX = '__test__'
const DAY = '2099-06-15'
const run = randomUUID().slice(0, 8)

let client: Client
let admin: AdminDb
let secret: string
const taskIds = new Set<string>()
const batchIds = new Set<string>()

async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args })
  const text = (result.content as { text: string }[])[0]?.text ?? ''
  const newline = text.indexOf('\n')
  const data = (newline === -1 ? {} : JSON.parse(text.slice(newline + 1))) as Record<string, any>
  if (typeof data.batch_id === 'string') batchIds.add(data.batch_id)
  return {
    isError: result.isError === true,
    summary: newline === -1 ? text : text.slice(0, newline),
    data,
  }
}

beforeAll(async () => {
  const env = readServerEnv()
  secret = env.mcpSecret
  admin = createAdminDb(env.supabaseUrl, env.secretKey)
  const entry = createEntry()
  client = new Client({ name: 'integration', version: '1.0.0' })
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`http://app.test/api/mcp/${secret}`), {
      fetch: (input, init) => entry(new Request(input, init)),
    }),
  )
})

afterAll(async () => {
  await client?.close()
  if (!admin) return
  if (taskIds.size > 0) {
    const rows = await admin
      .from('tasks')
      .select('id, title')
      .in('id', [...taskIds])
    const ours = (rows.data ?? []).filter((r) => r.title.startsWith(PREFIX)).map((r) => r.id)
    if (ours.length > 0) await admin.from('tasks').delete().in('id', ours)
  }
  if (batchIds.size > 0)
    await admin
      .from('mcp_batches')
      .delete()
      .in('id', [...batchIds])
})

describe('MCP server (real project)', () => {
  it('rejects a wrong secret with 404', async () => {
    const entry = createEntry()
    const response = await entry(
      new Request('http://app.test/api/mcp/not-the-secret', { method: 'POST', body: '{}' }),
    )
    expect(response.status).toBe(404)
  })

  it('plans, writes, reschedules, completes and undoes like Claude would', async () => {
    const context = await call('get_context')
    expect(context.data.timezone).toBeTruthy()

    const plan = [
      {
        title: `${PREFIX} mcp deep work ${run}`,
        date: DAY,
        start_time: '09:00',
        duration_min: 90,
        color: 'blue',
        icon: 'laptop',
      },
      {
        title: `${PREFIX} mcp lunch ${run}`,
        date: DAY,
        start_time: '12:30',
        duration_min: 60,
        icon: 'utensils',
      },
      { title: `${PREFIX} mcp idea ${run}`, subtasks: ['one', 'two'] },
    ]

    const dry = await call('create_tasks', { tasks: plan, dry_run: true })
    expect(dry.summary).toContain('Nothing was written')
    const before = await admin.from('tasks').select('id').like('title', `%mcp%${run}`)
    expect(before.data).toEqual([])

    const created = await call('create_tasks', { tasks: plan })
    expect(created.isError).toBe(false)
    const [deep, lunch, idea] = created.data.tasks as { id: string }[]
    for (const t of created.data.tasks as { id: string }[]) taskIds.add(t.id)
    const rows = await admin
      .from('tasks')
      .select('source, batch_id')
      .in('id', [...taskIds])
    expect(
      rows.data?.every((r) => r.source === 'mcp' && r.batch_id === created.data.batch_id),
    ).toBe(true)

    const day = (await call('get_schedule', { start_date: DAY })).data.days[0]
    expect(day.timed.map((t: { title: string }) => t.title)).toEqual([
      plan[0]?.title,
      plan[1]?.title,
    ])
    expect(day.free_slots[0]).toMatchObject({ start: expect.any(String) })

    const moved = await call('move_tasks', {
      moves: [{ id: lunch?.id, date: DAY, start_time: '13:00' }],
    })
    expect(moved.data.tasks[0]).toMatchObject({ start: '13:00', end: '14:00' })

    await call('set_completion', { ids: [deep?.id], done: true })
    await call('add_subtasks', { task_id: idea?.id, titles: ['three'] })
    const found = await call('search_tasks', { query: `idea ${run}` })
    expect(found.data.tasks[0].subtasks).toHaveLength(3)

    // Undo the reschedule: lunch goes back to 12:30.
    await call('undo_batch', { batch_id: moved.data.batch_id })
    const lunchRow = await admin
      .from('tasks')
      .select('start_time')
      .eq('id', lunch?.id ?? '')
      .single()
    expect(lunchRow.data?.start_time).toBe('12:30:00')

    // Undo the whole creation: every created task is gone from the planner.
    const undo = await call('undo_batch', { batch_id: created.data.batch_id })
    expect(undo.summary).toContain('3 changes reverted')
    expect((await call('get_schedule', { start_date: DAY })).data.days[0].timed).toEqual([])
    const batch = await admin
      .from('mcp_batches')
      .select('undone_at')
      .eq('id', created.data.batch_id)
      .single()
    expect(batch.data?.undone_at).not.toBeNull()
  })
})
