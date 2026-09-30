// Unit tests for the production smoke check. fetch is replaced by an in-memory fake; no network.
// Host- and key-shaped fixtures are built at runtime (never literal, P40).
import { describe, expect, it } from 'vitest'
import {
  SHA_ATTEMPTS,
  SmokeError,
  buildShaOf,
  deploymentUrlFrom,
  describeFetchError,
  isProtectedResponse,
  originOf,
  runSmoke,
} from '../smoke.mjs'

const SHA = 'a'.repeat(40)
const OLD_SHA = 'b'.repeat(40)
const prodHost = ['structured-zz11yy22', 'vercel', 'app'].join('.')
const deployHost = ['structured-zz11yy22-q1w2e3r4t-team', 'vercel', 'app'].join('.')
const sbHost = ['k'.repeat(20), 'supabase', 'co'].join('.')
const sbKey = ['sb', 'publishable', 'P1u2b3l4i5s6h7a8b9l0'].join('_')

const html = (sha) =>
  `<!doctype html><html><head><meta name="build-sha" content="${sha}" /></head></html>`

function response(status, { body = '', headers = {} } = {}) {
  return new Response(status === 204 || status === 304 ? null : body, { status, headers })
}

const GOOD_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer',
}

/** A fake production deployment; `overrides` maps a URL path (or `db`) to a response factory. */
function fakeSite(overrides = {}) {
  const calls = []
  const fetch = async (url, init) => {
    const u = new URL(url)
    calls.push({ url, init })
    const key = u.hostname === sbHost ? 'db' : u.hostname === deployHost ? 'deployment' : u.pathname
    if (overrides[key]) return overrides[key]({ url, init, count: calls.length })
    switch (key) {
      case '/':
        return response(200, { body: html(SHA), headers: GOOD_HEADERS })
      case '/day/2026-01-01':
        return response(200, { body: html(SHA), headers: GOOD_HEADERS })
      case '/robots.txt':
        return response(200, { body: 'User-agent: *', headers: { 'content-type': 'text/plain' } })
      case 'db':
        return response(200, {
          body: '[{"id":1}]',
          headers: { 'content-type': 'application/json' },
        })
      case 'deployment':
        return response(401, { body: 'Authentication Required' })
      default:
        return response(404, { body: 'not found' })
    }
  }
  return { fetch, calls }
}

function run(site, extra = {}) {
  const lines = []
  const sleeps = []
  const promise = runSmoke({
    env: {
      PROD_URL: ` https://${prodHost}/\n`,
      EXPECTED_SHA: SHA,
      SUPABASE_ENV_FILE: 'fake.env',
      ...extra.env,
    },
    argv: extra.argv ?? [],
    fetch: site.fetch,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    log: (line) => lines.push(line),
    readEnv: () => ({
      VITE_SUPABASE_URL: `https://${sbHost}`,
      VITE_SUPABASE_PUBLISHABLE_KEY: sbKey,
    }),
    readFile: extra.readFile ?? (() => `Vercel CLI\nhttps://${deployHost}\n`),
  })
  return { promise, lines, sleeps }
}

const expectNoSecrets = (lines) => {
  const text = lines.filter((l) => !l.startsWith('::add-mask::')).join('\n')
  for (const value of [prodHost, deployHost, sbHost, sbKey, 'https://']) {
    expect(text).not.toContain(value)
  }
}

