import { Check, Repeat } from 'lucide-react'
import { formatTime, toMinutes, type TimeFormat } from '@/core/dates'
import { colorHex, isAllDayLike, type Task } from '@/core/tasks'
import { TaskMeta } from '@/components/TaskMeta'
import { cn } from '@/lib/utils'

/** A one-line task for the week view: check, time and title. */
export function CompactTask({
  task,
  timeFormat,
  today,
  onOpen,
  onToggle,
}: {
  task: Task
  timeFormat: TimeFormat
  today: string
  onOpen: (task: Task) => void
  onToggle: (task: Task) => void
}) {
  const hex = colorHex(task.color)
  const done = task.completedAt !== null
  return (
    <div className="flex items-center gap-1.5 rounded-md py-0.5 pr-1 hover:bg-muted/60">
      <button
        type="button"
        role="checkbox"
        aria-checked={done}
        aria-label={`${done ? 'Mark not done' : 'Mark done'}: ${task.title}`}
        onClick={() => onToggle(task)}
        className="flex size-7 shrink-0 items-center justify-center"
      >
        <span
          className="flex size-4 items-center justify-center rounded-full border-2"
          style={{ borderColor: hex, backgroundColor: done ? hex : 'transparent' }}
        >
          {done ? <Check className="size-3 text-white" strokeWidth={3} /> : null}
        </span>
      </button>
      <button
        type="button"
        onClick={() => onOpen(task)}
        className="flex min-w-0 flex-1 flex-col text-left"
      >
        <span className="text-[11px] text-muted-foreground tabular-nums">
          {isAllDayLike(task) || task.startTime === null
            ? 'All day'
            : formatTime(toMinutes(task.startTime), timeFormat)}
          {task.recurrence ? (
            <Repeat aria-label="Repeats" className="ml-1 inline size-2.5 align-[-1px]" />
          ) : null}{' '}
          <TaskMeta task={task} today={today} />
        </span>
        <span className={cn('truncate text-sm', done && 'text-muted-foreground line-through')}>
          {task.title}
        </span>
      </button>
    </div>
  )
}
