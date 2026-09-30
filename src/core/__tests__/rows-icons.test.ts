import { describe, expect, it } from 'vitest'
import { isTaskIconName, TASK_ICON_NAMES, toStoredIcon } from '../icons.ts'
import { taskFromRow, toHHmm, toStartTime, type TaskRowShape } from '../rows.ts'

const row: TaskRowShape = {
  id: 't1',
  title: 'Gym',
  notes: null,
  icon: 'dumbbell',
  color: 'purple',
  subtasks: [{ id: 's', title: 'x', done: true }],
  date: '2099-01-01',
  start_time: '07:30:00',
  duration_min: 45,
  is_all_day: false,
  completed_at: null,
  inbox_order: 0,
  created_at: 'c',
  updated_at: 'u',
}

describe('taskFromRow', () => {
  it('maps and sanitizes a row', () => {
    expect(taskFromRow(row)).toMatchObject({ startTime: '07:30', color: 'purple', durationMin: 45 })
    expect(taskFromRow({ ...row, color: 'neon', start_time: '24:00:00' })).toMatchObject({
      color: 'coral',
      startTime: null,
    })
    expect(toHHmm(null)).toBeNull()
    expect(toStartTime('9am')).toBeNull()
  })
})

describe('icons', () => {
  it('knows the picker names', () => {
    expect(TASK_ICON_NAMES).toHaveLength(47)
    expect(isTaskIconName('dumbbell')).toBe(true)
    expect(isTaskIconName('running')).toBe(false)
  })

  it('stores only known names or a single emoji', () => {
    expect(toStoredIcon('Dumbbell ')).toBe('dumbbell')
    expect(toStoredIcon('🏃')).toBe('🏃')
    expect(toStoredIcon('👩‍💻')).toBe('👩‍💻')
    expect(toStoredIcon('running')).toBeNull()
    expect(toStoredIcon('🏃 run')).toBeNull()
    expect(toStoredIcon(null)).toBeNull()
    expect(toStoredIcon(undefined)).toBeNull()
  })
})
