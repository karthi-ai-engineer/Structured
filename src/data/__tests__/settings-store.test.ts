import { describe, expect, it, vi } from 'vitest'
import { createSettingsStore, type SettingsStore } from '@/data/repo/settings'
import { createDb, type Db } from '@/data/supabase'

// A real supabase-js client whose fetch is stubbed: this pins the actual response handling of
// supabase-js 2.117 (errors are returned as values, AbortError is status 0, and retries are off).

const PROJECT_URL = 'https://demo-project.supabase.co'
const KEY = ['sb', 'publishable', 'Ab12Cd34Ef56Gh78Ij90Kl'].join('_') // built at runtime

type Respond = () => Promise<Response>

function json(status: number, body: unknown): Respond {
  return () =>
    Promise.resolve(
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
}
const empty =
  (status: number): Respond =>
  () =>
    Promise.resolve(new Response(null, { status }))
const text =
  (status: number, body: string): Respond =>
  () =>
    Promise.resolve(new Response(body, { status }))
const reject =
  (error: Error): Respond =>
  () =>
    Promise.reject(error)

function setup(respond: Respond) {
  const fetchStub = vi.fn<typeof fetch>(() => respond())
  const store: SettingsStore = createSettingsStore(createDb(PROJECT_URL, KEY, { fetch: fetchStub }))
  return { store, fetchStub }
}

function requestOf(fetchStub: ReturnType<typeof setup>['fetchStub'], index = 0) {
  const call = fetchStub.mock.calls[index]
  if (!call) throw new Error(`fetch was not called ${index + 1} time(s)`)
  const [input, init] = call
  const url = input instanceof Request ? input.url : String(input)
  return { url: new URL(url), init: init ?? {}, headers: new Headers(init?.headers) }
}

const failures = [
  ['a rejected TypeError (network down)', reject(new TypeError('Failed to fetch')), 'network'],
  [
    'a rejected AbortError (deadline)',
    reject(new DOMException('The operation was aborted.', 'AbortError')),
    'timeout',
  ],
  ['540 (project paused)', text(540, 'Project paused'), 'paused'],
  [
    '404 PGRST205 (schema missing)',
    json(404, { code: 'PGRST205', message: 'x' }),
    'schema-missing',
  ],
  ['401 42501 (grants missing)', json(401, { code: '42501', message: 'x' }), 'permission'],
  ['401 without a code (key rejected)', json(401, { message: 'Invalid API key' }), 'invalid-key'],
  ['503 (retryable status, retries off)', text(503, 'unavailable'), 'http-503'],
  ['520 (retryable status, retries off)', text(520, 'origin error'), 'http-520'],
] as const

describe('createSettingsStore', () => {
  describe('readSettingsId', () => {
    it('returns 1 for 200 [{"id":1}] and sends a single-row GET with the key', async () => {
      const { store, fetchStub } = setup(json(200, [{ id: 1 }]))
      const signal = new AbortController().signal

      await expect(store.readSettingsId(signal)).resolves.toEqual({ ok: true, value: 1 })

      expect(fetchStub).toHaveBeenCalledTimes(1)
      const { url, init, headers } = requestOf(fetchStub)
      expect(url.pathname).toBe('/rest/v1/settings')
      expect(url.searchParams.get('select')).toBe('id')
      expect(url.searchParams.get('id')).toBe('eq.1')
      expect(init.method).toBe('GET')
      expect(init.signal).toBe(signal)
      expect(headers.get('apikey')).toBe(KEY)
    })

    it('returns null for 200 []', async () => {
      const { store } = setup(json(200, []))
      await expect(store.readSettingsId(new AbortController().signal)).resolves.toEqual({
        ok: true,
        value: null,
      })
    })

    it('maps more than one row to pg-PGRST116', async () => {
      const { store } = setup(json(200, [{ id: 1 }, { id: 1 }]))
      await expect(store.readSettingsId(new AbortController().signal)).resolves.toEqual({
        ok: false,
        code: 'pg-PGRST116',
      })
    })

    it.each(failures)('maps %s and calls fetch exactly once', async (_label, respond, code) => {
      const { store, fetchStub } = setup(respond)
      await expect(store.readSettingsId(new AbortController().signal)).resolves.toEqual({
        ok: false,
        code,
      })
      expect(fetchStub).toHaveBeenCalledTimes(1)
    })

    it('returns unexpected instead of throwing when the client throws', async () => {
      const broken = {
        from: () => {
          throw new Error('boom')
        },
      } as unknown as Db
      await expect(
        createSettingsStore(broken).readSettingsId(new AbortController().signal),
      ).resolves.toEqual({ ok: false, code: 'unexpected' })
    })
  })

  describe('insertDefaultSettings', () => {
    it('returns inserted for 201 and posts only the id and the zone', async () => {
      const { store, fetchStub } = setup(empty(201))
      const signal = new AbortController().signal

      await expect(store.insertDefaultSettings('Asia/Tokyo', signal)).resolves.toEqual({
        ok: true,
        value: 'inserted',
      })

      expect(fetchStub).toHaveBeenCalledTimes(1)
      const { url, init } = requestOf(fetchStub)
      expect(url.pathname).toBe('/rest/v1/settings')
      expect(init.method).toBe('POST')
      expect(init.signal).toBe(signal)
      expect(typeof init.body).toBe('string')
      expect(JSON.parse(typeof init.body === 'string' ? init.body : '')).toEqual({
        id: 1,
        timezone: 'Asia/Tokyo',
      })
    })

    it('returns exists for 409 23505 (another tab or device created the row first)', async () => {
      const { store } = setup(json(409, { code: '23505', message: 'duplicate key' }))
      await expect(
        store.insertDefaultSettings('Asia/Tokyo', new AbortController().signal),
      ).resolves.toEqual({ ok: true, value: 'exists' })
    })

    it('maps a check violation to pg-23514', async () => {
      const { store } = setup(json(400, { code: '23514', message: 'violates check' }))
      await expect(
        store.insertDefaultSettings('Asia/Tokyo', new AbortController().signal),
      ).resolves.toEqual({ ok: false, code: 'pg-23514' })
    })

    it.each(failures)('maps %s and calls fetch exactly once', async (_label, respond, code) => {
      const { store, fetchStub } = setup(respond)
      await expect(
        store.insertDefaultSettings('Asia/Tokyo', new AbortController().signal),
      ).resolves.toEqual({ ok: false, code })
      expect(fetchStub).toHaveBeenCalledTimes(1)
    })

    it('returns unexpected instead of throwing when the client throws', async () => {
      const broken = {
        from: () => {
          throw new Error('boom')
        },
      } as unknown as Db
      await expect(
        createSettingsStore(broken).insertDefaultSettings('UTC', new AbortController().signal),
      ).resolves.toEqual({ ok: false, code: 'unexpected' })
    })
  })

  it('never returns a server message, detail or hint', async () => {
    const secretish = 'details with a stack trace at https://example.com/assets/index.js'
    const { store } = setup(json(500, { message: secretish, details: secretish, hint: secretish }))
    const result = await store.readSettingsId(new AbortController().signal)
    expect(result).toEqual({ ok: false, code: 'http-500' })
    expect(JSON.stringify(result)).not.toContain('example.com')
  })
})
