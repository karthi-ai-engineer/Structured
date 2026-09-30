import { describe, expect, it } from 'vitest'

// Guards the hermetic unit-test environment (vitest.config.ts and src/test/setup.ts). If any of
// these fail, other tests could pass or fail depending on the machine they run on.
describe('unit-test environment', () => {
  it('runs in America/St_Johns (UTC-03:30 in January), not the machine zone', () => {
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(210)
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('America/St_Johns')
  })

  it('blanks the browser Supabase variables even when .env.local exists', () => {
    const url: unknown = import.meta.env.VITE_SUPABASE_URL
    const key: unknown = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    expect(url ?? '').toBe('')
    expect(key ?? '').toBe('')
  })

  it('stubs global fetch so that network calls reject', async () => {
    await expect(fetch('https://example.invalid')).rejects.toThrow('network disabled')
  })
})