describe('helpers', () => {
  it('originOf trims whitespace, keeps only the origin and never echoes the value', () => {
    expect(originOf(` https://${prodHost}/some/path?q=1 \n`, 'PROD_URL')).toBe(
      `https://${prodHost}`,
    )
    expect(originOf('http://localhost:4173/', 'X')).toBe('http://localhost:4173')
    for (const bad of [undefined, '', '   ', 'not a url', `http://${prodHost}`, 'ftp://x.y']) {
      let error
      try {
        originOf(bad, 'PROD_URL')
      } catch (caught) {
        error = caught
      }
      expect(error).toBeInstanceOf(SmokeError)
      expect(error.message).toMatch(/^PROD_URL /)
      if (bad && bad.trim()) expect(error.message).not.toContain(bad.trim())
    }
  })

  it.each([
    [html(SHA), SHA],
    [`<meta content='${SHA}' name='build-sha'>`, SHA],
    ['<meta name="build-sha" content="dev" />', 'dev'],
    ['<meta name="other" content="x" />', null],
    ['', null],
  ])('buildShaOf %#', (text, sha) => {
    expect(buildShaOf(text)).toBe(sha)
  })

  it('deploymentUrlFrom finds the generated URL in deploy output', () => {
    expect(deploymentUrlFrom(`Vercel CLI 61\nhttps://${deployHost}\n`)).toBe(
      `https://${deployHost}`,
    )
    expect(deploymentUrlFrom('no url here')).toBeNull()
  })

  it.each([
    [401, null, true],
    [403, null, true],
    [302, 'https://vercel.com/sso-api?url=x', true],
    [307, 'https://auth.vercel.com/login', true],
    [302, 'https://example.com/', false],
    [302, null, false],
    [302, 'not a url', false],
    [200, null, false],
    [404, null, false],
  ])('isProtectedResponse(%i, %j) is %s', (status, location, expected) => {
    expect(isProtectedResponse(status, location)).toBe(expected)
  })

  it('describeFetchError prints only a code', () => {
    const withCause = Object.assign(new TypeError(`fetch failed for https://${prodHost}`), {
      cause: { code: 'ENOTFOUND', message: `getaddrinfo ENOTFOUND ${prodHost}` },
    })
    expect(describeFetchError(withCause)).toBe('network error (ENOTFOUND)')
    expect(describeFetchError(new DOMException('aborted', 'AbortError'))).toBe(
      'network error (timeout)',
    )
    expect(describeFetchError(new TypeError('x'))).toBe('network error (TypeError)')
  })
})

