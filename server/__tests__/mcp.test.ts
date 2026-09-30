// The MCP server end to end through the official MCP client (same protocol as Claude), against an
// in-memory store and a fixed clock: Tuesday 2099-03-10, 09:00 in Asia/Tokyo.
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createEntry, secretFromUrl, secretMatches } from '../mcp/entry.ts'
import { MemoryStore } from './memoryStore.ts'

const SECRET = 'test-secret-0123456789-abcdefghijklmnop'
const NOW = new Date(Date.UTC(2099, 2, 10, 0, 0, 0)) // 09:00 in Tokyo
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

let store: MemoryStore
let client: Client

function entryFor(s: MemoryStore) {
  return createEntry({
    env: () => ({ supabaseUrl: 'http://db.test', secretKey: 'k', mcpSecret: SECRET }),
    store: () => s,
    clock: () => NOW,
  })
}

async function connect(s: MemoryStore): Promise<Client> {
  const entry = entryFor(s)
  const c = new Client({ name: 'test', version: '1.0.0' })
  await c.connect(
    new StreamableHTTPClientTransport(new URL(`http://app.test/api/mcp/${SECRET}`), {
      fetch: (input, init) => entry(new Request(input, init)),
    }),
  )
  return c
}

/** Calls a tool and splits its result into the summary line and the JSON payload. */
async function call(name: string, args: Record<string, unknown> = {}) {
  const result = await client.callTool({ name, arguments: args })
  const content = result.content as { type: string; text: string }[]
  const text = content[0]?.text ?? ''
  const newline = text.indexOf('\n')
  const summary = newline === -1 ? text : text.slice(0, newline)
  const data: unknown = newline === -1 ? undefined : JSON.parse(text.slice(newline + 1))
  return { isError: result.isError === true, summary, data: data as Record<string, any> }
}

beforeEach(async () => {
  store = new MemoryStore()
  store.seed({
    id: uuid(901),
    title: 'Standup',
    date: '2099-03-10',
    startTime: '10:00',
    durationMin: 15,
  })
  store.seed({ id: uuid(902), title: 'Read paper', date: null })
  store.seed({
    id: uuid(903),
    title: 'Old report',
    date: '2099-03-08',
    startTime: '14:00',
    durationMin: 60,
  })
  client = await connect(store)
})

afterEach(async () => {
  await client.close()
})

describe('discovery', () => {
  it('offers the tools and prompts with guidance', async () => {
    const tools = (await client.listTools()).tools.map((t) => t.name).sort()
    expect(tools).toEqual([
      'add_subtasks',
      'create_tasks',
      'delete_tasks',
      'find_free_slots',
      'get_context',
      'get_schedule',
      'list_inbox',
      'list_overdue',
      'move_tasks',
      'search_tasks',
      'set_completion',
      'undo_batch',
      'update_task',
    ])
    expect((await client.listPrompts()).prompts.map((p) => p.name).sort()).toEqual([
      'plan_day',
      'replan_overdue',
    ])
    expect(client.getInstructions()).toContain('get_context first')
  })

  it('renders the plan_day prompt with the date and the confirm-before-write workflow', async () => {
    const prompt = await client.getPrompt({
      name: 'plan_day',
      arguments: { date: '2099-03-11', focus: 'API' },
    })
    const text = (prompt.messages[0]?.content as { text: string }).text
    expect(text).toContain('2099-03-11')
    expect(text).toContain('Focus: API')
    expect(text).toContain('dry_run: true')
  })
})

