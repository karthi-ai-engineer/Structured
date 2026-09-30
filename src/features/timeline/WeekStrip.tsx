import { useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, formatDateLabel, startOfWeek, type ISODate, type WeekStart } from '@/core/dates'
import { cn } from '@/lib/utils'

const SWIPE_PX = 50

export function WeekStrip({
  selected,
  today,
  weekStart,
  onSelect,
}: {
  selected: ISODate
  today: ISODate
  weekStart: WeekStart
  onSelect: (date: ISODate) => void
}) {
  const first = startOfWeek(selected, weekStart)
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i))
  const startX = useRef<number | null>(null)

  return (
    <div
      className="flex touch-pan-y items-center gap-1"
      onPointerDown={(e) => {
        startX.current = e.clientX
      }}
      onPointerUp={(e) => {
        if (startX.current === null) return
        const dx = e.clientX - startX.current
        startX.current = null
        if (Math.abs(dx) >= SWIPE_PX) onSelect(addDays(selected, dx < 0 ? 7 : -7))
      }}
    >
      <button
        type="button"
        aria-label="Previous week"
        className="rounded-md p-2 text-muted-foreground hover:bg-muted"
        onClick={() => onSelect(addDays(selected, -7))}
      >
        <ChevronLeft className="size-4" />
      </button>
      <ol className="grid flex-1 grid-cols-7 gap-1">
        {days.map((day) => {
          const isSelected = day === selected
          const isToday = day === today
          return (
            <li key={day}>
              <button
                type="button"
                aria-label={formatDateLabel(day, 'EEEE, d MMMM')}
                aria-current={isSelected ? 'date' : undefined}
                onClick={() => onSelect(day)}
                className={cn(
                  'flex w-full flex-col items-center gap-0.5 rounded-xl py-1.5 text-xs transition-colors',
                  isSelected ? 'bg-foreground text-background' : 'hover:bg-muted',
                )}
              >
                <span className={cn(!isSelected && 'text-muted-foreground')}>
                  {formatDateLabel(day, 'EEEEE')}
                </span>
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    isToday && !isSelected && 'text-[#FF6B6B]',
                  )}
                >
                  {formatDateLabel(day, 'd')}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <button
        type="button"
        aria-label="Next week"
        className="rounded-md p-2 text-muted-foreground hover:bg-muted"
        onClick={() => onSelect(addDays(selected, 7))}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  )
}
