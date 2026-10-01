// The MCP server end to end through the official MCP client (same protocol as Claude), against an
// in-memory store and a fixed clock: Tuesday 2099-03-10, 09:00 in Asia/Tokyo.
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEntry, secretFromUrl, secretMatches } from '../mcp/entry.ts'
import { searchPattern } from '../store.ts'
import { MemoryStore } from './memoryStore.ts'

// Each test makes several protocol round trips; under the full coverage run on a busy machine a
// few of them take longer than the 5 s default.
vi.setConfig({ testTimeout: 20_000 })

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

// Round-1 code review of PR #18: each test reproduces a reviewer scenario.
describe('review fixes', () => {
  const created = async (tasks: Record<string, unknown>[]) => {
    const r = await call('create_tasks', { tasks })
    expect(r.isError).toBe(false)
    return {
      batchId: r.data.batch_id as string,
      ids: (r.data.tasks as { id: string }[]).map((t) => t.id),
    }
  }
  const row = (id: string) => {
    const r = store.rows.get(id)
    if (!r) throw new Error(`no row ${id}`)
    return r
  }

  it('undo keeps tasks the user changed since, until forced', async () => {
    const { batchId, ids } = await created([
      { title: 'A', date: '2099-03-11', start_time: '09:00' },
      { title: 'B', date: '2099-03-11', start_time: '11:00' },
    ])
    const [a = '', b = ''] = ids
    row(a).completedAt = '2099-03-11T10:00:00.000Z' // the user ticked A in the app

    const first = await call('undo_batch', { batch_id: batchId })
    expect(first.isError).toBe(false)
    expect(first.data.skipped).toEqual([{ id: a, title: 'A' }])
    expect(row(a).deletedAt).toBeNull()
    expect(row(b).deletedAt).not.toBeNull()
    expect(store.batches.get(batchId)?.undoneAt).toBeNull() // a retry stays possible

    const forced = await call('undo_batch', { batch_id: batchId, force: true })
    expect(forced.summary).toMatch(/^Undid "Created 2 tasks"/)
    expect(row(a).deletedAt).not.toBeNull()
    expect(store.batches.get(batchId)?.undoneAt).not.toBeNull()
  })

  it('undo of an edit leaves a later user move alone, until forced', async () => {
    const r = await call('update_task', { id: uuid(901), start_time: '12:00' })
    row(uuid(901)).startTime = '15:00' // moved again in the app
    const undo = await call('undo_batch', { batch_id: r.data.batch_id })
    expect(undo.data.skipped).toHaveLength(1)
    expect(row(uuid(901)).startTime).toBe('15:00')
    await call('undo_batch', { batch_id: r.data.batch_id, force: true })
    expect(row(uuid(901)).startTime).toBe('10:00')
  })

  it('a partly failed undo is reported and can be retried', async () => {
    const del = await call('delete_tasks', { ids: [uuid(901), uuid(902)] })
    store.updateFailures = [true] // the first revert request is dropped
    const partial = await call('undo_batch', { batch_id: del.data.batch_id })
    expect(partial.isError).toBe(true)
    expect(partial.summary).toMatch(/^Undo incomplete: 1 change could not be reverted/)
    expect(partial.data.failed).toHaveLength(1)
    expect(store.batches.get(del.data.batch_id)?.undoneAt).toBeNull()

    const retry = await call('undo_batch', { batch_id: del.data.batch_id })
    expect(retry.isError).toBe(false)
    expect(row(uuid(901)).deletedAt).toBeNull()
    expect(row(uuid(902)).deletedAt).toBeNull()
  })

  it('undo of add_subtasks removes only the added items, keeping the user items', async () => {
    const r = await call('add_subtasks', { task_id: uuid(901), titles: ['Notes', 'Blockers'] })
    const target = row(uuid(901))
    const [notes, blockers] = target.subtasks
    if (!notes || !blockers) throw new Error('subtasks missing')
    target.subtasks = [
      { ...notes, done: true },
      blockers,
      { id: 'own', title: 'Mine', done: false },
    ]
    await call('undo_batch', { batch_id: r.data.batch_id })
    expect(row(uuid(901)).subtasks).toEqual([{ id: 'own', title: 'Mine', done: false }])
  })

  it('a failure midway through move_tasks returns the batch to undo the moved part', async () => {
    store.updateFailures = [false, true]
    const r = await call('move_tasks', {
      moves: [
        { id: uuid(901), date: '2099-03-12', start_time: '09:00' },
        { id: uuid(903), date: '2099-03-12', start_time: '11:00' },
      ],
    })
    expect(r.isError).toBe(true)
    expect(r.summary).toMatch(/^Moved 1 of 2 tasks/)
    expect(row(uuid(901)).date).toBe('2099-03-12')
    await call('undo_batch', { batch_id: r.data.batch_id })
    expect(row(uuid(901))).toMatchObject({ date: '2099-03-10', startTime: '10:00' })
  })

  it('completing many tasks is all or nothing', async () => {
    store.updateFailures = [true]
    const r = await call('set_completion', { ids: [uuid(901), uuid(903)], done: true })
    expect(r.isError).toBe(true)
    expect(row(uuid(901)).completedAt).toBeNull()
    expect(row(uuid(903)).completedAt).toBeNull()
  })

  it('a start time makes an all-day task timed; without a date it is an error', async () => {
    store.seed({ id: uuid(904), title: 'Holiday', date: '2099-03-11', isAllDay: true })
    const moved = await call('move_tasks', {
      moves: [{ id: uuid(904), date: '2099-03-12', start_time: '10:00' }],
    })
    expect(moved.data.tasks[0]).toMatchObject({ start: '10:00', date: '2099-03-12' })
    expect(moved.data.tasks[0].all_day).toBeUndefined()

    store.seed({ id: uuid(905), title: 'Holiday 2', date: '2099-03-11', isAllDay: true })
    const updated = await call('update_task', { id: uuid(905), start_time: '08:00' })
    expect(updated.data.task).toMatchObject({ start: '08:00' })

    const inbox = await call('update_task', { id: uuid(902), start_time: '08:00' })
    expect(inbox.isError).toBe(true)
    expect(inbox.data.problems).toContain('Give a date to set a start time or all-day')
    const create = await call('create_tasks', {
      tasks: [{ title: 'No date', start_time: '08:00' }],
    })
    expect(create.data.problems[0].problems).toContain('Give a date to set a start time')
  })

  it('update_task refuses an unknown icon instead of clearing the current one', async () => {
    row(uuid(901)).icon = 'dumbbell'
    const r = await call('update_task', { id: uuid(901), icon: 'rocket' })
    expect(r.isError).toBe(true)
    expect(r.data.icons).toContain('laptop')
    expect(row(uuid(901)).icon).toBe('dumbbell')
  })

  it('unknown ids are errors or listed, never silent', async () => {
    const none = await call('set_completion', { ids: [uuid(999)], done: true })
    expect(none.isError).toBe(true)
    expect(none.data.missing).toEqual([uuid(999)])
    const some = await call('delete_tasks', { ids: [uuid(902), uuid(998)] })
    expect(some.data.missing).toEqual([uuid(998)])
  })

  it('flags a task that ends after midnight', async () => {
    const r = await call('create_tasks', {
      tasks: [{ title: 'Late', date: '2099-03-12', start_time: '23:30', duration_min: 60 }],
    })
    expect(r.data.tasks[0]).toMatchObject({ start: '23:30', end: '00:30', ends_next_day: true })
  })

  it('get_context and list_overdue look back the same number of days', async () => {
    store.seed({ id: uuid(906), title: 'Ancient', date: '2099-02-10', startTime: '09:00' })
    const context = await call('get_context')
    expect(context.data).toMatchObject({ overdue_count: 1, overdue_window_days: 14 })
    expect((await call('list_overdue')).data.tasks).toHaveLength(1)
  })

  it('search never matches everything', () => {
    expect(searchPattern('*')).toBeNull()
    expect(searchPattern('(),"')).toBeNull()
    expect(searchPattern('  lunch * ')).toBe('%lunch%')
    expect(searchPattern('50%_off')).toBe('%50\\%\\_off%')
  })
})