describe('read tools', () => {
  it('get_context: time, zone, counts and vocabulary', async () => {
    const r = await call('get_context')
    expect(r.summary).toBe(
      'It is Tuesday 2099-03-10, 09:00 (Asia/Tokyo). Day hours 07:00–22:00. Inbox: 1, overdue: 1.',
    )
    expect(r.data).toMatchObject({ today: '2099-03-10', now: '09:00', week_starts_on: 'Monday' })
    expect(r.data.icons).toContain('dumbbell')
    expect(r.data.colors).toContain('teal')
  })

  it('get_schedule: tasks, free slots from now on, and range limits', async () => {
    const r = await call('get_schedule', { start_date: '2099-03-10' })
    const day = r.data.days[0]
    expect(day.timed.map((t: { title: string }) => t.title)).toEqual(['Standup'])
    expect(day.free_slots).toEqual([
      { start: '09:00', end: '10:00', minutes: 60 },
      { start: '10:15', end: '22:00', minutes: 705 },
    ])
    expect(
      (await call('get_schedule', { start_date: '2099-03-10', end_date: '2099-04-20' })).isError,
    ).toBe(true)
    expect(
      (await call('get_schedule', { start_date: '2099-03-10', end_date: '2099-03-09' })).isError,
    ).toBe(true)
  })

  it('list_inbox, list_overdue, search_tasks, find_free_slots', async () => {
    expect((await call('list_inbox')).data.tasks[0]).toMatchObject({
      title: 'Read paper',
      inbox: true,
    })
    expect((await call('list_overdue')).data.tasks[0]).toMatchObject({
      title: 'Old report',
      date: '2099-03-08',
    })
    expect((await call('search_tasks', { query: 'STAND' })).data.tasks[0].title).toBe('Standup')
    const slots = await call('find_free_slots', {
      date: '2099-03-11',
      min_minutes: 60,
      from: '09:00',
      to: '12:00',
    })
    expect(slots.data.slots).toEqual([{ start: '09:00', end: '12:00', minutes: 180 }])
  })
})

describe('create_tasks', () => {
  const plan = [
    {
      title: 'Deep work: API',
      date: '2099-03-10',
      start_time: '09:30',
      duration_min: 60,
      color: 'blue',
      icon: 'laptop',
    },
    { title: 'Gym', date: '2099-03-10', start_time: '18:00', duration_min: 60, icon: '🏋️' },
    { title: 'Buy gift', subtasks: ['Pick', 'Wrap'] },
  ]

  it('dry run: previews with warnings and writes nothing', async () => {
    const r = await call('create_tasks', { tasks: plan, dry_run: true })
    expect(r.summary).toBe('Dry run: 3 tasks would be created, 1 warning. Nothing was written.')
    expect(r.data.tasks[0].warnings).toEqual(['Overlaps "Standup" (10:00–10:15)'])
    expect(r.data.tasks[0].id).toBeUndefined()
    expect(store.rows.size).toBe(3)
  })

  it('rejects the whole batch when one task is invalid', async () => {
    const r = await call('create_tasks', {
      tasks: [...plan, { title: 'No time', date: '2099-03-11' }],
    })
    expect(r.isError).toBe(true)
    expect(r.data.problems).toEqual([
      { index: 3, title: 'No time', problems: ['Pick a start time or turn on All day'] },
    ])
    expect(store.rows.size).toBe(3)
  })

  it('creates the tasks in one batch that undo_batch removes again', async () => {
    const r = await call('create_tasks', { tasks: plan })
    expect(r.summary).toMatch(/^Created 3 tasks \(batch [0-9a-f-]{36}\), 1 warning\./)
    const batchId = r.data.batch_id as string
    const created = [...store.rows.values()].filter((row) => row.batchId === batchId)
    expect(created.map((t) => [t.title, t.source, t.icon])).toEqual([
      ['Deep work: API', 'mcp', 'laptop'],
      ['Gym', 'mcp', '🏋️'],
      ['Buy gift', 'mcp', null],
    ])
    expect(created[2]?.subtasks.map((s) => s.title)).toEqual(['Pick', 'Wrap'])
    expect(created[2]?.date).toBeNull()

    const schedule = await call('get_schedule', { start_date: '2099-03-10' })
    expect(schedule.data.days[0].overlaps).toHaveLength(1)

    const undo = await call('undo_batch', { batch_id: batchId })
    expect(undo.summary).toBe('Undid "Created 3 tasks": 3 changes reverted.')
    expect(created.every((t) => t.deletedAt !== null)).toBe(true)
    expect((await call('undo_batch', { batch_id: batchId })).isError).toBe(true)
  })

  it('leaves out unknown icons with a warning and uses the defaults', async () => {
    const r = await call('create_tasks', {
      tasks: [{ title: 'Run', date: '2099-03-12', start_time: '07:00', icon: 'running' }],
    })
    expect(r.data.tasks[0]).toMatchObject({
      duration_min: 30,
      color: 'coral',
      warnings: ['Unknown icon "running" was left out'],
    })
  })
})

