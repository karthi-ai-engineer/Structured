import { Bell } from 'lucide-react'
import { ALERT_CHOICES, alertLabel } from '@/core/alerts'
import { ENERGY_LEVELS, type EnergyLevel } from '@/core/energy'
import { cn } from '@/lib/utils'

/** The task's energy level (PLAN.md E1): tap the selected one again to clear it. */
export function EnergyField({
  value,
  onChange,
}: {
  value: EnergyLevel | null
  onChange: (value: EnergyLevel | null) => void
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">Energy</legend>
      <div className="flex flex-wrap gap-2">
        {ENERGY_LEVELS.map((e) => (
          <button
            key={e.level}
            type="button"
            aria-pressed={value === e.level}
            aria-label={`Energy: ${e.label}`}
            title={e.label}
            onClick={() => onChange(value === e.level ? null : e.level)}
            className={cn(
              'min-h-9 rounded-full border px-3 text-sm',
              value === e.level ? 'border-foreground bg-muted' : 'hover:bg-muted',
            )}
          >
            {e.emoji}
          </button>
        ))}
      </div>
    </fieldset>
  )
}

/** Alerts for a timed task (N1). null follows the settings' defaults until something is picked. */
export function AlertsField({
  value,
  defaults,
  onChange,
}: {
  value: number[] | null
  defaults: readonly number[]
  onChange: (value: number[] | null) => void
}) {
  const shown = value ?? defaults
  function toggle(minutes: number) {
    const next = shown.includes(minutes) ? shown.filter((m) => m !== minutes) : [...shown, minutes]
    onChange(next.sort((a, b) => a - b))
  }
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Bell className="size-4" /> Alerts
        {value === null ? (
          <span className="text-xs font-normal text-muted-foreground">(your defaults)</span>
        ) : (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-xs font-normal text-muted-foreground underline-offset-2 hover:underline"
          >
            Use defaults
          </button>
        )}
      </legend>
      <div className="flex flex-wrap gap-2">
        {ALERT_CHOICES.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={shown.includes(m)}
            onClick={() => toggle(m)}
            className={cn(
              'min-h-9 rounded-full border px-3 text-sm',
              shown.includes(m) ? 'border-foreground bg-muted' : 'hover:bg-muted',
            )}
          >
            {alertLabel(m)}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
