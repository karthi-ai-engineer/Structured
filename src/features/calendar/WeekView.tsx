import { Link, useNavigate, useParams } from 'react-router'
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { tasksByDay, weekDays } from '@/core/calendar'
import { addDays, formatDateLabel, isISODate, type ISODate } from '@/core/dates'
import { Button } from '@/components/ui/button'
import { useAppSettings } from '@/data/queries/settings'
import { useRangeTasks, useTaskActions } from '@/data/queries/tasks'
import { useEditor } from '@/features/editor/editorContext'
import { CompactTask } from '@/features/calendar/CompactTask'
import { useStepKeys } from '@/features/calendar/useStepKeys'
import { ViewSwitch } from '@/features/calendar/ViewSwitch'
import { QueryState } from '@/features/shell/QueryState'
import { useClock } from '@/features/timeline/useClock'
import { cn } from '@/lib/utils'

const FIRST_DAY = '1900-01-08'
const LAST_DAY = '2999-12-24'

/** Seven days side by side (desktop) or stacked (phone), each with its tasks. */
export function WeekView() {
  const settings = useAppSettings()
  const { today } = useClock(settings.timezone)
  const params = useParams()
  const navigate = useNavigate()
  const anchor: ISODate =
    params.date !== undefined &&
    isISODate(params.date) &&
    params.date >= FIRST_DAY &&
    params.date <= LAST_DAY
      ? params.date
      : today
  const days = weekDays(anchor, settings.weekStart)
  const first = days[0] ?? anchor
  const last = days[6] ?? anchor
  const query = useRangeTasks(first, last)
  const byDay = tasksByDay(query.data ?? [])
  const actions = useTaskActions()
  const editor = useEditor()
  const go = (date: ISODate) => {
    if (date >= FIRST_DAY && date <= LAST_DAY) void navigate(`/week/${date}`)
  }
  useStepKeys(
    (by) => go(addDays(anchor, 7 * by)),
    () => go(today),
  )

  const sameMonth = first.slice(0, 7) === last.slice(0, 7)
  const title = `${formatDateLabel(first, sameMonth ? 'd' : 'd MMM')} – ${formatDateLabel(last, 'd MMM yyyy')}`

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pt-4 pb-28 lg:pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous week"
            onClick={() => go(addDays(anchor, -7))}
          >
            <ChevronLeft />
          </Button>
          <h1 className="text-xl font-semibold tracking-tight tabular-nums">{title}</h1>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next week"
            onClick={() => go(addDays(anchor, 7))}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {days.includes(today) ? null : (
            <Button variant="outline" size="sm" onClick={() => go(today)}>
              <CalendarDays data-icon="inline-start" /> Today
            </Button>
          )}
          <ViewSwitch date={anchor} today={today} active="week" />
        </div>
      </header>

      <QueryState query={query}>
        <ol aria-label="Week" className="grid gap-3 lg:grid-cols-7 lg:gap-2">
          {days.map((day) => {
            const tasks = byDay.get(day) ?? []
            const isToday = day === today
            return (
              <li
                key={day}
                aria-label={formatDateLabel(day, 'EEEE, d MMMM')}
                className={cn(
                  'flex min-h-24 flex-col gap-1 rounded-xl border p-2',
                  isToday && 'border-[#FF6B6B]/60',
                )}
              >
                <div className="flex items-center justify-between">
                  <Link
                    to={isToday ? '/' : `/day/${day}`}
                    className="rounded-md px-1 text-sm font-medium hover:bg-muted"
                  >
                    <span className="text-muted-foreground">{formatDateLabel(day, 'EEE')}</span>{' '}
                    <span className={cn('tabular-nums', isToday && 'text-[#FF6B6B]')}>
                      {formatDateLabel(day, 'd')}
                    </span>
                  </Link>
                  <button
                    type="button"
                    aria-label={`Add a task on ${formatDateLabel(day, 'EEEE d MMMM')}`}
                    onClick={() => editor.openCreate({ date: day, startTime: settings.dayStart })}
                    className="rounded-md p-1 text-muted-foreground hover:bg-muted"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
                {tasks.length === 0 ? (
                  <p className="px-1 text-xs text-muted-foreground/70">Free</p>
                ) : (
                  tasks.map((task) => (
                    <CompactTask
                      key={task.id}
                      task={task}
                      timeFormat={settings.timeFormat}
                      onOpen={editor.openEdit}
                      onToggle={actions.toggleComplete}
                    />
                  ))
                )}
              </li>
            )
          })}
        </ol>
      </QueryState>
    </div>
  )
}
