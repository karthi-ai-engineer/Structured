import { describe, expect, it } from 'vitest'
import {
  ALERT_AT_END,
  alertLabel,
  alertText,
  alertsForDay,
  dueBetween,
  toAlerts,
} from '../alerts.ts'
import { dayEnergy, energyStatus, isEnergyLevel, taskPoints, toEnergyLevel } from '../energy.ts'
import { formatCountdown, planIntervals, positionAt, startOfSegment } from '../focus.ts'
import type { Task } from '../tasks.ts'

function task(id: string, extra: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    notes: null,
    icon: null,
    color: 'blue',
    subtasks: [],
    date: '2026-10-01',
    startTime: '09:00',
    durationMin: 60,
    isAllDay: false,
    completedAt: null,
    inboxOrder: 0,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    recurrence: null,
    energy: null,
    alerts: null,
    ...extra,
  }
}

describe('energy', () => {
  it('validates levels', () => {
    expect([-1, 0, 1, 2, 3].every(isEnergyLevel)).toBe(true)
    expect(isEnergyLevel(4)).toBe(false)
    expect(toEnergyLevel('2')).toBeNull()
    expect(toEnergyLevel(2)).toBe(2)
  })

  it('counts level × started half hours; all-day and zero-length count once', () => {
    expect(taskPoints(task('a', { energy: 2, durationMin: 60 }))).toBe(4)
    expect(taskPoints(task('a', { energy: 3, durationMin: 31 }))).toBe(6)
    expect(taskPoints(task('a', { energy: 1, durationMin: 0 }))).toBe(1)
    expect(taskPoints(task('a', { energy: 2, isAllDay: true, durationMin: 600 }))).toBe(2)
    expect(taskPoints(task('a', { energy: -1, durationMin: 90 }))).toBe(-3)
    expect(taskPoints(task('a', { energy: 0 }))).toBe(0)
    expect(taskPoints(task('a'))).toBe(0)
  })

  it('sums a day, never below zero, ignoring inbox tasks', () => {
    expect(
      dayEnergy([
        task('a', { energy: 3, durationMin: 120 }),
        task('b', { energy: -1, durationMin: 60 }),
        task('c', { energy: 3, date: null }),
      ]),
    ).toBe(10)
    expect(dayEnergy([task('rest', { energy: -1, durationMin: 120 })])).toBe(0)
  })

  it('is green under 80 %, orange up to the limit, red above it', () => {
    expect(energyStatus(23, 30)).toBe('ok')
    expect(energyStatus(24, 30)).toBe('high')
    expect(energyStatus(30, 30)).toBe('high')
    expect(energyStatus(31, 30)).toBe('over')
  })
})

describe('alerts', () => {
  it('labels and cleans stored alerts', () => {
    expect([0, 5, 60, 90, ALERT_AT_END].map(alertLabel)).toEqual([
      'At start',
      '5 min before',
      '1 h before',
      '90 min before',
      'At end',
    ])
    expect(toAlerts(null)).toBeNull()
    expect(toAlerts([15, 0, 15, -1, -5, 2000, 1.5])).toEqual([-1, 0, 15])
    expect(toAlerts([])).toEqual([])
  })

  it('lists a day of alerts from the task or the defaults, skipping done, all-day and early ones', () => {
    const alerts = alertsForDay(
      [
        task('meet', { startTime: '10:00', durationMin: 30, alerts: [15, ALERT_AT_END] }),
        task('gym', { startTime: '07:00' }),
        task('done', { completedAt: 'x' }),
        task('allday', { isAllDay: true, startTime: null }),
        task('midnight', { startTime: '00:10', alerts: [30] }),
        task('late', { startTime: '23:50', durationMin: 30, alerts: [ALERT_AT_END] }),
      ],
      [0],
    )
    expect(alerts.map((a) => `${a.taskId} ${a.at}`)).toEqual(['gym 420', 'meet 585', 'meet 630'])
    expect(alerts[1]?.key).toBe('meet|2026-10-01|15')
    expect(dueBetween(alerts, 420, 600).map((a) => a.taskId)).toEqual(['meet'])
    expect(dueBetween(alerts, 419, 420).map((a) => a.taskId)).toEqual(['gym'])
  })

  it('words the notification', () => {
    const [before, end] = alertsForDay(
      [task('Standup', { startTime: '10:00', durationMin: 15, alerts: [5, ALERT_AT_END] })],
      [],
    )
    const time = (m: number) => `${Math.floor(m / 60)}h`
    if (!before || !end) throw new Error('alerts')
    expect(alertText(before, time)).toBe('"Standup" starts at 10h (5 min before)')
    expect(alertText(end, time)).toBe('Time is up for "Standup"')
    const [start] = alertsForDay([task('Run')], [0])
    if (!start) throw new Error('alert')
    expect(alertText(start, time)).toBe('"Run" starts now')
  })
})

describe('focus intervals', () => {
  it('fits focus and break segments into the time left', () => {
    // 60 minutes: focus, break, then the last 30 minutes (too short for another break) as focus.
    expect(planIntervals(60, 25, 5)).toEqual([
      { kind: 'focus', minutes: 25 },
      { kind: 'break', minutes: 5 },
      { kind: 'focus', minutes: 30 },
    ])
    expect(planIntervals(20, 25, 5)).toEqual([{ kind: 'focus', minutes: 20 }])
    expect(planIntervals(90, 30, 0)).toEqual([{ kind: 'focus', minutes: 90 }])
    expect(planIntervals(0, 25, 5)).toEqual([{ kind: 'focus', minutes: 1 }])
    expect(planIntervals(65, 25, 5)).toEqual([
      { kind: 'focus', minutes: 25 },
      { kind: 'break', minutes: 5 },
      { kind: 'focus', minutes: 25 },
      { kind: 'break', minutes: 5 },
      { kind: 'focus', minutes: 5 },
    ])
  })

  it('finds the current segment and the time left', () => {
    const plan = planIntervals(60, 25, 5)
    expect(positionAt(plan, 0)).toMatchObject({ index: 0, remainingMs: 25 * 60_000, done: false })
    expect(positionAt(plan, 26 * 60_000)).toMatchObject({ index: 1, remainingMs: 4 * 60_000 })
    expect(positionAt(plan, 31 * 60_000).segmentProgress).toBeCloseTo(1 / 30)
    expect(positionAt(plan, 30 * 60_000).overallProgress).toBeCloseTo(0.5)
    expect(positionAt(plan, 99 * 60_000)).toMatchObject({ index: 3, done: true, remainingMs: 0 })
    expect(positionAt([], 0)).toMatchObject({ done: true })
    expect(startOfSegment(plan, 2)).toBe(30 * 60_000)
  })

  it('formats countdowns', () => {
    expect(formatCountdown(25 * 60_000)).toBe('25:00')
    expect(formatCountdown(61_001)).toBe('01:02')
    expect(formatCountdown(-5)).toBe('00:00')
    expect(formatCountdown(3_725_000)).toBe('1:02:05')
  })
})
