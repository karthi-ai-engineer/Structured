// Compares .env.local with the Vercel env matrix and (optionally) adds what is missing
// (docs/phases/phase-0/PLAN.md sections 5.11 and 8.5).
//
//   npm run env:sync-vercel                      report only (read-only)
//   npm run env:sync-vercel -- --apply           add rows that are missing remotely, then verify
//   npm run env:sync-vercel -- --apply --force   also overwrite rows that differ or are Secret
//
// - The Vercel development env is the source of truth for other devices (`vercel env pull`).
//   Without --force, --apply never overwrites a remote value, so a device with an old
//   .env.local cannot undo a key that another device rotated (F24).
// - Output: one `KEY target: status` line per matrix row, then the type check. Names and targets
//   only; values, the project name and IDs are never printed. CLI errors are redacted.
// - Remote values come from `vercel env pull` into a temporary folder that is always deleted.
// - Exit code: 0 when every row is in sync (or missing locally) and every type is right, else 1.

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { randomBytes } from 'node:crypto'
import { APP_KEYS, classifyValue, readEnvFile } from './lib/env-file.mjs'
import { SAFE_ARG_RE, describeFailure, parseJson, runVercel } from './lib/vercel.mjs'

export const ENV_FILE = '.env.local'
export const PROJECT_FILE = '.vercel/project.json'
export const TARGETS = Object.freeze(['production', 'preview', 'development'])

/**
 * Where each variable lives in Vercel and how it is stored (PLAN.md section 5.11).
 * `config` can be pulled back; `secret` (sensitive) cannot. Development cannot be sensitive.
 */
export const MATRIX = Object.freeze([
  { key: 'VITE_SUPABASE_URL', production: 'config', preview: 'config', development: 'config' },
  {
    key: 'VITE_SUPABASE_PUBLISHABLE_KEY',
    production: 'config',
    preview: 'config',
    development: 'config',
  },
  { key: 'SUPABASE_SECRET_KEY', production: 'secret', development: 'config' },
  { key: 'SUPABASE_DB_PASSWORD', development: 'config' },
  { key: 'SUPABASE_PROJECT_REF', development: 'config' },
  { key: 'VERCEL_PROJECT_NAME', development: 'config' },
  { key: 'PROD_URL', development: 'config' },
  // Phase 2: the MCP connector's path secret. Secret in production; Config in development so
  // `vercel env pull` restores it on a new machine.
  { key: 'MCP_SECRET', production: 'secret', development: 'config' },
  // Phase 3: the key that encrypts the nightly backups (also a GitHub secret). Config in
  // development so `vercel env pull` brings it to every machine that may need to decrypt.
  { key: 'BACKUP_PASSPHRASE', development: 'config' },
])

/** The matrix as rows: one per (variable, target). */
export const ROWS = Object.freeze(
  MATRIX.flatMap((entry) =>
    TARGETS.filter((target) => entry[target]).map((target) =>
      Object.freeze({ key: entry.key, target, type: entry[target] }),
    ),
  ),
)

export const STATUS = Object.freeze({
  SAME: 'same',
  DIFFERS: 'differs',
  MISSING_REMOTE: 'missing remotely',
  SECRET: 'unknown (Secret)',
  NOT_PULLED: 'unknown (not in the pulled file)',
  MISSING_LOCAL: 'missing locally (skipped)',
})

export class SyncError extends Error {
  constructor(message) {
    super(message)
    this.name = 'SyncError'
  }
}

/**
 * Problems with present local values (placeholders, whitespace, control characters). A key that
 * is absent or empty is not a problem here: it is reported as missing locally.
 * @param {Record<string, string>} env
 */
export function localValueProblems(env) {
  const problems = []
  for (const key of APP_KEYS) {
    const status = classifyValue(env[key])
    if (status === 'placeholder' || status === 'whitespace') problems.push(`${key}: ${status}`)
  }
  return problems
}

