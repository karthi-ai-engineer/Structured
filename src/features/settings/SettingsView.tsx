import {
  Suspense,
  use,
  useState,
  useTransition,
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { BellRing, LoaderCircle } from 'lucide-react'
import { ALERT_CHOICES, alertLabel } from '@/core/alerts'
import { formatDuration, type WeekStart } from '@/core/dates'
import { DURATION_PRESETS } from '@/core/tasks'
import type { SettingsPatch, Theme } from '@/core/settings'
import { validateSettingsPatch } from '@/core/settings'
import { DbStatusBadge } from '@/components/DbStatusBadge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { startDbCheck } from '@/data/dbCheck'
import type { DbStatus } from '@/data/health'
import { useAppSettings, useUpdateSettings } from '@/data/queries/settings'
import { isOnline } from '@/platform/network'
import {
  notificationState,
  requestNotifications,
  type NotificationState,
} from '@/platform/notifications'
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
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]
    if (step === undefined) return
    e.preventDefault()
    const index = options.findIndex((o) => o.value === value)
    const next = options[(index + step + options.length) % options.length]
    if (!next) return
    onChange(next.value)
    const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')
    buttons[options.indexOf(next)]?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className="flex rounded-lg bg-muted p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          tabIndex={value === o.value ? 0 : -1}
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
  const [permission, setPermission] = useState<NotificationState>(notificationState)

  function save(patch: SettingsPatch) {
    if (validateSettingsPatch(patch).length === 0) update(patch)
  }
  // Time inputs fire on every segment typed, so they save on blur (or Enter) instead. They are
  // uncontrolled; the key remounts them when the setting changes on another device.
  const timeProps = (key: 'dayStart' | 'dayEnd') => ({
    type: 'time',
    className: 'h-9 w-32',
    defaultValue: settings[key],
    onBlur: (e: FocusEvent<HTMLInputElement>) => {
      const value = e.currentTarget.value
      if (value && value !== settings[key]) save({ [key]: value })
    },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') e.currentTarget.blur()
    },
  })

  // Whole-number fields save on blur (or Enter), like the time fields.
  const numberProps = (
    key: 'energyLimit' | 'focusMinutes' | 'breakMinutes',
    min: number,
    max: number,
  ) => ({
    type: 'number',
    inputMode: 'numeric' as const,
    min,
    max,
    className: 'h-9 w-24',
    defaultValue: settings[key],
    onBlur: (e: FocusEvent<HTMLInputElement>) => {
      const value = Math.round(Number(e.currentTarget.value))
      if (value !== settings[key] && validateSettingsPatch({ [key]: value }).length === 0) {
        save({ [key]: value })
      } else {
        e.currentTarget.value = String(settings[key])
      }
    },
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') e.currentTarget.blur()
    },
  })

  function toggleDefaultAlert(minutes: number) {
    const current = settings.defaultAlerts
    const next = current.includes(minutes)
      ? current.filter((m) => m !== minutes)
      : [...current, minutes]
    save({ defaultAlerts: next.sort((a, b) => a - b) })
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
          <Input key={settings.dayStart} id="set-start" {...timeProps('dayStart')} />
        </Row>
        <Row label="Day ends" htmlFor="set-end">
          <Input key={settings.dayEnd} id="set-end" {...timeProps('dayEnd')} />
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

      <section aria-labelledby="s-energy" className="flex flex-col">
        <h2
          id="s-energy"
          className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Energy and focus
        </h2>
        <Row label="Energy monitor" htmlFor="set-energy">
          <Switch
            id="set-energy"
            checked={settings.energyEnabled}
            onCheckedChange={(energyEnabled) => save({ energyEnabled })}
          />
        </Row>
        {settings.energyEnabled ? (
          <Row label="Daily energy limit" htmlFor="set-energy-limit">
            <Input
              key={settings.energyLimit}
              id="set-energy-limit"
              {...numberProps('energyLimit', 1, 999)}
            />
          </Row>
        ) : null}
        <Row label="Focus interval (minutes)" htmlFor="set-focus">
          <Input
            key={settings.focusMinutes}
            id="set-focus"
            {...numberProps('focusMinutes', 1, 240)}
          />
        </Row>
        <Row label="Break (minutes)" htmlFor="set-break">
          <Input
            key={settings.breakMinutes}
            id="set-break"
            {...numberProps('breakMinutes', 0, 120)}
          />
        </Row>
      </section>

      <section aria-labelledby="s-alerts" className="flex flex-col">
        <h2
          id="s-alerts"
          className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Alerts
        </h2>
        <div className="flex flex-col gap-2 border-b py-3">
          <span className="text-sm font-medium">Default alerts for timed tasks</span>
          <div role="group" aria-label="Default alerts" className="flex flex-wrap gap-2">
            {ALERT_CHOICES.map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={settings.defaultAlerts.includes(m)}
                onClick={() => toggleDefaultAlert(m)}
                className={cn(
                  'min-h-9 rounded-full border px-3 text-sm',
                  settings.defaultAlerts.includes(m)
                    ? 'border-foreground bg-muted'
                    : 'hover:bg-muted',
                )}
              >
                {alertLabel(m)}
              </button>
            ))}
          </div>
        </div>
        <Row label="Desktop notifications">
          {permission === 'granted' ? (
            <span className="text-sm text-muted-foreground">On</span>
          ) : permission === 'denied' ? (
            <span className="text-sm text-muted-foreground">Blocked in the browser settings</span>
          ) : permission === 'unsupported' ? (
            <span className="text-sm text-muted-foreground">Not available here</span>
          ) : (
            <Button
              size="sm"
              variant="outline"
              onClick={() => void requestNotifications().then(setPermission)}
            >
              <BellRing data-icon="inline-start" /> Turn on
            </Button>
          )}
        </Row>
        <p className="pt-2 text-xs text-muted-foreground">
          Alerts appear while the app is open. Without desktop notifications they show inside the
          app.
        </p>
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
