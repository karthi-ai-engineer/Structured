import { describe, expect, it, vi } from 'vitest'
import { nowIso } from '../dates.ts'
import {
  DEFAULT_SETTINGS,
  isTheme,
  toSafeWeekStart,
  toTheme,
  toTimeFormat,
  validateSettingsPatch,
} from '../settings.ts'

describe('settings', () => {
  it('has sensible defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      timeFormat: '24h',
      weekStart: 1,
      dayStart: '07:00',
      dayEnd: '22:00',
      defaultDuration: 30,
      theme: 'system',
    })
  })

  it('coerces stored values', () => {
    expect(isTheme('dark')).toBe(true)
    expect(isTheme('blue')).toBe(false)
    expect(toTheme('light')).toBe('light')
    expect(toTheme('neon')).toBe('system')
    expect(toTimeFormat('12h')).toBe('12h')
    expect(toTimeFormat('anything')).toBe('24h')
    expect(toSafeWeekStart(0)).toBe(0)
    expect(toSafeWeekStart(6)).toBe(6)
    expect(toSafeWeekStart(7)).toBe(1)
    expect(toSafeWeekStart(1.5)).toBe(1)
    expect(toSafeWeekStart('3')).toBe(1)
  })

  it('validates a patch', () => {
    expect(validateSettingsPatch({ timezone: 'Asia/Tokyo', dayStart: '06:30' })).toEqual([])
    expect(
      validateSettingsPatch({
        timezone: 'Mars/Base',
        dayStart: '7am',
        dayEnd: '25:00',
        defaultDuration: 0,
        theme: 'neon' as never,
      }),
    ).toEqual([
      'Time zone is invalid',
      'Day start is invalid',
      'Day end is invalid',
      'Default duration must be 1 to 1440 minutes',
      'Theme is invalid',
    ])
    expect(validateSettingsPatch({ defaultDuration: 30.5 })).toHaveLength(1)
  })
})

describe('nowIso', () => {
  it('formats an explicit instant as ISO 8601 UTC', () => {
    expect(nowIso(new Date(Date.UTC(2026, 8, 30, 3, 4, 5, 6)))).toBe('2026-09-30T03:04:05.006Z')
  })

  it('rejects an Invalid Date', () => {
    expect(() => nowIso(new Date(Number.NaN))).toThrow(RangeError)
  })

  it('defaults to the current clock', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(Date.UTC(2026, 9, 1, 12, 0, 0))
      expect(nowIso()).toBe('2026-10-01T12:00:00.000Z')
    } finally {
      vi.useRealTimers()
    }
  })
})
