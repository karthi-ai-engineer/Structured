// Task queries and optimistic mutations (PLAN.md section 12).
//
// - A mutation writes its result into every cached list at once (a task can move between a day
//   and the inbox) and, on failure, restores only THAT task, so it never undoes a newer write.
// - The cache is refetched only when the LAST pending task mutation settles: refetching while
//   other writes are in flight would briefly show their old values (visible flicker on quick
//   check-offs). Realtime echoes follow the same rule (realtime.ts).
// - Recurring occurrences: a write for one occurrence updates it in place. Series-wide writes
//   update what the cache can predict (shared fields, removals) and leave the rest, such as a
//   new rule, to the refetch on settle.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { addDays, nowIso, type ISODate } from '@/core/dates'
import { occursOn } from '@/core/recurrence'
import { generatedOccurrence } from '@/core/series'
import { sharedPatch, type NextTask, type RepeatSpec, type SeriesWrite } from '@/core/seriesEdits'
import { applyPatch, belongsTo, type Task, type TaskDraft, type TaskPatch } from '@/core/tasks'
import { OVERDUE_DAYS } from '@/core/calendar'
import { datesOfList, listOfKey, taskKeys, taskMutationKey } from '@/data/queries/keys'
import { tasks } from '@/data/queries/repos'
import { notify } from '@/stores/notices'

export function useDayTasks(date: ISODate) {
  return useQuery({ queryKey: taskKeys.day(date), queryFn: () => tasks().listDay(date) })
}

export function useRangeTasks(from: ISODate, to: ISODate) {
  return useQuery({
    queryKey: taskKeys.range(from, to),
    queryFn: () => tasks().listRange(from, to),
  })
}

export function useOverdueTasks(today: ISODate) {
  return useQuery({
    queryKey: taskKeys.overdue(today),
    queryFn: () => tasks().listOverdue(today, addDays(today, -OVERDUE_DAYS)),
  })
}

/** Every task in the cache, once (for suggestions from history). */
export function useCachedTasks(): Task[] {
  const qc = useQueryClient()
  const byId = new Map<string, Task>()
  for (const [, data] of qc.getQueriesData<Task[]>({ queryKey: taskKeys.all })) {
    for (const t of data ?? []) byId.set(t.id, t)
  }
  return [...byId.values()]
}

export function useInboxTasks() {
  return useQuery({ queryKey: taskKeys.inbox(), queryFn: () => tasks().listInbox() })
}

/** Puts `task` into every cached list it belongs to and removes it from the others. */
export function writeTaskToCache(qc: QueryClient, id: string, task: Task | null): void {
  for (const [key, data] of qc.getQueriesData<Task[]>({ queryKey: taskKeys.all })) {
    const list = listOfKey(key)
    if (!list || !data) continue
    const without = data.filter((t) => t.id !== id)
    qc.setQueryData(key, task && belongsTo(task, list) ? [...without, task] : without)
  }
}

export function newTask(id: string, draft: TaskDraft, now: string): Task {
  return applyPatch(
    {
      ...draft,
      id,
      completedAt: null,
      inboxOrder: 0,
      createdAt: now,
      updatedAt: now,
      recurrence: null,
    },
    {},
  )
}

/** How a new or converted task shows right away: itself, or its series' first occurrence (none
 *  when the rule skips the start date). */
export function shownAs(task: Task, repeat: RepeatSpec | null): Task | null {
  if (!repeat || task.date === null) return task
  if (!occursOn(repeat.rule, task.date, repeat.until, task.date)) return null
  return generatedOccurrence(
    { task: { ...task, date: task.date }, rule: repeat.rule, until: repeat.until },
    task.date,
  )
}

/** Maps the cached occurrences of a series (from `from` on, or all); null removes one. */
function mapSeriesInCache(
  qc: QueryClient,
  seriesId: string,
  from: ISODate | null,
  fn: (task: Task) => Task | null,
): void {
  const inScope = (t: Task) =>
    t.recurrence?.seriesId === seriesId && (from === null || t.recurrence.occurrenceDate >= from)
  for (const [key, data] of qc.getQueriesData<Task[]>({ queryKey: taskKeys.all })) {
    if (!listOfKey(key) || !data?.some(inScope)) continue
    qc.setQueryData(
      key,
      data.flatMap((t) => {
        if (!inScope(t)) return [t]
        const next = fn(t)
        return next ? [next] : []
      }),
    )
  }
}

