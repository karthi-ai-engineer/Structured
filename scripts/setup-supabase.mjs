// Idempotent Supabase bootstrap (docs/phases/phase-0/PLAN.md section 8.4, D0-29).
//
//   npm run db:setup
//
// Creates the cloud project `structured` in ap-south-1 in the organization "Karthi labs", or
// reuses it, and records its settings in .env.local. It can be re-run on any machine after a
// partial failure: it never creates a second project, never regenerates an existing database
// password, and never pauses or deletes another project.
//
// - Every CLI call goes through scripts/lib/supabase-cli.mjs (`--agent no`, stdin ignored).
// - Success means exit code 0 plus parsable stdout; stderr is ignored (the CLI writes notices
//   there even on success).
// - `projects create` runs at most once. Any doubt about its outcome is settled by listing the
//   projects again, never by retrying the create.
// - Output: progress lines and `KEY: set` lines only. Values, the ref and the URL are never printed.

import { readEnvFile, updateEnvFile } from './lib/env-file.mjs'
import {
  formatOutput,
  generatePassword,
  parseJsonOutput,
  rows,
  runReadOnlyJson,
  runSupabase,
  singleObject,
  sleep as realSleep,
} from './lib/supabase-cli.mjs'

export const ORG_NAME = 'Karthi labs'
export const PROJECT_NAME = 'structured'
export const REGION = 'ap-south-1'
/** Active free projects allowed per account on the Supabase free plan. */
export const FREE_PROJECT_LIMIT = 2

export const SUPABASE_KEYS = Object.freeze([
  'SUPABASE_PROJECT_REF',
  'SUPABASE_DB_PASSWORD',
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
])

const REF_RE = /^[a-z]{20}$/
/** Project states that do not count against the free limit. */
const INACTIVE_STATUSES = new Set([
  'INACTIVE',
  'PAUSED',
  'PAUSING',
  'PAUSE_FAILED',
  'GOING_DOWN',
  'REMOVED',
  'INIT_FAILED',
  'RESTORE_FAILED',
])

/** A condition only the owner can resolve. The message never contains a value. */
export class Blocker extends Error {
  constructor(message) {
    super(message)
    this.name = 'Blocker'
  }
}

/** The project ref of a `projects list` row (`ref`, or `id` in older shapes). */
export function refOf(project) {
  const ref = project?.ref ?? project?.id
  return typeof ref === 'string' ? ref : ''
}

export function projectUrl(ref) {
  return `https://${ref}.supabase.co`
}

/** True when the project counts against the free limit. */
export function isActiveProject(project) {
  const status = String(project?.status ?? '').toUpperCase()
  return !INACTIVE_STATUSES.has(status)
}

/**
 * Picks the API keys to store: keeps the current value when it is still one of the project's keys
 * of that type (idempotent, survives re-runs), otherwise takes the first key of that type.
 * Legacy JWT keys (anon, service_role) are never used.
 * @param {Record<string, unknown>[]} keys rows of `projects api-keys --reveal`
 * @param {{ publishable?: string, secret?: string }} current
 */
export function pickApiKeys(keys, current = {}) {
  const valuesOf = (type) =>
    keys
      .filter((key) => String(key?.type ?? '').toLowerCase() === type)
      .map((key) => key.api_key ?? key.key)
      .filter((value) => typeof value === 'string' && value.startsWith(`sb_${type}_`))
  const choose = (values, currentValue) =>
    currentValue && values.includes(currentValue) ? currentValue : values[0]
  return {
    publishable: choose(valuesOf('publishable'), current.publishable),
    secret: choose(valuesOf('secret'), current.secret),
  }
}

/**
 * Runs the bootstrap. All side effects are injectable for tests.
 * @param {{
 *   run?: typeof runSupabase,
 *   envPath?: string,
 *   log?: (line: string) => void,
 *   sleep?: (ms: number) => Promise<void>,
 *   now?: () => number,
 *   pollIntervalMs?: number,
 *   pollTimeoutMs?: number,
 *   keysIntervalMs?: number,
 *   keysTimeoutMs?: number,
 *   createPassword?: () => string,
 * }} [deps]
 */
