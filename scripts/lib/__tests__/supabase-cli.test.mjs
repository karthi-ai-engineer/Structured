// Unit tests for the Supabase CLI helpers. Key-shaped fixtures are built at runtime (P40).
import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  PASSWORD_ALPHABET,
  PASSWORD_LENGTH,
  formatOutput,
  generatePassword,
  parseJsonOutput,
  redact,
  resolveSupabaseBin,
  rows,
  runReadOnlyJson,
  runSupabase,
  singleObject,
} from '../supabase-cli.mjs'

const REF = 'abcdefghijklmnopqrst'
const host = `${REF}.${['supabase', 'co'].join('.')}`
const secretKey = ['sb', 'secret', 'A1b2C3d4E5f6G7h8I9j0'].join('_')
const publishableKey = ['sb', 'publishable', 'Z9y8X7w6V5u4T3s2R1q0'].join('_')
const password = 'Pw' + 'x'.repeat(30)

describe('parseJsonOutput', () => {
  it.each([
    ['a bare array', '[{"ref":"a"}]', [{ ref: 'a' }]],
    ['an envelope', '{"projects":[],"message":""}', { projects: [], message: '' }],
    ['JSON after a notice line', 'A new version is available\n[1,2]', [1, 2]],
    ['JSON with surrounding whitespace', '\n  {"a":1}\n', { a: 1 }],
  ])('parses %s', (_label, text, expected) => {
    expect(parseJsonOutput(text)).toEqual(expected)
  })

  it.each(['', '   ', 'Created project', '{broken'])('returns undefined for %j', (text) => {
    expect(parseJsonOutput(text)).toBeUndefined()
  })
})

describe('rows', () => {
  it('returns a bare array as is', () => {
    expect(rows([{ a: 1 }])).toEqual([{ a: 1 }])
  })
  it('unwraps the single array of an envelope', () => {
    expect(rows({ projects: [{ a: 1 }], message: '' })).toEqual([{ a: 1 }])
    expect(rows({ organizations: [], message: 'ok' })).toEqual([])
  })
  it('rejects unknown shapes', () => {
    expect(rows({ a: [], b: [] })).toBeUndefined()
    expect(rows({ message: 'x' })).toBeUndefined()
    expect(rows('text')).toBeUndefined()
    expect(rows(null)).toBeUndefined()
  })
})

describe('singleObject', () => {
  it('accepts the object, an envelope with one object, or a one-element array', () => {
    expect(singleObject({ ref: REF, name: 'x' })).toEqual({ ref: REF, name: 'x' })
    expect(singleObject({ project: { ref: REF }, message: '' })).toEqual({ ref: REF })
    expect(singleObject([{ id: REF }])).toEqual({ id: REF })
  })
  it('rejects ambiguous or empty shapes', () => {
    expect(singleObject({ a: { ref: 1 }, b: { ref: 2 } })).toBeUndefined()
    expect(singleObject([{}, {}])).toBeUndefined()
    expect(singleObject(undefined)).toBeUndefined()
  })
})

describe('runReadOnlyJson', () => {
  const ok = (stdout) => ({ status: 0, stdout, stderr: 'notice', timedOut: false })

  it('uses -o json first and ignores stderr', () => {
    const calls = []
    const result = runReadOnlyJson(['projects', 'list'], {
      run: (args) => (calls.push(args), ok('[]')),
    })
    expect(result).toEqual({ ok: true, json: [] })
    expect(calls).toEqual([['projects', 'list', '-o', 'json']])
  })

  it('retries once with --output-format json when stdout does not parse', () => {
    const calls = []
    const result = runReadOnlyJson(['orgs', 'list'], {
      run: (args) => (
        calls.push(args),
        args.includes('-o') ? ok('table') : ok('{"organizations":[]}')
      ),
    })
    expect(result).toEqual({ ok: true, json: { organizations: [] } })
    expect(calls[1]).toEqual(['orgs', 'list', '--output-format', 'json'])
  })

  it('retries once after a non-zero exit, then reports the reason', () => {
    const calls = []
    const result = runReadOnlyJson(['projects', 'list'], {
      run: (args) => (calls.push(args), { status: 1, stdout: '', stderr: 'x', timedOut: false }),
    })
    expect(result).toMatchObject({ ok: false, reason: 'exit 1' })
    expect(calls).toHaveLength(2)
  })
})

describe('generatePassword', () => {
  it('is 32 alphanumeric characters and not repeated', () => {
    const a = generatePassword()
    const b = generatePassword()
    expect(a).toHaveLength(PASSWORD_LENGTH)
    expect(a).toMatch(/^[A-Za-z0-9]{32}$/)
    expect(a).not.toBe(b)
  })
  it('draws from the whole alphabet', () => {
    const seen = new Set(generatePassword(4000))
    expect(seen.size).toBe(PASSWORD_ALPHABET.length)
  })
})

describe('redact', () => {
  it('replaces known values, keys, hosts and connection strings', () => {
    const text = [
      `Linked to ${REF} at ${host}`,
      `password ${password} and PW ${password.toUpperCase()}`,
      `keys ${secretKey} ${publishableKey}`,
      `url postgresql://postgres.${REF}:${password}@aws-1-ap-south-1.pooler.${['supabase', 'com'].join('.')}:5432/postgres`,
    ].join('\n')
    const out = redact(text, { ref: REF, password, host, secrets: [secretKey] })
    for (const value of [REF, password, secretKey, publishableKey, host]) {
      expect(out).not.toContain(value)
      expect(out.toLowerCase()).not.toContain(value.toLowerCase())
    }
    expect(out).toContain('<host>')
    expect(out).toContain('***')
  })

  it('redacts generic secrets even without known values', () => {
    const out = redact(`${secretKey} ${host} postgres.${REF}`)
    expect(out).not.toContain(secretKey)
    expect(out).not.toContain(host)
    expect(out).not.toContain(`postgres.${REF}`)
  })

  it('ignores short or missing known values', () => {
    expect(redact('abc def', { ref: 'abc', password: undefined })).toBe('abc def')
  })
})

describe('formatOutput', () => {
  it('prints stderr before stdout, redacted and limited to the last lines', () => {
    const result = { stdout: `done ${REF}`, stderr: 'line1\nline2', status: 0, timedOut: false }
    expect(formatOutput(result, { ref: REF })).toBe('line1\nline2\ndone <ref>')
    expect(formatOutput(result, { ref: REF }, 2)).toBe('line2\ndone <ref>')
    expect(formatOutput({ stdout: '', stderr: '' }, {})).toBe('')
  })
})

describe('the real CLI (local devDependency, no network)', () => {
  it('resolves the bin and runs --version with --agent no and stdin ignored', () => {
    expect(existsSync(resolveSupabaseBin())).toBe(true)
    const result = runSupabase(['--version'], { timeoutMs: 60_000 })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+/)
  }, 90_000)
})