/** The optimistic cache change for a recurring write (the refetch on settle completes it). */
export function writeSeriesToCache(qc: QueryClient, write: SeriesWrite): void {
  switch (write.kind) {
    case 'occurrence':
      writeTaskToCache(qc, write.task.id, write.task)
      return
    case 'cancel':
      writeTaskToCache(qc, write.task.id, null)
      return
    case 'remove-series':
      mapSeriesInCache(qc, write.seriesId, null, () => null)
      return
    case 'series': {
      // A reset moves dates: left to the refetch. Otherwise the edited fields show at once.
      if (!write.reset)
        mapSeriesInCache(qc, write.seriesId, null, (t) => applyPatch(t, write.shared))
      const until = write.repeat?.until
      if (until) mapSeriesInCache(qc, write.seriesId, addDays(until, 1), () => null)
      return
    }
    case 'split': {
      const next = write.next
      // Like the database: completed occurrences (and the kept one) move to a new series with its
      // values; the others are replaced by the new series' own occurrences.
      const kept = new Set<ISODate>()
      mapSeriesInCache(qc, write.seriesId, write.from, (t) => {
        const keep =
          next?.repeat && (t.completedAt !== null || t.recurrence?.occurrenceDate === write.keep)
        if (!keep || !next.repeat || !t.recurrence) return null
        kept.add(t.recurrence.occurrenceDate)
        return applyPatch(t, sharedPatch(next.draft))
      })
      if (next) writeNextToCache(qc, next, kept)
    }
  }
}

/** Shows what continues after a split: the one-off task, or the new series' occurrences in
 *  every cached day and range (except where a kept occurrence already stands). */
function writeNextToCache(qc: QueryClient, next: NextTask, kept: ReadonlySet<ISODate>): void {
  const task: Task = { ...newTask(next.id, next.draft, nowIso()), completedAt: next.completedAt }
  const start = task.date
  if (!next.repeat || start === null) {
    writeTaskToCache(qc, task.id, task)
    return
  }
  const master = {
    task: { ...task, date: start },
    rule: next.repeat.rule,
    until: next.repeat.until,
  }
  for (const [key, data] of qc.getQueriesData<Task[]>({ queryKey: taskKeys.all })) {
    const list = listOfKey(key)
    if (!list || !data) continue
    const added = datesOfList(list)
      .filter((date) => !kept.has(date) && occursOn(master.rule, start, master.until, date))
      .map((date) => generatedOccurrence(master, date))
    if (added.length > 0) qc.setQueryData(key, [...data, ...added])
  }
}

/** Refetches task lists unless other task mutations are still pending (this one included). */
export async function settleTasks(qc: QueryClient): Promise<void> {
  if (qc.isMutating({ mutationKey: taskMutationKey }) <= 1) {
    await qc.invalidateQueries({ queryKey: taskKeys.all })
  }
}

