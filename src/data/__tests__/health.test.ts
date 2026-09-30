import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SupabaseEnv } from '@/data/env'
import { checkDatabase, DB_CHECK_TIMEOUT_MS, singleflight, type DbStatus } from '@/data/health'
import type { DbResult, SettingsStore } from '@/data/repo/settings'

const okEnv: SupabaseEnv = {
  ok: true,
  url: 'https://demo-project.supabase.co',
  publishableKey: 'k',
}
const ZONE = 'Asia/Tokyo'

type ReadResult = DbResult<number | null>
type InsertResult = DbResult<'inserted' | 'exists'>

function fakeStore(reads: ReadResult[], insert: InsertResult = { ok: true, value: 'inserted' }) {
  const queue = [...reads]
  return {
    readSettingsId: vi.fn<SettingsStore['readSettingsId']>(() => {
      const next = queue.shift()
      return next ? Promise.resolve(next) : Promise.reject(new Error('unexpected read'))
    }),
    insertDefaultSettings: vi.fn<SettingsStore['insertDefaultSettings']>(() =>
      Promise.resolve(insert),
    ),
  }
}

function run(store: SettingsStore | null, overrides: { online?: boolean; env?: SupabaseEnv } = {}) {
  return checkDatabase({
    env: overrides.env ?? okEnv,
    store,
    timezone: ZONE,
    online: overrides.online ?? true,
  })
}

/** A promise that never settles (a hung request that ignores its abort signal). */
const hang = <T>() => new Promise<T>(() => undefined)

afterEach(() => {
  vi.useRealTimers()
})

