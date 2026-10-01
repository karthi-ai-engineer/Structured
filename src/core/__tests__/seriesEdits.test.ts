import { describe, expect, it } from 'vitest'
import { parseRule, type RepeatRule } from '../recurrence.ts'
import {
  planDelete,
  planEdit,
  repeatChanged,
  scopesFor,
  sharedPatch,
  type RepeatSpec,
} from '../seriesEdits.ts'
import type { Task, TaskDraft } from '../tasks.ts'

const SERIES = '11111111-1111-4111-8111-111111111111'
const NEW_ID = '99999999-9999-4999-8999-999999999999'

function rule(text: string): RepeatRule {
  const r = parseRule(text)
  if (!r) throw new Error(text)
  return r
}

const DAILY: RepeatSpec = { rule: rule('FREQ=DAILY'), until: null }

function occurrence(date: string, extra: Partial<Task> = {}): Task {
  return {
    id: `${SERIES}:${date}`,
    title: 'Gym',
    notes: null,
    icon: 'dumbbell',
    color: 'green',
    subtasks: [{ id: 's', title: 'Stretch', done: true }],
    date,
    startTime: '07:00',
    durationMin: 60,
    isAllDay: false,
    completedAt: null,
    inboxOrder: 0,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    recurrence: {
      seriesId: SERIES,
      occurrenceDate: date,
      rule: DAILY.rule,
      start: '2026-10-01',
      until: null,
    },
    ...extra,
  }
}

function draftOf(task: Task, extra: Partial<TaskDraft> = {}): TaskDraft {
  const { title, notes, icon, color, subtasks, date, startTime, durationMin, isAllDay } = task
  return { title, notes, icon, color, subtasks, date, startTime, durationMin, isAllDay, ...extra }
}

describe('scopes', () => {
  const occ = occurrence('2026-10-05')
  it('offers every scope when only fields change', () => {
    expect(repeatChanged(occ, DAILY)).toBe(false)
    expect(scopesFor(occ, DAILY)).toEqual(['this', 'future', 'all'])
  })
  it('a new rule or end date cannot apply to one occurrence', () => {
    expect(scopesFor(occ, { rule: rule('FREQ=WEEKLY;BYDAY=MO'), until: null })).toEqual([
      'future',
      'all',
    ])
    expect(scopesFor(occ, { ...DAILY, until: '2026-12-31' })).toEqual(['future', 'all'])
  })
  it('stopping the repeat applies from this occurrence on', () => {
    expect(scopesFor(occ, null)).toEqual(['future'])
  })
  it('refuses a task that is not an occurrence', () => {
    expect(() => scopesFor({ ...occ, recurrence: null }, DAILY)).toThrow(/Not an occurrence/)
  })
})

describe('planEdit', () => {
  const occ = occurrence('2026-10-05', { completedAt: '2026-10-05T08:00:00Z' })

  it('this: the occurrence with its new values', () => {
    const plan = planEdit(occ, draftOf(occ, { startTime: '09:00' }), DAILY, 'this', NEW_ID)
    expect(plan).toMatchObject({ kind: 'occurrence', task: { id: occ.id, startTime: '09:00' } })
  })

  it('future: splits at the occurrence and starts a new series with an undone template', () => {
    const plan = planEdit(occ, draftOf(occ, { startTime: '06:30' }), DAILY, 'future', NEW_ID)
    expect(plan).toEqual({
      kind: 'split',
      seriesId: SERIES,
      from: '2026-10-05',
      next: {
        id: NEW_ID,
        draft: draftOf(occ, {
          startTime: '06:30',
          subtasks: [{ id: 's', title: 'Stretch', done: false }],
        }),
        repeat: DAILY,
        completedAt: null,
      },
    })
  })

  it('future: moved earlier, the split starts at the new date', () => {
    const plan = planEdit(occ, draftOf(occ, { date: '2026-10-03' }), DAILY, 'future', NEW_ID)
    expect(plan).toMatchObject({ kind: 'split', from: '2026-10-03' })
  })

  it('future with repeating turned off: a one-off task that keeps its completion', () => {
    const plan = planEdit(occ, draftOf(occ), null, 'future', NEW_ID)
    expect(plan).toMatchObject({
      kind: 'split',
      next: {
        repeat: null,
        completedAt: '2026-10-05T08:00:00Z',
        draft: { subtasks: occ.subtasks },
      },
    })
  })

  it('future from the first occurrence is all', () => {
    const first = occurrence('2026-10-01')
    const plan = planEdit(first, draftOf(first, { title: 'Run' }), DAILY, 'future', NEW_ID)
    expect(plan).toMatchObject({ kind: 'series', patch: { title: 'Run', date: '2026-10-01' } })
    expect(plan).not.toHaveProperty('repeat')
  })

  it('all: shifts the series start by the date change and passes a new rule', () => {
    const weekly = { rule: rule('FREQ=WEEKLY;BYDAY=TU'), until: null }
    const plan = planEdit(occ, draftOf(occ, { date: '2026-10-06' }), weekly, 'all', NEW_ID)
    expect(plan).toMatchObject({
      kind: 'series',
      seriesId: SERIES,
      patch: { date: '2026-10-02', subtasks: [{ id: 's', done: false }] },
      repeat: weekly,
    })
  })

  it('all with repeating turned off (from the first occurrence): the series becomes this task', () => {
    const first = occurrence('2026-10-01', { completedAt: 'x' })
    const plan = planEdit(first, draftOf(first, { date: '2026-10-02' }), null, 'future', NEW_ID)
    expect(plan).toEqual({
      kind: 'series',
      seriesId: SERIES,
      patch: { ...draftOf(first, { date: '2026-10-02' }), completedAt: 'x' },
      repeat: null,
    })
  })

  it('all for an occurrence moved to the inbox keeps the series start', () => {
    const plan = planEdit(occ, draftOf(occ, { date: null }), DAILY, 'all', NEW_ID)
    expect(plan).toMatchObject({ kind: 'series', patch: { date: '2026-10-01' } })
  })
})

describe('planDelete', () => {
  it('this cancels one occurrence; future ends the series; all removes it', () => {
    const occ = occurrence('2026-10-05')
    expect(planDelete(occ, 'this')).toEqual({ kind: 'cancel', task: occ })
    expect(planDelete(occ, 'future')).toEqual({
      kind: 'split',
      seriesId: SERIES,
      from: '2026-10-05',
      next: null,
    })
    expect(planDelete(occ, 'all')).toEqual({ kind: 'remove-series', seriesId: SERIES })
    expect(planDelete(occurrence('2026-10-01'), 'future')).toEqual({
      kind: 'remove-series',
      seriesId: SERIES,
    })
  })
})

describe('sharedPatch', () => {
  it('keeps only the fields that reach other occurrences', () => {
    expect(
      sharedPatch({
        title: 'A',
        date: '2026-10-01',
        completedAt: null,
        subtasks: [],
        color: 'blue',
      }),
    ).toEqual({ title: 'A', color: 'blue' })
  })
})
