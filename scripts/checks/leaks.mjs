// Leak check (docs/phases/phase-0/PLAN.md section 8.6). Finds secrets, app URLs, the Supabase
// ref/host and the Vercel project name/IDs in repo files, commit messages and logs.
//
//   node scripts/checks/leaks.mjs                  files (tracked + untracked, not ignored) and
//                                                  commit messages in --range / COMMIT_RANGE /
//                                                  origin/main..HEAD
//   node scripts/checks/leaks.mjs --range a..b     same, with an explicit commit range
//   node scripts/checks/leaks.mjs --stdin          text on stdin (for example `gh run view --log`)
//   node scripts/checks/leaks.mjs --files f1 f2    only these files
//
// Output: `LEAK <where>:<line> matches <KEY or pattern name>`. Values are never printed.
// Exit code: 0 clean, 1 on any finding or error.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { SENSITIVE_KEYS, envFileExists, isPlaceholder, readEnvFile } from '../lib/env-file.mjs'
import {
  CheckError,
  isBinaryContent,
  listCommits,
  listRepoFiles,
  readAllStdin,
  readBytesOrNull,
  resolveRange,
  takeOption,
} from '../lib/repo.mjs'

/** Host labels that are documentation examples, not real deployments. */
export const ALLOWED_VERCEL_LABELS = Object.freeze(['example', 'my-app', 'your-app', 'my-project'])

/** Words that are public anyway and must not become "sensitive" host labels. */
const PUBLIC_LABELS = new Set(['structured', 'www', 'app', 'localhost'])

/** Minimum length of a sensitive value (shorter values would match ordinary text). */
export const MIN_SENSITIVE_LENGTH = 8

const PLACEHOLDER_SECRET_RE =
  /^(?:<[^>]*>|\[[^\]]*\]|\$\{?[A-Za-z_][A-Za-z0-9_]*\}?|\*+|x+|\.{3}|…|password|pass|secret)$/i

/**
 * Generic patterns (used in CI too, where no .env.local exists). `allow` receives the match and
 * returns true for documented placeholders and examples.
 */
export const GENERIC_PATTERNS = Object.freeze([
  { name: 'supabase-secret-key', regex: /sb_secret_[A-Za-z0-9_-]{16,}/g },
  { name: 'supabase-publishable-key', regex: /sb_publishable_[A-Za-z0-9_-]{16,}/g },
  { name: 'jwt', regex: /eyJ[\w-]{20,}\.[\w-]{20,}\./g },
  { name: 'supabase-host', regex: /\b[a-z]{20}\.supabase\.(?:co|in)\b/g },
  { name: 'supabase-pooler-user', regex: /\bpostgres\.[a-z]{20}\b/g },
  {
    name: 'db-url-with-password',
    regex: /postgres(?:ql)?:\/\/[^\s:@/]+:([^\s@/]+)@/g,
    allow: (match) => PLACEHOLDER_SECRET_RE.test(match[1] ?? ''),
  },
  {
    name: 'vercel-host',
    regex: /\b([a-z0-9-]+)\.vercel\.app\b/g,
    allow: (match) => ALLOWED_VERCEL_LABELS.includes(match[1] ?? ''),
  },
  { name: 'vercel-project-id', regex: /\bprj_[A-Za-z0-9]{20,}/g },
  { name: 'vercel-team-id', regex: /\bteam_[A-Za-z0-9]{20,}/g },
])

/**
 * @typedef {{ name: string, value: string, ignoreCase?: boolean }} SensitiveValue
 * @typedef {{ line: number, name: string }} Finding
 */

function hostOf(value) {
  try {
    const host = new URL(value.trim()).hostname.toLowerCase()
    return host || null
  } catch {
    return null
  }
}

/**
 * Builds the list of sensitive values from explicit sources only (never from every key of the
 * env file: Vercel adds system variables such as VERCEL_ENV that are public words).
 * @param {Record<string, string>} env parsed .env.local
 * @param {Record<string, unknown> | null} vercelProject parsed .vercel/project.json
 * @returns {SensitiveValue[]}
 */
export function buildSensitiveValues(env, vercelProject = null) {
  /** @type {SensitiveValue[]} */
  const out = []
  const seen = new Set()
  const add = (name, raw, ignoreCase = false) => {
    if (typeof raw !== 'string') return
    const value = raw.trim()
    if (value.length < MIN_SENSITIVE_LENGTH || isPlaceholder(value)) return
    const key = ignoreCase ? value.toLowerCase() : value
    if (seen.has(key)) return
    seen.add(key)
    out.push({ name, value, ignoreCase })
  }
  for (const key of SENSITIVE_KEYS) {
    add(key, env[key], key === 'VERCEL_PROJECT_NAME')
  }
  for (const key of ['VITE_SUPABASE_URL', 'PROD_URL']) {
    const raw = env[key]
    if (typeof raw !== 'string' || isPlaceholder(raw)) continue
    const host = hostOf(raw)
    if (!host) continue
    add(`${key} host`, host, true)
    const label = host.split('.')[0] ?? ''
    if (!PUBLIC_LABELS.has(label)) add(`${key} host label`, label, true)
  }
  if (vercelProject && typeof vercelProject === 'object') {
    add('.vercel/project.json orgId', vercelProject.orgId)
    add('.vercel/project.json projectId', vercelProject.projectId)
    add('.vercel/project.json projectName', vercelProject.projectName, true)
  }
  return out
}

