import { Repeat } from 'lucide-react'
import { dayOfWeek, formatDateLabel, type ISODate } from '@/core/dates'
import { describeRule, ordinal, type RepeatFreq, type RepeatPreset } from '@/core/recurrence'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { repeatSpecOf, type RepeatState } from '@/features/editor/repeatState'

const WEEKDAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const UNITS: Record<RepeatFreq, string> = {
  daily: 'days',
  weekly: 'weeks',
  monthly: 'months',
  yearly: 'years',
}
const SELECT =
  'h-9 rounded-md border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50'

export function RepeatField({
  state,
  start,
  weekStart,
  onChange,
}: {
  state: RepeatState
  start: ISODate
  weekStart: number
  onChange: (next: RepeatState) => void
}) {
  const set = (patch: Partial<RepeatState>) => onChange({ ...state, ...patch, touched: true })
  const spec = repeatSpecOf(state, start)
  const days = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7)
  const custom = state.preset === 'custom'

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="task-repeat" className="flex items-center gap-2">
          <Repeat className="size-4" /> Repeat
        </Label>
        <select
          id="task-repeat"
          value={state.preset}
          onChange={(e) => set({ preset: e.target.value as RepeatPreset })}
          className={cn(SELECT, 'max-w-[60%]')}
        >
          <option value="never">Never</option>
          <option value="daily">Every day</option>
          <option value="weekdays">Every weekday (Mon–Fri)</option>
          <option value="weekly">Every week on {WEEKDAY_NAMES[dayOfWeek(start)]}</option>
          <option value="monthly">Every month on the {ordinal(Number(start.slice(8)))}</option>
          <option value="yearly">Every year on {formatDateLabel(start, 'd MMMM')}</option>
          <option value="custom">Custom…</option>
        </select>
      </div>

      {custom ? (
        <div className="flex flex-col gap-2 rounded-lg border p-3">
          <div className="flex items-center gap-2 text-sm">
            Every
            <Input
              type="number"
              aria-label="Repeat interval"
              min={1}
              max={99}
              value={Number.isNaN(state.custom.interval) ? '' : state.custom.interval}
              onChange={(e) =>
                set({ custom: { ...state.custom, interval: Math.round(Number(e.target.value)) } })
              }
              className="h-9 w-16"
            />
            <select
              aria-label="Repeat unit"
              value={state.custom.freq}
              onChange={(e) => {
                const freq = e.target.value as RepeatFreq
                const weekdays =
                  freq === 'weekly' && state.custom.weekdays.length === 0
                    ? [dayOfWeek(start)]
                    : state.custom.weekdays
                set({
                  custom: { ...state.custom, freq, weekdays: freq === 'weekly' ? weekdays : [] },
                })
              }}
              className={SELECT}
            >
              {(Object.keys(UNITS) as RepeatFreq[]).map((f) => (
                <option key={f} value={f}>
                  {UNITS[f]}
                </option>
              ))}
            </select>
          </div>
          {state.custom.freq === 'weekly' ? (
            <div role="group" aria-label="Weekdays" className="flex gap-1">
              {days.map((d) => {
                const on = state.custom.weekdays.includes(d)
                return (
                  <button
                    key={d}
                    type="button"
                    aria-label={WEEKDAY_NAMES[d]}
                    aria-pressed={on}
                    onClick={() =>
                      set({
                        custom: {
                          ...state.custom,
                          weekdays: on
                            ? state.custom.weekdays.filter((x) => x !== d)
                            : [...state.custom.weekdays, d].sort(),
                        },
                      })
                    }
                    className={cn(
                      'size-9 rounded-full border text-sm',
                      on
                        ? 'border-transparent bg-primary text-primary-foreground'
                        : 'hover:bg-muted',
                    )}
                  >
                    {WEEKDAY_LETTERS[d]}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      ) : null}

      {state.preset !== 'never' ? (
        <>
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="task-repeat-ends">Ends</Label>
            <div className="flex items-center gap-2">
              {state.until !== null ? (
                <Input
                  type="date"
                  aria-label="Last day"
                  value={state.until}
                  min={start}
                  onChange={(e) => {
                    if (e.target.value) set({ until: e.target.value })
                  }}
                  className="h-9 w-40"
                />
              ) : (
                <span className="text-sm text-muted-foreground">Never</span>
              )}
              <Switch
                id="task-repeat-ends"
                aria-label="End on a date"
                checked={state.until !== null}
                onCheckedChange={(on) => set({ until: on ? (spec?.until ?? start) : null })}
              />
            </div>
          </div>
          {spec ? (
            <p className="text-xs text-muted-foreground">
              {describeRule(spec.rule, state.touched ? start : (state.originalStart ?? start))}
              {spec.until ? `, until ${formatDateLabel(spec.until, 'd MMM yyyy')}` : ''}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  )
}
