/**
 * Task domain model and pure timeline logic (PLAN.md sections 3.1, 8 and 9.2).
 *
 * A task with `date === null` lives in the inbox. A dated task is either timed (`startTime` set,
 * not all-day) or sits in the all-day row (`isAllDay`, or no start time). An occurrence of a
 * recurring series carries its `recurrence` (see series.ts); every other task has null.
 */

import {
  addMinutesToTime,
  fromMinutes,
  isISODate,
  isTime,
  toMinutes,
  type ISODate,
} from './dates.ts'
import type { EnergyLevel } from './energy.ts'
import type { RepeatRule } from './recurrence.ts'

export const TASK_COLORS = [
  { name: 'coral', hex: '#FF6B6B' },
  { name: 'orange', hex: '#FF9F43' },
  { name: 'yellow', hex: '#FECA57' },
  { name: 'green', hex: '#1DD1A1' },
  { name: 'teal', hex: '#10AC84' },
  { name: 'blue', hex: '#54A0FF' },
  { name: 'indigo', hex: '#5F27CD' },
  { name: 'purple', hex: '#A55EEA' },
  { name: 'pink', hex: '#FF6B9D' },
  { name: 'gray', hex: '#8395A7' },
] as const

export type TaskColor = (typeof TASK_COLORS)[number]['name']

export const DEFAULT_TASK_COLOR: TaskColor = 'coral'

/** Duration chips in the editor, in minutes (PLAN.md section 9.3). */
export const DURATION_PRESETS = [1, 15, 30, 45, 60, 90, 120] as const

export const MAX_TITLE_LENGTH = 200
export const MAX_DURATION_MIN = 1440

export interface Subtask {
  id: string
  title: string
  done: boolean
}

/** Where an occurrence of a recurring series comes from. */
export interface Recurrence {
  seriesId: string
  /** The date the rule produced; it stays the same when the occurrence is moved. */
  occurrenceDate: ISODate
  rule: RepeatRule
  /** The series' first date. */
  start: ISODate
  /** The series' last possible date (inclusive), or null for no end. */
  until: ISODate | null
}

export interface Task {
  /** A UUID, or `<seriesId>:<occurrenceDate>` for an occurrence of a recurring series. */
  id: string
  title: string
  notes: string | null
  /** A lucide icon name (e.g. 'dumbbell') or an emoji. */
  icon: string | null
  color: TaskColor
  subtasks: Subtask[]
  /** null: the task is in the inbox. */
  date: ISODate | null
  /** 'HH:mm', or null for all-day and inbox tasks. */
  startTime: string | null
  durationMin: number
  isAllDay: boolean
  completedAt: string | null
  inboxOrder: number
  createdAt: string
  updatedAt: string
  recurrence: Recurrence | null
  /** -1 relaxing, 0 neutral, 1..3 draining; null: not set (neutral). */
  energy: EnergyLevel | null
  /** Minutes before the start (0 = at the start, -1 = at the end); null: the settings' defaults. */
  alerts: number[] | null
  /** 1 high, 2 medium, 3 low; null: none. */
  priority: Priority | null
  /** A deadline, separate from the day the task is planned on. */
  dueDate: ISODate | null
}

export type Priority = 1 | 2 | 3

export const PRIORITIES: readonly { value: Priority; label: string }[] = [
  { value: 1, label: 'High' },
  { value: 2, label: 'Medium' },
  { value: 3, label: 'Low' },
]

export function toPriority(value: unknown): Priority | null {
  return value === 1 || value === 2 || value === 3 ? value : null
}

/** The fields a user edits. */
export type TaskDraft = Pick<
  Task,
  | 'title'
  | 'notes'
  | 'icon'
  | 'color'
  | 'subtasks'
  | 'date'
  | 'startTime'
  | 'durationMin'
  | 'isAllDay'
  | 'energy'
  | 'alerts'
  | 'priority'
  | 'dueDate'
>

export type TaskPatch = Partial<TaskDraft> & { completedAt?: string | null }

export function isTaskColor(value: unknown): value is TaskColor {
  return typeof value === 'string' && TASK_COLORS.some((c) => c.name === value)
}

export function colorHex(color: TaskColor): string {
  return TASK_COLORS.find((c) => c.name === color)?.hex ?? TASK_COLORS[0].hex
}

/** Reads the `subtasks` jsonb column defensively: malformed entries are dropped. */
export function parseSubtasks(value: unknown): Subtask[] {
  if (!Array.isArray(value)) return []
  const out: Subtask[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const { id, title, done } = item as Record<string, unknown>
    if (typeof id !== 'string' || id === '' || typeof title !== 'string') continue
    out.push({ id, title, done: done === true })
  }
  return out
}

/** The first grapheme of `text` if it is an emoji (keeping ZWJ sequences and skin tones whole),
 *  else null. Used for the editor's "type an emoji" field. */
export function firstEmoji(text: string): string | null {
  const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    .segment(text.trim())
    [Symbol.iterator]()
    .next()
  if (first.done) return null
  const grapheme = first.value.segment
  return /\p{Extended_Pictographic}/u.test(grapheme) ? grapheme : null
}

/** Trims and collapses inner whitespace. */
export function normalizeTitle(title: string): string {
  return title.trim().replace(/\s+/g, ' ')
}

