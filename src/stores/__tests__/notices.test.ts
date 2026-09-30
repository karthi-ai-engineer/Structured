import { afterEach, describe, expect, it, vi } from 'vitest'
import { dismiss, getNotices, notify, subscribe } from '@/stores/notices'

afterEach(() => {
  for (const n of getNotices()) dismiss(n.id)
  vi.useRealTimers()
})

describe('notices', () => {
  it('shows, notifies subscribers, auto-dismisses and keeps at most three', () => {
    vi.useFakeTimers()
    const listener = vi.fn()
    const unsubscribe = subscribe(listener)

    for (const m of ['a', 'b', 'c', 'd']) notify(m)
    expect(getNotices().map((n) => n.message)).toEqual(['b', 'c', 'd'])
    expect(listener).toHaveBeenCalledTimes(4)

    vi.advanceTimersByTime(5_000)
    expect(getNotices()).toEqual([])

    unsubscribe()
    notify('e')
    expect(listener).toHaveBeenCalledTimes(4 + 4) // four auto-dismissals, nothing after unsubscribe
  })

  it('dismisses by id', () => {
    notify('x')
    const [first] = getNotices()
    dismiss(first?.id ?? -1)
    expect(getNotices()).toEqual([])
  })
})
