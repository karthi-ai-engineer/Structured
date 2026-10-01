import { Flag } from 'lucide-react'
import { formatDateLabel, type ISODate } from '@/core/dates'
import { PRIORITIES, type Task } from '@/core/tasks'
import { cn } from '@/lib/utils'

const FLAG_COLORS = {
  1: 'text-red-600 dark:text-red-400',
  2: 'text-amber-600 dark:text-amber-400',
  3: 'text-blue-600 dark:text-blue-400',
} as const

/** A task's priority flag and due date (PLAN.md T20), inline. Nothing when neither is set. */
export function TaskMeta({
  task,
  today,
}: {
  task: Pick<Task, 'priority' | 'dueDate' | 'completedAt'>
  today: ISODate
}) {
  if (task.priority === null && task.dueDate === null) return null
  const label = PRIORITIES.find((p) => p.value === task.priority)?.label
  const overdue = task.dueDate !== null && task.dueDate < today && task.completedAt === null
  return (
    <span className="inline-flex items-center gap-1.5">
      {task.priority !== null ? (
        <Flag
          aria-label={`${label} priority`}
          className={cn('size-3', FLAG_COLORS[task.priority])}
        />
      ) : null}
      {task.dueDate !== null ? (
        <span
          className={cn(
            'rounded px-1 text-[11px]',
            overdue
              ? 'bg-red-500/10 text-red-700 dark:text-red-400'
              : 'bg-muted text-muted-foreground',
          )}
        >
          {overdue ? 'Overdue, due' : 'Due'} {formatDateLabel(task.dueDate, 'd MMM')}
        </span>
      ) : null}
    </span>
  )
}
