import { Link } from 'react-router'
import { ArrowRight, Check, Inbox, PartyPopper, Sparkles, Sun, Trash2 } from 'lucide-react'
import { OVERDUE_DAYS, fitIntoDay, tasksByDay } from '@/core/calendar'
import { addDays, formatDateLabel, formatTime, toMinutes } from '@/core/dates'
import { windowOf } from '@/core/schedule'
import { colorHex, nextStartTime, type Task } from '@/core/tasks'
import { TaskIcon } from '@/components/TaskIcon'
import { Button, buttonVariants } from '@/components/ui/button'
import { useAppSettings } from '@/data/queries/settings'
import { useDayTasks, useOverdueTasks, useTaskActions } from '@/data/queries/tasks'
import { QueryState } from '@/features/shell/QueryState'
import { useClock } from '@/features/timeline/useClock'
import { notify } from '@/stores/notices'

/** Unfinished one-off tasks from the last days: move them to today, tomorrow or the inbox. */
export function ReplanView() {
  const settings = useAppSettings()
  const { today, nowMinutes } = useClock(settings.timezone)
  const query = useOverdueTasks(today)
  const todayQuery = useDayTasks(today)
  const todayTasks = todayQuery.data ?? []
  // Placing tasks needs today's plan: until it has loaded, today would look empty.
  const ready = todayQuery.data !== undefined
  const actions = useTaskActions()
  const overdue = query.data ?? []
  const byDay = tasksByDay(overdue)
  const window = windowOf(settings)

  /** Today, in the first free slot that fits (or the next quarter hour if none does). */
  /** The move to today: all-day tasks keep their all-day place; timed ones get `startTime`. */
  function moveToToday(task: Task, startTime: string) {
    actions.update(task, task.isAllDay ? { date: today } : { date: today, startTime })
  }

  function toToday(task: Task) {
    const { placed } = fitIntoDay([task], todayTasks, window, nowMinutes)
    moveToToday(task, placed[0]?.startTime ?? nextStartTime(nowMinutes))
  }

  function fitAll() {
    const { placed, unplaced } = fitIntoDay(overdue, todayTasks, window, nowMinutes)
    for (const p of placed) moveToToday(p.task, p.startTime)
    if (unplaced.length > 0) {
      notify(
        `${unplaced.length} ${unplaced.length === 1 ? 'task does' : 'tasks do'} not fit into today's free time. Move ${unplaced.length === 1 ? 'it' : 'them'} one by one.`,
      )
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pt-4 pb-28 lg:pb-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Replan</h1>
        <p className="text-sm text-muted-foreground">
          Unfinished tasks from the last {OVERDUE_DAYS} days. Repeating tasks are not listed: they
          come back on their own.
        </p>
      </header>

      <QueryState query={query}>
        {overdue.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center text-muted-foreground">
            <PartyPopper className="size-8" />
            <p>Nothing to replan. You are all caught up.</p>
            <Link to="/" className={buttonVariants({ variant: 'outline' })}>
              Back to today <ArrowRight data-icon="inline-end" />
            </Link>
          </div>
        ) : (
          <>
            <Button className="self-start" onClick={fitAll} disabled={!ready}>
              <Sparkles data-icon="inline-start" /> Fit all into today
            </Button>
            {[...byDay.entries()].map(([date, tasks]) => (
              <section key={date} aria-label={formatDateLabel(date, 'EEEE, d MMMM')}>
                <h2 className="mb-1 text-sm font-medium text-muted-foreground">
                  {formatDateLabel(date, 'EEEE, d MMMM')}
                </h2>
                <ul className="flex flex-col gap-1">
                  {tasks.map((task) => (
                    <li
                      key={task.id}
                      className="flex flex-wrap items-center gap-2 rounded-xl border p-2"
                    >
                      <span
                        aria-hidden="true"
                        className="flex size-8 shrink-0 items-center justify-center rounded-full text-white"
                        style={{ backgroundColor: colorHex(task.color) }}
                      >
                        <TaskIcon icon={task.icon} className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{task.title}</span>
                        <span className="block text-xs text-muted-foreground tabular-nums">
                          {task.startTime && !task.isAllDay
                            ? formatTime(toMinutes(task.startTime), settings.timeFormat)
                            : 'All day'}
                        </span>
                      </span>
                      <span className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!ready}
                          onClick={() => toToday(task)}
                        >
                          <Sun data-icon="inline-start" /> Today
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => actions.update(task, { date: addDays(today, 1) })}
                        >
                          Tomorrow
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Move to the inbox: ${task.title}`}
                          onClick={() => actions.update(task, { date: null })}
                        >
                          <Inbox />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Mark done: ${task.title}`}
                          onClick={() => actions.toggleComplete(task)}
                        >
                          <Check />
                        </Button>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Delete: ${task.title}`}
                          className="text-destructive"
                          onClick={() => actions.remove(task)}
                        >
                          <Trash2 />
                        </Button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </>
        )}
      </QueryState>
    </div>
  )
}