describe('changing tasks', () => {
  it('update_task: reschedules with warnings; undo restores the old slot', async () => {
    const r = await call('update_task', { id: uuid(901), start_time: '21:45', duration_min: 30 })
    expect(r.data.task).toMatchObject({ start: '21:45', end: '22:15' })
    expect(r.data.task.warnings).toEqual(['Outside your day hours (07:00–22:00)'])
    await call('undo_batch', { batch_id: r.data.batch_id })
    expect(store.rows.get(uuid(901))).toMatchObject({ startTime: '10:00', durationMin: 15 })
    expect((await call('update_task', { id: uuid(901) })).isError).toBe(true)
    expect((await call('update_task', { id: uuid(999), title: 'x' })).isError).toBe(true)
  })

  it('move_tasks: needs a start time for untimed tasks and reopens completed ones sent to the inbox', async () => {
    const invalid = await call('move_tasks', { moves: [{ id: uuid(902), date: '2099-03-11' }] })
    expect(invalid.isError).toBe(true)
    store.rows.get(uuid(903))!.completedAt = '2099-03-08T10:00:00.000Z'
    const r = await call('move_tasks', {
      moves: [
        { id: uuid(902), date: '2099-03-11', start_time: '08:00' },
        { id: uuid(903), date: null },
      ],
    })
    expect(r.data.tasks.map((t: { title: string }) => t.title)).toEqual([
      'Read paper',
      'Old report',
    ])
    expect(store.rows.get(uuid(903))).toMatchObject({
      date: null,
      startTime: null,
      completedAt: null,
    })
    await call('undo_batch', { batch_id: r.data.batch_id })
    expect(store.rows.get(uuid(902))).toMatchObject({ date: null, startTime: null })
    expect(store.rows.get(uuid(903))).toMatchObject({
      date: '2099-03-08',
      startTime: '14:00',
      completedAt: '2099-03-08T10:00:00.000Z',
    })
    expect(
      (
        await call('move_tasks', {
          moves: [
            { id: uuid(902), date: null },
            { id: uuid(902), date: null },
          ],
        })
      ).isError,
    ).toBe(true)
  })

  it('set_completion, add_subtasks and delete_tasks are undoable', async () => {
    const done = await call('set_completion', { ids: [uuid(901)], done: true })
    expect(store.rows.get(uuid(901))?.completedAt).toBe('2099-03-10T00:00:00.000Z')
    expect((await call('set_completion', { ids: [uuid(901)], done: true })).summary).toMatch(
      /^Nothing to change/,
    )
    await call('undo_batch', { batch_id: done.data.batch_id })
    expect(store.rows.get(uuid(901))?.completedAt).toBeNull()

    const sub = await call('add_subtasks', { task_id: uuid(901), titles: ['Notes', 'Blockers'] })
    expect(sub.data.task.subtasks.map((s: { title: string }) => s.title)).toEqual([
      'Notes',
      'Blockers',
    ])

    const del = await call('delete_tasks', { ids: [uuid(901), uuid(902)] })
    expect(del.summary).toMatch(/^Deleted 2 tasks/)
    expect((await call('list_inbox')).data.tasks).toEqual([])
    await call('undo_batch', { batch_id: del.data.batch_id })
    expect((await call('list_inbox')).data.tasks).toHaveLength(1)
    expect(store.rows.get(uuid(901))?.deletedAt).toBeNull()
  })
})

describe('entry (secret path)', () => {
  it('answers 404 for a wrong or missing secret, and when misconfigured', async () => {
    const entry = entryFor(store)
    const post = (path: string) =>
      entry(
        new Request(`http://app.test${path}`, {
          method: 'POST',
          body: '{}',
          headers: { 'content-type': 'application/json' },
        }),
      )
    expect((await post('/api/mcp/wrong-secret')).status).toBe(404)
    expect((await post('/api/mcp/')).status).toBe(404)
    const broken = createEntry({
      env: () => {
        throw new Error('env missing')
      },
    })
    expect(
      (await broken(new Request(`http://app.test/api/mcp/${SECRET}`, { method: 'POST' }))).status,
    ).toBe(404)
  })

  it('parses and compares secrets safely', () => {
    expect(secretFromUrl('http://x/api/mcp/abc')).toBe('abc')
    expect(secretFromUrl('http://x/api/mcp/abc/?q=1')).toBe('abc')
    expect(secretFromUrl('http://x/api/mcp/a%20b')).toBe('a b')
    expect(secretFromUrl('http://x/api/mcp/%E0%A4%A')).toBeNull()
    expect(secretFromUrl('http://x/api/other')).toBeNull()
    expect(secretMatches('abc', 'abc')).toBe(true)
    expect(secretMatches('abd', 'abc')).toBe(false)
    expect(secretMatches('', 'abc')).toBe(false)
  })
})
