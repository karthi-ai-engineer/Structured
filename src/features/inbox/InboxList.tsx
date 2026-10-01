import { useState, type FormEvent } from 'react'
import { CalendarPlus } from 'lucide-react'
import { formatDateLabel, formatDuration, nowMinutesIn, todayIn } from '@/core/dates'
import {
  DEFAULT_TASK_COLOR,
  colorHex,
  nextStartTime,
  normalizeTitle,
  sortInbox,
  type TaskDraft,
} from '@/core/tasks'
import { TaskIcon } from '@/components/TaskIcon'
import { TaskMeta } from '@/components/TaskMeta'
import { Input } from '@/components/ui/input'
import { useAppSettings } from '@/data/queries/settings'
import { useCachedTasks, useInboxTasks, useTaskActions } from '@/data/queries/tasks'
import { parseQuickAdd } from '@/core/quickadd'
import { suggestStyle } from '@/core/suggest'
import { withQuickAdd } from '@/features/editor/quickAddDraft'
import { notify } from '@/stores/notices'
import { useEditor } from '@/features/editor/editorContext'
import { QueryState } from '@/features/shell/QueryState'
import { taskDrag } from '@/features/timeline/taskDrag'
import { CheckCircle } from '@/features/timeline/TaskRow'

/** Quick add plus the list of undated tasks. Used by the inbox page and the desktop panel. */
export function InboxList() {
  const settings = useAppSettings()
  const query = useInboxTasks()
  const actions = useTaskActions()
  const editor = useEditor()
  const history = useCachedTasks()
  const [title, setTitle] = useState('')

  function quickAdd(event: FormEvent) {
    event.preventDefault()
    const today = todayIn(settings.timezone)
    const quick = parseQuickAdd(title, today)
    const clean = normalizeTitle(quick.title)
    if (!clean) return
    const base: TaskDraft = {
      title: clean,
      notes: null,
      icon: null,
      color: DEFAULT_TASK_COLOR,
      subtasks: [],
      date: null,
      startTime: null,
      durationMin: settings.defaultDuration,
      isAllDay: false,
      energy: null,
      alerts: null,
      priority: null,
      dueDate: null,
    }
    // Quick-add syntax (T15) can schedule it; the icon and color follow the title (T16).
    const draft = withQuickAdd(base, { ...quick, title: clean }, today)
    const style = suggestStyle(clean, history)
    actions.create(crypto.randomUUID(), {
      ...draft,
      icon: style.icon ?? draft.icon,
      color: style.color ?? draft.color,
    })
    if (draft.date !== null) {
      notify(
        `Added "${clean}" to ${draft.date === today ? 'today' : formatDateLabel(draft.date, 'EEE d MMM')}`,
      )
    }
    setTitle('')
  }

  const items = sortInbox(query.data ?? [])

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={quickAdd}>
        <Input
          aria-label="Add to inbox"
          placeholder="Add a task: Gym tomorrow 7am 1h"
          value={title}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          className="h-11"
        />
      </form>
      <QueryState query={query}>
        {items.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            The inbox is empty. Capture ideas here and schedule them later.
          </p>
        ) : (
          <ul aria-label="Inbox" className="flex flex-col gap-1">
            {items.map((task) => (
              <li
                key={task.id}
                // Desktop: drag onto free time (or an empty day) in the timeline to schedule it.
                draggable
                onDragStart={(e) => taskDrag.start(task, e.dataTransfer)}
                onDragEnd={() => taskDrag.end()}
                className="flex items-center gap-2 rounded-xl pl-2 hover:bg-muted/50"
              >
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center rounded-full text-white"
                  style={{ backgroundColor: colorHex(task.color) }}
                >
                  <TaskIcon icon={task.icon} className="size-4" />
                </span>
                <button
                  type="button"
                  onClick={() => editor.openEdit(task)}
                  className="min-w-0 flex-1 py-2 text-left"
                >
                  <span className="block truncate">{task.title}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    {formatDuration(task.durationMin)}
                    <TaskMeta task={task} today={todayIn(settings.timezone)} />
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={`Schedule for today: ${task.title}`}
                  title="Schedule for today"
                  onClick={() =>
                    actions.update(
                      task,
                      {
                        date: todayIn(settings.timezone),
                        startTime: nextStartTime(nowMinutesIn(settings.timezone)),
                      },
                      null,
                      { undo: `Scheduled "${task.title}" for today` },
                    )
                  }
                  className="rounded-md p-2 text-muted-foreground hover:bg-muted"
                >
                  <CalendarPlus className="size-4" />
                </button>
                <CheckCircle task={task} onToggle={actions.toggleComplete} />
              </li>
            ))}
          </ul>
        )}
      </QueryState>
    </div>
  )
}
