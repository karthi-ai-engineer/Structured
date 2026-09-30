// Supabase tasks for npm scripts (docs/phases/phase-0/PLAN.md section 8.3, D0-18).
//
//   node scripts/supabase.mjs link                 link the CLI to SUPABASE_PROJECT_REF
//   node scripts/supabase.mjs push [--dry-run]     db push --linked (retries on connection errors)
//   node scripts/supabase.mjs migrations           migration list --linked (local vs remote)
//   node scripts/supabase.mjs types                regenerate src/data/database.types.ts
//   node scripts/supabase.mjs ping                 REST probe: db: ok (200) | PAUSED (540) | ...
//   node scripts/supabase.mjs settings             settings row: present, timezone=... | missing
//
// Values come from .env.local (read with the shared parser; npm scripts run in cmd.exe on
// Windows, so `$VAR` cannot be used). CLI output is printed only after the ref, the database
// password, the keys and the project host are replaced with <ref>, *** and <host>.

import { readFileSync, writeFileSync } from 'node:fs'
import { isPlaceholder, readEnvFile } from './lib/env-file.mjs'
import { formatOutput, runSupabase, sleep } from './lib/supabase-cli.mjs'

export const TYPES_FILE = 'src/data/database.types.ts'
const LINKED_REF_FILE = 'supabase/.temp/project-ref'
const ENV_FILE = '.env.local'
const USAGE =
  'usage: node scripts/supabase.mjs <link|push|migrations|types|ping|settings> [--dry-run]'

/** Errors worth retrying for db push: the pooler or tenant is not reachable yet (P18). */
export const RETRYABLE_PUSH_ERROR =
  /Tenant or user not found|connection refused|connection reset|failed to connect|could not connect|connect(?:ion)? timed out|i\/o timeout|dial tcp|no such host|ECONNRESET|ETIMEDOUT|EAI_AGAIN|server closed the connection|timeout: context deadline exceeded/i

/** Waits between db push attempts (about three minutes in total). */
export const PUSH_RETRY_DELAYS_MS = Object.freeze([30_000, 60_000, 90_000])

export class TaskError extends Error {
  constructor(message) {
    super(message)
    this.name = 'TaskError'
  }
}

/**
 * Reads .env.local and checks that the given keys are usable. Messages name keys, never values.
 * @param {readonly string[]} required
 */
export function loadEnv(required, path = ENV_FILE) {
  const env = readEnvFile(path)
  for (const key of required) {
    const value = env[key]
    if (value === undefined || value.trim() === '') {
      throw new TaskError(`${key} is missing in ${path} (see HANDOFF.md to restore it)`)
    }
    if (isPlaceholder(value)) {
      throw new TaskError(
        `${key} in ${path} is a Vercel Secret placeholder; restore the real value (HANDOFF.md)`,
      )
    }
  }
  return env
}

function hostOf(value) {
  try {
    return new URL(String(value ?? '').trim()).hostname || undefined
  } catch {
    return undefined
  }
}

/** Values to redact from CLI output. */
export function knownValues(env) {
  return {
    ref: env.SUPABASE_PROJECT_REF,
    password: env.SUPABASE_DB_PASSWORD,
    host: hostOf(env.VITE_SUPABASE_URL),
    secrets: [env.SUPABASE_SECRET_KEY, env.VITE_SUPABASE_PUBLISHABLE_KEY],
  }
}

/** The REST endpoint of a table, built from the project URL (only its origin is used). */
export function restUrl(projectUrl, table, query) {
  const url = new URL(String(projectUrl).trim())
  url.pathname = `/rest/v1/${table}`
  url.search = new URLSearchParams(query).toString()
  url.hash = ''
  return url
}

/**
 * The single line `ping` prints for an HTTP status.
 * @param {number} status
 */
export function describePingStatus(status) {
  if (status === 200) return 'db: ok (200)'
  if (status === 540) {
    return 'db: PAUSED (540): restore the project in the Supabase dashboard (HANDOFF.md, Recovery)'
  }
  return `db: http-${status}`
}

