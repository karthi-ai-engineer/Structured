import { describe, expect, it } from 'vitest'
import {
  draftToInsert,
  patchToUpdate,
  rowToSettings,
  rowToTask,
  settingsPatchToUpdate,
  toHHmm,
  toSafeTimeZone,
  toStartTime,
  type SettingsRow,
  type TaskRow,
} from '@/data/mappers'

const row: TaskRow = {
  id: 't1',
  title: 'Gym',
  notes: null,
  icon: 'dumbbell',
  color: 'green',
  subtasks: [{ id: 's1', title: 'Warm up', done: true }],
  date: '2026-10-01',
  start_time: '07:30:00',
  duration_min: 60,
  is_all_day: false,
  energy: null,
  priority: null,
  due_date: null,
  goal_id: null,
  alerts: null,
  repeat_rule: null,
  repeat_until: null,
  series_id: null,
  occurrence_date: null,
  is_cancelled: false,
  completed_at: null,
  inbox_order: 0,
  source: 'app',
  batch_id: null,
  created_at: '2026-09-30T00:00:00Z',
  updated_at: '2026-09-30T00:00:00Z',
  deleted_at: null,
}

describe('task mapping', () => {
  it('maps a row to a task, trimming seconds and parsing subtasks', () => {
    const task = rowToTask(row)
    expect(task.startTime).toBe('07:30')
    expect(task.subtasks).toEqual([{ id: 's1', title: 'Warm up', done: true }])
    expect(task.color).toBe('green')
  })

  it('falls back to the default color for an unknown one', () => {
    expect(rowToTask({ ...row, color: 'chartreuse' }).color).toBe('coral')
  })

  it('builds an insert tagged as an app write', () => {
    const insert = draftToInsert('t2', {
      title: 'Read',
      notes: 'ch. 3',
      icon: null,
      color: 'blue',
      subtasks: [],
      date: null,
      startTime: null,
      durationMin: 30,
      isAllDay: false,
      energy: null,
      alerts: null,
    })
    expect(insert).toMatchObject({ id: 't2', title: 'Read', date: null, source: 'app' })
    expect(insert.subtasks).toEqual([])
  })

  it('maps only the fields present in a patch', () => {
    expect(patchToUpdate({})).toEqual({})
    expect(
      patchToUpdate({
        title: 'A',
        notes: null,
        icon: 'sun',
        color: 'teal',
        subtasks: [{ id: 'x', title: 'y', done: false }],
        date: '2026-10-02',
        startTime: '08:00',
        durationMin: 15,
        isAllDay: true,
        energy: null,
        alerts: null,
        completedAt: '2026-10-02T08:00:00Z',
      }),
    ).toEqual({
      title: 'A',
      energy: null,
      alerts: null,
      notes: null,
      icon: 'sun',
      color: 'teal',
      subtasks: [{ id: 'x', title: 'y', done: false }],
      date: '2026-10-02',
      start_time: '08:00',
      duration_min: 15,
      is_all_day: true,
      completed_at: '2026-10-02T08:00:00Z',
    })
  })

  it('trims times', () => {
    expect(toHHmm('22:00:00')).toBe('22:00')
    expect(toHHmm(null)).toBeNull()
  })
})

describe('sanitizing stored values', () => {
  it('drops start times the timeline cannot place', () => {
    expect(toStartTime('09:15:00')).toBe('09:15')
    expect(toStartTime('24:00:00')).toBeNull()
    expect(toStartTime('7am')).toBeNull()
    expect(toStartTime(null)).toBeNull()
    expect(rowToTask({ ...row, start_time: '24:00:00' }).startTime).toBeNull()
  })

  it('replaces an unusable time zone with the device zone', () => {
    expect(toSafeTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata')
    // The unit tests run in America/St_Johns (vitest.config.ts).
    expect(toSafeTimeZone('+05:30')).toBe('America/St_Johns')
    expect(toSafeTimeZone('Mars/Base')).toBe('America/St_Johns')
  })
})

describe('settings mapping', () => {
  const settingsRow: SettingsRow = {
    id: 1,
    timezone: 'Asia/Tokyo',
    time_format: '12h',
    week_start: 0,
    day_start: '06:30:00',
    day_end: '23:00:00',
    seeded_at: null,
    default_duration: 45,
    default_alerts: [0],
    energy_enabled: true,
    energy_limit: 30,
    focus_minutes: 25,
    break_minutes: 5,
    theme: 'dark',
    updated_at: '2026-09-30T00:00:00Z',
  }

  it('maps a row to settings', () => {
    expect(rowToSettings(settingsRow)).toEqual({
      timezone: 'Asia/Tokyo',
      timeFormat: '12h',
      weekStart: 0,
      dayStart: '06:30',
      dayEnd: '23:00',
      defaultDuration: 45,
      theme: 'dark',
      updatedAt: '2026-09-30T00:00:00Z',
      energyEnabled: true,
      energyLimit: 30,
      focusMinutes: 25,
      breakMinutes: 5,
      defaultAlerts: [0],
    })
  })

  it('maps a settings patch', () => {
    expect(settingsPatchToUpdate({})).toEqual({})
    expect(
      settingsPatchToUpdate({
        timezone: 'UTC',
        timeFormat: '24h',
        weekStart: 1,
        dayStart: '07:00',
        dayEnd: '22:00',
        defaultDuration: 30,
        theme: 'light',
      }),
    ).toEqual({
      timezone: 'UTC',
      time_format: '24h',
      week_start: 1,
      day_start: '07:00',
      day_end: '22:00',
      default_duration: 30,
      theme: 'light',
    })
  })
})