describe('checkDatabase', () => {
  it('returns not-configured with the env problems and never touches a store', async () => {
    const store = fakeStore([])
    const env: SupabaseEnv = { ok: false, problems: ['VITE_SUPABASE_URL is missing'] }
    await expect(run(store, { env })).resolves.toEqual({
      state: 'not-configured',
      problems: ['VITE_SUPABASE_URL is missing'],
    })
    expect(store.readSettingsId).not.toHaveBeenCalled()
  })

  it('returns not-configured when there is no store', async () => {
    await expect(run(null)).resolves.toEqual({ state: 'not-configured', problems: [] })
  })

  it('returns error/offline immediately, with no store call', async () => {
    const store = fakeStore([{ ok: true, value: 1 }])
    await expect(run(store, { online: false })).resolves.toEqual({
      state: 'error',
      code: 'offline',
    })
    expect(store.readSettingsId).not.toHaveBeenCalled()
    expect(store.insertDefaultSettings).not.toHaveBeenCalled()
  })

  it('returns connected/found when the row exists, without inserting', async () => {
    const store = fakeStore([{ ok: true, value: 1 }])
    await expect(run(store)).resolves.toEqual({ state: 'connected', settingsRow: 'found' })
    expect(store.readSettingsId).toHaveBeenCalledTimes(1)
    expect(store.insertDefaultSettings).not.toHaveBeenCalled()
  })

  it('inserts the browser zone and re-reads when the row is missing (connected/created)', async () => {
    vi.useFakeTimers()
    const store = fakeStore([
      { ok: true, value: null },
      { ok: true, value: 1 },
    ])

    await expect(run(store)).resolves.toEqual({ state: 'connected', settingsRow: 'created' })

    expect(store.insertDefaultSettings).toHaveBeenCalledWith(ZONE, expect.any(AbortSignal))
    expect(store.readSettingsId).toHaveBeenCalledTimes(2)
    // One shared deadline: every call got the same signal, and the timer was cleared.
    const signals = [
      ...store.readSettingsId.mock.calls.map(([signal]) => signal),
      ...store.insertDefaultSettings.mock.calls.map(([, signal]) => signal),
    ]
    expect(new Set(signals).size).toBe(1)
    expect(signals[0]?.aborted).toBe(false)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('returns connected/found when the insert reports that the row already exists', async () => {
    const store = fakeStore(
      [
        { ok: true, value: null },
        { ok: true, value: 1 },
      ],
      { ok: true, value: 'exists' },
    )
    await expect(run(store)).resolves.toEqual({ state: 'connected', settingsRow: 'found' })
  })

  it('returns error/write-not-visible when the re-read finds no row', async () => {
    const store = fakeStore([
      { ok: true, value: null },
      { ok: true, value: null },
    ])
    await expect(run(store)).resolves.toEqual({ state: 'error', code: 'write-not-visible' })
  })

  it.each([
    ['the first read', fakeStore([{ ok: false, code: 'permission' }]), 'permission'],
    [
      'the insert',
      fakeStore([{ ok: true, value: null }], { ok: false, code: 'pg-23514' }),
      'pg-23514',
    ],
    [
      'the re-read',
      fakeStore([
        { ok: true, value: null },
        { ok: false, code: 'network' },
      ]),
      'network',
    ],
  ] as const)('passes through a store error code from %s', async (_label, store, code) => {
    await expect(run(store)).resolves.toEqual({ state: 'error', code })
  })

  it('returns error/unexpected when the store throws synchronously', async () => {
    const store: SettingsStore = {
      readSettingsId: () => {
        throw new Error('boom')
      },
      insertDefaultSettings: () => hang(),
    }
    await expect(run(store)).resolves.toEqual({ state: 'error', code: 'unexpected' })
  })

  it('returns error/unexpected when a store promise rejects', async () => {
    const store = fakeStore([]) // the first read rejects
    await expect(run(store)).resolves.toEqual({ state: 'error', code: 'unexpected' })
  })

  it('times out a hung store at 12 s and fires the abort signal', async () => {
    vi.useFakeTimers()
    let seen: AbortSignal | undefined
    const store: SettingsStore = {
      readSettingsId: (signal) => {
        seen = signal
        return hang()
      },
      insertDefaultSettings: () => hang(),
    }
    let result: DbStatus | undefined
    void run(store).then((status) => {
      result = status
    })

    await vi.advanceTimersByTimeAsync(DB_CHECK_TIMEOUT_MS - 1)
    expect(DB_CHECK_TIMEOUT_MS).toBe(12_000)
    expect(result).toBeUndefined()
    expect(seen?.aborted).toBe(false)

    await vi.advanceTimersByTimeAsync(1)
    expect(result).toEqual({ state: 'error', code: 'timeout' })
    expect(seen?.aborted).toBe(true)
  })

  it('applies one deadline to the whole read, insert and re-read sequence', async () => {
    vi.useFakeTimers()
    const after = <T>(ms: number, value: T) =>
      new Promise<T>((resolve) => setTimeout(() => resolve(value), ms))
    let reads = 0
    const store: SettingsStore = {
      readSettingsId: () => (++reads === 1 ? after(5_000, { ok: true, value: null }) : hang()),
      insertDefaultSettings: () => after(5_000, { ok: true, value: 'inserted' }),
    }
    let result: DbStatus | undefined
    void run(store).then((status) => {
      result = status
    })

    await vi.advanceTimersByTimeAsync(11_999) // 5 s read + 5 s insert + a hung re-read
    expect(reads).toBe(2)
    expect(result).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1)
    expect(result).toEqual({ state: 'error', code: 'timeout' })
  })

  it('honours a custom timeout', async () => {
    vi.useFakeTimers()
    let result: DbStatus | undefined
    const store: SettingsStore = {
      readSettingsId: () => hang(),
      insertDefaultSettings: () => hang(),
    }
    void checkDatabase({ env: okEnv, store, timezone: ZONE, online: true, timeoutMs: 500 }).then(
      (status) => {
        result = status
      },
    )
    await vi.advanceTimersByTimeAsync(500)
    expect(result).toEqual({ state: 'error', code: 'timeout' })
  })
})

describe('singleflight', () => {
  function deferred<T>() {
    let resolve: (value: T) => void = () => undefined
    let reject: (error: Error) => void = () => undefined
    const promise = new Promise<T>((res, rej) => {
      resolve = res
      reject = rej
    })
    return { promise, resolve, reject }
  }

  it('gives concurrent callers the same promise and starts once', async () => {
    const pending = deferred<string>()
    const start = vi.fn((label: string) => pending.promise.then((value) => `${label}:${value}`))
    const flight = singleflight(start)

    const first = flight('a')
    const second = flight('b') // joins the pending call; its argument is ignored
    expect(second).toBe(first)
    expect(start).toHaveBeenCalledTimes(1)

    pending.resolve('done')
    await expect(first).resolves.toBe('a:done')
  })

  it('starts a new call after the previous one settled', async () => {
    let calls = 0
    const flight = singleflight(() => Promise.resolve(++calls))

    const first = flight()
    await expect(first).resolves.toBe(1)
    const second = flight()
    expect(second).not.toBe(first)
    await expect(second).resolves.toBe(2)
  })

  it('starts a new call after the previous one rejected', async () => {
    const pending = deferred<number>()
    const start = vi
      .fn<() => Promise<number>>()
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce(2)
    const flight = singleflight(start)

    const first = flight()
    pending.reject(new Error('failed'))
    await expect(first).rejects.toThrow('failed')
    await expect(flight()).resolves.toBe(2)
    expect(start).toHaveBeenCalledTimes(2)
  })

  it('turns a synchronous throw into a rejection and does not stay stuck', async () => {
    const start = vi
      .fn<() => Promise<number>>()
      .mockImplementationOnce(() => {
        throw new Error('sync')
      })
      .mockResolvedValueOnce(7)
    const flight = singleflight(start)

    await expect(flight()).rejects.toThrow('sync')
    await expect(flight()).resolves.toBe(7)
  })
})