/** A network error without the host (Node puts the host into the message, so it is not used). */
export function describeNetworkError(error) {
  const code = error?.cause?.code ?? (error?.name === 'TimeoutError' ? 'timeout' : error?.name)
  return `network error (${code ?? 'unknown'})`
}

/**
 * Normalises generated types: LF only, exactly one trailing newline.
 * @param {string} text
 */
export function normalizeTypes(text) {
  const normalized = `${text.replace(/\r\n?/g, '\n').replace(/\s+$/, '')}\n`
  if (!normalized.includes('export type Database')) {
    throw new TaskError('the generated types do not contain `export type Database`')
  }
  if (/https?:\/\//.test(normalized) || /supabase\.(?:co|in)\b/.test(normalized)) {
    throw new TaskError('the generated types contain a URL; refusing to write them')
  }
  return normalized
}

/** Number of tables in the generated `public.Tables` block. */
export function countTables(text) {
  const start = text.indexOf('\n    Tables: {')
  const end = text.indexOf('\n    Views: {', start)
  if (start === -1 || end === -1) return 0
  return (text.slice(start, end).match(/^ {6}[A-Za-z_][A-Za-z0-9_]*: \{$/gm) ?? []).length
}

function print(line) {
  process.stdout.write(`${line}\n`)
}

function printResult(result, env, maxLines = 80) {
  const text = formatOutput(result, knownValues(env), maxLines)
  if (text) print(text)
}

function describeExit(result) {
  if (result.timedOut) return 'timed out'
  return `exit ${result.status ?? result.error ?? 'unknown'}`
}

/** Fails unless the CLI is linked to SUPABASE_PROJECT_REF. */
function assertLinked(env) {
  let linked
  try {
    linked = readFileSync(LINKED_REF_FILE, 'utf8').trim()
  } catch {
    throw new TaskError('the Supabase CLI is not linked: run `npm run db:link` first')
  }
  if (linked !== env.SUPABASE_PROJECT_REF.trim()) {
    throw new TaskError(
      'the Supabase CLI is linked to a different project than SUPABASE_PROJECT_REF: run `npm run db:link`',
    )
  }
}

function dbEnv(env) {
  return { SUPABASE_DB_PASSWORD: env.SUPABASE_DB_PASSWORD }
}

function link() {
  const env = loadEnv(['SUPABASE_PROJECT_REF', 'SUPABASE_DB_PASSWORD'])
  const ref = env.SUPABASE_PROJECT_REF.trim()
  let result = runSupabase(['link', '--project-ref', ref], { env: dbEnv(env) })
  if (result.status !== 0 && /password/i.test(`${result.stdout}\n${result.stderr}`)) {
    // The password normally comes from SUPABASE_DB_PASSWORD; the `=` form keeps it one argument.
    print('link: retrying with the password flag')
    result = runSupabase(['link', '--project-ref', ref, `--password=${env.SUPABASE_DB_PASSWORD}`], {
      env: dbEnv(env),
    })
  }
  printResult(result, env)
  if (result.status !== 0) throw new TaskError(`supabase link failed (${describeExit(result)})`)
  assertLinked(env)
  print('link: ok (the CLI is linked to SUPABASE_PROJECT_REF from .env.local)')
}

async function push(dryRun) {
  const env = loadEnv(['SUPABASE_PROJECT_REF', 'SUPABASE_DB_PASSWORD'])
  assertLinked(env)
  const args = ['db', 'push', '--linked', '--yes', ...(dryRun ? ['--dry-run'] : [])]
  for (let attempt = 0; ; attempt += 1) {
    const result = runSupabase(args, { env: dbEnv(env) })
    printResult(result, env)
    if (result.status === 0) {
      print(`push: ok${dryRun ? ' (dry run)' : ''}`)
      return
    }
    const retryable = RETRYABLE_PUSH_ERROR.test(`${result.stdout}\n${result.stderr}`)
    const delay = PUSH_RETRY_DELAYS_MS[attempt]
    if (!retryable || delay === undefined) {
      throw new TaskError(
        `supabase db push failed (${describeExit(result)}). db commands need outbound TCP 5432 ` +
          'to the pooler (HANDOFF.md, Recovery).',
      )
    }
    print(`push: connection problem; retrying in ${delay / 1000} s`)
    await sleep(delay)
  }
}

function migrations() {
  const env = loadEnv(['SUPABASE_PROJECT_REF', 'SUPABASE_DB_PASSWORD'])
  assertLinked(env)
  const result = runSupabase(['migration', 'list', '--linked'], { env: dbEnv(env) })
  printResult(result, env)
  if (result.status !== 0) {
    throw new TaskError(`supabase migration list failed (${describeExit(result)})`)
  }
}

function types() {
  const env = loadEnv(['SUPABASE_PROJECT_REF'])
  const result = runSupabase([
    'gen',
    'types',
    '--lang',
    'typescript',
    '--project-id',
    env.SUPABASE_PROJECT_REF.trim(),
    '--schema',
    'public',
  ])
  if (result.status !== 0) {
    printResult(result, env)
    throw new TaskError(`supabase gen types failed (${describeExit(result)})`)
  }
  const text = normalizeTypes(result.stdout)
  let previous
  try {
    previous = readFileSync(TYPES_FILE, 'utf8')
  } catch {
    previous = null // first generation
  }
  writeFileSync(TYPES_FILE, text, 'utf8')
  const tables = countTables(text)
  print(
    `types: ${previous === text ? 'unchanged' : 'wrote'} ${TYPES_FILE} ` +
      `(${text.split('\n').length - 1} lines, ${tables} public tables)`,
  )
}

async function fetchRest(env, table, query) {
  const url = restUrl(env.VITE_SUPABASE_URL, table, query)
  return fetch(url, {
    headers: { apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY.trim(), Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  })
}

async function ping() {
  const env = loadEnv(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'])
  let response
  try {
    response = await fetchRest(env, 'settings', { select: 'id', limit: '1' })
  } catch (error) {
    print(`db: ${describeNetworkError(error)}`)
    return 1
  }
  await response.body?.cancel()
  print(describePingStatus(response.status))
  return response.status === 200 ? 0 : 1
}

async function settings() {
  const env = loadEnv(['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'])
  let response
  try {
    response = await fetchRest(env, 'settings', {
      select: 'id,timezone,updated_at',
      id: 'eq.1',
    })
  } catch (error) {
    print(`settings: ${describeNetworkError(error)}`)
    return 1
  }
  if (response.status !== 200) {
    await response.body?.cancel()
    print(`settings: ${describePingStatus(response.status).replace(/^db: /, '')}`)
    return 1
  }
  const body = await response.json()
  const row = Array.isArray(body) ? body[0] : undefined
  if (!row) {
    print('settings row: missing')
    return 0
  }
  print(`settings row: present, timezone=${row.timezone}, updated_at=${row.updated_at}`)
  return 0
}

/** CLI entry point; returns the exit code. */
export async function main(argv) {
  const args = [...argv]
  const command = args.shift()
  const dryRunIndex = args.indexOf('--dry-run')
  const dryRun = dryRunIndex !== -1
  if (dryRun) args.splice(dryRunIndex, 1)
  try {
    if (args.length > 0 || (dryRun && command !== 'push')) throw new TaskError(USAGE)
    switch (command) {
      case 'link':
        link()
        return 0
      case 'push':
        await push(dryRun)
        return 0
      case 'migrations':
        migrations()
        return 0
      case 'types':
        types()
        return 0
      case 'ping':
        return await ping()
      case 'settings':
        return await settings()
      default:
        throw new TaskError(USAGE)
    }
  } catch (error) {
    if (['TaskError', 'EnvFileError', 'SupabaseCliError'].includes(error?.name)) {
      process.stderr.write(`error: ${error.message}\n`)
      return 1
    }
    throw error
  }
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2))
}
