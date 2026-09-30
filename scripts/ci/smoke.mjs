// Production smoke check (docs/phases/phase-0/PLAN.md section 8.11). Used by
// scripts/ci/deploy-prod.sh after every deploy, in CI and locally.
//
//   PROD_URL=... EXPECTED_SHA=<commit> SUPABASE_ENV_FILE=.vercel/.env.production.local \
//     node scripts/ci/smoke.mjs [--expect-protected <vercel deploy stdout file>]
//
// Checks (each prints `ok|FAIL <METHOD> <path> (<status>[, detail])`, paths only, never a URL):
//   1. GET / is 200 text/html with <meta name="build-sha" content="$EXPECTED_SHA"> (retried while
//      the production alias still serves the previous deployment)
//   2. / has the noindex and no-referrer privacy headers
//   3. GET /day/2026-01-01 is 200 text/html (SPA rewrite)
//   4. GET /assets/does-not-exist.js is 404 (assets are never rewritten)
//   5. GET /api and GET /api/not-a-function are 404 (the API namespace is never rewritten)
//   6. GET /robots.txt is 200
//   7. The live database answers the publishable key (GET /rest/v1/settings is 200)
//   8. With --expect-protected: the generated deployment URL needs a Vercel login
//      (Standard Protection; the URL is read from the file and never printed)
// Exit code 1 on any FAIL.

import { readFileSync } from 'node:fs'
import { readEnvFile } from '../lib/env-file.mjs'

export const SHA_RE = /^[0-9a-f]{7,40}$/
export const SHA_ATTEMPTS = 6
export const SHA_RETRY_DELAY_MS = 10_000
export const REQUEST_TIMEOUT_MS = 20_000
export const DEFAULT_SUPABASE_ENV_FILE = '.vercel/.env.production.local'

export class SmokeError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SmokeError'
  }
}

function isLocalHost(hostname) {
  return hostname === 'localhost' || hostname === '127.0.0.1'
}

/**
 * The origin of a URL given in an environment variable. All whitespace is removed first (a
 * secret pasted with a newline must not break the check, F2). Messages never contain the value.
 * @param {string | undefined} raw
 * @param {string} name variable name for messages
 */
export function originOf(raw, name) {
  const value = String(raw ?? '').replace(/\s+/g, '')
  if (value === '') throw new SmokeError(`${name} is not set`)
  let url
  try {
    url = new URL(value)
  } catch {
    throw new SmokeError(`${name} is not a valid URL`)
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocalHost(url.hostname))) {
    throw new SmokeError(`${name} must be an https URL`)
  }
  return url.origin
}

