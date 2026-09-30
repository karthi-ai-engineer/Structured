import { describe, expect, it } from 'vitest'
import { readSupabaseEnv, SUPABASE_ENV_VARS, type SupabaseEnv } from '@/data/env'

// Key-shaped fixtures are built at runtime, so the source never contains a string that the
// leak checker (scripts/checks/leaks.mjs) would flag.
const publishable = (tail = 'Ab12Cd34Ef56Gh78Ij90Kl') => ['sb', 'publishable', tail].join('_')
const secret = (tail = 'Ab12Cd34Ef56Gh78Ij90Kl') => ['sb', 'secret', tail].join('_')
function jwt(payload: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  return [encode({ alg: 'HS256', typ: 'JWT' }), encode(payload), 'c2lnbmF0dXJl'].join('.')
}

const URL_VAR = 'VITE_SUPABASE_URL'
const KEY_VAR = 'VITE_SUPABASE_PUBLISHABLE_KEY'
const GOOD_URL = 'https://demo-project.supabase.co'
const anonJwt = jwt({ iss: 'supabase', role: 'anon' })
const serviceJwt = jwt({ iss: 'supabase', role: 'service_role' })

function read(url: string | undefined, key: string | undefined, requirePublishable = false) {
  return readSupabaseEnv({ [URL_VAR]: url, [KEY_VAR]: key }, { requirePublishable })
}

function problemsOf(result: SupabaseEnv): readonly string[] {
  return result.ok ? [] : result.problems
}

describe('readSupabaseEnv', () => {
  it('accepts a valid URL and publishable key', () => {
    expect(read(GOOD_URL, publishable())).toEqual({
      ok: true,
      url: GOOD_URL,
      publishableKey: publishable(),
    })
    expect(read(GOOD_URL, publishable(), true).ok).toBe(true)
  })

  it('lists both names when both variables are missing', () => {
    expect(readSupabaseEnv({})).toEqual({
      ok: false,
      problems: [`${URL_VAR} is missing`, `${KEY_VAR} is missing`],
    })
    expect(problemsOf(read('', ''))).toEqual([`${URL_VAR} is missing`, `${KEY_VAR} is missing`])
  })

  it('ignores unrelated variables', () => {
    const env = { [URL_VAR]: GOOD_URL, [KEY_VAR]: publishable(), VITE_OTHER: 'x', MODE: 'dev' }
    expect(readSupabaseEnv(env).ok).toBe(true)
  })

  it('exports the variable names in display order', () => {
    expect(SUPABASE_ENV_VARS).toEqual([URL_VAR, KEY_VAR])
  })

  describe.each([
    ['leading whitespace', ` ${GOOD_URL}`, 'has leading or trailing whitespace'],
    ['a trailing newline', `${GOOD_URL}\n`, 'has leading or trailing whitespace'],
    [
      'a control character',
      `https://demo-pro${String.fromCharCode(7)}ject.supabase.co`,
      'contains control characters',
    ],
    ['a DEL character', `${GOOD_URL}${String.fromCharCode(0x7f)}/`, 'contains control characters'],
    ['the REST path', `${GOOD_URL}/rest/v1`, 'without a path'],
    ['a trailing path', `${GOOD_URL}/x/`, 'without a path'],
    ['a query string', `${GOOD_URL}?x=1`, 'query string or fragment'],
    ['an empty query string', `${GOOD_URL}/?`, 'query string or fragment'],
    ['a fragment', `${GOOD_URL}#h`, 'query string or fragment'],
    ['plain http on a public host', 'http://example.com', 'must use https'],
    ['another protocol', 'ftp://demo-project.supabase.co', 'must use https'],
    ['credentials', 'https://user:pw@demo-project.supabase.co', 'user name or password'],
    ['a relative value', 'demo-project.supabase.co', 'not a valid URL'],
    ['the Vercel placeholder', 'SENSITIVE_ENV_VALUE_PLACEHOLDER', 'Vercel Secret placeholder'],
    ['the bracketed placeholder', '[SENSITIVE]', 'Vercel Secret placeholder'],
  ])('rejects a URL with %s', (_label, url, expected) => {
    const problems = problemsOf(read(url, publishable()))

    it('reports exactly one problem, naming the variable', () => {
      expect(problems).toHaveLength(1)
      expect(problems[0]).toMatch(new RegExp(`^${URL_VAR} `))
      expect(problems[0]).toContain(expected)
    })

    it('never echoes the value', () => {
      for (const problem of problems) {
        expect(problem).not.toContain(url.trim())
        expect(problem).not.toContain('demo-project')
      }
    })
  })

  it.each([
    'http://localhost:54321',
    'http://127.0.0.1:54321',
    'https://localhost:54321',
    `${GOOD_URL}/`,
  ])('accepts %s', (url) => {
    expect(read(url, publishable()).ok).toBe(true)
  })

  describe.each([
    ['a secret key', secret(), 'secret key must never be used in the browser', false],
    [
      'a legacy service_role JWT',
      serviceJwt,
      'secret key must never be used in the browser',
      false,
    ],
    [
      'the Vercel placeholder',
      'SENSITIVE_ENV_VALUE_PLACEHOLDER',
      'Vercel Secret placeholder',
      false,
    ],
    ['the bracketed placeholder', '[SENSITIVE]', 'Vercel Secret placeholder', false],
    ['trailing whitespace', `${publishable()} `, 'leading or trailing whitespace', false],
    [
      'a control character',
      `${publishable()}${String.fromCharCode(0)}x`,
      'control characters',
      false,
    ],
    ['only the prefix', publishable(''), 'not a valid publishable key', false],
    ['an inner space', publishable('Ab12 Cd34'), 'not a valid publishable key', false],
    [
      'an unknown format',
      'not-a-key-at-all',
      'neither a publishable key nor a legacy anon key',
      false,
    ],
    ['a JWT without a role', jwt({ iss: 'supabase' }), 'neither a publishable key', false],
    [
      'a malformed JWT payload',
      `${anonJwt.split('.')[0] ?? ''}.%%%.sig`,
      'neither a publishable key',
      false,
    ],
    [
      'a JWT payload that is not JSON',
      `${anonJwt.split('.')[0] ?? ''}.${btoa('nope').replace(/=+$/, '')}.sig`,
      'neither a publishable key',
      false,
    ],
    ['a legacy anon JWT in a production build', anonJwt, 'must be a publishable key', true],
  ])('rejects a key that is %s', (_label, key, expected, requirePublishable) => {
    const problems = problemsOf(read(GOOD_URL, key, requirePublishable))

    it('reports exactly one problem, naming the variable', () => {
      expect(problems).toHaveLength(1)
      expect(problems[0]).toMatch(new RegExp(`^${KEY_VAR} `))
      expect(problems[0]).toContain(expected)
    })

    it('never echoes the value', () => {
      for (const problem of problems) {
        if (key.trim().length >= 4) expect(problem).not.toContain(key.trim())
        expect(problem).not.toContain('Ab12')
      }
    })
  })

  it('accepts a legacy anon JWT outside production builds', () => {
    expect(read(GOOD_URL, anonJwt)).toEqual({ ok: true, url: GOOD_URL, publishableKey: anonJwt })
  })

  it('reports a URL problem and a key problem together', () => {
    const problems = problemsOf(read(`${GOOD_URL}/rest/v1`, secret()))
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(new RegExp(`^${URL_VAR} `))
    expect(problems[1]).toMatch(new RegExp(`^${KEY_VAR} `))
  })
})
