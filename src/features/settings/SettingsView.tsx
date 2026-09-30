import { Suspense, use, useState, useTransition, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { formatDuration, type WeekStart } from '@/core/dates'
import { DURATION_PRESETS } from '@/core/tasks'
import type { SettingsPatch, Theme } from '@/core/settings'
import { validateSettingsPatch } from '@/core/settings'
import { DbStatusBadge } from '@/components/DbStatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { startDbCheck } from '@/data/dbCheck'
import type { DbStatus } from '@/data/health'
import { useAppSettings, useUpdateSettings } from '@/data/queries/settings'
import { isOnline } from '@/platform/network'
import { detectTimeZone, listTimeZones } from '@/platform/timezone'
import { cn } from '@/lib/utils'

const selectClass =
  'h-9 rounded-md border border-input bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring'

function Row({
  label,
  htmlFor,
  children,
}: {
  label: string
  htmlFor?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-h-12 items-center justify-between gap-4 border-b py-2 last:border-b-0">
      <label htmlFor={htmlFor} className="text-sm font-medium">
        {label}
      </label>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: readonly { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg bg-muted p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'min-h-8 rounded-md px-3 text-sm',
            value === o.value ? 'bg-background shadow-sm' : 'text-muted-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function runDbCheck(): Promise<DbStatus> {
  return startDbCheck({ timezone: detectTimeZone(), online: isOnline() })
}

function DbStatusView({ promise }: { promise: Promise<DbStatus> }) {
  return <DbStatusBadge status={use(promise)} />
}

function DatabaseStatus() {
  const [status, setStatus] = useState(runDbCheck)
  const [isPending, startTransition] = useTransition()
  return (
    <div className="flex items-center gap-3">
      <Suspense fallback={<DbStatusBadge status={{ state: 'checking' }} />}>
        <DbStatusView promise={status} />
      </Suspense>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        aria-busy={isPending}
        onClick={() => startTransition(() => setStatus(runDbCheck()))}
      >
        {isPending ? (
          <LoaderCircle data-icon="inline-start" className="motion-safe:animate-spin" />
        ) : null}
        Check again
      </Button>
    </div>
  )
}

export function SettingsView() {
  const settings = useAppSettings()
  const update = useUpdateSettings()
  const [zones] = useState(listTimeZones)

  function save(patch: SettingsPatch) {
    if (validateSettingsPatch(patch).length === 0) update(patch)
  }
  const onTime = (key: 'dayStart' | 'dayEnd') => (value: string) => {
    if (value) save({ [key]: value })
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 pt-4 pb-28 lg:pb-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Saved instantly and synced to every device.</p>
      </header>

      <section aria-labelledby="s-time" className="flex flex-col">
        <h2
          id="s-time"
          className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Time
        </h2>
        <Row label="Time zone" htmlFor="set-tz">
          <select
            id="set-tz"
            className={cn(selectClass, 'max-w-44')}
            value={settings.timezone}
            onChange={(e) => save({ timezone: e.target.value })}
          >
            {(zones.includes(settings.timezone) ? zones : [settings.timezone, ...zones]).map(
              (z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ),
            )}
          </select>
          <Button size="sm" variant="ghost" onClick={() => save({ timezone: detectTimeZone() })}>
            Use device
          </Button>
        </Row>
        <Row label="Time format">
          <Segmented
            label="Time format"
            value={settings.timeFormat}
            options={[
              { value: '24h', label: '24h' },
              { value: '12h', label: '12h' },
            ]}
            onChange={(timeFormat) => save({ timeFormat })}
          />
        </Row>
        <Row label="Week starts on" htmlFor="set-week">
          <select
            id="set-week"
            className={selectClass}
            value={settings.weekStart}
            onChange={(e) => save({ weekStart: Number(e.target.value) as WeekStart })}
          >
            <option value={1}>Monday</option>
            <option value={0}>Sunday</option>
            <option value={6}>Saturday</option>
          </select>
        </Row>
        <Row label="Day starts" htmlFor="set-start">
          <Input
            id="set-start"
            type="time"
            className="h-9 w-32"
            value={settings.dayStart}
            onChange={(e) => onTime('dayStart')(e.target.value)}
          />
        </Row>
        <Row label="Day ends" htmlFor="set-end">
          <Input
            id="set-end"
            type="time"
            className="h-9 w-32"
            value={settings.dayEnd}
            onChange={(e) => onTime('dayEnd')(e.target.value)}
          />
        </Row>
        <Row label="Default duration" htmlFor="set-duration">
          <select
            id="set-duration"
            className={selectClass}
            value={settings.defaultDuration}
            onChange={(e) => save({ defaultDuration: Number(e.target.value) })}
          >
            {DURATION_PRESETS.filter((m) => m >= 15).map((m) => (
              <option key={m} value={m}>
                {formatDuration(m)}
              </option>
            ))}
          </select>
        </Row>
      </section>

      <section aria-labelledby="s-look" className="flex flex-col">
        <h2
          id="s-look"
          className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Appearance
        </h2>
        <Row label="Theme">
          <Segmented<Theme>
            label="Theme"
            value={settings.theme}
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(theme) => save({ theme })}
          />
        </Row>
      </section>

      <section aria-labelledby="s-db" className="flex flex-col">
        <h2
          id="s-db"
          className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Database
        </h2>
        <Row label="Status">
          <DatabaseStatus />
        </Row>
      </section>
    </div>
  )
}
