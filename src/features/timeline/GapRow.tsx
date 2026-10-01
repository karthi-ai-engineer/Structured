import { Plus } from 'lucide-react'
import { formatDuration, formatTime, toMinutes, type TimeFormat } from '@/core/dates'
import type { Task } from '@/core/tasks'
import { useTaskDrop } from '@/features/timeline/taskDrag'
import { cn } from '@/lib/utils'

/** Free time between tasks: tap to add a task there, or drop an inbox task on it. */
export function GapRow({
  start,
  minutes,
  timeFormat,
  onAdd,
  onDropTask,
}: {
  start: string
  minutes: number
  timeFormat: TimeFormat
  onAdd: (start: string, minutes: number) => void
  onDropTask: (task: Task, start: string) => void
}) {
  const drop = useTaskDrop((task) => onDropTask(task, start))
  const time = formatTime(toMinutes(start), timeFormat)
  return (
    <li className="flex gap-3" {...drop.bind}>
      <div className="w-16 shrink-0 pt-2.5 text-right text-xs text-muted-foreground/70 tabular-nums">
        {time}
      </div>
      <div className="flex w-11 shrink-0 justify-center">
        <span aria-hidden="true" className="w-0 border-l-2 border-dashed border-border" />
      </div>
      <button
        type="button"
        aria-label={`Add a task at ${time} (${formatDuration(minutes)} free)`}
        onClick={() => onAdd(start, minutes)}
        className={cn(
          'my-1 flex min-h-9 flex-1 items-center gap-2 rounded-lg px-2 text-left text-sm text-muted-foreground hover:bg-muted/60 hover:text-foreground',
          drop.over && 'bg-primary/10 text-foreground ring-2 ring-primary/40',
        )}
      >
        <Plus className="size-4" />
        {drop.over ? `Drop to schedule at ${time}` : `${formatDuration(minutes)} free`}
      </button>
    </li>
  )
}
