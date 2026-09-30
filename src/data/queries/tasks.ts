// Task queries and optimistic mutations (PLAN.md section 12).
//
// - A mutation writes its result into every cached list at once (a task can move between a day
//   and the inbox) and, on failure, restores only THAT task, so it never undoes a newer write.
// - The cache is refetched only when the LAST pending task mutation settles: refetching while
//   other writes are in flight would briefly show their old values (visible flicker on quick
//   check-offs). Realtime echoes follow the same rule (realtime.ts).
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { nowIso, type ISODate } from '@/core/dates'
import { applyPatch, belongsTo, type Task, type TaskDraft, type TaskPatch } from '@/core/tasks'
import { listOfKey, taskKeys, taskMutationKey } from '@/data/queries/keys'
import { tasks } from '@/data/queries/repos'
import { notify } from '@/stores/notices'

export function useDayTasks(date: ISODate) {
  return useQuery({ queryKey: taskKeys.day(date), queryFn: () => tasks().listDay(date) })
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
    { ...draft, id, completedAt: null, inboxOrder: 0, createdAt: now, updatedAt: now },
    {},
  )
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
    mutationFn: ({ id, draft }: { id: string; draft: TaskDraft }) => tasks().create(id, draft),
    onMutate: async ({ id, draft }) => {
      await hold()
      writeTaskToCache(qc, id, newTask(id, draft, nowIso()))
    },
    onError: (_error, { id }) => {
      writeTaskToCache(qc, id, null)
      notify('Could not add the task. Try again.')
    },
    onSettled: settle,
  })

  const update = useMutation({
    mutationKey: taskMutationKey,
    mutationFn: ({ task, patch }: { task: Task; patch: TaskPatch }) =>
      tasks().update(task.id, patch),
    onMutate: async ({ task, patch }) => {
      await hold()
      writeTaskToCache(qc, task.id, applyPatch(task, patch))
    },
    onError: (_error, { task }) => {
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

  return {
    create: (id: string, draft: TaskDraft) => create.mutate({ id, draft }),
    update: (task: Task, patch: TaskPatch) => update.mutate({ task, patch }),
    remove: (task: Task) => remove.mutate(task),
    toggleComplete: (task: Task) =>
      update.mutate({ task, patch: { completedAt: task.completedAt ? null : nowIso() } }),
  }
}
