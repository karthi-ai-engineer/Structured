import { describe, expect, it } from 'vitest'
import {
  expandSeries,
  expandSeriesRows,
  masterFromRow,
  missingSeriesIds,
  occurrenceId,
  overrideFromRow,
  parseOccurrenceId,
  type SeriesRowShape,
} from '../series.ts'

const S1 = '11111111-1111-4111-8111-111111111111'
const S2 = '22222222-2222-4222-8222-222222222222'

function row(extra: Partial<SeriesRowShape> & Pick<SeriesRowShape, 'id'>): SeriesRowShape {
  return {
    title: 'Gym',
    notes: null,
    icon: 'dumbbell',
    color: 'green',
    subtasks: [{ id: 'a', title: 'Stretch', done: true }],
    date: '2026-10-01',
    start_time: '07:00:00',
    duration_min: 60,
    is_all_day: false,
    completed_at: '2026-10-01T08:00:00Z',
    inbox_order: 0,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    repeat_rule: 'FREQ=DAILY',
    repeat_until: null,
    series_id: null,
    occurrence_date: null,
    is_cancelled: false,
    ...extra,
  }
}

const override = (extra: Partial<SeriesRowShape>) =>
  row({
    id: 'o-' + String(extra.occurrence_date),
    repeat_rule: null,
    series_id: S1,
    completed_at: null,
    date: extra.occurrence_date ?? null,
    ...extra,
  })

describe('occurrence ids', () => {
  it('round-trips and rejects other ids', () => {
    expect(occurrenceId(S1, '2026-10-02')).toBe(`${S1}:2026-10-02`)
    expect(parseOccurrenceId(`${S1}:2026-10-02`)).toEqual({ seriesId: S1, date: '2026-10-02' })
    expect(parseOccurrenceId(S1)).toBeNull()
    expect(parseOccurrenceId(`${S1}:2026-02-30`)).toBeNull()
    expect(parseOccurrenceId(`not-a-uuid:2026-10-02`)).toBeNull()
  })
})

describe('rows', () => {
  it('reads a series row, rejecting unusable ones', () => {
    const m = masterFromRow(row({ id: S1, repeat_until: '2026-10-31' }))
    expect(m).toMatchObject({ rule: { freq: 'daily' }, until: '2026-10-31' })
    expect(m?.task.date).toBe('2026-10-01')
    expect(masterFromRow(row({ id: S1, repeat_until: 'nope' }))?.until).toBeNull()
    expect(masterFromRow(row({ id: S1, repeat_rule: 'FREQ=HOURLY' }))).toBeNull()
    expect(masterFromRow(row({ id: S1, date: null }))).toBeNull()
    expect(masterFromRow(row({ id: S1, series_id: S2 }))).toBeNull()
  })

  it('reads an override row', () => {
    expect(overrideFromRow(override({ occurrence_date: '2026-10-02' }))).toMatchObject({
      seriesId: S1,
      occurrenceDate: '2026-10-02',
      cancelled: false,
    })
    expect(overrideFromRow(row({ id: 'x' }))).toBeNull()
    expect(overrideFromRow(override({ occurrence_date: null }))).toBeNull()
  })
})

describe('expandSeries', () => {
  it('generates occurrences from the template: undone, no subtasks done, stable ids', () => {
    const tasks = expandSeriesRows([row({ id: S1 })], '2026-10-02', '2026-10-03')
    expect(tasks.map((t) => t.id)).toEqual([`${S1}:2026-10-02`, `${S1}:2026-10-03`])
    expect(tasks[0]).toMatchObject({
      date: '2026-10-02',
      startTime: '07:00',
      completedAt: null,
      subtasks: [{ id: 'a', title: 'Stretch', done: false }],
      recurrence: {
        seriesId: S1,
        occurrenceDate: '2026-10-02',
        start: '2026-10-01',
        until: null,
        rule: { freq: 'daily', interval: 1, weekdays: [] },
      },
    })
  })

  it('an override replaces its occurrence, and shows on its own date', () => {
    const rows = [
      row({ id: S1 }),
      override({ occurrence_date: '2026-10-02', start_time: '09:30:00', title: 'Gym (late)' }),
      // Moved from the 3rd to the 5th: gone from the 3rd, shown on the 5th.
      override({ occurrence_date: '2026-10-03', date: '2026-10-05' }),
      override({ occurrence_date: '2026-10-04', is_cancelled: true }),
    ]
    const days = expandSeriesRows(rows, '2026-10-02', '2026-10-05')
      .map((t) => `${t.date} ${t.startTime} ${t.title} ${t.id.slice(-10)}`)
      .sort()
    expect(days).toEqual([
      '2026-10-02 09:30 Gym (late) 2026-10-02',
      '2026-10-05 07:00 Gym 2026-10-03',
      '2026-10-05 07:00 Gym 2026-10-05',
    ])
    // The moved occurrence is outside a range that holds only its original date.
    expect(expandSeriesRows(rows, '2026-10-03', '2026-10-03')).toEqual([])
  })

  it('drops overrides without a live series, and inbox overrides', () => {
    const orphan = overrideFromRow(override({ occurrence_date: '2026-10-02', series_id: S2 }))
    const inbox = overrideFromRow(override({ occurrence_date: '2026-10-02', date: null }))
    if (!orphan || !inbox) throw new Error('fixture')
    const master = masterFromRow(row({ id: S1, repeat_until: '2026-10-01' }))
    if (!master) throw new Error('fixture')
    expect(expandSeries([master], [orphan, inbox], '2026-10-02', '2026-10-09')).toEqual([])
  })

  it('skips unusable rows and lists series that overrides need', () => {
    const rows = [
      row({ id: S1, repeat_rule: 'garbage' }),
      override({ occurrence_date: null }),
      override({ occurrence_date: '2026-10-02', series_id: S2 }),
      override({ occurrence_date: '2026-10-03' }),
    ]
    expect(expandSeriesRows(rows, '2026-10-01', '2026-10-09')).toEqual([])
    expect(missingSeriesIds(rows)).toEqual([S2])
    expect(
      missingSeriesIds([row({ id: S1 }), override({ occurrence_date: '2026-10-02' })]),
    ).toEqual([])
  })
})
