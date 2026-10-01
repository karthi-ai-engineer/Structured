/**
 * The energy monitor (PLAN.md E1, section 8 `energy.ts`). Each task has an energy level:
 * relaxing (-1) recharges, neutral (0) costs nothing, and 1 to 3 drain. Points accrue per started
 * half hour; a day's total is compared with the user's limit. Shared with the MCP server, so
 * Claude sees the same totals as the app.
 */

import type { Task } from './tasks.ts'

export type EnergyLevel = -1 | 0 | 1 | 2 | 3

export const ENERGY_LEVELS: readonly { level: EnergyLevel; label: string; emoji: string }[] = [
  { level: -1, label: 'Relaxing', emoji: '🪷' },
  { level: 0, label: 'Neutral', emoji: '⭕' },
  { level: 1, label: 'Light', emoji: '🔥' },
  { level: 2, label: 'Draining', emoji: '🔥🔥' },
  { level: 3, label: 'Exhausting', emoji: '🔥🔥🔥' },
]

export function isEnergyLevel(value: unknown): value is EnergyLevel {
  return value === -1 || value === 0 || value === 1 || value === 2 || value === 3
}

/** A stored energy value the app can use, or null (not set: counts as neutral). */
export function toEnergyLevel(value: unknown): EnergyLevel | null {
  return isEnergyLevel(value) ? value : null
}

/** level × started half hours; an all-day or zero-length task counts as one half hour. */
export function taskPoints(task: Pick<Task, 'energy' | 'durationMin' | 'isAllDay'>): number {
  const level = task.energy ?? 0
  if (level === 0) return 0
  const units = task.isAllDay ? 1 : Math.max(1, Math.ceil(task.durationMin / 30))
  return level * units
}

/** A day's energy: the sum of its dated tasks' points, never below zero. */
export function dayEnergy(
  tasks: readonly Pick<Task, 'energy' | 'durationMin' | 'isAllDay' | 'date'>[],
): number {
  const total = tasks.reduce((sum, t) => (t.date === null ? sum : sum + taskPoints(t)), 0)
  return Math.max(0, total)
}

export type EnergyStatus = 'ok' | 'high' | 'over'

/** Under 80 % of the limit is fine, up to 100 % is high, above it is over. */
export function energyStatus(points: number, limit: number): EnergyStatus {
  if (points > limit) return 'over'
  return points >= 0.8 * limit ? 'high' : 'ok'
}