describe('recurring tasks', () => {
  const SERIES = uuid(950)
  beforeEach(() => {
    store.seriesRows = [
      {
        id: SERIES,
        title: 'Rise and Shine',
        notes: null,
        icon: 'sunrise',
        color: 'orange',
        subtasks: [],
        date: '2099-03-01',
        start_time: '07:30:00',
        duration_min: 60,
        is_all_day: false,
        completed_at: null,
        inbox_order: 0,
        created_at: '2099-01-01T00:00:00.000Z',
        updated_at: '2099-01-01T00:00:00.000Z',
        repeat_rule: 'FREQ=DAILY',
        repeat_until: null,
        series_id: null,
        occurrence_date: null,
        is_cancelled: false,
      },
    ]
  })

  it('schedule reads include occurrences, marked as repeating and read-only', async () => {
    const r = await call('get_schedule', { start_date: '2099-03-11' })
    const rise = r.data.days[0].timed.find((t: { title: string }) => t.title === 'Rise and Shine')
    expect(rise).toMatchObject({
      id: `${SERIES}:2099-03-11`,
      start: '07:30',
      end: '08:30',
      repeats: 'Every day',
      read_only: true,
    })
    const slots = await call('find_free_slots', { date: '2099-03-11', min_duration_min: 15 })
    // Day hours start at 07:00: free until the occurrence, then from its end.
    expect(slots.data.slots[0]).toMatchObject({ start: '07:00', end: '07:30' })
    expect(slots.data.slots[1]).toMatchObject({ start: '08:30' })
  })

  it('warns about overlaps with an occurrence', async () => {
    const r = await call('create_tasks', {
      dry_run: true,
      tasks: [{ title: 'Early call', date: '2099-03-12', start_time: '08:00', duration_min: 30 }],
    })
    expect(JSON.stringify(r.data)).toContain('Rise and Shine')
  })

  it('refuses to change an occurrence, with a clear reason', async () => {
    const r = await call('set_completion', { ids: [`${SERIES}:2099-03-11`], done: true })
    expect(r.isError).toBe(true)
    expect(r.summary + JSON.stringify(r.data)).toContain(
      'repeating tasks can be changed only in the app',
    )
    const bad = await call('delete_tasks', { ids: ['nope'] })
    expect(bad.summary + JSON.stringify(bad.data)).toContain('Not a task id')
  })
})

