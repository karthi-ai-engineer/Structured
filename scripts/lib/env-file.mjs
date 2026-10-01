// .env file reader/writer shared by every repo script (docs/phases/phase-0/PLAN.md section 8.1).
//
// - Reads UTF-8 (a BOM is stripped) and refuses UTF-16, which PowerShell redirection produces.
// - Writes atomically (temp file in the same folder, then rename), LF only, UTF-8 without a BOM,
//   and keeps every other line and comment.
// - Never prints a value, except `get`, which exists only for piping into a shell variable.
//
// CLI (run with plain node):
//   node scripts/lib/env-file.mjs check [--file .env.local] [--allow-missing KEY,KEY]
//   node scripts/lib/env-file.mjs get <file> <KEY>          raw value on stdout, no newline
//   printf '%s' "$value" | node scripts/lib/env-file.mjs set <KEY> [--file .env.local]

import { randomBytes } from 'node:crypto'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { parseEnv } from 'node:util'

/** The app keys documented in .env.example (PLAN.md section 5.10). */
export const APP_KEYS = Object.freeze([
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SUPABASE_DB_PASSWORD',
  'SUPABASE_PROJECT_REF',
  'VERCEL_PROJECT_NAME',
  'PROD_URL',
  'MCP_SECRET',
])

/** Keys whose values must never appear in the repo, commit messages or logs (leak check). */
export const SENSITIVE_KEYS = Object.freeze([...APP_KEYS, 'VERCEL_OIDC_TOKEN'])

/** Values `vercel env pull` writes for Secret (sensitive) variables. */
export const PLACEHOLDERS = Object.freeze(['SENSITIVE_ENV_VALUE_PLACEHOLDER', '[SENSITIVE]'])

const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
const SAFE_UNQUOTED_RE = /^[A-Za-z0-9_.:/@+=-]*$/
// eslint-disable-next-line no-control-regex -- control characters are exactly what we look for
const CONTROL_RE = /[\u0000-\u001f\u007f]/
const ASSIGNMENT_RE = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/

const ENCODING_ADVICE =
  're-save it as UTF-8 without BOM (never write .env files with PowerShell redirection)'

export class EnvFileError extends Error {
  constructor(message) {
    super(message)
    this.name = 'EnvFileError'
  }
}

/** True when the value is a Vercel Secret placeholder instead of a real value. */
export function isPlaceholder(value) {
  return typeof value === 'string' && PLACEHOLDERS.includes(value.trim())
}

/**
 * Decodes .env bytes: strips a UTF-8 BOM, refuses UTF-16 (with or without BOM) and invalid UTF-8.
 * @param {Uint8Array} bytes
 * @param {string} [label] file name used in error messages
 */
export function decodeEnvBytes(bytes, label = '.env file') {
  const b = bytes
  if (b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))) {
    throw new EnvFileError(`${label} is UTF-16 encoded: ${ENCODING_ADVICE}`)
  }
  if (b.includes(0)) {
    throw new EnvFileError(`${label} contains NUL bytes (UTF-16?): ${ENCODING_ADVICE}`)
  }
  const start = b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf ? 3 : 0
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(b.subarray(start))
  } catch {
    throw new EnvFileError(`${label} is not valid UTF-8: ${ENCODING_ADVICE}`)
  }
}

/** Parses .env text (CRLF tolerated) into a plain object. */
export function parseEnvText(text) {
  return { ...parseEnv(text.replace(/\r\n?/g, '\n')) }
}

function readTextOrNull(path) {
  let bytes
  try {
    bytes = readFileSync(path)
  } catch (error) {
    if (error && error.code === 'ENOENT') return null
    throw error
  }
  return decodeEnvBytes(bytes, basename(path))
}

/** Reads and parses an .env file. A missing file gives `{}`. */
export function readEnvFile(path) {
  const text = readTextOrNull(path)
  return text === null ? {} : parseEnvText(text)
}

/** True when the file exists (and is readable). */
export function envFileExists(path) {
  try {
    readFileSync(path)
    return true
  } catch {
    return false
  }
}

/**
 * Formats a value for a `KEY=value` line. Quotes only when needed, and verifies that the result
 * parses back to exactly the same value.
 */
export function formatEnvValue(key, value) {
  if (typeof value !== 'string') throw new EnvFileError(`${key}: value must be a string`)
  if (/[\r\n]/.test(value))
    throw new EnvFileError(`${key}: values containing a newline are rejected`)
  if (CONTROL_RE.test(value))
    throw new EnvFileError(`${key}: values containing control characters are rejected`)
  const candidates = SAFE_UNQUOTED_RE.test(value)
    ? [value]
    : [`'${value}'`, `\`${value}\``, `"${value}"`].filter((quoted) => {
        const quote = quoted[0]
        return !value.includes(quote)
      })
  for (const candidate of candidates) {
    if (parseEnvText(`${key}=${candidate}\n`)[key] === value) return candidate
  }
  throw new EnvFileError(`${key}: the value cannot be stored safely in an .env file`)
}