/** Reads .env.local and .vercel/project.json from the repo root, if they exist. */
export function loadSensitiveValues(cwd = process.cwd()) {
  const envPath = join(cwd, '.env.local')
  const hasEnv = envFileExists(envPath)
  const env = hasEnv ? readEnvFile(envPath) : {}
  let vercelProject
  try {
    vercelProject = JSON.parse(readFileSync(join(cwd, '.vercel', 'project.json'), 'utf8'))
  } catch {
    vercelProject = null // not linked yet (or unreadable): only .env.local values apply
  }
  return {
    hasEnv,
    hasVercelProject: vercelProject !== null,
    values: buildSensitiveValues(env, vercelProject),
  }
}

/**
 * Finds leaks in a text. Reports line numbers and names only, never the matched value.
 * @param {string} text
 * @param {readonly SensitiveValue[]} [sensitive]
 * @returns {Finding[]}
 */
export function findLeaks(text, sensitive = []) {
  /** @type {Finding[]} */
  const findings = []
  const exact = sensitive.filter((s) => !s.ignoreCase)
  const folded = sensitive
    .filter((s) => s.ignoreCase)
    .map((s) => ({ ...s, value: s.value.toLowerCase() }))
  const lines = text.split('\n')
  lines.forEach((line, index) => {
    const names = new Set()
    for (const s of exact) if (line.includes(s.value)) names.add(s.name)
    if (folded.length > 0) {
      const lower = line.toLowerCase()
      for (const s of folded) if (lower.includes(s.value)) names.add(s.name)
    }
    for (const pattern of GENERIC_PATTERNS) {
      for (const match of line.matchAll(pattern.regex)) {
        if (!pattern.allow?.(match)) {
          names.add(pattern.name)
          break
        }
      }
    }
    for (const name of names) findings.push({ line: index + 1, name })
  })
  return findings
}

function parseArgs(argv) {
  const args = [...argv]
  const options = { stdin: false, files: /** @type {string[] | null} */ (null), range: undefined }
  options.range = takeOption(args, '--range')
  const stdinIndex = args.indexOf('--stdin')
  if (stdinIndex !== -1) {
    options.stdin = true
    args.splice(stdinIndex, 1)
  }
  const filesIndex = args.indexOf('--files')
  if (filesIndex !== -1) {
    options.files = args.splice(filesIndex).slice(1)
    if (options.files.length === 0) throw new CheckError('--files needs at least one path')
  }
  if (args.length > 0) throw new CheckError(`unexpected arguments: ${args.join(' ')}`)
  if ((options.stdin || options.files) && options.range) {
    throw new CheckError('--range cannot be combined with --stdin or --files')
  }
  return options
}

/** CLI entry point; returns the exit code. */
export function main(
  argv,
  io = { stdout: process.stdout, stderr: process.stderr, stdin: readAllStdin },
) {
  let options
  try {
    options = parseArgs(argv)
  } catch (error) {
    io.stderr.write(`error: ${error.message}\n`)
    return 1
  }
  try {
    const { hasEnv, hasVercelProject, values } = loadSensitiveValues()
    let count = 0
    const report = (where, text) => {
      for (const f of findLeaks(text, values)) {
        io.stdout.write(`LEAK ${where}:${f.line} matches ${f.name}\n`)
        count += 1
      }
    }
    const scanned = []

    if (options.stdin) {
      report('stdin', io.stdin())
      scanned.push('stdin')
    }
    if (options.files) {
      for (const file of options.files) {
        const bytes = readBytesOrNull(file)
        if (bytes === null) throw new CheckError(`${file}: not found`)
        report(file, bytes.toString('utf8'))
      }
      scanned.push(`${options.files.length} file(s)`)
    }
    if (!options.stdin && !options.files) {
      let files = 0
      for (const file of listRepoFiles()) {
        const bytes = readBytesOrNull(file)
        if (bytes === null || isBinaryContent(file, bytes)) continue
        report(file, bytes.toString('utf8'))
        files += 1
      }
      const range = resolveRange(options.range)
      const commits = listCommits(range)
      for (const commit of commits) report(`commit ${commit.sha.slice(0, 7)}`, commit.message)
      scanned.push(`${files} files`, `${commits.length} commit messages in ${range}`)
    }

    const source = hasEnv
      ? `${values.length} sensitive values from .env.local${hasVercelProject ? ' and .vercel/project.json' : ''}`
      : 'generic patterns only (.env.local not present)'
    if (count > 0) {
      io.stderr.write(
        `leaks: ${count} finding(s) in ${scanned.join(', ')}; ${source}. Values are not printed. ` +
          'Remove them; if anything was pushed, follow the leak-response runbook (HANDOFF.md).\n',
      )
      return 1
    }
    io.stdout.write(`leaks: ok (${scanned.join(', ')}; ${source})\n`)
    return 0
  } catch (error) {
    if (error instanceof CheckError || error?.name === 'EnvFileError') {
      io.stderr.write(`error: ${error.message}\n`)
      return 1
    }
    throw error
  }
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2))
}