/** The CLI's own type label: Secret for sensitive values, System, or Config. */
export function typeLabel(record) {
  if (record?.type === 'sensitive' || record?.visibility === 'secret') return 'Secret'
  if (record?.type === 'system') return 'System'
  return 'Config'
}

/**
 * Parses `vercel env ls --format json` into names, targets and type labels only (the JSON also
 * holds readable values, which are dropped here and never kept).
 * @param {unknown} json
 * @returns {{ key: string, targets: string[], type: string, gitBranch: string | null }[]}
 */
export function parseEnvRecords(json) {
  const envs = json && typeof json === 'object' ? /** @type {any} */ (json).envs : undefined
  if (!Array.isArray(envs)) throw new SyncError('unexpected `vercel env ls --format json` output')
  return envs
    .filter((env) => env && typeof env.key === 'string')
    .map((env) => ({
      key: env.key,
      targets: Array.isArray(env.target)
        ? env.target.filter((t) => typeof t === 'string')
        : typeof env.target === 'string'
          ? [env.target]
          : [],
      type: typeLabel(env),
      gitBranch: typeof env.gitBranch === 'string' && env.gitBranch !== '' ? env.gitBranch : null,
    }))
}

/** The branch-independent record of a key in a target, if any. */
function recordFor(records, key, target) {
  return records.find((r) => r.key === key && r.targets.includes(target) && r.gitBranch === null)
}

/**
 * Status of one matrix row.
 * @param {{ local: string | undefined, record: { type: string } | undefined, pulled: string | undefined }} input
 */
export function classifyRow({ local, record, pulled }) {
  if (local === undefined || local === '') return STATUS.MISSING_LOCAL
  if (!record) return STATUS.MISSING_REMOTE
  if (record.type === 'Secret') return STATUS.SECRET
  if (pulled === undefined) return STATUS.NOT_PULLED
  return pulled === local ? STATUS.SAME : STATUS.DIFFERS
}

/**
 * Builds the report rows.
 * @param {Record<string, string>} local parsed .env.local
 * @param {Record<string, Record<string, string>>} pulled parsed `env pull` file per target
 * @param {ReturnType<typeof parseEnvRecords>} records
 */
export function buildReport(local, pulled, records) {
  return ROWS.map((row) => {
    const record = recordFor(records, row.key, row.target)
    return {
      ...row,
      status: classifyRow({
        local: local[row.key],
        record,
        pulled: pulled[row.target]?.[row.key],
      }),
      remoteType: record?.type ?? null,
    }
  })
}

/** True when a report row needs no action. A production Secret is expected to be unknown. */
export function rowInSync(row) {
  if (row.status === STATUS.SAME || row.status === STATUS.MISSING_LOCAL) return true
  return row.status === STATUS.SECRET && row.type === 'secret'
}

/**
 * Type problems: every matrix row present remotely must have its planned type (VITE_* must be
 * Config in production and preview, or the bundle ships without them), and app keys must not
 * exist in targets outside the matrix.
 * @param {ReturnType<typeof parseEnvRecords>} records
 */
export function typeProblems(records) {
  const problems = []
  for (const row of ROWS) {
    const record = recordFor(records, row.key, row.target)
    if (!record) continue
    const expected = row.type === 'secret' ? 'Secret' : 'Config'
    if (record.type !== expected) {
      problems.push(`${row.key} ${row.target}: stored as ${record.type}, must be ${expected}`)
    }
  }
  for (const record of records) {
    if (!APP_KEYS.includes(record.key)) continue
    for (const target of record.targets) {
      if (!ROWS.some((row) => row.key === record.key && row.target === target)) {
        problems.push(
          `${record.key} ${target}: not in the env matrix (remove it: vercel env rm ${record.key} ${target})`,
        )
      }
    }
  }
  return problems
}

/** Rows that --apply (and --apply --force) would write. */
export function rowsToWrite(report, { force = false } = {}) {
  return report.filter(
    (row) =>
      row.status === STATUS.MISSING_REMOTE ||
      (force &&
        (row.status === STATUS.DIFFERS ||
          row.status === STATUS.SECRET ||
          row.status === STATUS.NOT_PULLED)),
  )
}

