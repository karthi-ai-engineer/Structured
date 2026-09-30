import { describe, expect, it } from 'vitest'
import { startDbCheck } from '@/data/dbCheck'
import { supabase, supabaseEnv } from '@/data/supabase'

// Unit tests run unconfigured (vitest.config.ts blanks the VITE_* values), exactly like CI and a
// clone without .env.local. This is the unit-level half of manual check M3.
describe('startDbCheck in an unconfigured build', () => {
  it('has no client and reports both variables', () => {
    expect(supabase).toBeNull()
    expect(supabaseEnv).toEqual({
      ok: false,
      problems: ['VITE_SUPABASE_URL is missing', 'VITE_SUPABASE_PUBLISHABLE_KEY is missing'],
    })
  })

  it('resolves to not-configured and shares the in-flight check (singleflight)', async () => {
    const first = startDbCheck({ timezone: 'Asia/Tokyo', online: true })
    const second = startDbCheck({ timezone: 'Asia/Tokyo', online: true })
    expect(second).toBe(first)
    await expect(first).resolves.toEqual({
      state: 'not-configured',
      problems: ['VITE_SUPABASE_URL is missing', 'VITE_SUPABASE_PUBLISHABLE_KEY is missing'],
    })
  })
})
