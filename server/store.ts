// The MCP server's data access: tasks, settings and undo batches in Supabase, through the secret
// key (server only). Plain one-off tasks only, like the app in Phase 1: recurring series arrive in
// Phase 3. Every error surfaces as a short code, never a server message.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json, TablesUpdate } from '../src/data/database.types.ts'
import { isValidTimeZone, type ISODate } from '../src/core/dates.ts'
import { taskFromRow, toStartTime } from '../src/core/rows.ts'
import type { Subtask, Task, TaskColor } from '../src/core/tasks.ts'

export type AdminDb = SupabaseClient<Database>

export function createAdminDb(url: string, secretKey: string): AdminDb {
  return createClient<Database>(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export interface StoreSettings {
  timezone: string
  timeFormat: '12h' | '24h'
  weekStart: number
  dayStart: string
  dayEnd: string
  defaultDuration: number
}

export interface NewTask {
  id: string
  title: string
  notes: string | null
  icon: string | null
  color: TaskColor
  subtasks: Subtask[]
  date: ISODate | null
  startTime: string | null
  durationMin: number
  isAllDay: boolean
}

/** Column changes, in domain terms. `deletedAt` soft-deletes (a timestamp) or restores (null). */
export interface TaskChanges {
  title?: string
  notes?: string | null
  icon?: string | null
  color?: TaskColor
  subtasks?: Subtask[]
  date?: ISODate | null
  startTime?: string | null
  durationMin?: number
  isAllDay?: boolean
  completedAt?: string | null
  deletedAt?: string | null
}

export type BatchOp =
  | { kind: 'create'; id: string }
  | { kind: 'update'; id: string; before: TaskChanges }
  | { kind: 'delete'; id: string }

export interface Batch {
  id: string
  tool: string
  summary: string
  ops: BatchOp[]
  undoneAt: string | null
  createdAt: string
}

export interface SearchOptions {
  from?: ISODate
  to?: ISODate
  includeCompleted: boolean
  limit: number
}

export interface TaskStore {
  getSettings(): Promise<StoreSettings>
  listRange(from: ISODate, to: ISODate): Promise<Task[]>
  listInbox(limit: number): Promise<Task[]>
  /** Open tasks dated from `since` up to the day before `before`. */
  listOpenBefore(before: ISODate, since: ISODate): Promise<Task[]>
  search(query: string, options: SearchOptions): Promise<Task[]>
  /** Tasks by id; soft-deleted ones only when asked (undo needs them). */
  getMany(ids: readonly string[], includeDeleted?: boolean): Promise<Task[]>
  insertMany(tasks: readonly NewTask[], batchId: string): Promise<Task[]>
  update(id: string, changes: TaskChanges, batchId: string | null): Promise<Task>
  saveBatch(batch: Omit<Batch, 'undoneAt' | 'createdAt'>): Promise<void>
  getBatch(id: string): Promise<Batch | null>
  markUndone(id: string, at: string): Promise<void>
}

export class StoreError extends Error {
  readonly code: string
  constructor(code: string) {
    super(`Database error: ${code}`)
    this.name = 'StoreError'
    this.code = code
  }
}

function fail(error: { code?: string } | null, status: number): never {
  const code =
    error?.code && /^[A-Z0-9]{1,12}$/i.test(error.code) ? `pg-${error.code}` : `http-${status}`
  throw new StoreError(code)
}

function subtasksJson(subtasks: readonly Subtask[]): Json {
  return subtasks.map((s) => ({ id: s.id, title: s.title, done: s.done }))
}

function toUpdate(changes: TaskChanges, batchId: string | null): TablesUpdate<'tasks'> {
  const u: TablesUpdate<'tasks'> = {}
  if (changes.title !== undefined) u.title = changes.title
  if (changes.notes !== undefined) u.notes = changes.notes
  if (changes.icon !== undefined) u.icon = changes.icon
  if (changes.color !== undefined) u.color = changes.color
  if (changes.subtasks !== undefined) u.subtasks = subtasksJson(changes.subtasks)
  if (changes.date !== undefined) u.date = changes.date
  if (changes.startTime !== undefined) u.start_time = changes.startTime
  if (changes.durationMin !== undefined) u.duration_min = changes.durationMin
  if (changes.isAllDay !== undefined) u.is_all_day = changes.isAllDay
  if (changes.completedAt !== undefined) u.completed_at = changes.completedAt
  if (changes.deletedAt !== undefined) u.deleted_at = changes.deletedAt
  if (batchId !== null) u.batch_id = batchId
  return u
}

/** PostgREST `or` filter values must not contain its syntax characters; LIKE wildcards are
 *  escaped so the query matches literally. */
export function searchPattern(query: string): string {
  const clean = query.replace(/[,()"]/g, ' ').trim()
  return `%${clean.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

export function createSupabaseStore(db: AdminDb): TaskStore {
  const plain = () => db.from('tasks').select('*').is('repeat_rule', null).is('series_id', null)
  const live = () => plain().is('deleted_at', null)

  return {
    async getSettings() {
      const { data, error, status } = await db
        .from('settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle()
      if (error) fail(error, status)
      return {
        timezone: data && isValidTimeZone(data.timezone) ? data.timezone : 'UTC',
        timeFormat: data?.time_format === '12h' ? '12h' : '24h',
        weekStart: data?.week_start ?? 1,
        dayStart: toStartTime(data?.day_start ?? null) ?? '07:00',
        dayEnd: toStartTime(data?.day_end ?? null) ?? '22:00',
        defaultDuration: data?.default_duration ?? 30,
      }
    },

    async listRange(from, to) {
      const { data, error, status } = await live().gte('date', from).lte('date', to)
      if (error) fail(error, status)
      return data.map(taskFromRow)
    },

    async listInbox(limit) {
      const { data, error, status } = await live()
        .is('date', null)
        .is('completed_at', null)
        .order('inbox_order')
        .order('created_at')
        .limit(limit)
      if (error) fail(error, status)
      return data.map(taskFromRow)
    },

    async listOpenBefore(before, since) {
      const { data, error, status } = await live()
        .lt('date', before)
        .gte('date', since)
        .is('completed_at', null)
        .order('date')
        .order('start_time')
      if (error) fail(error, status)
      return data.map(taskFromRow)
    },

    async search(query, options) {
      const pattern = searchPattern(query)
      let q = live().or(`title.ilike.${pattern},notes.ilike.${pattern}`)
      if (options.from) q = q.gte('date', options.from)
      if (options.to) q = q.lte('date', options.to)
      if (!options.includeCompleted) q = q.is('completed_at', null)
      const { data, error, status } = await q
        .order('date', { ascending: false, nullsFirst: true })
        .limit(options.limit)
      if (error) fail(error, status)
      return data.map(taskFromRow)
    },

    async getMany(ids, includeDeleted = false) {
      if (ids.length === 0) return []
      const base = includeDeleted ? plain() : live()
      const { data, error, status } = await base.in('id', [...ids])
      if (error) fail(error, status)
      return data.map(taskFromRow)
    },

    async insertMany(tasks, batchId) {
      const rows = tasks.map((t) => ({
        id: t.id,
        title: t.title,
        notes: t.notes,
        icon: t.icon,
        color: t.color,
        subtasks: subtasksJson(t.subtasks),
        date: t.date,
        start_time: t.startTime,
        duration_min: t.durationMin,
        is_all_day: t.isAllDay,
        source: 'mcp',
        batch_id: batchId,
      }))
      const { data, error, status } = await db.from('tasks').insert(rows).select('*')
      if (error) fail(error, status)
      return data.map(taskFromRow)
    },

    async update(id, changes, batchId) {
      const { data, error, status } = await db
        .from('tasks')
        .update(toUpdate(changes, batchId))
        .eq('id', id)
        .select('*')
        .single()
      if (error) fail(error, status)
      return taskFromRow(data)
    },

    async saveBatch(batch) {
      const { error, status } = await db.from('mcp_batches').insert({
        id: batch.id,
        tool: batch.tool,
        summary: batch.summary,
        ops: batch.ops as unknown as Json,
      })
      if (error) fail(error, status)
    },

    async getBatch(id) {
      const { data, error, status } = await db
        .from('mcp_batches')
        .select('*')
        .eq('id', id)
        .maybeSingle()
      if (error) fail(error, status)
      if (!data) return null
      return {
        id: data.id,
        tool: data.tool,
        summary: data.summary ?? '',
        ops: (Array.isArray(data.ops) ? data.ops : []) as unknown as BatchOp[],
        undoneAt: data.undone_at,
        createdAt: data.created_at,
      }
    },

    async markUndone(id, at) {
      const { error, status } = await db.from('mcp_batches').update({ undone_at: at }).eq('id', id)
      if (error) fail(error, status)
    },
  }
}