/** CLI arguments of `vercel env add` for a row (the value goes on stdin). */
export function envAddArgs(row, { force = false } = {}) {
  return [
    'env',
    'add',
    row.key,
    row.target,
    '--yes',
    row.type === 'secret' ? '--sensitive' : '--no-sensitive',
    ...(force ? ['--force'] : []),
  ]
}

/** True when the CLI refused a preview variable because it wants a Git branch. */
export function needsGitBranch(result) {
  return /git_branch_required|git[- ]branch/i.test(`${result.stdout}\n${result.stderr}`)
}

/**
 * A new folder for `env pull` output, plus its path as a safe CLI argument (forward slashes).
 * The caller deletes it.
 * @param {string} cwd the linked repo root
 * @param {string} [base] parent folder (the OS temp folder by default)
 */
export function makeTempDir(cwd, base = tmpdir()) {
  const dir = mkdtempSync(join(base, 'structured-env-'))
  const arg = dir.replace(/\\/g, '/')
  if (SAFE_ARG_RE.test(arg)) return { dir, arg }
  rmSync(dir, { recursive: true, force: true })
  // The temp path has characters the CLI helper refuses (for example a space in the user name):
  // use a folder inside the gitignored .vercel/ instead, passed as a relative path.
  const local = mkdtempSync(join(cwd, '.vercel', `tmp-env-${randomBytes(4).toString('hex')}-`))
  return { dir: local, arg: relative(cwd, local).replace(/\\/g, '/') }
}

/**
 * Reads the linked project (.vercel/project.json). The local deploy flow and this script must
 * never run unlinked: the CLI could take its "new project" path (P27).
 */
export function readLinkedProject(cwd = process.cwd()) {
  let json
  try {
    json = JSON.parse(readFileSync(join(cwd, PROJECT_FILE), 'utf8'))
  } catch {
    throw new SyncError(
      `not linked (${PROJECT_FILE} is missing): follow the Vercel link step in HANDOFF.md`,
    )
  }
  if (typeof json?.projectId !== 'string' || typeof json?.orgId !== 'string') {
    throw new SyncError(`${PROJECT_FILE} has no projectId or orgId: re-link (HANDOFF.md)`)
  }
  return json
}

/**
 * Runs the report (and --apply). All effects are injectable for tests.
 * @param {{
 *   apply?: boolean, force?: boolean, cwd?: string,
 *   run?: typeof runVercel, readLocal?: () => Record<string, string>,
 *   readProject?: () => { projectId: string, orgId: string, projectName?: string },
 *   pullDir?: (cwd: string) => { dir: string, arg: string },
 *   readPulled?: (path: string) => Record<string, string>,
 *   log?: (line: string) => void,
 * }} [deps]
 * @returns {Promise<number>} exit code
 */