/** The content of <meta name="build-sha" content="...">, or null. */
export function buildShaOf(html) {
  const tag = String(html).match(/<meta\b[^>]*\bname=["']build-sha["'][^>]*>/i)?.[0]
  return tag?.match(/\bcontent=["']([^"']*)["']/i)?.[1] ?? null
}

/** The first generated deployment URL (https://<name>.vercel.app) in `vercel deploy` output. */
export function deploymentUrlFrom(text) {
  return String(text).match(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app\b/i)?.[0] ?? null
}

/** Standard Protection answers 401/403, or redirects to a Vercel login page. */
export function isProtectedResponse(status, location) {
  if (status === 401 || status === 403) return true
  if (status < 300 || status > 399 || !location) return false
  try {
    const host = new URL(location).hostname.toLowerCase()
    return host === 'vercel.com' || host.endsWith('.vercel.com')
  } catch {
    return false
  }
}

/** A short, value-free description of a fetch failure. */
export function describeFetchError(error) {
  if (error?.name === 'AbortError' || error?.name === 'TimeoutError')
    return 'network error (timeout)'
  const code = error?.cause?.code ?? error?.code ?? error?.cause?.name ?? error?.name ?? 'unknown'
  return `network error (${String(code).replace(/[^A-Za-z0-9_-]/g, '')})`
}

function contentType(response) {
  return (response.headers.get('content-type') ?? '').toLowerCase()
}

/**
 * Runs every check. All effects are injectable for tests.
 * @param {{
 *   env?: Record<string, string | undefined>, argv?: string[],
 *   fetch?: typeof fetch, sleep?: (ms: number) => Promise<void>,
 *   log?: (line: string) => void, readFile?: (path: string) => string,
 *   readEnv?: (path: string) => Record<string, string>,
 * }} [deps]
 * @returns {Promise<number>} exit code
 */
export async function runSmoke(deps = {}) {
  const env = deps.env ?? process.env
  const argv = deps.argv ?? []
  const doFetch = deps.fetch ?? globalThis.fetch
  const sleep = deps.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  const log = deps.log ?? ((line) => process.stdout.write(`${line}\n`))
  const readFile = deps.readFile ?? ((path) => readFileSync(path, 'utf8'))
  const readEnv = deps.readEnv ?? readEnvFile

  let protectedFile
  const rest = [...argv]
  const flag = rest.indexOf('--expect-protected')
  if (flag !== -1) {
    protectedFile = rest[flag + 1]
    if (!protectedFile || protectedFile.startsWith('--')) {
      throw new SmokeError('--expect-protected needs the file with the `vercel deploy` output')
    }
    rest.splice(flag, 2)
  }
  if (rest.length > 0) throw new SmokeError(`unexpected arguments: ${rest.join(' ')}`)

  const origin = originOf(env.PROD_URL, 'PROD_URL')
  const expectedSha = String(env.EXPECTED_SHA ?? '').trim()
  if (!SHA_RE.test(expectedSha)) throw new SmokeError('EXPECTED_SHA must be a commit SHA')
  const envFile = env.SUPABASE_ENV_FILE || DEFAULT_SUPABASE_ENV_FILE
  const supabase = readEnv(envFile)
  const sbOrigin = originOf(supabase.VITE_SUPABASE_URL, `VITE_SUPABASE_URL in ${envFile}`)
  const sbKey = String(supabase.VITE_SUPABASE_PUBLISHABLE_KEY ?? '').trim()
  if (sbKey === '') throw new SmokeError(`VITE_SUPABASE_PUBLISHABLE_KEY is missing in ${envFile}`)

  if (env.GITHUB_ACTIONS === 'true') {
    const host = new URL(origin).hostname
    for (const value of [host, host.split('.')[0], new URL(sbOrigin).hostname, sbKey]) {
      if (value) log(`::add-mask::${value}`)
    }
  }

  let failures = 0
  const report = (ok, method, path, status, detail) => {
    if (!ok) failures += 1
    log(`${ok ? 'ok' : 'FAIL'} ${method} ${path} (${status}${detail ? `, ${detail}` : ''})`)
  }

  /** @returns {Promise<Response | { error: string }>} */
  const get = async (base, path, headers = {}) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
    try {
      return await doFetch(`${base}${path}`, {
        method: 'GET',
        headers: { 'cache-control': 'no-cache', ...headers },
        redirect: 'manual',
        signal: controller.signal,
      })
    } catch (error) {
      return { error: describeFetchError(error) }
    } finally {
      clearTimeout(timer)
    }
  }

  // 1 and 2: the home page serves the expected commit, with the privacy headers.
  let home
  let homeDetail = ''
  for (let attempt = 1; attempt <= SHA_ATTEMPTS; attempt += 1) {
    const response = await get(origin, '/')
    if ('error' in response) {
      homeDetail = response.error
    } else {
      const html = await response.text()
      const sha = buildShaOf(html)
      if (
        response.status === 200 &&
        contentType(response).includes('text/html') &&
        sha === expectedSha
      ) {
        home = response
        break
      }
      homeDetail =
        response.status !== 200
          ? `status ${response.status}`
          : !contentType(response).includes('text/html')
            ? 'not text/html'
            : sha === null
              ? 'no build-sha meta'
              : 'build-sha is not the expected commit yet'
    }
    if (attempt < SHA_ATTEMPTS) {
      log(
        `wait GET / (${homeDetail}; retry ${attempt + 1}/${SHA_ATTEMPTS} in ${SHA_RETRY_DELAY_MS / 1000} s)`,
      )
      await sleep(SHA_RETRY_DELAY_MS)
    }
  }
  if (home) {
    report(true, 'GET', '/', 200, `build-sha ${expectedSha.slice(0, 7)}`)
    const robots = (home.headers.get('x-robots-tag') ?? '').toLowerCase()
    const referrer = (home.headers.get('referrer-policy') ?? '').toLowerCase()
    report(
      robots.includes('noindex'),
      'HEADER',
      '/ x-robots-tag',
      robots.includes('noindex') ? 'noindex' : 'missing',
    )
    report(referrer === 'no-referrer', 'HEADER', '/ referrer-policy', referrer || 'missing')
  } else {
    report(false, 'GET', '/', 'no match', homeDetail)
  }

  // 3 to 6: routing.
  const expectStatus = async (path, status, { html = false } = {}) => {
    const response = await get(origin, path)
    if ('error' in response) return report(false, 'GET', path, 'error', response.error)
    await response.arrayBuffer().catch(() => undefined)
    const typeOk = !html || contentType(response).includes('text/html')
    report(
      response.status === status && typeOk,
      'GET',
      path,
      response.status,
      typeOk ? '' : 'not text/html',
    )
  }
  await expectStatus('/day/2026-01-01', 200, { html: true })
  await expectStatus('/assets/does-not-exist.js', 404)
  await expectStatus('/api', 404)
  await expectStatus('/api/not-a-function', 404)
  await expectStatus('/robots.txt', 200)

  // 7: the live database answers the publishable key.
  const db = await get(sbOrigin, '/rest/v1/settings?select=id&limit=1', { apikey: sbKey })
  if ('error' in db) {
    report(false, 'GET', 'db /rest/v1/settings', 'error', db.error)
  } else {
    await db.arrayBuffer().catch(() => undefined)
    const detail =
      db.status === 540
        ? 'Supabase project is paused (restore it in the dashboard)'
        : db.status === 401 || db.status === 403
          ? 'publishable key rejected'
          : ''
    report(db.status === 200, 'GET', 'db /rest/v1/settings', db.status, detail)
  }

  // 8: generated deployment URLs are protected (Standard Protection), production stays public.
  if (protectedFile) {
    let deploymentUrl
    try {
      deploymentUrl = deploymentUrlFrom(readFile(protectedFile))
    } catch {
      deploymentUrl = null // unreadable file: reported below without its path contents
    }
    if (!deploymentUrl) {
      report(false, 'GET', '<deployment>/', 'no URL', 'no deployment URL in the given file')
    } else {
      const response = await get(new URL(deploymentUrl).origin, '/')
      if ('error' in response) {
        report(false, 'GET', '<deployment>/', 'error', response.error)
      } else {
        await response.arrayBuffer().catch(() => undefined)
        const ok = isProtectedResponse(response.status, response.headers.get('location'))
        report(ok, 'GET', '<deployment>/', response.status, ok ? 'protected' : 'NOT protected')
      }
    }
  }

  log(failures === 0 ? 'smoke: ok' : `smoke: ${failures} check(s) failed`)
  return failures === 0 ? 0 : 1
}

if (import.meta.main) {
  try {
    process.exitCode = await runSmoke({ argv: process.argv.slice(2) })
  } catch (error) {
    if (error instanceof SmokeError || error?.name === 'EnvFileError') {
      process.stderr.write(`error: ${error.message}\n`)
      process.exitCode = 1
    } else {
      throw error
    }
  }
}