export function useTaskActions() {
  const qc = useQueryClient()
  // An in-flight fetch could land after the optimistic write and overwrite it.
  const hold = () => qc.cancelQueries({ queryKey: taskKeys.all })
  const settle = () => settleTasks(qc)

  const create = useMutation({
    mutationKey: taskMutationKey,
    mutationFn: ({
      id,
      draft,
      repeat,
    }: {
      id: string
      draft: TaskDraft
      repeat: RepeatSpec | null
    }) => tasks().create(id, draft, repeat),
    onMutate: async ({ id, draft, repeat }) => {
      await hold()
      const shown = shownAs(newTask(id, draft, nowIso()), repeat)
      if (shown) writeTaskToCache(qc, shown.id, shown)
    },
    onError: (_error, { id, draft, repeat }) => {
      const shown = shownAs(newTask(id, draft, nowIso()), repeat)
      if (shown) writeTaskToCache(qc, shown.id, null)
      notify('Could not add the task. Try again.')
    },
    onSettled: settle,
  })

  const update = useMutation({
    mutationKey: taskMutationKey,
    mutationFn: ({
      task,
      patch,
      repeat,
    }: {
      task: Task
      patch: TaskPatch
      repeat: RepeatSpec | null
    }) => tasks().update(task.id, patch, repeat),
    onMutate: async ({ task, patch, repeat }) => {
      await hold()
      const next = applyPatch(task, repeat ? { ...patch, completedAt: null } : patch)
      const shown = shownAs(next, repeat)
      writeTaskToCache(qc, task.id, shown && shown.id === task.id ? shown : null)
      if (shown && shown.id !== task.id) writeTaskToCache(qc, shown.id, shown)
    },
    onError: (_error, { task, patch, repeat }) => {
      const shown = shownAs(applyPatch(task, patch), repeat)
      if (shown && shown.id !== task.id) writeTaskToCache(qc, shown.id, null)
      writeTaskToCache(qc, task.id, task)
      notify('Could not save the change. It was undone.')
    },
    onSettled: settle,
  })

  const remove = useMutation({
    mutationKey: taskMutationKey,
    mutationFn: (task: Task) => tasks().remove(task.id),
    onMutate: async (task) => {
      await hold()
      writeTaskToCache(qc, task.id, null)
    },
    onError: (_error, task) => {
      writeTaskToCache(qc, task.id, task)
      notify('Could not delete the task.')
    },
    onSettled: settle,
  })

  const series = useMutation({
    mutationKey: taskMutationKey,
    mutationFn: (write: SeriesWrite) => tasks().applySeriesWrite(write),
    onMutate: async (write) => {
      await hold()
      writeSeriesToCache(qc, write)
    },
    // The refetch on settle restores what the server has.
    onError: () => notify('Could not save the change to the repeating task. It was undone.'),
    onSettled: settle,
  })

  /** One occurrence's own values (completion, subtasks, a move): "this task only". */
  const saveOccurrence = (task: Task, patch: TaskPatch) =>
    series.mutate({ kind: 'occurrence', task: applyPatch(task, patch) })

  const restore = useMutation({
    mutationKey: taskMutationKey,
    mutationFn: (task: Task) => tasks().restore(task.id),
    onMutate: async (task) => {
      await hold()
      writeTaskToCache(qc, task.id, task)
    },
    onError: (_error, task) => {
      writeTaskToCache(qc, task.id, null)
      notify('Could not bring the task back.')
    },
    onSettled: settle,
  })

  /** The task as the cache has it now (an undo must not overwrite later changes). */
  const latest = (id: string, fallback: Task): Task => {
    for (const [, data] of qc.getQueriesData<Task[]>({ queryKey: taskKeys.all })) {
      const found = data?.find((t) => t.id === id)
      if (found) return found
    }
    return fallback
  }

  /** The previous values of the fields a patch changes (to undo it). */
  const before = (task: Task, patch: TaskPatch): TaskPatch =>
    Object.fromEntries(Object.keys(patch).map((k) => [k, task[k as keyof TaskPatch]]))

  /** A one-off task, or one occurrence ("this task only"). */
  const change = (task: Task, patch: TaskPatch, repeat: RepeatSpec | null) => {
    if (task.recurrence) saveOccurrence(task, patch)
    else update.mutate({ task, patch, repeat })
  }

  return {
    create: (id: string, draft: TaskDraft, repeat: RepeatSpec | null = null) =>
      create.mutate({ id, draft, repeat }),
    /**
     * A one-off task (`repeat` turns it into a series), or one occurrence of a series. With
     * `undo`, a notice offers to put the old values back (moves: drag, Replan, scheduling).
     */
    update: (
      task: Task,
      patch: TaskPatch,
      repeat: RepeatSpec | null = null,
      options: { undo?: string } = {},
    ) => {
      change(task, patch, repeat)
      if (options.undo) {
        const back = before(task, patch)
        notify(options.undo, {
          label: 'Undo',
          run: () => change(latest(task.id, applyPatch(task, patch)), back, null),
        })
      }
    },
    remove: (task: Task) => {
      if (task.recurrence) series.mutate({ kind: 'cancel', task })
      else remove.mutate(task)
      notify(`Deleted "${task.title}"`, {
        label: 'Undo',
        run: () =>
          task.recurrence ? series.mutate({ kind: 'occurrence', task }) : restore.mutate(task),
      })
    },
    /** An edit or delete of a recurring occurrence, planned by src/core/seriesEdits.ts. */
    applySeries: (write: SeriesWrite) => series.mutate(write),
    toggleComplete: (task: Task) => {
      const patch = { completedAt: task.completedAt ? null : nowIso() }
      change(task, patch, null)
      if (patch.completedAt) {
        notify(`Done: "${task.title}"`, {
          label: 'Undo',
          run: () => change(latest(task.id, { ...task, ...patch }), { completedAt: null }, null),
        })
      }
    },
  }
}
