import { Check, Repeat } from 'lucide-react'
import { formatDuration, formatTime, toMinutes, type TimeFormat } from '@/core/dates'
import { colorHex, pillHeight, taskEnd, type Task } from '@/core/tasks'
import { TaskIcon } from '@/components/TaskIcon'
import { cn } from '@/lib/utils'

export function CheckCircle({ task, onToggle }: { task: Task; onToggle: (task: Task) => void }) {
  const done = task.completedAt !== null
  const hex = colorHex(task.color)
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={`${done ? 'Mark not done' : 'Mark done'}: ${task.title}`}
      onClick={() => onToggle(task)}
      className="flex size-11 shrink-0 items-center justify-center rounded-full"
    >
      <span
        className="flex size-7 items-center justify-center rounded-full border-2 transition-all motion-safe:active:scale-90"
        style={{ borderColor: hex, backgroundColor: done ? hex : 'transparent' }}
      >
        {done ? <Check className="size-4 text-white" strokeWidth={3} /> : null}
      </span>
    </button>
  )
}

/** One timed task on the timeline: time label, colored pill, title and check circle. */
export function TaskRow({
  task,
  timeFormat,
  progress,
  isLast,
  onOpen,
  onToggle,
}: {
  task: Task
  timeFormat: TimeFormat
  progress: number
  isLast: boolean
  onOpen: (task: Task) => void
  onToggle: (task: Task) => void
}) {
  const hex = colorHex(task.color)
  const done = task.completedAt !== null
  const start = toMinutes(task.startTime ?? '00:00')
  const end = taskEnd(task)
  const endLabel = end ? formatTime(toMinutes(end.time), timeFormat) : ''
  const height = pillHeight(task.durationMin)
  const doneSubtasks = task.subtasks.filter((s) => s.done).length

  return (
    <li className="flex gap-3">
      <div className="w-16 shrink-0 pt-3 text-right text-xs text-muted-foreground tabular-nums">
        {formatTime(start, timeFormat)}
      </div>
      <div className="flex w-11 shrink-0 flex-col items-center">
        <button
          type="button"
          aria-label={`Open ${task.title}`}
          onClick={() => onOpen(task)}
          className="relative flex w-11 shrink-0 justify-center overflow-hidden rounded-full pt-3 text-white"
          style={{ height, backgroundColor: hex, opacity: done ? 0.55 : 1 }}
        >
          {progress > 0 && progress < 1 ? (
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 bg-black/15"
              style={{ height: `${Math.round(progress * 100)}%` }}
            />
          ) : null}
          <TaskIcon icon={task.icon} className="relative" />
        </button>
        {isLast ? null : <span aria-hidden="true" className="min-h-3 w-0.5 flex-1 bg-border" />}
      </div>
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="min-w-0 flex-1 pt-1.5 pb-3 text-left"
      >
        <span className="block text-xs text-muted-foreground tabular-nums">
          {formatTime(start, timeFormat)}
          {task.durationMin > 0 ? ` – ${endLabel} (${formatDuration(task.durationMin)})` : ''}
          {task.recurrence ? (
            <Repeat aria-label="Repeats" className="ml-1.5 inline size-3 align-[-1px]" />
          ) : null}
        </span>
        <span
          className={cn(
            'block truncate text-base font-medium',
            done && 'text-muted-foreground line-through',
          )}
        >
          {task.title}
        </span>
        {task.subtasks.length > 0 ? (
          <span className="block text-xs text-muted-foreground">
            {doneSubtasks}/{task.subtasks.length} subtasks
          </span>
        ) : null}
      </button>
      <CheckCircle task={task} onToggle={onToggle} />
    </li>
  )
}
