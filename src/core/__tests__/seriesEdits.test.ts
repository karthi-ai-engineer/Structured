import { describe, expect, it } from 'vitest'
import { parseRule, type RepeatRule } from '../recurrence.ts'
import {
  changedFields,
  changesOf,
  planDelete,
  planEdit,
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

/** An occurrence of a series starting `start` (2026-10-01 by default, a Thursday). */
function occurrence(
  occurrenceDate: string,
  extra: Partial<Task> = {},
  series: { rule?: RepeatRule; start?: string; until?: string | null } = {},
): Task {
  return {
    id: `${SERIES}:${occurrenceDate}`,
    title: 'Gym',
    notes: null,
    icon: 'dumbbell',
    color: 'green',
    subtasks: [{ id: 's', title: 'Stretch', done: true }],
    date: occurrenceDate,
    startTime: '07:00',
    durationMin: 60,
    isAllDay: false,
    energy: null,
    alerts: null,
    priority: null,
    dueDate: null,
    completedAt: null,
    inboxOrder: 0,
    createdAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-09-01T00:00:00Z',
    recurrence: {
      seriesId: SERIES,
      occurrenceDate,
      rule: series.rule ?? DAILY.rule,
      start: series.start ?? '2026-10-01',
      until: series.until ?? null,
    },
    ...extra,
  }
}

function draftOf(task: Task, extra: Partial<TaskDraft> = {}): TaskDraft {
  const {
    title,
    notes,
    icon,
    color,
    subtasks,
    date,
    startTime,
    durationMin,
    isAllDay,
    energy,
    alerts,
    priority,
    dueDate,
  } = task
  return {
    title,
    notes,
    icon,
    color,
    subtasks,
    date,
    startTime,
    durationMin,
    isAllDay,
    energy,
    alerts,
    priority,
    dueDate,
    ...extra,
  }
}

describe('scopes', () => {
  const occ = occurrence('2026-10-05')
  it('offers every scope when only fields change', () => {
    expect(changesOf(occ, draftOf(occ), DAILY)).toEqual({ date: false, rule: false, until: false })
    expect(scopesFor(occ, draftOf(occ, { title: 'Run' }), DAILY)).toEqual(['this', 'future', 'all'])
  })
  it('a moved occurrence: this one, or the series from here on when its days follow the start', () => {
    expect(scopesFor(occ, draftOf(occ, { date: '2026-10-06' }), DAILY)).toEqual(['this', 'future'])
    const monthly = rule('FREQ=MONTHLY')
    const rent = occurrence('2026-10-05', {}, { rule: monthly, start: '2026-01-05' })
    expect(
      scopesFor(rent, draftOf(rent, { date: '2026-10-06' }), { rule: monthly, until: null }),
    ).toEqual(['this', 'future'])
    // Weekly series list their weekdays: moving the series is a rule change.
    const mondays = rule('FREQ=WEEKLY;BYDAY=MO')
    const gym = occurrence('2026-10-12', {}, { rule: mondays, start: '2026-10-05' })
    expect(
      scopesFor(gym, draftOf(gym, { date: '2026-10-13' }), { rule: mondays, until: null }),
    ).toEqual(['this'])
  })
  it('a new rule, or turning the repeat off, applies from here on', () => {
    const weekly = { rule: rule('FREQ=WEEKLY;BYDAY=MO'), until: null }
    expect(scopesFor(occ, draftOf(occ), weekly)).toEqual(['future'])
    expect(scopesFor(occ, draftOf(occ), null)).toEqual(['future'])
  })
  it('a new end date alone is a change to the whole series', () => {
    expect(scopesFor(occ, draftOf(occ), { ...DAILY, until: '2026-12-31' })).toEqual(['all'])
    // A new day and a new end date at once cannot be saved together.
    expect(
      scopesFor(occ, draftOf(occ, { date: '2026-10-06' }), { ...DAILY, until: '2026-12-31' }),
    ).toEqual([])
  })
  it('planEdit refuses a scope that is not offered', () => {
    const mondays = rule('FREQ=WEEKLY;BYDAY=MO')
    const gym = occurrence('2026-10-12', {}, { rule: mondays, start: '2026-10-05' })
    const spec = { rule: mondays, until: '2026-12-31' }
    expect(() =>
      planEdit(gym, draftOf(gym, { date: '2026-10-13' }), spec, 'future', NEW_ID),
    ).toThrow(/not offered/)
    expect(() =>
      planEdit(
        gym,
        draftOf(gym, { date: '2026-10-13' }),
        { ...spec, until: null },
        'future',
        NEW_ID,
      ),
    ).toThrow(/not offered/)
  })
  it('refuses a task that is not an occurrence', () => {
    expect(() => scopesFor({ ...occ, recurrence: null }, draftOf(occ), DAILY)).toThrow(
      /Not an occurrence/,
    )
  })
})

describe('due date edits (code review)', () => {
  it('reach the series row with "all", never the occurrences', () => {
    const occ = occurrence('2026-10-05')
    expect(planEdit(occ, draftOf(occ, { dueDate: '2026-12-01' }), DAILY, 'all', NEW_ID)).toEqual({
      kind: 'series',
      seriesId: SERIES,
      patch: { dueDate: '2026-12-01' },
      shared: {},
      reset: false,
    })
  })
})

describe('changedFields', () => {
  it('only what differs; subtasks as an undone template when the list changed', () => {
    const occ = occurrence('2026-10-05')
    expect(changedFields(occ, draftOf(occ))).toEqual({})
    expect(changedFields(occ, draftOf(occ, { title: 'Run', durationMin: 45 }))).toEqual({
      title: 'Run',
      durationMin: 45,
    })
    // Ticking a subtask is progress, not a change to the list.
    expect(
      changedFields(occ, draftOf(occ, { subtasks: [{ id: 's', title: 'Stretch', done: false }] })),
    ).toEqual({})
    expect(
      changedFields(
        occ,
        draftOf(occ, {
          subtasks: [
            { id: 's', title: 'Stretch', done: true },
            { id: 't', title: 'Cool down', done: true },
          ],
        }),
      ),
    ).toEqual({
      subtasks: [
        { id: 's', title: 'Stretch', done: false },
        { id: 't', title: 'Cool down', done: false },
      ],
    })
  })
})

describe('planEdit: this and all', () => {
  it('this: the occurrence with its new values', () => {
    const occ = occurrence('2026-10-05')
    const plan = planEdit(occ, draftOf(occ, { startTime: '09:00' }), DAILY, 'this', NEW_ID)
    expect(plan).toMatchObject({ kind: 'occurrence', task: { id: occ.id, startTime: '09:00' } })
  })

  it('all: only the edited fields, so other occurrences keep their own values', () => {
    // This occurrence was moved to 09:00 on its own; renaming it for all keeps the series at 07:00.
    const occ = occurrence('2026-10-05', { startTime: '09:00' })
    const plan = planEdit(occ, draftOf(occ, { title: 'Run' }), DAILY, 'all', NEW_ID)
    expect(plan).toEqual({
      kind: 'series',
      seriesId: SERIES,
      patch: { title: 'Run' },
      shared: { title: 'Run' },
      reset: false,
    })
  })

  it('all with a new end date keeps the per-occurrence changes (no reset)', () => {
    const occ = occurrence('2026-10-05')
    const until = { ...DAILY, until: '2026-12-31' }
    expect(planEdit(occ, draftOf(occ), until, 'all', NEW_ID)).toEqual({
      kind: 'series',
      seriesId: SERIES,
      patch: {},
      shared: {},
      reset: false,
      repeat: until,
    })
  })
})

describe('planEdit: this and future', () => {
  it('splits at the occurrence, keeps its own override, and starts an undone template', () => {
    const occ = occurrence('2026-10-05', { completedAt: '2026-10-05T08:00:00Z' })
    const plan = planEdit(occ, draftOf(occ, { startTime: '06:30' }), DAILY, 'future', NEW_ID)
    expect(plan).toEqual({
      kind: 'split',
      seriesId: SERIES,
      from: '2026-10-05',
      keep: '2026-10-05',
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

  it('a new weekday from a moved occurrence: the new series starts on the picked day', () => {
    // Mondays from 2026-10-05; the 12th moves to Tuesday the 13th with "every week on Tuesday".
    const mondays = rule('FREQ=WEEKLY;BYDAY=MO')
    const tuesdays = { rule: rule('FREQ=WEEKLY;BYDAY=TU'), until: null }
    const occ = occurrence('2026-10-12', {}, { rule: mondays, start: '2026-10-05' })
    expect(scopesFor(occ, draftOf(occ, { date: '2026-10-13' }), tuesdays)).toEqual(['future'])
    expect(
      planEdit(occ, draftOf(occ, { date: '2026-10-13' }), tuesdays, 'future', NEW_ID),
    ).toMatchObject({
      kind: 'split',
      from: '2026-10-12',
      keep: null,
      next: { draft: { date: '2026-10-13' }, repeat: tuesdays },
    })
  })

  it('moved earlier with a new rule: the split starts at the new date', () => {
    const occ = occurrence('2026-10-05')
    const weekly = { rule: rule('FREQ=WEEKLY;BYDAY=SA'), until: null }
    expect(
      planEdit(occ, draftOf(occ, { date: '2026-10-03' }), weekly, 'future', NEW_ID),
    ).toMatchObject({ kind: 'split', from: '2026-10-03', keep: null })
  })

  it('an occurrence moved on its own stays where it was put, and the pattern continues', () => {
    // Monthly on the 5th; Oct 5 was moved to Oct 6 on its own. Renaming it from here on keeps
    // the series on the 5th and keeps this occurrence's override (on the 6th, renamed).
    const monthly = rule('FREQ=MONTHLY')
    const occ = occurrence(
      '2026-10-05',
      { date: '2026-10-06' },
      { rule: monthly, start: '2026-01-05' },
    )
    const plan = planEdit(
      occ,
      draftOf(occ, { title: 'Rent' }),
      { rule: monthly, until: null },
      'future',
      NEW_ID,
    )
    expect(plan).toMatchObject({
      kind: 'split',
      from: '2026-10-05',
      keep: '2026-10-05',
      next: { draft: { date: '2026-10-05', title: 'Rent' } },
    })
  })

  it('a monthly series moved a day later from here on starts on the new day', () => {
    const monthly = rule('FREQ=MONTHLY')
    const rent = occurrence('2026-10-05', {}, { rule: monthly, start: '2026-01-05' })
    expect(
      planEdit(
        rent,
        draftOf(rent, { date: '2026-10-06' }),
        { rule: monthly, until: null },
        'future',
        NEW_ID,
      ),
    ).toMatchObject({
      kind: 'split',
      from: '2026-10-05',
      keep: null,
      next: { draft: { date: '2026-10-06' }, repeat: { rule: monthly } },
    })
  })

  it('continued from a short month, a monthly series keeps its day (the 31st)', () => {
    const monthly = rule('FREQ=MONTHLY')
    const feb = occurrence('2026-02-28', {}, { rule: monthly, start: '2026-01-31' })
    const plan = planEdit(
      feb,
      draftOf(feb, { title: 'Rent' }),
      { rule: monthly, until: null },
      'future',
      NEW_ID,
    )
    expect(plan).toMatchObject({
      kind: 'split',
      from: '2026-02-28',
      next: { draft: { date: '2026-02-28' }, repeat: { rule: { freq: 'monthly', monthDay: 31 } } },
    })
    // A yearly series from Feb 29, edited in a common year, keeps the 29th.
    const yearly = rule('FREQ=YEARLY')
    const bday = occurrence('2029-02-28', {}, { rule: yearly, start: '2028-02-29' })
    expect(
      planEdit(
        bday,
        draftOf(bday, { title: 'Party' }),
        { rule: yearly, until: null },
        'future',
        NEW_ID,
      ),
    ).toMatchObject({ next: { repeat: { rule: { monthDay: 29 } } } })
    // No clamping, no extra day: the rule stays as it was.
    const mid = occurrence('2026-03-15', {}, { rule: monthly, start: '2026-01-15' })
    const midPlan = planEdit(
      mid,
      draftOf(mid, { title: 'X' }),
      { rule: monthly, until: null },
      'future',
      NEW_ID,
    )
    expect(midPlan.kind === 'split' && midPlan.next?.repeat?.rule).toEqual(monthly)
  })

  it('a new rule starts at this occurrence (monthly "on the 15th" from Oct 15)', () => {
    const occ = occurrence('2026-10-15')
    const monthly = { rule: rule('FREQ=MONTHLY'), until: null }
    expect(planEdit(occ, draftOf(occ), monthly, 'future', NEW_ID)).toMatchObject({
      kind: 'split',
      from: '2026-10-15',
      next: { draft: { date: '2026-10-15' }, repeat: monthly },
    })
  })

  it('turning the repeat off: a one-off task that keeps its completion', () => {
    const occ = occurrence('2026-10-05', { completedAt: 'x' })
    expect(planEdit(occ, draftOf(occ), null, 'future', NEW_ID)).toMatchObject({
      kind: 'split',
      from: '2026-10-05',
      keep: null,
      next: { repeat: null, completedAt: 'x', draft: { subtasks: occ.subtasks } },
    })
  })
})

describe('planEdit: this and future from the first occurrence (the whole series)', () => {
  const first = occurrence('2026-10-01', { completedAt: 'x' })

  it('fields only: like all', () => {
    expect(planEdit(first, draftOf(first, { title: 'Run' }), DAILY, 'future', NEW_ID)).toEqual({
      kind: 'series',
      seriesId: SERIES,
      patch: { title: 'Run' },
      shared: { title: 'Run' },
      reset: false,
    })
  })

  it('a new rule or a move rewrites the series and resets the open overrides', () => {
    const weekly = { rule: rule('FREQ=WEEKLY;BYDAY=TH'), until: null }
    expect(planEdit(first, draftOf(first), weekly, 'future', NEW_ID)).toMatchObject({
      kind: 'series',
      patch: { date: '2026-10-01', subtasks: [{ done: false }] },
      reset: true,
      repeat: weekly,
    })
    expect(
      planEdit(first, draftOf(first, { date: '2026-10-02' }), DAILY, 'future', NEW_ID),
    ).toMatchObject({ kind: 'series', patch: { date: '2026-10-02' }, reset: true, repeat: DAILY })
  })

  it('turning the repeat off: the series becomes this one task', () => {
    expect(planEdit(first, draftOf(first, { date: '2026-10-02' }), null, 'future', NEW_ID)).toEqual(
      {
        kind: 'series',
        seriesId: SERIES,
        patch: { ...draftOf(first, { date: '2026-10-02' }), completedAt: 'x' },
        shared: {},
        reset: true,
        repeat: null,
      },
    )
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
      keep: null,
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