/** Human-readable problems with a draft; empty when it can be saved. */
export function validateDraft(draft: TaskDraft): string[] {
  const problems: string[] = []
  const title = normalizeTitle(draft.title)
  if (title === '') problems.push('Title is required')
  if (title.length > MAX_TITLE_LENGTH) {
    problems.push(`Title must be at most ${MAX_TITLE_LENGTH} characters`)
  }
  if (
    !Number.isInteger(draft.durationMin) ||
    draft.durationMin < 0 ||
    draft.durationMin > MAX_DURATION_MIN
  ) {
    problems.push(`Duration must be a whole number of minutes from 0 to ${MAX_DURATION_MIN}`)
  }
  if (draft.date !== null && !isISODate(draft.date)) problems.push('Date is invalid')
  if (draft.startTime !== null && !isTime(draft.startTime)) problems.push('Start time is invalid')
  if (draft.dueDate !== null && !isISODate(draft.dueDate)) problems.push('Due date is invalid')
  if (draft.date !== null && !draft.isAllDay && draft.startTime === null) {
    problems.push('Pick a start time or turn on All day')
  }
  if (!isTaskColor(draft.color)) problems.push('Color is invalid')
  return problems
}

/** True when the task sits in the all-day row of its day. */
export function isAllDayLike(task: Pick<Task, 'isAllDay' | 'startTime'>): boolean {
  return task.isAllDay || task.startTime === null
}

/** The end of a timed task as 'HH:mm' plus how many days it spills over, or null. */
export function taskEnd(
  task: Pick<Task, 'isAllDay' | 'startTime' | 'durationMin'>,
): { time: string; dayOffset: number } | null {
  if (isAllDayLike(task) || task.startTime === null) return null
  return addMinutesToTime(task.startTime, task.durationMin)
}

export interface DayLayout {
  allDay: Task[]
  timed: Task[]
}

function byCreated(a: Task, b: Task): number {
  return a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id < b.id ? -1 : 1
}

/** Splits a day's tasks into the all-day row and the timeline, each in display order. */
export function layoutDay(tasks: readonly Task[]): DayLayout {
  const allDay = tasks.filter(isAllDayLike).sort(byCreated)
  const timed = tasks
    .filter((t) => !isAllDayLike(t))
    .sort((a, b) => {
      const diff = toMinutes(a.startTime ?? '00:00') - toMinutes(b.startTime ?? '00:00')
      return diff !== 0 ? diff : byCreated(a, b)
    })
  return { allDay, timed }
}

/** Inbox order: manual order first, then oldest first. */
export function sortInbox(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) =>
    a.inboxOrder !== b.inboxOrder ? a.inboxOrder - b.inboxOrder : byCreated(a, b),
  )
}

/** Pill height in px: a circle for short tasks, growing with duration (PLAN.md section 9.2). */
export function pillHeight(durationMin: number): number {
  const raw = 44 + (Math.max(durationMin, 15) - 15) * 0.9
  return Math.round(Math.min(Math.max(raw, 44), 220))
}

/**
 * How far through its time slot a task is, 0..1, for the in-progress fill. Only tasks on `today`
 * can be in progress; tasks crossing midnight are clamped to the end of the day.
 */
export function taskProgress(
  task: Pick<Task, 'date' | 'isAllDay' | 'startTime' | 'durationMin'>,
  today: ISODate,
  nowMinutes: number,
): number {
  if (task.date !== today || isAllDayLike(task) || task.startTime === null) return 0
  const start = toMinutes(task.startTime)
  const end = Math.min(start + task.durationMin, 1440)
  if (nowMinutes <= start) return 0
  if (nowMinutes >= end || end === start) return nowMinutes >= end ? 1 : 0
  return (nowMinutes - start) / (end - start)
}

/** The index in `timed` before which the current-time line is drawn (timed.length = after all). */
export function nowLineIndex(timed: readonly Task[], nowMinutes: number): number {
  const index = timed.findIndex((t) => toMinutes(t.startTime ?? '00:00') > nowMinutes)
  return index === -1 ? timed.length : index
}

/** The next quarter hour after `nowMinutes` as 'HH:mm', for a new task's default start
 *  (capped at 23:45 so it stays on the same day). */
export function nextStartTime(nowMinutes: number): string {
  const next = Math.min(Math.floor(nowMinutes / 15) * 15 + 15, 23 * 60 + 45)
  return fromMinutes(next)
}

/** Applies a patch the way the database will, so optimistic updates match the saved row. */
export function applyPatch(task: Task, patch: TaskPatch): Task {
  const next: Task = { ...task, ...patch }
  if (next.date === null) {
    next.startTime = null
    next.isAllDay = false
  }
  if (next.isAllDay) next.startTime = null
  next.title = normalizeTitle(next.title)
  return next
}

/** Whether a task belongs in the given list (for optimistic cache updates). */
/** A cached task list: one day, a date range (week and month views), the inbox, or the
 *  unfinished one-off tasks dated `since` up to the day before `before` (Replan). */
export type TaskList =
  | { kind: 'day'; date: ISODate }
  | { kind: 'range'; from: ISODate; to: ISODate }
  | { kind: 'inbox' }
  | { kind: 'overdue'; since: ISODate; before: ISODate }

export function belongsTo(
  task: Pick<Task, 'date' | 'completedAt' | 'recurrence'>,
  list: TaskList,
): boolean {
  switch (list.kind) {
    case 'day':
      return task.date === list.date
    case 'range':
      return task.date !== null && task.date >= list.from && task.date <= list.to
    case 'inbox':
      return task.date === null && task.completedAt === null
    case 'overdue':
      return (
        task.date !== null &&
        task.date >= list.since &&
        task.date < list.before &&
        task.completedAt === null &&
        task.recurrence === null
      )
  }
}
