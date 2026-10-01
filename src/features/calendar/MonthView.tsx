import { Link, useNavigate, useParams } from 'react-router'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import {
  addMonths,
  isISOMonth,
  monthGrid,
  monthOf,
  tasksByDay,
  type ISOMonth,
} from '@/core/calendar'
import { formatDateLabel } from '@/core/dates'
import { colorHex } from '@/core/tasks'
import { Button } from '@/components/ui/button'
import { useAppSettings } from '@/data/queries/settings'
import { useRangeTasks } from '@/data/queries/tasks'
import { useStepKeys } from '@/features/calendar/useStepKeys'
import { ViewSwitch } from '@/features/calendar/ViewSwitch'
import { QueryState } from '@/features/shell/QueryState'
import { useClock } from '@/features/timeline/useClock'
import { cn } from '@/lib/utils'

const FIRST_MONTH = '1900-02'
const LAST_MONTH = '2999-11'
/** Task titles shown in a day cell before "+N more" (desktop); phones show dots. */
const MAX_TITLES = 3

/** A month grid: tap a day to open it. */
export function MonthView() {
  const settings = useAppSettings()
  const { today } = useClock(settings.timezone)
  const params = useParams()
  const navigate = useNavigate()
  const month: ISOMonth =
    params.month !== undefined &&
    isISOMonth(params.month) &&
    params.month >= FIRST_MONTH &&
    params.month <= LAST_MONTH
      ? params.month
      : monthOf(today)
  const grid = monthGrid(month, settings.weekStart)
  const query = useRangeTasks(grid[0] ?? `${month}-01`, grid[41] ?? `${month}-01`)
  const byDay = tasksByDay(query.data ?? [])
  const go = (next: ISOMonth) => {
    if (next >= FIRST_MONTH && next <= LAST_MONTH) void navigate(`/month/${next}`)
  }
  useStepKeys(
    (by) => go(addMonths(month, by)),
    () => go(monthOf(today)),
  )
  const isThisMonth = month === monthOf(today)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-2 pt-4 pb-28 sm:px-4 lg:pb-8">
      <header className="flex flex-wrap items-center justify-between gap-3 px-2 sm:px-0">
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous month"
            onClick={() => go(addMonths(month, -1))}
          >
            <ChevronLeft />
          </Button>
          <h1 className="text-xl font-semibold tracking-tight">
            {formatDateLabel(`${month}-01`, 'MMMM yyyy')}
          </h1>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next month"
            onClick={() => go(addMonths(month, 1))}
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-2">
          {isThisMonth ? null : (
            <Button variant="outline" size="sm" onClick={() => go(monthOf(today))}>
              <CalendarDays data-icon="inline-start" /> Today
            </Button>
          )}
          <ViewSwitch date={isThisMonth ? today : `${month}-01`} today={today} active="month" />
        </div>
      </header>

      <QueryState query={query}>
        <section aria-label={formatDateLabel(`${month}-01`, 'MMMM yyyy')}>
          <div aria-hidden="true" className="grid grid-cols-7 pb-1">
            {grid.slice(0, 7).map((day) => (
              <div key={day} className="text-center text-xs font-medium text-muted-foreground">
                {formatDateLabel(day, 'EEE')}
              </div>
            ))}
          </div>
          {[0, 1, 2, 3, 4, 5].map((week) => (
            <div key={week} className="grid grid-cols-7 border-t">
              {grid.slice(week * 7, week * 7 + 7).map((day) => {
                const tasks = byDay.get(day) ?? []
                const inMonth = monthOf(day) === month
                const isToday = day === today
                const open = tasks.filter((t) => t.completedAt === null).length
                return (
                  <Link
                    key={day}
                    to={isToday ? '/' : `/day/${day}`}
                    aria-label={`${formatDateLabel(day, 'EEEE, d MMMM')}: ${tasks.length} ${tasks.length === 1 ? 'task' : 'tasks'}${open < tasks.length ? `, ${tasks.length - open} done` : ''}`}
                    className={cn(
                      'flex min-h-16 flex-col gap-0.5 p-1 hover:bg-muted/60 sm:min-h-24',
                      !inMonth && 'bg-muted/30 text-muted-foreground',
                    )}
                  >
                    <span
                      className={cn(
                        'flex size-6 items-center justify-center rounded-full text-xs tabular-nums',
                        isToday && 'bg-[#FF6B6B] font-semibold text-white',
                      )}
                    >
                      {formatDateLabel(day, 'd')}
                    </span>
                    {/* Phones: colored dots. Desktop: titles. */}
                    <span className="flex flex-wrap gap-0.5 sm:hidden">
                      {tasks.slice(0, 6).map((t) => (
                        <span
                          key={t.id}
                          className="size-1.5 rounded-full"
                          style={{
                            backgroundColor: colorHex(t.color),
                            opacity: t.completedAt ? 0.4 : 1,
                          }}
                        />
                      ))}
                    </span>
                    <span className="hidden flex-col gap-0.5 sm:flex">
                      {tasks.slice(0, MAX_TITLES).map((t) => (
                        <span key={t.id} className="flex min-w-0 items-center gap-1 text-[11px]">
                          <span
                            className="size-1.5 shrink-0 rounded-full"
                            style={{ backgroundColor: colorHex(t.color) }}
                          />
                          <span
                            className={cn('truncate', t.completedAt && 'line-through opacity-60')}
                          >
                            {t.title}
                          </span>
                        </span>
                      ))}
                      {tasks.length > MAX_TITLES ? (
                        <span className="text-[11px] text-muted-foreground">
                          +{tasks.length - MAX_TITLES} more
                        </span>
                      ) : null}
                    </span>
                  </Link>
                )
              })}
            </div>
          ))}
        </section>
      </QueryState>
    </div>
  )
}
