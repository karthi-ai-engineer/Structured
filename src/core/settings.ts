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
  return problems
}
