import type { ISODate } from '@/core/dates'
import { ENERGY_LEVELS } from '@/core/energy'
import { formatDateLabel } from '@/core/dates'
import { PRIORITIES, type TaskDraft } from '@/core/tasks'
import type { QuickAdd } from '@/core/quickadd'

/**
 * A draft with what quick add recognised in its title applied (PLAN.md T15). A date without a
 * time makes an unscheduled draft all-day; a time without a date means today.
 */
export function withQuickAdd(draft: TaskDraft, quick: QuickAdd, today: ISODate): TaskDraft {
  if (quick.found.length === 0) return draft
  const date = quick.date ?? (quick.startTime && draft.date === null ? today : draft.date)
  const wasUnscheduled = draft.date === null || draft.startTime === null
  return {
    ...draft,
    title: quick.title,
    date,
    startTime: quick.startTime ?? (date !== null && wasUnscheduled ? null : draft.startTime),
    isAllDay: quick.startTime
      ? false
      : date !== null && wasUnscheduled && draft.startTime === null
        ? true
        : draft.isAllDay,
    durationMin: quick.durationMin ?? draft.durationMin,
    priority: quick.priority ?? draft.priority,
    energy: quick.energy ?? draft.energy,
  }
}

/** Short labels for the editor's preview chips. */
export function quickAddLabels(quick: QuickAdd, today: ISODate): string[] {
  return quick.found.map((f) => {
    switch (f.kind) {
      case 'date':
        return quick.date === today
          ? 'Today'
          : quick.date
            ? formatDateLabel(quick.date, 'EEE d MMM')
            : f.text
      case 'time':
        return quick.startTime ?? f.text
      case 'duration':
        return `${quick.durationMin ?? ''} min`
      case 'priority':
        return `${PRIORITIES.find((p) => p.value === quick.priority)?.label ?? ''} priority`
      case 'energy':
        return ENERGY_LEVELS.find((e) => e.level === quick.energy)?.emoji ?? f.text
    }
  })
}
