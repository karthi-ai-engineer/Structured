// An in-memory TaskStore for unit tests: same contract as the Supabase store.
import type { ISODate } from '../../src/core/dates.ts'
import { expandSeriesRows, type SeriesRowShape } from '../../src/core/series.ts'
import type { Task } from '../../src/core/tasks.ts'
import {
  ROW_NOT_FOUND,
  StoreError,
  type Batch,
  type NewTask,
  type SearchOptions,
  type StoreSettings,
  type TaskChanges,
  type TaskStore,
} from '../store.ts'

interface Row extends Task {
  deletedAt: string | null
  batchId: string | null
  source: string
}

export class MemoryStore implements TaskStore {
  rows = new Map<string, Row>()
  batches = new Map<string, Batch>()
  settings: StoreSettings = {
    timezone: 'Asia/Tokyo',
    timeFormat: '24h',
    weekStart: 1,
    dayStart: '07:00',
    dayEnd: '22:00',
    defaultDuration: 30,
  }

  /** Seeds an existing (app-created) task. */
  seed(task: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
    const row: Row = {
      notes: null,
      icon: null,
      color: 'gray',
      subtasks: [],
      date: null,
      startTime: null,
      durationMin: 30,
      isAllDay: false,
      completedAt: null,
      inboxOrder: 0,
      createdAt: '2099-01-01T00:00:00.000Z',
      updatedAt: '2099-01-01T00:00:00.000Z',
      recurrence: null,
      deletedAt: null,
      batchId: null,
      source: 'app',
      ...task,
    }
    this.rows.set(row.id, row)
    return row
  }

  private live(): Row[] {
    return [...this.rows.values()].filter((r) => r.deletedAt === null)
  }

  private static task(r: Row): Task {
    return {
      id: r.id,
      title: r.title,
      notes: r.notes,
      icon: r.icon,
      color: r.color,
      subtasks: r.subtasks.map((s) => ({ ...s })),
      date: r.date,
      startTime: r.startTime,
      durationMin: r.durationMin,
      isAllDay: r.isAllDay,
      completedAt: r.completedAt,
      inboxOrder: r.inboxOrder,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      recurrence: r.recurrence,
    }
  }

  getSettings(): Promise<StoreSettings> {
    return Promise.resolve({ ...this.settings })
  }

  /** Recurring series and override rows, in database shape (expanded on read). */
  seriesRows: SeriesRowShape[] = []

  listRange(from: ISODate, to: ISODate): Promise<Task[]> {
    return Promise.resolve([
      ...this.live()
        .filter((r) => r.date !== null && r.date >= from && r.date <= to)
        .map((r) => MemoryStore.task(r)),
      ...expandSeriesRows(this.seriesRows, from, to),
    ])
  }

  listInbox(limit: number): Promise<Task[]> {
    return Promise.resolve(
      this.live()
        .filter((r) => r.date === null && r.completedAt === null)
        .slice(0, limit)
        .map((r) => MemoryStore.task(r)),
    )
  }

  listOpenBefore(before: ISODate, since: ISODate): Promise<Task[]> {
    return Promise.resolve(
      this.live()
        .filter(
          (r) => r.date !== null && r.date < before && r.date >= since && r.completedAt === null,
        )
        .map((r) => MemoryStore.task(r)),
    )
  }

  search(query: string, options: SearchOptions): Promise<Task[]> {
    const q = query.toLowerCase()
    return Promise.resolve(
      this.live()
        .filter(
          (r) => r.title.toLowerCase().includes(q) || (r.notes ?? '').toLowerCase().includes(q),
        )
        .filter((r) => options.includeCompleted || r.completedAt === null)
        .filter((r) => !options.from || (r.date !== null && r.date >= options.from))
        .filter((r) => !options.to || (r.date !== null && r.date <= options.to))
        .slice(0, options.limit)
        .map((r) => MemoryStore.task(r)),
    )
  }

  listDates(dates: readonly ISODate[]): Promise<Task[]> {
    const wanted = new Set(dates)
    const sorted = [...wanted].sort()
    const repeating =
      sorted.length === 0
        ? []
        : expandSeriesRows(this.seriesRows, sorted[0] ?? '', sorted[sorted.length - 1] ?? '')
    return Promise.resolve(
      [...this.live().map((r) => MemoryStore.task(r)), ...repeating].filter(
        (t) => t.date !== null && wanted.has(t.date),
      ),
    )
  }

  async updateMany(ids: readonly string[], changes: TaskChanges, batchId: string): Promise<Task[]> {
    // One statement in the real store: it fails as a whole, before any row changes.
    if (this.updateFailures.shift() === true) throw new StoreError('http-503')
    const out: Task[] = []
    for (const id of ids) out.push(await this.update(id, changes, batchId))
    return out
  }

  getMany(ids: readonly string[], includeDeleted = false): Promise<Task[]> {
    return Promise.resolve(
      ids
        .map((id) => this.rows.get(id))
        .filter((r): r is Row => r !== undefined && (includeDeleted || r.deletedAt === null))
        .map((r) => MemoryStore.task(r)),
    )
  }

  insertMany(tasks: readonly NewTask[], batchId: string): Promise<Task[]> {
    return Promise.resolve(
      tasks.map((t) => {
        const row: Row = {
          ...t,
          completedAt: null,
          inboxOrder: 0,
          createdAt: '2099-03-10T00:00:00.000Z',
          updatedAt: '2099-03-10T00:00:00.000Z',
          recurrence: null,
          deletedAt: null,
          batchId,
          source: 'mcp',
        }
        this.rows.set(row.id, row)
        return MemoryStore.task(row)
      }),
    )
  }

  /**
   * Failure injection for partial-write tests: each update (or updateMany) takes the next entry;
   * `true` makes it fail with a transient store error, as a dropped request would.
   */
  updateFailures: boolean[] = []

  update(id: string, changes: TaskChanges, batchId: string | null): Promise<Task> {
    if (this.updateFailures.shift() === true) return Promise.reject(new StoreError('http-503'))
    const row = this.rows.get(id)
    if (!row) return Promise.reject(new StoreError(ROW_NOT_FOUND))
    const { deletedAt, ...rest } = changes
    Object.assign(row, rest)
    if (deletedAt !== undefined) row.deletedAt = deletedAt
    if (batchId !== null) row.batchId = batchId
    return Promise.resolve(MemoryStore.task(row))
  }

  saveBatch(batch: Omit<Batch, 'undoneAt' | 'createdAt'>): Promise<void> {
    this.batches.set(batch.id, { ...batch, undoneAt: null, createdAt: '2099-03-10T00:00:00.000Z' })
    return Promise.resolve()
  }

  getBatch(id: string): Promise<Batch | null> {
    return Promise.resolve(this.batches.get(id) ?? null)
  }

  markUndone(id: string, at: string): Promise<void> {
    const batch = this.batches.get(id)
    if (batch) batch.undoneAt = at
    return Promise.resolve()
  }
}
