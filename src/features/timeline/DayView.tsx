import { Fragment, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { CalendarDays, Plus } from 'lucide-react'
import { addDays, formatDateLabel, formatTime, isISODate, type ISODate } from '@/core/dates'
import { layoutDay, nextStartTime, nowLineIndex, taskProgress } from '@/core/tasks'
import { TaskIcon } from '@/components/TaskIcon'
import { Button } from '@/components/ui/button'
import { useAppSettings } from '@/data/queries/settings'
import { useDayTasks, useTaskActions } from '@/data/queries/tasks'
import { useEditor } from '@/features/editor/editorContext'
import { CheckCircle, TaskRow } from '@/features/timeline/TaskRow'
import { WeekStrip } from '@/features/timeline/WeekStrip'
import { useClock } from '@/features/timeline/useClock'
import { Fab } from '@/features/shell/Fab'
import { QueryState } from '@/features/shell/QueryState'
import { cn } from '@/lib/utils'

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  )
}

export function DayView() {
  const settings = useAppSettings()
  const { today, nowMinutes } = useClock(settings.timezone)
  const params = useParams()
  const navigate = useNavigate()
  const selected: ISODate =
    params.date !== undefined && isISODate(params.date) ? params.date : today
  const query = useDayTasks(selected)
  const actions = useTaskActions()
  const editor = useEditor()

  const goTo = (date: ISODate) => void navigate(date === today ? '/' : `/day/${date}`)
  const openNew = () =>
    editor.openCreate({
      date: selected,
      startTime: selected === today ? nextStartTime(nowMinutes) : settings.dayStart,
    })

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return
      if (document.querySelector('[role="dialog"]')) return
      if (e.key === 'ArrowLeft') goTo(addDays(selected, -1))
      else if (e.key === 'ArrowRight') goTo(addDays(selected, 1))
      else if (e.key === 't') goTo(today)
      else if (e.key === 'n') openNew()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const { allDay, timed } = layoutDay(query.data ?? [])
  const lineAt = selected === today ? nowLineIndex(timed, nowMinutes) : -1
  const isEmpty = query.data !== undefined && allDay.length === 0 && timed.length === 0

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-28 lg:pb-8">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {formatDateLabel(selected, 'MMMM yyyy')}
          </h1>
          <p className="text-sm text-muted-foreground">
            {selected === today ? 'Today, ' : ''}
            {formatDateLabel(selected, 'EEEE d')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selected === today ? null : (
            <Button variant="outline" size="sm" onClick={() => goTo(today)}>
              <CalendarDays data-icon="inline-start" /> Today
            </Button>
          )}
          <Button size="sm" className="hidden lg:inline-flex" onClick={openNew}>
            <Plus data-icon="inline-start" /> New task
          </Button>
        </div>
      </header>

      <WeekStrip selected={selected} today={today} weekStart={settings.weekStart} onSelect={goTo} />

      <QueryState query={query}>
        {allDay.length > 0 ? (
          <section aria-label="All-day tasks" className="flex flex-wrap gap-2">
            {allDay.map((task) => (
              <div key={task.id} className="flex items-center gap-1 rounded-full border pr-1 pl-3">
                <button
                  type="button"
                  onClick={() => editor.openEdit(task)}
                  className={cn(
                    'flex items-center gap-2 py-1 text-sm',
                    task.completedAt && 'text-muted-foreground line-through',
                  )}
                >
                  <TaskIcon icon={task.icon} className="size-4" />
                  {task.title}
                </button>
                <CheckCircle task={task} onToggle={actions.toggleComplete} />
              </div>
            ))}
          </section>
        ) : null}

        {isEmpty ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <p>Nothing planned for this day.</p>
            <Button variant="outline" onClick={openNew}>
              <Plus data-icon="inline-start" /> Add a task
            </Button>
          </div>
        ) : (
          <ol aria-label="Timeline" className="flex flex-col">
            {timed.map((task, i) => (
              <Fragment key={task.id}>
                {i === lineAt ? (
                  <NowLine minutes={nowMinutes} format={settings.timeFormat} />
                ) : null}
                <TaskRow
                  task={task}
                  timeFormat={settings.timeFormat}
                  progress={taskProgress(task, today, nowMinutes)}
                  isLast={i === timed.length - 1}
                  onOpen={editor.openEdit}
                  onToggle={actions.toggleComplete}
                />
              </Fragment>
            ))}
            {lineAt === timed.length && timed.length > 0 ? (
              <NowLine minutes={nowMinutes} format={settings.timeFormat} />
            ) : null}
          </ol>
        )}
      </QueryState>

      <Fab label="New task" onClick={openNew} />
    </div>
  )
}

function NowLine({ minutes, format }: { minutes: number; format: '12h' | '24h' }) {
  return (
    <li aria-label="Current time" className="flex items-center gap-3 py-1">
      <span className="w-16 shrink-0 text-right text-xs font-semibold text-[#FF6B6B] tabular-nums">
        {formatTime(minutes, format)}
      </span>
      <span className="h-0.5 flex-1 rounded bg-[#FF6B6B]" />
    </li>
  )
}
