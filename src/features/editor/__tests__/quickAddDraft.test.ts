import { describe, expect, it } from 'vitest'
import { parseQuickAdd } from '@/core/quickadd'
import type { TaskDraft } from '@/core/tasks'
import { quickAddLabels, withQuickAdd } from '@/features/editor/quickAddDraft'

const TODAY = '2026-10-01'

const inbox: TaskDraft = {
  title: '',
  notes: null,
  icon: null,
  color: 'coral',
  subtasks: [],
  date: null,
  startTime: null,
  durationMin: 30,
  isAllDay: false,
  energy: null,
  alerts: null,
  priority: null,
  dueDate: null,
}

const apply = (text: string, draft: TaskDraft = inbox) =>
  withQuickAdd({ ...draft, title: text }, parseQuickAdd(text, TODAY), TODAY)

describe('withQuickAdd', () => {
  it('schedules an inbox draft from the title', () => {
    expect(apply('Gym tomorrow 7am 1h !high ~2')).toMatchObject({
      title: 'Gym',
      date: '2026-10-02',
      startTime: '07:00',
      isAllDay: false,
      durationMin: 60,
      priority: 1,
      energy: 2,
    })
  })

  it('a date alone makes an unscheduled draft all-day; a time alone means today', () => {
    expect(apply('Taxes friday')).toMatchObject({
      date: '2026-10-02',
      isAllDay: true,
      startTime: null,
    })
    expect(apply('Call mum 18:00')).toMatchObject({
      date: TODAY,
      startTime: '18:00',
      isAllDay: false,
    })
  })

  it('keeps the start time of a draft opened on a day when only the date changes', () => {
    const timed = { ...inbox, date: TODAY, startTime: '09:00' }
    expect(apply('Report tomorrow', timed)).toMatchObject({
      title: 'Report',
      date: '2026-10-02',
      startTime: '09:00',
      isAllDay: false,
    })
  })

  it('leaves a draft without recognised parts alone', () => {
    const draft = { ...inbox, title: 'Plain title' }
    expect(withQuickAdd(draft, parseQuickAdd('Plain title', TODAY), TODAY)).toBe(draft)
  })
})

describe('quickAddLabels', () => {
  it('describes what was recognised', () => {
    expect(quickAddLabels(parseQuickAdd('x today 7am 45m !low ~-1', TODAY), TODAY)).toEqual([
      'Today',
      '07:00',
      '45 min',
      'Low priority',
      '🪷',
    ])
    expect(quickAddLabels(parseQuickAdd('x oct 5', TODAY), TODAY)).toEqual(['Mon 5 Oct'])
  })
})