describe('runSmoke', () => {
  it('passes against a healthy deployment and prints paths only', async () => {
    const site = fakeSite()
    const { promise, lines, sleeps } = run(site)
    expect(await promise).toBe(0)
    expect(lines).toEqual([
      `ok GET / (200, build-sha ${SHA.slice(0, 7)})`,
      'ok HEADER / x-robots-tag (noindex)',
      'ok HEADER / referrer-policy (no-referrer)',
      'ok GET /day/2026-01-01 (200)',
      'ok GET /assets/does-not-exist.js (404)',
      'ok GET /api (404)',
      'ok GET /api/not-a-function (404)',
      'ok GET /robots.txt (200)',
      'ok GET db /rest/v1/settings (200)',
      'smoke: ok',
    ])
    expect(sleeps).toEqual([])
    const db = site.calls.find((c) => new URL(c.url).hostname === sbHost)
    expect(db.init.headers.apikey).toBe(sbKey)
    expect(new URL(db.url).pathname).toBe('/rest/v1/settings')
    for (const call of site.calls) expect(call.init.redirect).toBe('manual')
    expectNoSecrets(lines)
  })

  it('retries until the expected build is live', async () => {
    const site = fakeSite({
      '/': ({ count }) =>
        response(200, { body: html(count < 3 ? OLD_SHA : SHA), headers: GOOD_HEADERS }),
    })
    const { promise, lines, sleeps } = run(site)
    expect(await promise).toBe(0)
    expect(sleeps).toEqual([10_000, 10_000])
    expect(lines[0]).toMatch(/^wait GET \/ \(build-sha is not the expected commit yet; retry 2\/6/)
  })

  it('fails after the last attempt when the old build stays live', async () => {
    const site = fakeSite({
      '/': () => response(200, { body: html(OLD_SHA), headers: GOOD_HEADERS }),
    })
    const { promise, lines, sleeps } = run(site)
    expect(await promise).toBe(1)
    expect(sleeps).toHaveLength(SHA_ATTEMPTS - 1)
    expect(lines).toContain('FAIL GET / (no match, build-sha is not the expected commit yet)')
    expect(lines.at(-1)).toBe('smoke: 1 check(s) failed')
  })

  it('reports each broken route, header and the paused database', async () => {
    const site = fakeSite({
      '/': () => response(200, { body: html(SHA), headers: { 'content-type': 'text/html' } }),
      '/day/2026-01-01': () => response(404),
      '/assets/does-not-exist.js': () => response(200, { body: html(SHA), headers: GOOD_HEADERS }),
      '/api': () => response(200, { body: html(SHA), headers: GOOD_HEADERS }),
      db: () => response(540, { body: 'paused' }),
    })
    const { promise, lines } = run(site)
    expect(await promise).toBe(1)
    expect(lines).toEqual(
      expect.arrayContaining([
        'FAIL HEADER / x-robots-tag (missing)',
        'FAIL HEADER / referrer-policy (missing)',
        'FAIL GET /day/2026-01-01 (404, not text/html)',
        'FAIL GET /assets/does-not-exist.js (200)',
        'FAIL GET /api (200)',
        'ok GET /api/not-a-function (404)',
        'FAIL GET db /rest/v1/settings (540, Supabase project is paused (restore it in the dashboard))',
        'smoke: 6 check(s) failed',
      ]),
    )
    expectNoSecrets(lines)
  })

  it('names a rejected publishable key and network errors without hosts', async () => {
    const site = fakeSite({
      db: () => response(401, { body: '{"message":"Invalid API key"}' }),
      '/robots.txt': () => {
        throw Object.assign(new TypeError('fetch failed'), {
          cause: { code: 'ECONNRESET', message: `socket hang up ${prodHost}` },
        })
      },
    })
    const { promise, lines } = run(site)
    expect(await promise).toBe(1)
    expect(lines).toContain('FAIL GET db /rest/v1/settings (401, publishable key rejected)')
    expect(lines).toContain('FAIL GET /robots.txt (error, network error (ECONNRESET))')
    expectNoSecrets(lines)
  })

  it('checks that the generated deployment URL is protected, without printing it', async () => {
    const protectedRun = run(fakeSite(), { argv: ['--expect-protected', 'deploy.out'] })
    expect(await protectedRun.promise).toBe(0)
    expect(protectedRun.lines).toContain('ok GET <deployment>/ (401, protected)')
    expectNoSecrets(protectedRun.lines)

    const open = run(
      fakeSite({ deployment: () => response(200, { body: html(SHA), headers: GOOD_HEADERS }) }),
      { argv: ['--expect-protected', 'deploy.out'] },
    )
    expect(await open.promise).toBe(1)
    expect(open.lines).toContain('FAIL GET <deployment>/ (200, NOT protected)')

    const missing = run(fakeSite(), {
      argv: ['--expect-protected', 'deploy.out'],
      readFile: () => {
        throw new Error('ENOENT')
      },
    })
    expect(await missing.promise).toBe(1)
    expect(missing.lines).toContain(
      'FAIL GET <deployment>/ (no URL, no deployment URL in the given file)',
    )
  })

  it('masks the hosts and the key first when running in GitHub Actions', async () => {
    const { promise, lines } = run(fakeSite(), { env: { GITHUB_ACTIONS: 'true' } })
    expect(await promise).toBe(0)
    expect(lines.slice(0, 4)).toEqual([
      `::add-mask::${prodHost}`,
      '::add-mask::structured-zz11yy22',
      `::add-mask::${sbHost}`,
      `::add-mask::${sbKey}`,
    ])
  })

  it('refuses bad inputs before any request', async () => {
    const site = fakeSite()
    await expect(run(site, { env: { EXPECTED_SHA: 'dev' } }).promise).rejects.toThrow(
      /EXPECTED_SHA/,
    )
    await expect(run(site, { env: { PROD_URL: '' } }).promise).rejects.toThrow(
      /PROD_URL is not set/,
    )
    await expect(run(site, { argv: ['--expect-protected'] }).promise).rejects.toThrow(
      /--expect-protected needs/,
    )
    await expect(run(site, { argv: ['--other'] }).promise).rejects.toThrow(/unexpected arguments/)
    expect(site.calls).toEqual([])
  })
})