export async function syncVercelEnv(deps = {}) {
  const cwd = deps.cwd ?? process.cwd()
  const run = deps.run ?? runVercel
  const log = deps.log ?? ((line) => process.stdout.write(`${line}\n`))
  const project = (deps.readProject ?? (() => readLinkedProject(cwd)))()
  const local = (deps.readLocal ?? (() => readEnvFile(join(cwd, ENV_FILE))))()
  const readPulled = deps.readPulled ?? readEnvFile
  const known = [
    ...APP_KEYS.map((key) => local[key]),
    project.projectId,
    project.orgId,
    project.projectName,
  ]

  const localProblems = localValueProblems(local)
  if (localProblems.length > 0) {
    for (const problem of localProblems) log(`error: ${ENV_FILE} ${problem}`)
    throw new SyncError(`fix ${ENV_FILE} first (see HANDOFF.md; never commit it)`)
  }

  const call = (args, options, what) => {
    const result = run(args, { cwd, ...options })
    if (result.status !== 0) {
      throw new SyncError(`${what} failed: ${describeFailure(result, known)}`)
    }
    return result
  }

  const snapshot = () => {
    const listed = call(['env', 'ls', '--format', 'json'], {}, 'vercel env ls')
    const records = parseEnvRecords(parseJson(listed.stdout))
    const temp = (deps.pullDir ?? makeTempDir)(cwd)
    /** @type {Record<string, Record<string, string>>} */
    const pulled = {}
    try {
      for (const target of TARGETS) {
        const file = `${temp.arg}/${target}.env`
        call(
          ['env', 'pull', file, `--environment=${target}`, '--yes'],
          {},
          `vercel env pull (${target})`,
        )
        pulled[target] = readPulled(join(temp.dir, `${target}.env`))
      }
    } finally {
      rmSync(temp.dir, { recursive: true, force: true })
    }
    return { records, report: buildReport(local, pulled, records) }
  }

  const print = ({ records, report }) => {
    for (const row of report) log(`${row.key} ${row.target}: ${row.status}`)
    const problems = typeProblems(records)
    for (const problem of problems) log(`TYPE ${problem}`)
    if (problems.length === 0) {
      log('types: ok (VITE_* are Config in production and preview; the secret key is Secret)')
    }
    return report.every(rowInSync) && problems.length === 0
  }

  let state = snapshot()
  let ok = print(state)

  if (deps.apply) {
    const writes = rowsToWrite(state.report, { force: deps.force })
    if (writes.length === 0) {
      log('apply: nothing to add')
    } else {
      for (const row of writes) {
        const value = local[row.key] ?? ''
        const result = run(
          envAddArgs(row, { force: deps.force && row.status !== STATUS.MISSING_REMOTE }),
          {
            cwd,
            input: value,
          },
        )
        if (result.status === 0) {
          log(
            `apply: ${row.key} ${row.target}: added (${row.type === 'secret' ? 'Secret' : 'Config'})`,
          )
          continue
        }
        if (
          row.target === 'preview' &&
          row.status === STATUS.MISSING_REMOTE &&
          needsGitBranch(result)
        ) {
          // Fallback (PLAN.md section 8.5 item 5): the API adds a preview variable for all branches.
          const body = JSON.stringify({
            key: row.key,
            value,
            type: 'encrypted',
            target: ['preview'],
          })
          call(
            [
              'api',
              `/v10/projects/${project.projectId}/env`,
              '--scope',
              project.orgId,
              '-X',
              'POST',
              '--input',
              '-',
            ],
            { input: body },
            `vercel api env add (${row.key} preview)`,
          )
          log(`apply: ${row.key} ${row.target}: added through the API (Config)`)
          continue
        }
        throw new SyncError(
          `vercel env add ${row.key} ${row.target} failed: ${describeFailure(result, known)}`,
        )
      }
    }
    const skipped = state.report.filter((row) => !rowInSync(row) && !writes.includes(row))
    for (const row of skipped) {
      log(
        `apply: ${row.key} ${row.target}: ${row.status}, not overwritten (use --force, or vercel env rm and --apply)`,
      )
    }
    log('verify:')
    state = snapshot()
    ok = print(state)
  }

  log(ok ? 'env sync: in sync' : 'env sync: NOT in sync (see the lines above)')
  return ok ? 0 : 1
}

async function main(argv) {
  const args = new Set(argv)
  const known = new Set(['--apply', '--force'])
  const unknown = argv.filter((arg) => !known.has(arg))
  if (unknown.length > 0) {
    process.stderr.write(`error: unexpected arguments: ${unknown.join(' ')}\n`)
    return 1
  }
  if (args.has('--force') && !args.has('--apply')) {
    process.stderr.write('error: --force needs --apply\n')
    return 1
  }
  try {
    return await syncVercelEnv({ apply: args.has('--apply'), force: args.has('--force') })
  } catch (error) {
    if (
      error instanceof SyncError ||
      error?.name === 'EnvFileError' ||
      error?.name === 'VercelCliError'
    ) {
      process.stderr.write(`error: ${error.message}\n`)
      return 1
    }
    throw error
  }
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2))
}