export async function setupSupabase(deps = {}) {
  const run = deps.run ?? runSupabase
  const envPath = deps.envPath ?? '.env.local'
  const log = deps.log ?? ((line) => process.stdout.write(`${line}\n`))
  const sleep = deps.sleep ?? realSleep
  const now = deps.now ?? (() => Date.now())
  const pollIntervalMs = deps.pollIntervalMs ?? 10_000
  const pollTimeoutMs = deps.pollTimeoutMs ?? 10 * 60_000
  const keysIntervalMs = deps.keysIntervalMs ?? 20_000
  const keysTimeoutMs = deps.keysTimeoutMs ?? 5 * 60_000
  const createPassword = deps.createPassword ?? generatePassword

  const readRows = (args, what) => {
    const result = runReadOnlyJson(args, { run })
    if (!result.ok) {
      throw new Blocker(
        `supabase ${args.join(' ')} failed (${result.reason}). Log in with \`npx supabase login\` ` +
          '(or set SUPABASE_ACCESS_TOKEN), then re-run `npm run db:setup`.',
      )
    }
    const list = rows(result.json)
    if (!list) throw new Blocker(`unrecognised ${what} output from the Supabase CLI`)
    return list
  }
  const listProjects = () => readRows(['projects', 'list'], 'projects list')

  // 1. Preconditions: logged in, exactly one organization with the expected name.
  let projects = listProjects()
  const orgs = readRows(['orgs', 'list'], 'orgs list').filter(
    (org) =>
      String(org?.name ?? '')
        .trim()
        .toLowerCase() === ORG_NAME.toLowerCase(),
  )
  if (orgs.length !== 1) {
    throw new Blocker(`expected exactly one organization named "${ORG_NAME}", found ${orgs.length}`)
  }
  const org = orgs[0]
  const orgId = String(org.id ?? org.slug ?? '')
  if (!orgId) throw new Blocker(`the organization "${ORG_NAME}" has no id in the CLI output`)
  const inOrg = (project) =>
    project?.organization_id === org.id ||
    (org.slug !== undefined && project?.organization_slug === org.slug)
  const namedInOrg = () => projects.filter((p) => inOrg(p) && p?.name === PROJECT_NAME)
  log(`organization: "${ORG_NAME}" found; ${projects.length} project(s) visible`)

  // 2. Resume, adopt or create.
  let env = readEnvFile(envPath)
  let ref = (env.SUPABASE_PROJECT_REF ?? '').trim()
  const persist = (updates, label) => {
    updateEnvFile(envPath, updates)
    env = readEnvFile(envPath)
    for (const key of Object.keys(updates))
      log(`${key}: saved to .env.local${label ? ` (${label})` : ''}`)
  }

  if (ref) {
    if (!REF_RE.test(ref)) throw new Blocker('SUPABASE_PROJECT_REF in .env.local is malformed')
    const project = projects.find((p) => refOf(p) === ref)
    if (!project) {
      throw new Blocker(
        'SUPABASE_PROJECT_REF in .env.local is not a project this login can access. Fix or remove ' +
          'it (and SUPABASE_DB_PASSWORD if it belongs to another project), then re-run.',
      )
    }
    if (!inOrg(project)) {
      throw new Blocker(`SUPABASE_PROJECT_REF in .env.local belongs to another organization`)
    }
    log('project: reusing the project recorded in .env.local')
  } else {
    const named = namedInOrg()
    if (named.length > 1) {
      throw new Blocker(`more than one project is named "${PROJECT_NAME}"; keep one, then re-run`)
    }
    if (named.length === 1) {
      if (!(env.SUPABASE_DB_PASSWORD ?? '').trim()) {
        throw new Blocker(
          `a project named "${PROJECT_NAME}" already exists, but .env.local has no ` +
            'SUPABASE_DB_PASSWORD. Reset the database password in the Supabase dashboard ' +
            '(Project settings, Database), put it into .env.local, and re-run.',
        )
      }
      ref = refOf(named[0])
      if (!REF_RE.test(ref)) throw new Blocker('the existing project has a malformed ref')
      persist({ SUPABASE_PROJECT_REF: ref, VITE_SUPABASE_URL: projectUrl(ref) }, 'adopted')
      log(`project: adopted the existing "${PROJECT_NAME}" project`)
    } else {
      // 3. Free limit: never pause or delete another project.
      const active = projects.filter(isActiveProject).length
      if (active >= FREE_PROJECT_LIMIT) {
        throw new Blocker(
          `free project limit reached (${active} active projects). Pause or delete a project ` +
            'yourself in the Supabase dashboard, then re-run. This script never touches other projects.',
        )
      }

      // 4. Create, exactly once.
      let password = (env.SUPABASE_DB_PASSWORD ?? '').trim()
      if (!password) {
        password = createPassword()
        persist({ SUPABASE_DB_PASSWORD: password }, 'generated')
      } else {
        log('SUPABASE_DB_PASSWORD: reusing the value in .env.local')
      }
      log(`project: creating "${PROJECT_NAME}" in ${REGION} (this takes a minute or two)`)
      const result = run(
        [
          'projects',
          'create',
          PROJECT_NAME,
          '--org-id',
          orgId,
          '--region',
          REGION,
          `--db-password=${password}`,
          '-o',
          'json',
          '--yes',
        ],
        { timeoutMs: 5 * 60_000 },
      )
      let created = ''
      if (result.status === 0) {
        const object = singleObject(parseJsonOutput(result.stdout))
        const candidate = object ? refOf(object) : ''
        if (REF_RE.test(candidate)) {
          created = candidate
          projects = listProjects() // fresh status for the health poll below
        }
      }
      if (!created) {
        const why =
          result.status === 0
            ? 'unparsable output'
            : result.timedOut
              ? 'timed out'
              : `exit ${result.status ?? result.error ?? 'unknown'}`
        log(`projects create: ${why}; listing the projects again before deciding`)
        projects = listProjects()
        const again = namedInOrg()
        if (again.length === 1 && REF_RE.test(refOf(again[0]))) {
          created = refOf(again[0])
          log(`project: found "${PROJECT_NAME}" after the create call; adopting it`)
        } else {
          const detail = formatOutput(result, { password }, 20)
          if (detail) log(`supabase projects create output (redacted):\n${detail}`)
          throw new Blocker(
            `project creation failed and no "${PROJECT_NAME}" project exists. Check the output above, ` +
              'fix the cause, then re-run `npm run db:setup` (it reuses the saved password).',
          )
        }
      }
      ref = created
      persist({ SUPABASE_PROJECT_REF: ref, VITE_SUPABASE_URL: projectUrl(ref) }, 'created')
    }
  }

  if (!(env.VITE_SUPABASE_URL ?? '').trim()) {
    persist({ VITE_SUPABASE_URL: projectUrl(ref) })
  }
  if (!(env.SUPABASE_DB_PASSWORD ?? '').trim()) {
    throw new Blocker(
      'SUPABASE_DB_PASSWORD is missing in .env.local. Reset the database password in the Supabase ' +
        'dashboard (Project settings, Database), put it into .env.local, and re-run.',
    )
  }

  // 5. Wait until the project is healthy.
  const pollDeadline = now() + pollTimeoutMs
  for (;;) {
    const project = projects.find((p) => refOf(p) === ref)
    const lastStatus = String(project?.status ?? 'unknown')
    if (lastStatus === 'ACTIVE_HEALTHY') break
    if (now() >= pollDeadline) {
      throw new Blocker(
        `the project is not healthy after ${Math.round(pollTimeoutMs / 60_000)} minutes ` +
          `(status ${lastStatus}). If it is paused, restore it in the dashboard; then re-run.`,
      )
    }
    log(`project status: ${lastStatus}; waiting`)
    await sleep(pollIntervalMs)
    projects = listProjects()
  }
  log('project status: ACTIVE_HEALTHY')

  // 6. API keys (new-style publishable and secret keys only; retried while the project warms up).
  const keysDeadline = now() + keysTimeoutMs
  let picked
  for (;;) {
    const result = runReadOnlyJson(['projects', 'api-keys', '--project-ref', ref, '--reveal'], {
      run,
    })
    const keyRows = result.ok ? rows(result.json) : undefined
    if (keyRows) {
      picked = pickApiKeys(keyRows, {
        publishable: env.VITE_SUPABASE_PUBLISHABLE_KEY,
        secret: env.SUPABASE_SECRET_KEY,
      })
      if (picked.publishable && picked.secret) break
    }
    if (now() >= keysDeadline) {
      throw new Blocker(
        'no publishable and secret API key could be read. Create a publishable and a secret API ' +
          'key in the dashboard (Settings, API Keys), then re-run. Legacy keys are never used.',
      )
    }
    log(`api keys: ${result.ok ? 'not available yet' : `read failed (${result.reason})`}; retrying`)
    await sleep(keysIntervalMs)
  }
  const keyUpdates = {}
  if (picked.publishable !== env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    keyUpdates.VITE_SUPABASE_PUBLISHABLE_KEY = picked.publishable
  }
  if (picked.secret !== env.SUPABASE_SECRET_KEY) keyUpdates.SUPABASE_SECRET_KEY = picked.secret
  if (Object.keys(keyUpdates).length > 0) persist(keyUpdates)

  // 7. Summary: names only.
  env = readEnvFile(envPath)
  const lines = SUPABASE_KEYS.map((key) => `${key}: ${(env[key] ?? '').trim() ? 'set' : 'missing'}`)
  for (const line of lines) log(line)
  return { ref }
}

async function main() {
  try {
    await setupSupabase()
    process.stdout.write('db:setup: ok. Next: npm run db:link\n')
    return 0
  } catch (error) {
    if (error instanceof Blocker) {
      process.stderr.write(`BLOCKER: ${error.message}\n`)
      return 1
    }
    if (error?.name === 'EnvFileError' || error?.name === 'SupabaseCliError') {
      process.stderr.write(`error: ${error.message}\n`)
      return 1
    }
    throw error
  }
}

if (import.meta.main) {
  process.exitCode = await main()
}
