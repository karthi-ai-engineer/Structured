// Vercel CLI helper (docs/phases/phase-0/PLAN.md section 8.2, D0-24).
//
// - The CLI is pinned to one exact version. Keep VERCEL_CLI identical in
//   .github/workflows/deploy.yml and scripts/ci/deploy-prod.sh (checked by `npm run check:hygiene`).
// - `npx` is `npx.cmd` on Windows, and Node refuses to spawn .cmd files without a shell (P29), so
//   the command runs through a shell. Every argument must match SAFE_ARG_RE, which leaves nothing
//   for the shell to interpret. Values never go into arguments: they go through stdin (`input`).
// - Every call adds `--non-interactive`, so the CLI behaves the same for a person and an agent,
//   and a missing input fails instead of waiting for a prompt.
// - Callers never print stdout or stderr raw: they print summaries, or text passed through redact().

import { spawnSync } from 'node:child_process'

/** The exact Vercel CLI version used everywhere (bump all three places in one commit). */
export const VERCEL_CLI = 'vercel@61.1.0'

/** Arguments are limited to characters that no shell (sh or cmd.exe) interprets. */
export const SAFE_ARG_RE = /^[A-Za-z0-9_@.:=/-]+$/

/** Default time limit of one CLI call (npx may download the CLI first). */
export const DEFAULT_TIMEOUT_MS = 300_000

export class VercelCliError extends Error {
  constructor(message) {
    super(message)
    this.name = 'VercelCliError'
  }
}

/**
 * Throws unless every argument is shell-safe. The message never contains the argument itself.
 * @param {readonly string[]} args
 */
export function assertSafeArgs(args) {
  args.forEach((arg, index) => {
    if (typeof arg !== 'string' || !SAFE_ARG_RE.test(arg)) {
      throw new VercelCliError(
        `unsafe Vercel CLI argument #${index + 1} (only [A-Za-z0-9_@.:=/-] are allowed; pass values on stdin)`,
      )
    }
  })
}

/**
 * The shell command line for a CLI call.
 * @param {readonly string[]} args
 */
export function vercelCommand(args) {
  assertSafeArgs(args)
  return ['npx', '--yes', VERCEL_CLI, ...args, '--non-interactive'].join(' ')
}

/**
 * Runs the pinned Vercel CLI once. Never throws for a non-zero exit; the caller decides.
 * @param {readonly string[]} args
 * @param {{ input?: string, cwd?: string, env?: Record<string, string>, timeoutMs?: number }} [options]
 * @returns {{ status: number | null, stdout: string, stderr: string, timedOut: boolean, error?: string }}
 */
export function runVercel(args, options = {}) {
  const result = spawnSync(vercelCommand(args), {
    shell: true,
    cwd: options.cwd ?? process.cwd(),
    input: options.input ?? '',
    encoding: 'utf8',
    env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1', NO_COLOR: '1', ...options.env },
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    windowsHide: true,
  })
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    timedOut: result.error?.code === 'ETIMEDOUT',
    ...(result.error ? { error: result.error.code ?? result.error.name } : {}),
  }
}

/**
 * Parses CLI JSON output, tolerating text around it (the outermost object or array is taken).
 * Returns undefined when nothing parses.
 * @param {string} text
 */
export function parseJson(text) {
  const trimmed = String(text ?? '').trim()
  if (trimmed === '') return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    // fall through: look for the outermost JSON value
  }
  for (const [open, close] of [
    ['{', '}'],
    ['[', ']'],
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Removes values, URLs, hosts, IDs and the project name from CLI output before it is printed.
 * @param {string} text
 * @param {readonly (string | undefined | null)[]} [known] exact values to mask (6+ characters)
 */
export function redact(text, known = []) {
  let out = String(text ?? '')
  const values = [...new Set(known.filter((v) => typeof v === 'string' && v.trim().length >= 6))]
    .map((v) => v.trim())
    .sort((a, b) => b.length - a.length)
  for (const value of values) out = out.replace(new RegExp(escapeRegExp(value), 'gi'), '***')
  return out
    .replace(/https?:\/\/[^\s"'<>]+/g, '[redacted-url]')
    .replace(/[A-Za-z0-9.-]+\.vercel\.app/g, '[redacted-host]')
    .replace(/[a-z]{20}\.supabase\.(?:co|in)/g, '[redacted-host]')
    .replace(/(?:prj|team|dpl)_[A-Za-z0-9]{10,}/g, '[redacted-id]')
    .replace(/sb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, 'sb_***')
    .replace(/eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]*/g, '<jwt>')
    .replace(/[A-Za-z0-9._-]+\/structured-[a-z0-9]{6,}/g, '[redacted-scope/project]')
    .replace(/structured-[a-z0-9]{6,}/g, '[redacted-project]')
}

/**
 * A short, redacted description of a failed call: exit status plus the last lines of output.
 * @param {ReturnType<typeof runVercel>} result
 * @param {readonly (string | undefined | null)[]} [known]
 */
export function describeFailure(result, known = [], maxLines = 20) {
  const status = result.timedOut
    ? 'timed out'
    : `exit ${result.status ?? result.error ?? 'unknown'}`
  const text = `${result.stderr}\n${result.stdout}`.trim()
  if (text === '') return status
  const tail = redact(text, known).split('\n').slice(-maxLines).join('\n')
  return `${status}\n${tail}`
}
