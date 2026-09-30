/**
 * The icon names a task may store (`tasks.icon`), shared by the UI picker and the MCP server.
 * The UI maps each name to a lucide icon (src/components/TaskIcon.tsx); a test keeps the two in
 * sync. Any single emoji is also a valid icon.
 */

import { firstEmoji } from './tasks.ts'

export const TASK_ICON_NAMES = [
  'list-todo',
  'sunrise',
  'sun',
  'sunset',
  'moon',
  'bed',
  'coffee',
  'utensils',
  'shower-head',
  'shirt',
  'laptop',
  'code',
  'briefcase',
  'presentation',
  'users',
  'message-circle',
  'phone',
  'mail',
  'video',
  'book-open',
  'graduation-cap',
  'pen-line',
  'brain',
  'target',
  'timer',
  'dumbbell',
  'footprints',
  'bike',
  'heart',
  'pill',
  'droplets',
  'shopping-cart',
  'wallet',
  'house',
  'car',
  'plane',
  'dog',
  'leaf',
  'music',
  'palette',
  'brush',
  'gamepad-2',
  'gift',
  'star',
  'sparkles',
  'flame',
  'zap',
] as const

export type TaskIconName = (typeof TASK_ICON_NAMES)[number]

export function isTaskIconName(value: string): value is TaskIconName {
  return (TASK_ICON_NAMES as readonly string[]).includes(value)
}

/** A known icon name or a single emoji as stored, otherwise null (never free text, which the
 *  timeline would render as raw words inside the pill). */
export function toStoredIcon(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null
  const trimmed = value.trim().toLowerCase()
  if (isTaskIconName(trimmed)) return trimmed
  const emoji = firstEmoji(value)
  return emoji !== null && emoji === value.trim() ? emoji : null
}
