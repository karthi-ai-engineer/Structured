// Database error codes (docs/phases/phase-0/PLAN.md 6.4, D0-30).
//
// supabase-js returns errors as values ({ status, error }). Only a short code derived from them
// ever reaches the UI: messages, details and hints can carry stack traces and bundle URLs.

export type DbErrorCode =
  | 'offline'
  | 'network'
  | 'timeout'
  | 'paused'
  | 'invalid-key'
  | 'schema-missing'
  | 'permission'
  | 'write-not-visible'
  | 'unexpected'
  | `pg-${string}`
  | `http-${number}`

/** The parts of a supabase-js / PostgREST response this mapping reads. */
export interface DbErrorResponse {
  status: number
  error: { message?: unknown; code?: unknown } | null
}

/** PostgREST (`PGRST116`) and Postgres (`23505`, `42P01`) codes. Anything else is ignored. */
const SAFE_CODE = /^[A-Z0-9]{1,12}$/i

/**
 * Maps a failed response to a code:
 * - status 0 (fetch rejected): `AbortError`/`TimeoutError` → `timeout`, anything else → `network`
 * - 540 → `paused` (the Supabase project is paused)
 * - `PGRST205` → `schema-missing`, `42501` → `permission`
 * - 401/403 without a code → `invalid-key` (the API gateway rejected the key)
 * - any other code → `pg-<code>`, else `http-<status>`
 */
export function toDbErrorCode(response: DbErrorResponse): DbErrorCode {
  const { status } = response
  const message = typeof response.error?.message === 'string' ? response.error.message : ''
  const rawCode = typeof response.error?.code === 'string' ? response.error.code : ''
  const code = SAFE_CODE.test(rawCode) ? rawCode : ''

  if (status === 0) {
    return message.startsWith('AbortError') || message.startsWith('TimeoutError')
      ? 'timeout'
      : 'network'
  }
  if (status === 540) return 'paused'
  if (code === 'PGRST205') return 'schema-missing'
  if (code === '42501') return 'permission'
  if ((status === 401 || status === 403) && code === '') return 'invalid-key'
  if (code !== '') return `pg-${code}`
  return Number.isInteger(status) ? `http-${status}` : 'unexpected'
}
