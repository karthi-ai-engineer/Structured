// The database health check behind the home page's status (docs/phases/phase-0/PLAN.md 6.4).
// Pure: the settings store is injected, so tests run it with a fake store and fake timers.
import type { SupabaseEnv } from '@/data/env'
import type { DbErrorCode } from '@/data/errors'
import type { DbResult, SettingsStore } from '@/data/repo/settings'

export type DbStatus =
  | { state: 'checking' }
  | { state: 'not-configured'; problems: readonly string[] }
  | { state: 'connected'; settingsRow: 'found' | 'created' }
  | { state: 'error'; code: DbErrorCode }

export interface CheckDatabaseInput {
  env: SupabaseEnv
  store: SettingsStore | null
  /** The browser's IANA zone, stored when this check creates the settings row. */
  timezone: string
  online: boolean
  /** One deadline for the whole read, insert and re-read sequence. */
  timeoutMs?: number
}

export const DB_CHECK_TIMEOUT_MS = 12_000

type DbFailure = Extract<DbResult<never>, { ok: false }>

function failed(code: DbErrorCode): DbStatus {
  return { state: 'error', code }
}

/**
 * Reads the settings row. If it is missing, inserts it with the browser's zone and reads it back
 * (the read and write proof). Never rejects: every failure becomes an error state.
 */
export async function checkDatabase(input: CheckDatabaseInput): Promise<DbStatus> {
  try {
    const { env, store, timezone, online } = input
    if (!env.ok) return { state: 'not-configured', problems: env.problems }
    if (store === null) return { state: 'not-configured', problems: [] }
    if (!online) return failed('offline')

    const controller = new AbortController()
    // Settles when the deadline aborts the requests, so even a store call that ignores the
    // signal cannot keep the check pending.
    const deadline = new Promise<DbFailure>((resolve) => {
      controller.signal.addEventListener('abort', () => resolve({ ok: false, code: 'timeout' }), {
        once: true,
      })
    })
    const timer = setTimeout(() => controller.abort(), input.timeoutMs ?? DB_CHECK_TIMEOUT_MS)
    const withDeadline = <T>(call: Promise<DbResult<T>>) => Promise.race([call, deadline])

    try {
      const read = await withDeadline(store.readSettingsId(controller.signal))
      if (!read.ok) return failed(read.code)
      if (read.value !== null) return { state: 'connected', settingsRow: 'found' }

      const insert = await withDeadline(store.insertDefaultSettings(timezone, controller.signal))
      if (!insert.ok) return failed(insert.code)

      const reread = await withDeadline(store.readSettingsId(controller.signal))
      if (!reread.ok) return failed(reread.code)
      if (reread.value === null) return failed('write-not-visible')
      return { state: 'connected', settingsRow: insert.value === 'inserted' ? 'created' : 'found' }
    } finally {
      clearTimeout(timer)
    }
  } catch {
    return failed('unexpected')
  }
}

/**
 * Shares one in-flight call: while a call is pending, every caller gets the same promise (the
 * arguments of joining callers are ignored). The next call after it settles starts a new one.
 * This keeps React StrictMode's double-invoked state initializer from running two checks.
 */
export function singleflight<A extends unknown[], T>(
  start: (...args: A) => Promise<T>,
): (...args: A) => Promise<T> {
  let pending: Promise<T> | null = null
  return (...args: A) => {
    if (pending !== null) return pending
    let current: Promise<T>
    try {
      current = start(...args)
    } catch (error) {
      current = Promise.reject(error instanceof Error ? error : new Error(String(error)))
    }
    pending = current
    const clear = () => {
      if (pending === current) pending = null
    }
    current.then(clear, clear)
    return current
  }
}
