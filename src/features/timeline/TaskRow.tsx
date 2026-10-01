import { Link } from 'react-router'
import { AlertTriangle, Check, Repeat, Timer } from 'lucide-react'
import { formatDuration, formatTime, toMinutes, type TimeFormat } from '@/core/dates'
import { colorHex, pillHeight, taskEnd, type Task, type TaskPatch } from '@/core/tasks'
import { movedStart, resizedDuration } from '@/core/timeline'
import { TaskIcon } from '@/components/TaskIcon'
import { TaskMeta } from '@/components/TaskMeta'
import { useVerticalDrag } from '@/features/timeline/useVerticalDrag'
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

/**
 * One timed task on the timeline: time label, colored pill, title and check circle. Dragging
 * the pill moves the task (5-minute steps); dragging its bottom edge changes the duration.
 */
export function TaskRow({
  task,
  timeFormat,
  progress,
  isLast,
  today,
  overlaps = false,
  onOpen,
  onToggle,
  onReschedule,
}: {
  task: Task
  timeFormat: TimeFormat
  progress: number
  isLast: boolean
  /** For the due-date badge (overdue in red). */
  today: string
  overlaps?: boolean
  onOpen: (task: Task) => void
  onToggle: (task: Task) => void
  onReschedule?: (task: Task, patch: TaskPatch) => void
}) {
  const startTime = task.startTime ?? '00:00'
  const move = useVerticalDrag((minutes) => {
    const next = movedStart(startTime, minutes)
    if (next !== startTime) onReschedule?.(task, { startTime: next })
  })
  const resize = useVerticalDrag((minutes) => {
    const next = resizedDuration(task.durationMin, minutes)
    if (next !== task.durationMin) onReschedule?.(task, { durationMin: next })
  })

  // While dragging, everything shows the values the task will get.
  const shown: Task = {
    ...task,
    startTime: move.minutes === null ? task.startTime : movedStart(startTime, move.minutes),
    durationMin:
      resize.minutes === null
        ? task.durationMin
        : resizedDuration(task.durationMin, resize.minutes),
  }
  const dragging = move.minutes !== null || resize.minutes !== null
  const hex = colorHex(task.color)
  const done = task.completedAt !== null
  const start = toMinutes(shown.startTime ?? '00:00')
  const end = taskEnd(shown)
  const endLabel = end ? formatTime(toMinutes(end.time), timeFormat) : ''
  const height = pillHeight(shown.durationMin)
  const doneSubtasks = task.subtasks.filter((s) => s.done).length
  const draggable = onReschedule !== undefined

  return (
    <li className="flex gap-3">
      <div
        className={cn(
          'w-16 shrink-0 pt-3 text-right text-xs tabular-nums',
          dragging ? 'font-semibold text-foreground' : 'text-muted-foreground',
        )}
      >
        {formatTime(start, timeFormat)}
      </div>
      <div className="flex w-11 shrink-0 flex-col items-center">
        <div className="relative">
          <button
            type="button"
            aria-label={`Open ${task.title}`}
            onClick={() => onOpen(task)}
            {...(draggable ? move.bind : {})}
            className={cn(
              'relative flex w-11 shrink-0 touch-pan-y justify-center overflow-hidden rounded-full pt-3 text-white select-none [-webkit-touch-callout:none]',
              draggable && 'cursor-grab active:cursor-grabbing',
              dragging && 'shadow-lg ring-2 ring-ring ring-offset-2 ring-offset-background',
            )}
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
          {draggable ? (
            <span
              aria-hidden="true"
              title="Drag to change the duration"
              // Covers the bottom of the pill: a plain click there still opens the task.
              onClick={() => onOpen(task)}
              {...resize.bind}
              className="absolute inset-x-1 -bottom-1 flex h-4 cursor-ns-resize touch-pan-y justify-center select-none"
            >
              <span className="mt-1.5 h-1 w-5 rounded-full bg-white/70 shadow-sm" />
            </span>
          ) : null}
        </div>
        {isLast ? null : <span aria-hidden="true" className="min-h-3 w-0.5 flex-1 bg-border" />}
      </div>
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="min-w-0 flex-1 pt-1.5 pb-3 text-left"
      >
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
          {formatTime(start, timeFormat)}
          {shown.durationMin > 0 ? ` – ${endLabel} (${formatDuration(shown.durationMin)})` : ''}
          {task.recurrence ? <Repeat aria-label="Repeats" className="size-3" /> : null}
          <TaskMeta task={task} today={today} />
          {overlaps ? (
            <AlertTriangle
              aria-label="Overlaps another task"
              className="size-3 text-amber-600 dark:text-amber-400"
            />
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
      {progress > 0 && progress < 1 && task.completedAt === null ? (
        <Link
          to={`/focus/${encodeURIComponent(task.id)}`}
          aria-label={`Focus on ${task.title}`}
          title="Focus"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted"
        >
          <Timer className="size-5" />
        </Link>
      ) : null}
      <CheckCircle task={task} onToggle={onToggle} />
    </li>
  )
}
