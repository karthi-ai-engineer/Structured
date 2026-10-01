import { Link } from 'react-router'
import { monthOf } from '@/core/calendar'
import type { ISODate } from '@/core/dates'
import { cn } from '@/lib/utils'

export type CalendarView = 'day' | 'week' | 'month'

/** Day / Week / Month, keeping the date in view. */
export function ViewSwitch({
  date,
  today,
  active,
}: {
  date: ISODate
  today: ISODate
  active: CalendarView
}) {
  const items: { view: CalendarView; label: string; to: string }[] = [
    { view: 'day', label: 'Day', to: date === today ? '/' : `/day/${date}` },
    { view: 'week', label: 'Week', to: `/week/${date}` },
    { view: 'month', label: 'Month', to: `/month/${monthOf(date)}` },
  ]
  return (
    <nav aria-label="Calendar view" className="inline-flex rounded-lg border p-0.5 text-sm">
      {items.map((item) => (
        <Link
          key={item.view}
          to={item.to}
          aria-current={item.view === active ? 'page' : undefined}
          className={cn(
            'rounded-md px-3 py-1',
            item.view === active
              ? 'bg-foreground text-background'
              : 'text-muted-foreground hover:bg-muted',
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  )
}
