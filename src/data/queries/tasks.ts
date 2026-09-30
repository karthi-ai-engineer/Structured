// Task queries and optimistic mutations (PLAN.md section 12). A mutation updates every cached
// list at once (a task can move between a day and the inbox), rolls back on failure, and
// refetches afterwards so the cache always converges on the database.
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { nowIso, type ISODate } from '@/core/dates'
import { applyPatch, belongsTo, type Task, type TaskDraft, type TaskPatch } from '@/core/tasks'
import { listOfKey, taskKeys } from '@/data/queries/keys'
import { tasks } from '@/data/queries/repos'
import { notify } from '@/stores/notices'

export function useDayTasks(date: ISODate) {
  return useQuery({ queryKey: taskKeys.day(date), queryFn: () => tasks().listDay(date) })
}

export function useInboxTasks() {
  return useQuery({ queryKey: taskKeys.inbox(), queryFn: () => tasks().listInbox() })
}

type Snapshot = [readonly unknown[], Task[] | undefined][]

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
    { ...draft, id, completedAt: null, inboxOrder: 0, createdAt: now, updatedAt: now },
    {},
  )
}

export function useTaskActions() {
  const qc = useQueryClient()

  async function snapshot(): Promise<Snapshot> {
    await qc.cancelQueries({ queryKey: taskKeys.all })
    return qc.getQueriesData<Task[]>({ queryKey: taskKeys.all })
  }
  function rollback(snap: Snapshot | undefined, message: string) {
    for (const [key, data] of snap ?? []) qc.setQueryData(key, data)
    notify(message)
  }
  const settle = () => qc.invalidateQueries({ queryKey: taskKeys.all })

  const create = useMutation({
    mutationFn: ({ id, draft }: { id: string; draft: TaskDraft }) => tasks().create(id, draft),
    onMutate: async ({ id, draft }) => {
      const snap = await snapshot()
      writeTaskToCache(qc, id, newTask(id, draft, nowIso()))
      return snap
    },
    onError: (_error, _vars, snap) => rollback(snap, 'Could not add the task. Try again.'),
    onSettled: settle,
  })

  const update = useMutation({
    mutationFn: ({ task, patch }: { task: Task; patch: TaskPatch }) =>
      tasks().update(task.id, patch),
    onMutate: async ({ task, patch }) => {
      const snap = await snapshot()
      writeTaskToCache(qc, task.id, applyPatch(task, patch))
      return snap
    },
    onError: (_error, _vars, snap) => rollback(snap, 'Could not save the change. It was undone.'),
    onSettled: settle,
  })

  const remove = useMutation({
    mutationFn: (task: Task) => tasks().remove(task.id),
    onMutate: async (task) => {
      const snap = await snapshot()
      writeTaskToCache(qc, task.id, null)
      return snap
    },
    onError: (_error, _vars, snap) => rollback(snap, 'Could not delete the task.'),
    onSettled: settle,
  })

  return {
    create: (id: string, draft: TaskDraft) => create.mutate({ id, draft }),
    update: (task: Task, patch: TaskPatch) => update.mutate({ task, patch }),
    remove: (task: Task) => remove.mutate(task),
    toggleComplete: (task: Task) =>
      update.mutate({ task, patch: { completedAt: task.completedAt ? null : nowIso() } }),
  }
}
