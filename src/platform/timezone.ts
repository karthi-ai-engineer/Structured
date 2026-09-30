// Browser time-zone adapter (docs/phases/phase-0/PLAN.md 6.5).
import { normalizeTimeZone } from '@/core/dates'

/** The device's IANA zone in Intl's canonical spelling, or 'UTC' if it is unusable. */
export function detectTimeZone(): string {
  try {
    return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return 'UTC'
  }
}