/**
 * Sets keys in an .env file, keeping every other line and comment. Existing keys are replaced in
 * place (later duplicates are removed); new keys are appended. Atomic, LF, UTF-8 without BOM.
 * @param {string} path
 * @param {Record<string, string>} updates
 */
export function updateEnvFile(path, updates) {
  const entries = Object.entries(updates)
  for (const [key] of entries) {
    if (!KEY_RE.test(key)) throw new EnvFileError(`invalid variable name: ${JSON.stringify(key)}`)
  }
  const formatted = new Map(entries.map(([key, value]) => [key, formatEnvValue(key, value)]))

  const text = readTextOrNull(path) ?? ''
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()

  const written = new Set()
  const out = []
  for (const line of lines) {
    const match = ASSIGNMENT_RE.exec(line)
    const key = match?.[1]
    if (key !== undefined && formatted.has(key)) {
      if (!written.has(key)) {
        out.push(`${key}=${formatted.get(key)}`)
        written.add(key)
      }
      continue
    }
    out.push(line)
  }
  for (const [key, value] of formatted) {
    if (!written.has(key)) out.push(`${key}=${value}`)
  }

  const content = `${out.join('\n')}\n`
  // Same folder (so rename is atomic) and, for .env.local, still matched by the .env.* ignore rule.
  const tmp = join(
    dirname(path),
    `${basename(path)}.tmp-${process.pid}-${randomBytes(4).toString('hex')}`,
  )
  try {
    writeFileSync(tmp, content, { encoding: 'utf8', mode: 0o600 })
    renameSync(tmp, path)
  } catch (error) {
    rmSync(tmp, { force: true })
    throw error
  }
}

/**
 * Classifies a value for `check`: ok | missing | empty | placeholder | whitespace.
 * @param {string | undefined} value
 */
export function classifyValue(value) {
  if (value === undefined) return 'missing'
  if (value === '') return 'empty'
  if (isPlaceholder(value)) return 'placeholder'
  if (value !== value.trim() || CONTROL_RE.test(value)) return 'whitespace'
  return 'ok'
}

/**
 * Checks the app keys. Returns printable lines (names and statuses only) and whether all are ok.
 * @param {Record<string, string>} env
 * @param {{ allowMissing?: readonly string[] }} [options]
 */
export function checkAppKeys(env, options = {}) {
  const allowMissing = new Set(options.allowMissing ?? [])
  const lines = []
  let ok = true
  for (const key of APP_KEYS) {
    const status = classifyValue(env[key])
    if (status === 'ok') {
      lines.push(`${key}: ok`)
    } else if ((status === 'missing' || status === 'empty') && allowMissing.has(key)) {
      lines.push(`${key}: ${status} (allowed)`)
    } else {
      lines.push(`${key}: ${status}`)
      ok = false
    }
  }
  return { ok, lines }
}

function takeOption(args, name) {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) throw new EnvFileError(`${name} needs a value`)
  args.splice(index, 2)
  return value
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch (error) {
    if (error && error.code === 'EAGAIN') return ''
    throw error
  }
}

/** CLI entry point; returns the exit code. */
export function main(
  argv,
  io = { stdout: process.stdout, stderr: process.stderr, stdin: readStdin },
) {
  const args = [...argv]
  const command = args.shift()
  try {
    switch (command) {
      case 'check': {
        const file = takeOption(args, '--file') ?? '.env.local'
        const allow = takeOption(args, '--allow-missing')
        if (args.length > 0) throw new EnvFileError(`unexpected arguments: ${args.join(' ')}`)
        if (!envFileExists(file)) {
          io.stderr.write(`${file}: not found (see HANDOFF.md to restore it)\n`)
          return 1
        }
        const allowMissing = allow
          ? allow
              .split(',')
              .map((key) => key.trim())
              .filter(Boolean)
          : []
        const result = checkAppKeys(readEnvFile(file), { allowMissing })
        io.stdout.write(`${result.lines.join('\n')}\n`)
        return result.ok ? 0 : 1
      }
      case 'get': {
        const [file, key, ...rest] = args
        if (!file || !key || rest.length > 0) throw new EnvFileError('usage: get <file> <KEY>')
        if (!envFileExists(file)) {
          io.stderr.write(`${file}: not found\n`)
          return 1
        }
        const value = readEnvFile(file)[key]
        if (value !== undefined) io.stdout.write(value)
        return 0
      }
      case 'set': {
        const file = takeOption(args, '--file') ?? '.env.local'
        const [key, ...rest] = args
        if (!key || rest.length > 0)
          throw new EnvFileError('usage: set <KEY> [--file .env.local] (value on stdin)')
        const value = io.stdin().replace(/\r?\n$/, '')
        if (value === '') throw new EnvFileError(`${key}: no value on stdin`)
        updateEnvFile(file, { [key]: value })
        io.stdout.write(`${key}: set\n`)
        return 0
      }
      default:
        throw new EnvFileError(
          'usage: env-file.mjs <check|get|set> ... (see the header of scripts/lib/env-file.mjs)',
        )
    }
  } catch (error) {
    if (error instanceof EnvFileError) {
      io.stderr.write(`error: ${error.message}\n`)
      return 1
    }
    throw error
  }
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2))
}
