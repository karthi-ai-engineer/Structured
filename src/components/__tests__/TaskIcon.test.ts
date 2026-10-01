import { describe, expect, it } from 'vitest'
import { TASK_ICON_NAMES } from '@/core/icons'
import { TASK_ICONS } from '@/components/TaskIcon'

describe('TaskIcon map', () => {
  it('offers exactly the shared icon names, in the same order', () => {
    expect(Object.keys(TASK_ICONS)).toEqual([...TASK_ICON_NAMES])
  })
})