describe('energy monitor', () => {
  it('stores a task energy level, totals each day, and warns over the limit', async () => {
    store.settings.energyLimit = 10
    const first = await call('create_tasks', {
      tasks: [
        {
          title: 'Deep work',
          date: '2099-03-12',
          start_time: '09:00',
          duration_min: 120,
          energy: 2,
        },
      ],
    })
    expect(first.data.tasks[0]).toMatchObject({ energy: 2 })
    expect(first.data.tasks[0].warnings).toBeUndefined()

    const day = await call('get_schedule', { start_date: '2099-03-12' })
    expect(day.data.days[0].energy).toEqual({ used: 8, limit: 10 })

    const more = await call('create_tasks', {
      dry_run: true,
      tasks: [
        { title: 'Workshop', date: '2099-03-12', start_time: '14:00', duration_min: 60, energy: 3 },
      ],
    })
    expect(JSON.stringify(more.data)).toContain('Takes the day over its energy limit (14/10)')

    // update_task changes the level; undo restores it.
    const id = first.data.tasks[0].id
    const updated = await call('update_task', { id, energy: -1 })
    expect(updated.data.task.energy).toBe(-1)
    await call('undo_batch', { batch_id: updated.data.batch_id })
    expect(store.rows.get(id)?.energy).toBe(2)
  })

  it('leaves energy out when the monitor is off', async () => {
    store.settings.energyEnabled = false
    const day = await call('get_schedule', { start_date: '2099-03-12' })
    expect(day.data.days[0].energy).toBeUndefined()
  })
})

describe('priority and due date', () => {
  it('creates, shows, changes and undoes them', async () => {
    const r = await call('create_tasks', {
      tasks: [
        {
          title: 'Report',
          date: '2099-03-12',
          start_time: '15:00',
          priority: 'high',
          due_date: '2099-03-14',
        },
      ],
    })
    expect(r.data.tasks[0]).toMatchObject({ priority: 'high', due_date: '2099-03-14' })
    const id = r.data.tasks[0].id
    const u = await call('update_task', { id, priority: null, due_date: '2099-03-20' })
    expect(u.data.task.priority).toBeUndefined()
    expect(u.data.task.due_date).toBe('2099-03-20')
    await call('undo_batch', { batch_id: u.data.batch_id })
    expect(store.rows.get(id)).toMatchObject({ priority: 1, dueDate: '2099-03-14' })
  })
})
