/** User settings (the single `settings` row, PLAN.md section 7.1), as the app uses them. */

import { isTime, isValidTimeZone, toWeekStart, type TimeFormat, type WeekStart } from './dates.ts'

export type Theme = 'system' | 'light' | 'dark'

export interface Settings {
  timezone: string
  timeFormat: TimeFormat
  weekStart: WeekStart
  /** 'HH:mm' */
  dayStart: string
  /** 'HH:mm' */
  dayEnd: string
  defaultDuration: number
  theme: Theme
  /** The energy monitor (PLAN.md E1). */
  energyEnabled: boolean
  energyLimit: number
  /** Focus mode intervals, in minutes (F2). */
  focusMinutes: number
  breakMinutes: number
  /** Alerts for tasks without their own (minutes before the start; -1 = at the end). */
  defaultAlerts: number[]
  updatedAt: string
}

export type SettingsPatch = Partial<Omit<Settings, 'updatedAt'>>

export const DEFAULT_SETTINGS: Omit<Settings, 'timezone' | 'updatedAt'> = {
  timeFormat: '24h',
  weekStart: 1,
  dayStart: '07:00',
  dayEnd: '22:00',
  defaultDuration: 30,
  theme: 'system',
  energyEnabled: true,
  energyLimit: 30,
  focusMinutes: 25,
  breakMinutes: 5,
  defaultAlerts: [0],
}

export function isTheme(value: unknown): value is Theme {
  return value === 'system' || value === 'light' || value === 'dark'
}

export function toTheme(value: unknown): Theme {
  return isTheme(value) ? value : DEFAULT_SETTINGS.theme
}

export function toTimeFormat(value: unknown): TimeFormat {
  return value === '12h' ? '12h' : '24h'
}

/** Clamps anything to a valid week start (0 = Sunday ... 6 = Saturday). */
export function toSafeWeekStart(value: unknown): WeekStart {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 6
    ? toWeekStart(value)
    : DEFAULT_SETTINGS.weekStart
}

/** Human-readable problems with a settings patch; empty when it can be saved. */
export function validateSettingsPatch(patch: SettingsPatch): string[] {
  const problems: string[] = []
  if (patch.timezone !== undefined && !isValidTimeZone(patch.timezone)) {
    problems.push('Time zone is invalid')
  }
  if (patch.dayStart !== undefined && !isTime(patch.dayStart)) problems.push('Day start is invalid')
  if (patch.dayEnd !== undefined && !isTime(patch.dayEnd)) problems.push('Day end is invalid')
  if (
    patch.defaultDuration !== undefined &&
    (!Number.isInteger(patch.defaultDuration) ||
      patch.defaultDuration < 1 ||
      patch.defaultDuration > 1440)
  ) {
    problems.push('Default duration must be 1 to 1440 minutes')
  }
  if (patch.theme !== undefined && !isTheme(patch.theme)) problems.push('Theme is invalid')
  const whole = (n: number | undefined, min: number, max: number) =>
    n === undefined || (Number.isInteger(n) && n >= min && n <= max)
  if (!whole(patch.energyLimit, 1, 999)) problems.push('Energy limit must be 1 to 999')
  if (!whole(patch.focusMinutes, 1, 240)) problems.push('Focus length must be 1 to 240 minutes')
  if (!whole(patch.breakMinutes, 0, 120)) problems.push('Break length must be 0 to 120 minutes')
  return problems
}
