// MCP tools (PLAN.md section 10.4). Conventions (section 10.3):
// - dates 'YYYY-MM-DD' and times 'HH:mm' (24 h) in the user's time zone, durations in minutes
// - every write is validated first (nothing is written if any item is invalid), returns warnings
//   instead of failing, is tagged source='mcp' and recorded as one undoable batch.

import type { CallToolResult, McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'
import {
  addDays,
  diffDays,
  formatDateLabel,
  isISODate,
  nowIso,
  nowMinutesIn,
  todayIn,
  type ISODate,
} from '../../src/core/dates.ts'
import { TASK_ICON_NAMES, toStoredIcon } from '../../src/core/icons.ts'
import {
  findFreeSlots,
  overlappingPairs,
  plannedTaskWarnings,
  taskInterval,
  windowOf,
  type Interval,
  type PlannedTask,
} from '../../src/core/schedule.ts'
import {
  applyPatch,
  DEFAULT_TASK_COLOR,
  layoutDay,
  normalizeTitle,
  TASK_COLORS,
  validateDraft,
  type Subtask,
  type Task,
  type TaskDraft,
} from '../../src/core/tasks.ts'
import {
  ROW_NOT_FOUND,
  StoreError,
  type BatchOp,
  type NewTask,
  type TaskChanges,
  type TaskStore,
} from '../store.ts'
import { fail, ok, plural, view } from './format.ts'

export interface ToolDeps {
  store: TaskStore
  now: () => Date
  newId: () => string
}

const COLOR_NAMES = TASK_COLORS.map((c) => c.name) as [string, ...string[]]
const MAX_RANGE_DAYS = 31
/** How far back "overdue" looks, in get_context and list_overdue alike. */
const OVERDUE_DAYS = 14

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD')
  .refine(isISODate, 'Not a real calendar date')
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:mm (24-hour)')
const taskId = z.string().uuid()
const color = z.enum(COLOR_NAMES)
const duration = z.number().int().min(0).max(1440)
const title = z.string().trim().min(1).max(200)

/** Runs a tool body, turning store failures into a readable error result. */
async function guarded(body: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await body()
  } catch (error) {
    if (error instanceof StoreError)
      return fail(
        `The planner database refused the request (${error.code}). Nothing more was changed.`,
      )
    throw error
  }
}

function roundUp(minutes: number, step: number): number {
  return Math.min(Math.ceil(minutes / step) * step, 1440)
}

