import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOnline } from '@/platform/network'
import { detectTimeZone } from '@/platform/timezone'

const originalNavigator = globalThis.navigator

afterEach(() => {
  vi.restoreAllMocks()
  vi.stubGlobal('navigator', originalNavigator)
})

function mockResolvedZone(timeZone: string) {
  const real = new Intl.DateTimeFormat().resolvedOptions()
  // Only the first call (detectTimeZone's own read); normalizeTimeZone keeps the real Intl.
  vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValueOnce({
    ...real,
    timeZone,
  })
}

describe('detectTimeZone', () => {
  it("returns the runtime's zone (the unit tests run in America/St_Johns)", () => {
    expect(detectTimeZone()).toBe('America/St_Johns')
  })

  it("returns Intl's canonical spelling", () => {
    mockResolvedZone('asia/tokyo')
    expect(detectTimeZone()).toBe('Asia/Tokyo')
  })

  it.each(['Mars/Olympus_Mons', '', '+05:30'])(
    'falls back to UTC for the unusable zone %j',
    (zone) => {
      mockResolvedZone(zone)
      expect(detectTimeZone()).toBe('UTC')
    },
  )

  it('falls back to UTC when Intl throws', () => {
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockImplementation(() => {
      throw new Error('no Intl')
    })
    expect(detectTimeZone()).toBe('UTC')
  })
})

describe('isOnline', () => {
  it('is false only when the browser reports offline', () => {
    vi.stubGlobal('navigator', { onLine: false })
    expect(isOnline()).toBe(false)
    vi.stubGlobal('navigator', { onLine: true })
    expect(isOnline()).toBe(true)
  })

  it('assumes online when onLine is unknown or there is no navigator', () => {
    vi.stubGlobal('navigator', {})
    expect(isOnline()).toBe(true)
    vi.stubGlobal('navigator', undefined)
    expect(isOnline()).toBe(true)
  })
})
