// Supabase CLI helpers shared by scripts/supabase.mjs and scripts/setup-supabase.mjs
// (docs/phases/phase-0/PLAN.md sections 8.3 and 8.4).
//
// - The CLI is the local `supabase` devDependency, run with the current Node binary and no shell
//   (npm scripts run in cmd.exe on Windows, and Node refuses to spawn .cmd files without a shell).
// - Every call gets `--agent no` (CLI 2.118 auto-detects AI agents and changes its behaviour) and
//   stdin is ignored, so a prompt reads EOF instead of hanging.
// - Output is captured in memory. Callers print only summaries or text passed through redact().

import { spawnSync } from 'node:child_process'
import { randomInt } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

/** Default time limit of one CLI call. */
export const DEFAULT_TIMEOUT_MS = 180_000

/** Characters of generated database passwords (alphanumeric: safe in URLs, shells and flags). */
export const PASSWORD_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
export const PASSWORD_LENGTH = 32

export class SupabaseCliError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SupabaseCliError'
  }
}

/** Absolute path of the Supabase CLI's JS entry (the `bin` of the local `supabase` package). */
export function resolveSupabaseBin() {
  const require = createRequire(import.meta.url)
  let pkgPath
  try {
    pkgPath = require.resolve('supabase/package.json')
  } catch {
    throw new SupabaseCliError('the supabase devDependency is not installed: run `npm ci`')
  }
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  const bin = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.supabase
  if (typeof bin !== 'string') throw new SupabaseCliError('the supabase package has no bin entry')
  return join(dirname(pkgPath), bin)
}

/**
 * Runs the Supabase CLI once. Never throws for a non-zero exit; the caller decides.
 * @param {readonly string[]} args CLI arguments (without --agent)
 * @param {{ env?: Record<string, string>, timeoutMs?: number, cwd?: string }} [options]
 * @returns {{ status: number | null, stdout: string, stderr: string, timedOut: boolean, error?: string }}
 */
export function runSupabase(args, options = {}) {
  const result = spawnSync(process.execPath, [resolveSupabaseBin(), ...args, '--agent', 'no'], {
    cwd: options.cwd ?? process.cwd(),
    env: { ...process.env, NO_COLOR: '1', ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    windowsHide: true,
  })
  const timedOut = result.error?.code === 'ETIMEDOUT'
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut,
    ...(result.error ? { error: result.error.code ?? result.error.name } : {}),
  }
}

/**
 * Parses CLI JSON output. Tolerates text around the JSON (for example a notice line) by taking
 * the outermost array or object. Returns undefined when nothing parses.
 * @param {string} text
 */
export function parseJsonOutput(text) {
  const trimmed = text.trim()
  if (trimmed === '') return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    // fall through: look for the outermost JSON value
  }
  for (const [open, close] of [
    ['[', ']'],
    ['{', '}'],
  ]) {
    const start = trimmed.indexOf(open)
    const end = trimmed.lastIndexOf(close)
    if (start !== -1 && end > start) {
      try {
        return JSON.parse(trimmed.slice(start, end + 1))
      } catch {
        // try the other shape
      }
    }
  }
  return undefined
}

/**
 * Normalises the two JSON shapes of CLI 2.118 into rows: `-o json` gives a bare array,
 * `--output-format json` gives an envelope such as `{ projects: [...], message }`.
 * @param {unknown} json
 * @returns {Record<string, unknown>[] | undefined} undefined when the shape is not recognised
 */
export function rows(json) {
  if (Array.isArray(json)) return json
  if (json && typeof json === 'object') {
    const arrays = Object.values(json).filter(Array.isArray)
    if (arrays.length === 1) return arrays[0]
  }
  return undefined
}

/**
 * The single object in a create response: the object itself, or the only object inside an
 * envelope such as `{ project: {...}, message }`.
 * @param {unknown} json
 * @returns {Record<string, unknown> | undefined}
 */
export function singleObject(json) {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return Array.isArray(json) && json.length === 1 && json[0] && typeof json[0] === 'object'
      ? json[0]
      : undefined
  }
  if ('ref' in json || 'id' in json) return /** @type {Record<string, unknown>} */ (json)
  const objects = Object.values(json).filter(
    (value) => value && typeof value === 'object' && !Array.isArray(value),
  )
  return objects.length === 1 ? /** @type {Record<string, unknown>} */ (objects[0]) : undefined
}

/** The two JSON output flags of CLI 2.118, in the order they are tried. */
export const JSON_FORMATS = Object.freeze([
  Object.freeze(['-o', 'json']),
  Object.freeze(['--output-format', 'json']),
])

/**
 * Runs a read-only JSON command with `-o json`, and once more with `--output-format json` when
 * that fails or stdout does not parse (repeating a read-only call is harmless). Never use this
 * for commands with side effects (projects create).
 * @param {readonly string[]} args
 * @param {{ env?: Record<string, string>, timeoutMs?: number, run?: typeof runSupabase }} [options]
 * @returns {{ ok: true, json: unknown } | { ok: false, reason: string, lastResult?: ReturnType<typeof runSupabase> }}
 */
export function runReadOnlyJson(args, options = {}) {
  const run = options.run ?? runSupabase
  let reason = ''
  let lastResult
  for (const format of JSON_FORMATS) {
    const result = run([...args, ...format], options)
    lastResult = result
    if (result.status !== 0) {
      reason = result.timedOut ? 'timed out' : `exit ${result.status ?? result.error ?? 'unknown'}`
      continue
    }
    const json = parseJsonOutput(result.stdout)
    if (json !== undefined) return { ok: true, json }
    reason = 'unparsable output'
  }
  return { ok: false, reason, lastResult }
}

/**
 * Generates a database password: PASSWORD_LENGTH characters drawn uniformly from
 * PASSWORD_ALPHABET with crypto.randomInt.
 */
export function generatePassword(length = PASSWORD_LENGTH) {
  let out = ''
  for (let i = 0; i < length; i += 1) out += PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]
  return out
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Removes secrets and identifiers from CLI output before it is printed.
 * @param {string} text
 * @param {{ ref?: string, password?: string, host?: string, secrets?: readonly (string | undefined)[] }} known
 */
export function redact(text, known = {}) {
  let out = String(text)
  const replacements = [
    [known.password, '***'],
    ...(known.secrets ?? []).map((value) => [value, '***']),
    [known.host, '<host>'],
    [known.ref, '<ref>'],
  ]
  for (const [value, replacement] of replacements) {
    if (typeof value === 'string' && value.length >= 6) {
      out = out.replace(new RegExp(escapeRegExp(value), 'gi'), replacement)
    }
  }
  return out
    .replace(/postgres(?:ql)?:\/\/[^\s@/]+@/gi, 'postgresql://***@')
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, 'sb_***')
    .replace(/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]*/g, '<jwt>')
    .replace(/\b[a-z]{20}\.(?:pooler\.)?supabase\.(?:co|in|com)\b/g, '<host>')
    .replace(/\b[a-z0-9-]+\.pooler\.supabase\.(?:co|in|com)\b/g, '<pooler-host>')
    .replace(/\bpostgres\.[a-z]{20}\b/g, 'postgres.<ref>')
}

/**
 * Redacted, trimmed CLI output (at most `maxLines` lines from the end). stderr comes first: the
 * CLI writes its progress there and the result to stdout.
 */
export function formatOutput(result, known, maxLines = 60) {
  const text = `${result.stderr}\n${result.stdout}`.trim()
  if (text === '') return ''
  const lines = redact(text, known).split('\n')
  return lines.slice(-maxLines).join('\n')
}

/** Resolves after `ms` milliseconds. */
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