function datesBetween(from: ISODate, to: ISODate): ISODate[] {
  const days: ISODate[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
  return days
}

function asPlanned(
  t: Pick<Task, 'title' | 'date' | 'startTime' | 'durationMin' | 'isAllDay'>,
): PlannedTask {
  return {
    title: t.title,
    date: t.date,
    startTime: t.startTime,
    durationMin: t.durationMin,
    isAllDay: t.isAllDay,
  }
}

export function registerTools(server: McpServer, deps: ToolDeps): void {
  const { store } = deps

  async function clock() {
    const settings = await store.getSettings()
    const now = deps.now()
    const today = todayIn(settings.timezone, now)
    const nowMinutes = nowMinutesIn(settings.timezone, now)
    return { settings, now, today, nowMinutes }
  }

  /** Free slots on `date` inside `window`, from now on when the date is today. */
  function freeOn(
    date: ISODate,
    tasks: readonly Task[],
    window: Interval,
    today: ISODate,
    nowMinutes: number,
    min: number,
  ) {
    if (date < today) return []
    const from = date === today ? Math.max(window.start, roundUp(nowMinutes, 5)) : window.start
    const busy = tasks
      .filter((t) => t.completedAt === null)
      .map(taskInterval)
      .filter((i): i is Interval => i !== null)
    return findFreeSlots(busy, { start: from, end: window.end }, min)
  }

  // ---------------------------------------------------------------------------------------------
  // Read tools

  server.registerTool(
    'get_context',
    {
      title: 'Get planner context',
      description:
        'Call this first. Returns today, the current time and weekday in the user’s time zone, their day hours and defaults, counts of inbox and overdue tasks, and the allowed colors and icon names.',
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    () =>
      guarded(async () => {
        const { settings, today, nowMinutes } = await clock()
        const [inbox, overdue] = await Promise.all([
          store.listInbox(500),
          store.listOpenBefore(today, addDays(today, -OVERDUE_DAYS)),
        ])
        const hh = String(Math.floor(nowMinutes / 60)).padStart(2, '0')
        const mm = String(nowMinutes % 60).padStart(2, '0')
        const data = {
          today,
          now: `${hh}:${mm}`,
          weekday: formatDateLabel(today, 'EEEE'),
          timezone: settings.timezone,
          day_start: settings.dayStart,
          day_end: settings.dayEnd,
          default_duration_min: settings.defaultDuration,
          time_format: settings.timeFormat,
          week_starts_on: formatDateLabel(addDays('2023-01-01', settings.weekStart), 'EEEE'),
          inbox_count: inbox.length,
          overdue_count: overdue.length,
          overdue_window_days: OVERDUE_DAYS,
          colors: COLOR_NAMES,
          icons: TASK_ICON_NAMES,
        }
        return ok(
          `It is ${data.weekday} ${today}, ${data.now} (${settings.timezone}). Day hours ${settings.dayStart}–${settings.dayEnd}. Inbox: ${inbox.length}, overdue: ${overdue.length}.`,
          data,
        )
      }),
  )

  server.registerTool(
    'get_schedule',
    {
      title: 'Get schedule',
      description:
        'The plan for one day or a range (up to 31 days): all-day tasks, timed tasks in order, free slots (from now on, inside day hours, at least 15 minutes) and overlapping task pairs.',
      inputSchema: z.object({
        start_date: isoDate,
        end_date: isoDate.optional().describe('Inclusive; defaults to start_date'),
        include_completed: z.boolean().optional().describe('Default true'),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ start_date, end_date, include_completed }) =>
      guarded(async () => {
        const end = end_date ?? start_date
        const span = diffDays(end, start_date)
        if (span < 0) return fail('end_date must not be before start_date.')
        if (span >= MAX_RANGE_DAYS) return fail(`Ask for at most ${MAX_RANGE_DAYS} days at a time.`)
        const { settings, today, nowMinutes } = await clock()
        const all = await store.listRange(start_date, end)
        const shown = include_completed === false ? all.filter((t) => t.completedAt === null) : all
        const window = windowOf(settings)
        const days = datesBetween(start_date, end).map((date) => {
          const onDay = shown.filter((t) => t.date === date)
          const { allDay, timed } = layoutDay(onDay)
          const open = all.filter((t) => t.date === date && t.completedAt === null)
          return {
            date,
            weekday: formatDateLabel(date, 'EEEE'),
            all_day: allDay.map((t) => view(t)),
            timed: timed.map((t) => view(t)),
            free_slots: freeOn(date, open, window, today, nowMinutes, 15),
            overlaps: overlappingPairs(open),
          }
        })
        const count = days.reduce((n, d) => n + d.all_day.length + d.timed.length, 0)
        return ok(
          `${plural(count, 'task')} from ${start_date}${end === start_date ? '' : ` to ${end}`}.`,
          { days },
        )
      }),
  )

  server.registerTool(
    'list_inbox',
    {
      title: 'List inbox',
      description:
        'Open tasks without a date (ideas and to-dos waiting to be scheduled), oldest first.',
      inputSchema: z.object({ limit: z.number().int().min(1).max(200).optional() }),
      annotations: { readOnlyHint: true },
    },
    ({ limit }) =>
      guarded(async () => {
        const tasks = await store.listInbox(limit ?? 50)
        return ok(`${plural(tasks.length, 'inbox task')}.`, { tasks: tasks.map((t) => view(t)) })
      }),
  )

  server.registerTool(
    'find_free_slots',
    {
      title: 'Find free slots',
      description:
        'Free time on a date, from now on if it is today. Defaults to the user’s day hours; pass from/to to search another window.',
      inputSchema: z.object({
        date: isoDate,
        min_minutes: z.number().int().min(1).max(1440).optional().describe('Default 30'),
        from: hhmm.optional(),
        to: hhmm.optional(),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ date, min_minutes, from, to }) =>
      guarded(async () => {
        const { settings, today, nowMinutes } = await clock()
        const window = windowOf({
          dayStart: from ?? settings.dayStart,
          dayEnd: to ?? settings.dayEnd,
        })
        const tasks = await store.listRange(date, date)
        const slots = freeOn(date, tasks, window, today, nowMinutes, min_minutes ?? 30)
        const total = slots.reduce((n, s) => n + s.minutes, 0)
        return ok(`${plural(slots.length, 'free slot')} on ${date} (${total} min in total).`, {
          date,
          slots,
        })
      }),
  )

  server.registerTool(
    'list_overdue',
    {
      title: 'List overdue tasks',
      description: 'Open tasks dated before today (default: the last 14 days). Use them to replan.',
      inputSchema: z.object({ days_back: z.number().int().min(1).max(90).optional() }),
      annotations: { readOnlyHint: true },
    },
    ({ days_back }) =>
      guarded(async () => {
        const { today } = await clock()
        const tasks = await store.listOpenBefore(
          today,
          addDays(today, -(days_back ?? OVERDUE_DAYS)),
        )
        return ok(`${plural(tasks.length, 'overdue task')}.`, { tasks: tasks.map((t) => view(t)) })
      }),
  )

  server.registerTool(
    'search_tasks',
    {
      title: 'Search tasks',
      description: 'Finds tasks whose title or notes contain the text (case-insensitive).',
      inputSchema: z.object({
        query: z.string().trim().min(1).max(100),
        from: isoDate.optional(),
        to: isoDate.optional(),
        include_completed: z.boolean().optional().describe('Default false'),
        limit: z.number().int().min(1).max(100).optional().describe('Default 25'),
      }),
      annotations: { readOnlyHint: true },
    },
    ({ query, from, to, include_completed, limit }) =>
      guarded(async () => {
        const tasks = await store.search(query, {
          from,
          to,
          includeCompleted: include_completed ?? false,
          limit: limit ?? 25,
        })
        return ok(`${plural(tasks.length, 'match')} for "${query}".`, {
          tasks: tasks.map((t) => view(t)),
        })
      }),
  )

  // ---------------------------------------------------------------------------------------------
  // Write tools

  /** Warnings for planned tasks, checked against the existing tasks on the same dates (only
   *  those dates are loaded) and against each other, in order. */
  async function warningsFor(
    planned: readonly PlannedTask[],
    ignoreIds: ReadonlySet<string>,
  ): Promise<string[][]> {
    const { settings, today, nowMinutes } = await clock()
    const dates = planned.map((p) => p.date).filter((d): d is ISODate => d !== null)
    const existing = await store.listDates(dates)
    const accepted: (PlannedTask & { completedAt: null })[] = []
    return planned.map((p) => {
      const sameDay = [
        ...existing.filter((t) => t.date === p.date && !ignoreIds.has(t.id)),
        ...accepted.filter((t) => t.date === p.date),
      ]
      const warnings = plannedTaskWarnings(p, { sameDay, window: settings, today, nowMinutes })
      accepted.push({ ...p, completedAt: null })
      return warnings
    })
  }

  const newTaskItem = z.object({
    title,
    date: isoDate.nullable().optional().describe('Omit or null for the inbox'),
    start_time: hhmm.optional().describe('Required for a dated task unless all_day'),
    duration_min: duration.optional().describe('Default: the user’s default duration'),
    all_day: z.boolean().optional(),
    color: color.optional(),
    icon: z
      .string()
      .max(40)
      .optional()
      .describe('One of the icon names from get_context, or one emoji'),
    notes: z.string().max(5000).optional(),
    subtasks: z.array(title).max(50).optional(),
  })

  server.registerTool(
    'create_tasks',
    {
      title: 'Create tasks',
      description:
        'Creates one or more tasks (up to 50) in one undoable batch. Always call with dry_run: true first, show the plan and warnings to the user, and create only after they confirm. If any task is invalid, nothing is created. Warnings (overlaps, outside day hours, in the past) do not block.',
      inputSchema: z.object({
        tasks: z.array(newTaskItem).min(1).max(50),
        dry_run: z.boolean().optional(),
      }),
    },
    ({ tasks, dry_run }) =>
      guarded(async () => {
        const { settings } = await clock()
        const drafts = tasks.map((t) => {
          const date = t.date ?? null
          const isAllDay = date !== null && t.all_day === true
          const icon = toStoredIcon(t.icon)
          const task: NewTask = {
            id: deps.newId(),
            title: normalizeTitle(t.title),
            notes: t.notes?.trim() ? t.notes.trim() : null,
            icon,
            color: (t.color as NewTask['color'] | undefined) ?? DEFAULT_TASK_COLOR,
            subtasks: (t.subtasks ?? []).map((s) => ({
              id: deps.newId(),
              title: normalizeTitle(s),
              done: false,
            })),
            date,
            startTime: date !== null && !isAllDay ? (t.start_time ?? null) : null,
            durationMin: t.duration_min ?? settings.defaultDuration,
            isAllDay,
          }
          const problems = validateDraft(task)
          if (date === null && t.start_time !== undefined) {
            problems.push('Give a date to set a start time')
          }
          return {
            task,
            problems,
            iconWarning: t.icon && icon === null ? `Unknown icon "${t.icon}" was left out` : null,
          }
        })
        const problems = drafts
          .map((d, index) => ({ index, title: d.task.title, problems: d.problems }))
          .filter((p) => p.problems.length > 0)
        if (problems.length > 0) {
          return fail(`Nothing was created: ${plural(problems.length, 'task')} need fixing.`, {
            problems,
          })
        }
        const warnings = (
          await warningsFor(
            drafts.map((d) => asPlanned(d.task)),
            new Set(),
          )
        ).map((w, i) => {
          const iconWarning = drafts[i]?.iconWarning
          return iconWarning ? [...w, iconWarning] : w
        })
        const warningCount = warnings.reduce((n, w) => n + w.length, 0)
        const asTask = (t: NewTask): Task => ({
          ...t,
          completedAt: null,
          inboxOrder: 0,
          createdAt: '',
          updatedAt: '',
        })

        if (dry_run) {
          return ok(
            `Dry run: ${plural(drafts.length, 'task')} would be created, ${plural(warningCount, 'warning')}. Nothing was written.`,
            {
              dry_run: true,
              tasks: drafts.map((d, i) => {
                const { id: _id, ...rest } = view(asTask(d.task), warnings[i])
                void _id
                return rest
              }),
            },
          )
        }
        const batchId = deps.newId()
        const summary = `Created ${plural(drafts.length, 'task')}`
        await store.saveBatch({
          id: batchId,
          tool: 'create_tasks',
          summary,
          ops: drafts.map((d) => ({
            kind: 'create',
            id: d.task.id,
            after: pick(asTask(d.task), FIELDS),
          })),
        })
        // One insert statement: all tasks are created, or none.
        const created = await store.insertMany(
          drafts.map((d) => d.task),
          batchId,
        )
        const byId = new Map(created.map((t) => [t.id, t]))
        return ok(
          `${summary} (batch ${batchId}), ${plural(warningCount, 'warning')}. They appear live in the planner. Undo with undo_batch.`,
          {
            batch_id: batchId,
            tasks: drafts.map((d, i) => view(byId.get(d.task.id) ?? asTask(d.task), warnings[i])),
          },
        )
      }),
  )

  /**
   * The stored changes for a scheduling patch, normalized like the app does, plus problems.
   * - A start time makes an all-day task timed (unless all_day is given explicitly).
   * - A start time or all-day without a date is a problem (the inbox has neither).
   * - A completed task moved to the inbox is reopened (the inbox lists only open tasks).
   */
  function scheduleChanges(task: Task, input: Partial<TaskDraft>) {
    const patch: Partial<TaskDraft> = { ...input }
    if (
      patch.startTime !== undefined &&
      patch.startTime !== null &&
      patch.isAllDay === undefined &&
      task.isAllDay
    ) {
      patch.isAllDay = false
    }
    const merged = applyPatch(task, patch)
    const changes: TaskChanges = { ...patch }
    if (patch.date !== undefined || patch.startTime !== undefined || patch.isAllDay !== undefined) {
      changes.date = merged.date
      changes.startTime = merged.startTime
      changes.isAllDay = merged.isAllDay
    }
    if (merged.date === null && task.completedAt !== null && patch.date === null) {
      changes.completedAt = null
      merged.completedAt = null
    }
    const problems = validateDraft(merged)
    if (
      merged.date === null &&
      ((input.startTime !== undefined && input.startTime !== null) || input.isAllDay === true)
    ) {
      problems.push('Give a date to set a start time or all-day')
    }
    return { merged, changes, problems }
  }

  /** The undo record of an edit: the old and the new values of every field it touches. */
  function updateOp(task: Task, changes: TaskChanges): BatchOp {
    const keys = changedKeys(changes)
    return { kind: 'update', id: task.id, before: pick(task, keys), after: pick(changes, keys) }
  }

  server.registerTool(
    'update_task',
    {
      title: 'Update a task',
      description:
        'Changes fields of one task (only the fields you pass). date: null moves it to the inbox; start_time on an all-day task makes it timed. Returns warnings; undoable with undo_batch.',
      inputSchema: z.object({
        id: taskId,
        title: title.optional(),
        notes: z.string().max(5000).nullable().optional(),
        icon: z.string().max(40).nullable().optional(),
        color: color.optional(),
        date: isoDate.nullable().optional(),
        start_time: hhmm.nullable().optional(),
        duration_min: duration.optional(),
        all_day: z.boolean().optional(),
      }),
    },
    (input) =>
      guarded(async () => {
        const [task] = await store.getMany([input.id])
        if (!task) return fail(`No task with id ${input.id}.`)
        const patch: Partial<TaskDraft> = {}
        if (input.title !== undefined) patch.title = normalizeTitle(input.title)
        if (input.notes !== undefined) patch.notes = input.notes?.trim() ? input.notes.trim() : null
        if (input.icon !== undefined) {
          const icon = toStoredIcon(input.icon)
          if (input.icon !== null && input.icon.trim() !== '' && icon === null) {
            return fail(`Unknown icon "${input.icon}". Nothing was changed.`, {
              icons: TASK_ICON_NAMES,
            })
          }
          patch.icon = icon
        }
        if (input.color !== undefined) patch.color = input.color as TaskDraft['color']
        if (input.date !== undefined) patch.date = input.date
        if (input.start_time !== undefined) patch.startTime = input.start_time
        if (input.duration_min !== undefined) patch.durationMin = input.duration_min
        if (input.all_day !== undefined) patch.isAllDay = input.all_day
        if (Object.keys(patch).length === 0) return fail('Pass at least one field to change.')
        const { merged, changes, problems } = scheduleChanges(task, patch)
        if (problems.length > 0) return fail('Nothing was changed.', { problems })
        const [warnings] = await warningsFor([asPlanned(merged)], new Set([task.id]))
        const batchId = deps.newId()
        await store.saveBatch({
          id: batchId,
          tool: 'update_task',
          summary: `Updated "${task.title}"`,
          ops: [updateOp(task, changes)],
        })
        const updated = await store.update(task.id, changes, batchId)
        return ok(`Updated "${updated.title}" (batch ${batchId}).`, {
          batch_id: batchId,
          task: view(updated, warnings),
        })
      }),
  )

  server.registerTool(
    'move_tasks',
    {
      title: 'Move tasks',
      description:
        'Reschedules tasks in one undoable batch (for example to replan overdue work). Each move: id, date (null = inbox), and start_time (required when the task has no time yet and is not all-day; it makes an all-day task timed). Validates everything first.',
      inputSchema: z.object({
        moves: z
          .array(z.object({ id: taskId, date: isoDate.nullable(), start_time: hhmm.optional() }))
          .min(1)
          .max(50),
      }),
    },
    ({ moves }) =>
      guarded(async () => {
        const ids = moves.map((m) => m.id)
        if (new Set(ids).size !== ids.length) {
          return fail('Each task may be moved only once per call.')
        }
        const tasks = await store.getMany(ids)
        const byId = new Map(tasks.map((t) => [t.id, t]))
        const missing = ids.filter((id) => !byId.has(id))
        if (missing.length > 0) return fail('Nothing was moved: unknown task ids.', { missing })
        const plans = moves.map((m) => {
          const task = byId.get(m.id) as Task
          const patch: Partial<TaskDraft> = { date: m.date }
          if (m.start_time !== undefined) patch.startTime = m.start_time
          return { task, ...scheduleChanges(task, patch) }
        })
        const problems = plans
          .map((p) => ({ id: p.task.id, title: p.task.title, problems: p.problems }))
          .filter((p) => p.problems.length > 0)
        if (problems.length > 0) return fail('Nothing was moved.', { problems })
        const warnings = await warningsFor(
          plans.map((p) => asPlanned(p.merged)),
          new Set(ids),
        )
        const batchId = deps.newId()
        await store.saveBatch({
          id: batchId,
          tool: 'move_tasks',
          summary: `Moved ${plural(plans.length, 'task')}`,
          ops: plans.map((p) => updateOp(p.task, p.changes)),
        })
        // Each task gets its own values, so the rows are written one by one. If one fails, the
        // answer names the batch and the rows already moved, so undo_batch can revert them.
        const moved: Record<string, unknown>[] = []
        for (const [i, p] of plans.entries()) {
          try {
            moved.push(view(await store.update(p.task.id, p.changes, batchId), warnings[i]))
          } catch (error) {
            if (!(error instanceof StoreError)) throw error
            return fail(
              `Moved ${moved.length} of ${plans.length} tasks, then the database refused the rest (${error.code}). Revert the moved ones with undo_batch.`,
              { batch_id: batchId, moved },
            )
          }
        }
        return ok(`Moved ${plural(moved.length, 'task')} (batch ${batchId}).`, {
          batch_id: batchId,
          tasks: moved,
        })
      }),
  )

  server.registerTool(
    'set_completion',
    {
      title: 'Complete or reopen tasks',
      description:
        'Marks tasks done (done: true) or not done (done: false), in one undoable batch.',
      inputSchema: z.object({ ids: z.array(taskId).min(1).max(100), done: z.boolean() }),
    },
    ({ ids, done }) =>
      guarded(async () => {
        const unique = [...new Set(ids)]
        const tasks = await store.getMany(unique)
        const missing = unique.filter((id) => !tasks.some((t) => t.id === id))
        if (tasks.length === 0) return fail('None of these tasks exist.', { missing })
        const changing = tasks.filter((t) => (t.completedAt !== null) !== done)
        if (changing.length === 0) {
          return ok(
            `Nothing to change: ${plural(tasks.length, 'task')} already ${done ? 'done' : 'open'}.`,
            { missing },
          )
        }
        const changes: TaskChanges = { completedAt: done ? nowIso(deps.now()) : null }
        const batchId = deps.newId()
        await store.saveBatch({
          id: batchId,
          tool: 'set_completion',
          summary: `${done ? 'Completed' : 'Reopened'} ${plural(changing.length, 'task')}`,
          ops: changing.map((t) => updateOp(t, changes)),
        })
        // One statement: all rows change, or none.
        const updated = await store.updateMany(
          changing.map((t) => t.id),
          changes,
          batchId,
        )
        return ok(
          `${done ? 'Completed' : 'Reopened'} ${plural(updated.length, 'task')} (batch ${batchId}).`,
          { batch_id: batchId, tasks: updated.map((t) => view(t)), missing },
        )
      }),
  )

  server.registerTool(
    'delete_tasks',
    {
      title: 'Delete tasks',
      description:
        'Deletes tasks in one undoable batch (soft delete: undo_batch restores them). Confirm with the user first.',
      inputSchema: z.object({ ids: z.array(taskId).min(1).max(100) }),
      annotations: { destructiveHint: true },
    },
    ({ ids }) =>
      guarded(async () => {
        const unique = [...new Set(ids)]
        const tasks = await store.getMany(unique)
        const missing = unique.filter((id) => !tasks.some((t) => t.id === id))
        if (tasks.length === 0) return fail('None of these tasks exist.', { missing })
        const batchId = deps.newId()
        await store.saveBatch({
          id: batchId,
          tool: 'delete_tasks',
          summary: `Deleted ${plural(tasks.length, 'task')}`,
          ops: tasks.map((t) => ({ kind: 'delete', id: t.id })),
        })
        // One statement: all rows are deleted, or none.
        await store.updateMany(
          tasks.map((t) => t.id),
          { deletedAt: nowIso(deps.now()) },
          batchId,
        )
        return ok(
          `Deleted ${plural(tasks.length, 'task')} (batch ${batchId}). Undo with undo_batch.`,
          {
            batch_id: batchId,
            deleted: tasks.map((t) => ({ id: t.id, title: t.title })),
            missing,
          },
        )
      }),
  )

  server.registerTool(
    'add_subtasks',
    {
      title: 'Add subtasks',
      description:
        'Appends checklist items to a task (break a task into concrete steps). Undoable: undo removes only these items.',
      inputSchema: z.object({ task_id: taskId, titles: z.array(title).min(1).max(50) }),
    },
    ({ task_id, titles }) =>
      guarded(async () => {
        const [task] = await store.getMany([task_id])
        if (!task) return fail(`No task with id ${task_id}.`)
        const added: Subtask[] = titles.map((t) => ({
          id: deps.newId(),
          title: normalizeTitle(t),
          done: false,
        }))
        const batchId = deps.newId()
        await store.saveBatch({
          id: batchId,
          tool: 'add_subtasks',
          summary: `Added ${plural(added.length, 'subtask')} to "${task.title}"`,
          ops: [{ kind: 'subtasks_added', id: task.id, subtaskIds: added.map((s) => s.id) }],
        })
        const updated = await store.update(
          task.id,
          { subtasks: [...task.subtasks, ...added] },
          batchId,
        )
        return ok(
          `Added ${plural(added.length, 'subtask')} to "${task.title}" (batch ${batchId}).`,
          { batch_id: batchId, task: view(updated) },
        )
      }),
  )

  server.registerTool(
    'undo_batch',
    {
      title: 'Undo a batch',
      description:
        'Reverts one earlier write (created tasks are removed, edits restored, deletions brought back). Changes the user made to a task since then are kept: such tasks are skipped and listed, unless force is true. Safe to call again after a partial undo.',
      inputSchema: z.object({
        batch_id: taskId,
        force: z.boolean().optional().describe('Also revert tasks the user changed since'),
      }),
    },
    ({ batch_id, force }) =>
      guarded(async () => {
        const batch = await store.getBatch(batch_id)
        if (!batch) return fail(`No batch with id ${batch_id}.`)
        if (batch.undoneAt) {
          return fail(
            `Batch ${batch_id} ("${batch.summary}") was already undone at ${batch.undoneAt}.`,
          )
        }
        const at = nowIso(deps.now())
        const current = new Map(
          (await store.getMany([...new Set(batch.ops.map((op) => op.id))], true)).map((t) => [
            t.id,
            t,
          ]),
        )
        const reverted: string[] = []
        const skipped: { id: string; title: string }[] = []
        const gone: string[] = []
        const failed: string[] = []

        for (const op of [...batch.ops].reverse()) {
          const task = current.get(op.id)
          if (!task) {
            gone.push(op.id)
            continue
          }
          let changes: TaskChanges
          if (op.kind === 'create') {
            if (!force && op.after && !sameValues(task, op.after)) {
              skipped.push({ id: task.id, title: task.title })
              continue
            }
            changes = { deletedAt: at }
          } else if (op.kind === 'update') {
            if (sameValues(task, op.before)) {
              reverted.push(op.id) // already reverted (for example by an earlier, partial undo)
              continue
            }
            if (!force && op.after && !sameValues(task, op.after)) {
              skipped.push({ id: task.id, title: task.title })
              continue
            }
            changes = op.before
          } else if (op.kind === 'delete') {
            changes = { deletedAt: null }
          } else {
            const remove = new Set(op.subtaskIds)
            changes = { subtasks: task.subtasks.filter((s) => !remove.has(s.id)) }
          }
          try {
            current.set(op.id, await store.update(op.id, changes, null))
            reverted.push(op.id)
          } catch (error) {
            if (!(error instanceof StoreError)) throw error
            if (error.code === ROW_NOT_FOUND) gone.push(op.id)
            else failed.push(op.id)
          }
        }

        const result = { batch_id, reverted: reverted.length, skipped, gone, failed }
        if (failed.length > 0) {
          return fail(
            `Undo incomplete: ${plural(failed.length, 'change')} could not be reverted right now. Call undo_batch again (it is safe to repeat).`,
            result,
          )
        }
        if (skipped.length > 0) {
          return ok(
            `Reverted ${plural(reverted.length, 'change')} of "${batch.summary}". ${plural(skipped.length, 'task')} changed since and ${skipped.length === 1 ? 'was' : 'were'} kept: call undo_batch again with force: true to revert ${skipped.length === 1 ? 'it' : 'them'} too.`,
            result,
          )
        }
        await store.markUndone(batch_id, at)
        return ok(
          `Undid "${batch.summary}": ${plural(reverted.length, 'change')} reverted${gone.length ? `, ${gone.length} already gone` : ''}.`,
          result,
        )
      }),
  )
}

const FIELDS = [
  'title',
  'notes',
  'icon',
  'color',
  'subtasks',
  'date',
  'startTime',
  'durationMin',
  'isAllDay',
  'completedAt',
] as const
type Field = (typeof FIELDS)[number]

/** The fields a change touches (deletion is tracked separately). */
function changedKeys(changes: TaskChanges): Field[] {
  return FIELDS.filter((k) => changes[k] !== undefined)
}

/** The given fields of a task or a change, as a change. */
function pick(source: Task | TaskChanges, keys: readonly Field[]): TaskChanges {
  const out: Record<string, unknown> = {}
  for (const k of keys) out[k] = (source as Record<Field, unknown>)[k]
  return out
}

/** True when the task still has exactly these values (subtasks compared by content). */
function sameValues(task: Task, expected: TaskChanges): boolean {
  return FIELDS.every(
    (k) => expected[k] === undefined || JSON.stringify(task[k]) === JSON.stringify(expected[k]),
  )
}
