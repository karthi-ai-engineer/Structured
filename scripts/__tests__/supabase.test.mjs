// Unit tests for the pure parts of scripts/supabase.mjs (no CLI, no network).
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  RETRYABLE_PUSH_ERROR,
  TaskError,
  countTables,
  describeNetworkError,
  describePingStatus,
  knownValues,
  loadEnv,
  main,
  normalizeTypes,
  restUrl,
} from '../supabase.mjs'

const REF = 'abcdefghijklmnopqrst'
const projectUrl = `https://${REF}.${['supabase', 'co'].join('.')}`

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'supabase-mjs-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('loadEnv', () => {
  it('returns the env when every required key is usable', () => {
    const path = join(dir, '.env.local')
    writeFileSync(path, `SUPABASE_PROJECT_REF=${REF}\nSUPABASE_DB_PASSWORD=pw\n`)
    expect(loadEnv(['SUPABASE_PROJECT_REF'], path)).toMatchObject({ SUPABASE_PROJECT_REF: REF })
  })

  it.each([
    ['missing', '', /SUPABASE_DB_PASSWORD is missing/],
    ['empty', 'SUPABASE_DB_PASSWORD=\n', /SUPABASE_DB_PASSWORD is missing/],
    [
      'a placeholder',
      'SUPABASE_DB_PASSWORD=SENSITIVE_ENV_VALUE_PLACEHOLDER\n',
      /Vercel Secret placeholder/,
    ],
  ])('names the key when it is %s, never the value', (_label, content, message) => {
    const path = join(dir, '.env.local')
    writeFileSync(path, content)
    expect(() => loadEnv(['SUPABASE_DB_PASSWORD'], path)).toThrow(message)
    expect(() => loadEnv(['SUPABASE_DB_PASSWORD'], path)).toThrow(TaskError)
  })
})

describe('knownValues', () => {
  it('collects the values to redact, with the host of the project URL', () => {
    expect(
      knownValues({
        SUPABASE_PROJECT_REF: REF,
        SUPABASE_DB_PASSWORD: 'pw',
        VITE_SUPABASE_URL: projectUrl,
      }),
    ).toMatchObject({ ref: REF, password: 'pw', host: new URL(projectUrl).hostname })
  })
})

describe('restUrl', () => {
  it('uses only the origin of the project URL', () => {
    const url = restUrl(`${projectUrl}/rest/v1/?x=1#h`, 'settings', { select: 'id', limit: '1' })
    expect(url.pathname).toBe('/rest/v1/settings')
    expect(url.search).toBe('?select=id&limit=1')
    expect(url.hash).toBe('')
    expect(url.origin).toBe(projectUrl)
  })
})

describe('ping output', () => {
  it.each([
    [200, 'db: ok (200)'],
    [540, 'db: PAUSED (540): restore the project in the Supabase dashboard (HANDOFF.md, Recovery)'],
    [401, 'db: http-401'],
    [404, 'db: http-404'],
  ])('status %i prints %j', (status, line) => {
    expect(describePingStatus(status)).toBe(line)
  })

  it('describes network errors by code, never by message (which contains the host)', () => {
    const error = new TypeError(`fetch failed for ${projectUrl}`, {
      cause: Object.assign(new Error('x'), { code: 'ENOTFOUND' }),
    })
    expect(describeNetworkError(error)).toBe('network error (ENOTFOUND)')
    expect(describeNetworkError(new DOMException('t', 'TimeoutError'))).toBe(
      'network error (timeout)',
    )
    expect(describeNetworkError(undefined)).toBe('network error (unknown)')
  })
})

describe('normalizeTypes', () => {
  const types = 'export type Database = {\r\n  public: {}\r\n}\r\n\r\n\r\n'

  it('writes LF with exactly one trailing newline', () => {
    expect(normalizeTypes(types)).toBe('export type Database = {\n  public: {}\n}\n')
  })

  it('refuses output without the Database type or with a URL', () => {
    expect(() => normalizeTypes('Connecting...')).toThrow(/export type Database/)
    expect(() => normalizeTypes(`export type Database = {}\n// ${projectUrl}\n`)).toThrow(/URL/)
  })
})

describe('countTables', () => {
  it('counts the entries of public.Tables only', () => {
    const text = [
      'export type Database = {',
      '  public: {',
      '    Tables: {',
      '      goals: {',
      '        Row: {',
      '          id: string',
      '        }',
      '      }',
      '      settings: {',
      '      }',
      '    }',
      '    Views: {',
      '      some_view: {',
      '      }',
      '    }',
    ].join('\n')
    expect(countTables(text)).toBe(2)
    expect(countTables('nothing')).toBe(0)
  })
})

describe('RETRYABLE_PUSH_ERROR', () => {
  it.each([
    'FATAL: Tenant or user not found',
    'failed to connect to postgres: dial tcp 1.2.3.4:5432: i/o timeout',
    'connection refused',
  ])('retries %j', (text) => {
    expect(RETRYABLE_PUSH_ERROR.test(text)).toBe(true)
  })

  it.each(['ERROR: syntax error at or near "tabel" (SQLSTATE 42601)', 'relation already exists'])(
    'does not retry SQL errors: %j',
    (text) => {
      expect(RETRYABLE_PUSH_ERROR.test(text)).toBe(false)
    },
  )
})

describe('main', () => {
  it.each([[[]], [['bogus']], [['link', '--dry-run']], [['push', 'extra']]])(
    'rejects %j with the usage line',
    async (argv) => {
      const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
      try {
        await expect(main(argv)).resolves.toBe(1)
        expect(String(stderr.mock.calls[0]?.[0])).toMatch(/^error: usage: /)
      } finally {
        stderr.mockRestore()
      }
    },
  )
})
