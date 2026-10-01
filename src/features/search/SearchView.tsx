import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Repeat, Search } from 'lucide-react'
import { formatDateLabel, formatTime, toMinutes } from '@/core/dates'
import { colorHex, type Task } from '@/core/tasks'
import { TaskIcon } from '@/components/TaskIcon'
import { TaskMeta } from '@/components/TaskMeta'
import { Input } from '@/components/ui/input'
import { tasks } from '@/data/queries/repos'
import { useAppSettings } from '@/data/queries/settings'
import { useEditor } from '@/features/editor/editorContext'
import { QueryState } from '@/features/shell/QueryState'
import { useClock } from '@/features/timeline/useClock'
import { cn } from '@/lib/utils'

/** Search across all tasks, title and notes (PLAN.md T17). */
export function SearchView() {
  const settings = useAppSettings()
  const { today } = useClock(settings.timezone)
  const editor = useEditor()
  const [text, setText] = useState('')
  const [query, setQuery] = useState('')

  // Search once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(text.trim()), 250)
    return () => clearTimeout(timer)
  }, [text])

  const results = useQuery({
    queryKey: ['search', query, today],
    queryFn: () => tasks().search(query, today),
    enabled: query.length >= 2,
  })

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-28 lg:pb-8">
      <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
      <div className="relative">
        <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus
          type="search"
          aria-label="Search tasks"
          placeholder="Search titles and notes"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="h-11 pl-9 text-base"
        />
      </div>

      {query.length < 2 ? (
        <p className="text-sm text-muted-foreground">Type at least two letters.</p>
      ) : (
        <QueryState query={results}>
          {results.data && results.data.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No tasks match.</p>
          ) : (
            <ul aria-label="Results" className="flex flex-col gap-1">
              {(results.data ?? []).map((task) => (
                <li key={task.id}>
                  <Result
                    task={task}
                    today={today}
                    onOpen={editor.openEdit}
                    format={settings.timeFormat}
                  />
                </li>
              ))}
            </ul>
          )}
        </QueryState>
      )}
    </div>
  )
}

function Result({
  task,
  today,
  onOpen,
  format,
}: {
  task: Task
  today: string
  onOpen: (task: Task) => void
  format: '12h' | '24h'
}) {
  const when =
    task.date === null
      ? 'Inbox'
      : `${task.date === today ? 'Today' : formatDateLabel(task.date, 'EEE d MMM yyyy')}${
          task.startTime && !task.isAllDay
            ? `, ${formatTime(toMinutes(task.startTime), format)}`
            : ''
        }`
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-muted/60"
    >
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: colorHex(task.color) }}
      >
        <TaskIcon icon={task.icon} className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span
          className={cn('block truncate', task.completedAt && 'text-muted-foreground line-through')}
        >
          {task.title}
        </span>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {task.recurrence ? <Repeat aria-label="Repeats" className="size-3" /> : null}
          {task.recurrence ? 'Next: ' : ''}
          {when}
          <TaskMeta task={task} today={today} />
        </span>
      </span>
    </button>
  )
}
