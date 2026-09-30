// Browser time-zone adapter (docs/phases/phase-0/PLAN.md 6.5).
import { normalizeTimeZone } from '@/core/dates'

/** Every IANA zone this runtime knows, for the settings picker (falls back to a short list). */
export function listTimeZones(): string[] {
  try {
    return Intl.supportedValuesOf('timeZone')
  } catch {
    return ['UTC', 'Asia/Kolkata', 'Asia/Tokyo', 'Europe/London', 'America/New_York']
  }
}

/** The device's IANA zone in Intl's canonical spelling, or 'UTC' if it is unusable. */
export function detectTimeZone(): string {
  try {
    return normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  } catch {
    return 'UTC'
  }
}
