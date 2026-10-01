import { Fragment, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router'
import { CalendarDays, Plus, Repeat } from 'lucide-react'
import { addDays, formatDateLabel, formatTime, isISODate, type ISODate } from '@/core/dates'
import { windowOf } from '@/core/schedule'
import { layoutDay, nextStartTime, taskProgress, type Task } from '@/core/tasks'
import { nowItemIndex, timelineItems } from '@/core/timeline'
import { TaskIcon } from '@/components/TaskIcon'
import { Button } from '@/components/ui/button'
import { useAppSettings } from '@/data/queries/settings'
import { useDayTasks, useTaskActions } from '@/data/queries/tasks'
import { useEditor } from '@/features/editor/editorContext'
import { GapRow } from '@/features/timeline/GapRow'
import { useTaskDrop } from '@/features/timeline/taskDrag'
import { CheckCircle, TaskRow } from '@/features/timeline/TaskRow'
import { WeekStrip } from '@/features/timeline/WeekStrip'
import { useClock } from '@/features/timeline/useClock'
import { Fab } from '@/features/shell/Fab'
import { QueryState } from '@/features/shell/QueryState'
import { cn } from '@/lib/utils'

// The week strip shows up to 6 days around the selected one, and the arrows move a week, so
// keep navigation where every one of those dates is inside dates.ts's supported range.
const FIRST_DAY = '1900-01-08'
const LAST_DAY = '2999-12-24'

function isNavigableDate(date: string): boolean {
  return isISODate(date) && date >= FIRST_DAY && date <= LAST_DAY
}

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
    params.date !== undefined && isNavigableDate(params.date) ? params.date : today
  const query = useDayTasks(selected)
  const actions = useTaskActions()
  const editor = useEditor()

  const goTo = (date: ISODate) => {
    if (isNavigableDate(date)) void navigate(date === today ? '/' : `/day/${date}`)
  }
  const defaultStart = selected === today ? nextStartTime(nowMinutes) : settings.dayStart
  const openNew = () => editor.openCreate({ date: selected, startTime: defaultStart })
  const openAt = (start: string, minutes: number) =>
    editor.openCreate({
      date: selected,
      startTime: start,
      durationMin: Math.min(settings.defaultDuration, minutes),
    })
  const scheduleAt = (task: Task, start: string) =>
    actions.update(task, { date: selected, startTime: start, isAllDay: false })
  const emptyDrop = useTaskDrop((task) => scheduleAt(task, defaultStart))

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
  // Free time that has already passed today is not offered.
  const notBefore = selected === today ? nowMinutes : selected < today ? 1440 : 0
  const items = timelineItems(timed, windowOf(settings), notBefore)
  const lastTask = timed.at(-1)
  const lineAt = selected === today ? nowItemIndex(items, nowMinutes) : -1
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
                  {task.recurrence ? <Repeat aria-label="Repeats" className="size-3" /> : null}
                </button>
                <CheckCircle task={task} onToggle={actions.toggleComplete} />
              </div>
            ))}
          </section>
        ) : null}

        {isEmpty ? (
          <div
            {...emptyDrop.bind}
            className={cn(
              'flex flex-col items-center gap-3 rounded-xl py-16 text-center text-muted-foreground',
              emptyDrop.over && 'bg-primary/10 ring-2 ring-primary/40',
            )}
          >
            <p>Nothing planned for this day.</p>
            <Button variant="outline" onClick={openNew}>
              <Plus data-icon="inline-start" /> Add a task
            </Button>
          </div>
        ) : (
          <ol aria-label="Timeline" className="flex flex-col">
            {items.map((item, i) => (
              <Fragment key={item.kind === 'task' ? item.task.id : `gap-${item.start}`}>
                {i === lineAt ? (
                  <NowLine minutes={nowMinutes} format={settings.timeFormat} />
                ) : null}
                {item.kind === 'task' ? (
                  <TaskRow
                    task={item.task}
                    timeFormat={settings.timeFormat}
                    progress={taskProgress(item.task, today, nowMinutes)}
                    isLast={item.task === lastTask}
                    overlaps={item.overlaps}
                    onOpen={editor.openEdit}
                    onToggle={actions.toggleComplete}
                    onReschedule={actions.update}
                  />
                ) : (
                  <GapRow
                    start={item.start}
                    minutes={item.minutes}
                    timeFormat={settings.timeFormat}
                    onAdd={openAt}
                    onDropTask={scheduleAt}
                  />
                )}
              </Fragment>
            ))}
            {lineAt === items.length && items.length > 0 ? (
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
