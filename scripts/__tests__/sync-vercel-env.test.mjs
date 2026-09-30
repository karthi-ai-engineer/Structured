// Unit tests for the Vercel env sync. The CLI is replaced by an in-memory fake; no network, no
// real project. Key-, host- and ID-shaped fixtures are built at runtime (never literal, P40).
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  MATRIX,
  ROWS,
  STATUS,
  SyncError,
  buildReport,
  classifyRow,
  envAddArgs,
  localValueProblems,
  makeTempDir,
  needsGitBranch,
  parseEnvRecords,
  readLinkedProject,
  rowInSync,
  rowsToWrite,
  syncVercelEnv,
  typeLabel,
  typeProblems,
} from '../sync-vercel-env.mjs'
import { SAFE_ARG_RE } from '../lib/vercel.mjs'

const join2 = (...parts) => parts.join('')
const LOCAL = Object.freeze({
  VITE_SUPABASE_URL: join2('https://', 'k'.repeat(20), '.supa', 'base.co'),
  VITE_SUPABASE_PUBLISHABLE_KEY: ['sb', 'publishable', 'P1u2b3l4i5s6h7a8b9l0'].join('_'),
  SUPABASE_SECRET_KEY: ['sb', 'secret', 'S1e2c3r4e5t6K7e8y9Z0'].join('_'),
  SUPABASE_DB_PASSWORD: 'Db' + 'p'.repeat(30),
  SUPABASE_PROJECT_REF: 'k'.repeat(20),
  VERCEL_PROJECT_NAME: 'structured-zz11yy22',
  PROD_URL: join2('https://', ['structured-zz11yy22', 'vercel', 'app'].join('.')),
})
const PROJECT = Object.freeze({
  projectId: join2('prj', '_', 'Ab3'.repeat(8)),
  orgId: join2('team', '_', 'Xy9'.repeat(8)),
  projectName: 'structured-zz11yy22',
})

/**
 * An in-memory Vercel project. `records` holds { key, target, type, value }, where type is the
 * API type ('encrypted' = Config, 'sensitive' = Secret).
 */
function fakeVercel(initial = [], options = {}) {
  const records = initial.map((r) => ({ ...r }))
  const calls = []
  const ok = (stdout = '') => ({
    status: 0,
    stdout,
    stderr: 'Vercel CLI 61.1.0\n',
    timedOut: false,
  })
  const run = (args, opts = {}) => {
    calls.push({ args: [...args], input: opts.input })
    const [a, b] = args
    if (a === 'env' && b === 'ls') {
      if (options.lsFails) {
        return {
          status: 1,
          stdout: `Error: project ${PROJECT.projectId} (${PROJECT.projectName}) not found`,
          stderr: '',
          timedOut: false,
        }
      }
      return ok(
        JSON.stringify({
          envs: records.map((r) => ({
            key: r.key,
            value: r.type === 'sensitive' ? undefined : r.value,
            type: r.type,
            target: [r.target],
            gitBranch: null,
          })),
        }),
      )
    }
    if (a === 'env' && b === 'pull') return ok('')
    if (a === 'env' && b === 'add') {
      const [, , key, target] = args
      if (options.previewNeedsBranch && target === 'preview') {
        return {
          status: 1,
          stdout: '{"status":"action_required","reason":"git_branch_required"}',
          stderr: '',
          timedOut: false,
        }
      }
      const type = args.includes('--sensitive') ? 'sensitive' : 'encrypted'
      const existing = records.find((r) => r.key === key && r.target === target)
      if (existing && !args.includes('--force')) {
        return { status: 1, stdout: '', stderr: 'already exists', timedOut: false }
      }
      if (existing) Object.assign(existing, { type, value: opts.input })
      else records.push({ key, target, type, value: opts.input })
      return ok('Added')
    }
    if (a === 'api') {
      const body = JSON.parse(opts.input)
      records.push({ key: body.key, target: body.target[0], type: body.type, value: body.value })
      return ok('{}')
    }
    throw new Error(`unexpected CLI call: ${args.join(' ')}`)
  }
  /** What `env pull` would write for a target (Secrets become the placeholder). */
  const readPulled = (path) => {
    const target = basename(path, '.env')
    const env = { VERCEL_ENV: target, VERCEL_OIDC_TOKEN: 'x'.repeat(40) }
    for (const r of records.filter((x) => x.target === target)) {
      env[r.key] = r.type === 'sensitive' ? '[SENSITIVE]' : r.value
    }
    return env
  }
  return { run, calls, records, readPulled }
}

/** Remote records that exactly match the matrix and LOCAL. */
function inSyncRecords(local = LOCAL) {
  return ROWS.filter((row) => local[row.key] !== undefined).map((row) => ({
    key: row.key,
    target: row.target,
    type: row.type === 'secret' ? 'sensitive' : 'encrypted',
    value: local[row.key],
  }))
}

let lines
const deps = (fake, extra = {}) => ({
  run: fake.run,
  readPulled: fake.readPulled,
  readLocal: () => ({ ...LOCAL }),
  readProject: () => ({ ...PROJECT }),
  pullDir: () => ({ dir: join(tmpdir(), 'never-created-structured-test'), arg: 'tmp' }),
  log: (line) => lines.push(line),
  ...extra,
})
const allText = () => lines.join('\n')
const expectNoValues = (text) => {
  for (const value of [...Object.values(LOCAL), PROJECT.projectId, PROJECT.orgId]) {
    expect(text).not.toContain(value)
  }
}

beforeEach(() => {
  lines = []
})

describe('the env matrix (PLAN.md section 5.11)', () => {
  it('has exactly the planned rows and types', () => {
    expect(ROWS.map((r) => `${r.key} ${r.target} ${r.type}`)).toEqual([
      'VITE_SUPABASE_URL production config',
      'VITE_SUPABASE_URL preview config',
      'VITE_SUPABASE_URL development config',
      'VITE_SUPABASE_PUBLISHABLE_KEY production config',
      'VITE_SUPABASE_PUBLISHABLE_KEY preview config',
      'VITE_SUPABASE_PUBLISHABLE_KEY development config',
      'SUPABASE_SECRET_KEY production secret',
      'SUPABASE_SECRET_KEY development config',
      'SUPABASE_DB_PASSWORD development config',
      'SUPABASE_PROJECT_REF development config',
      'VERCEL_PROJECT_NAME development config',
      'PROD_URL development config',
    ])
    expect(MATRIX).toHaveLength(7)
  })

  it('never stores a development value as Secret (Vercel refuses it)', () => {
    expect(ROWS.filter((r) => r.target === 'development' && r.type === 'secret')).toEqual([])
  })
})

describe('localValueProblems', () => {
  it('flags placeholders and whitespace, but not missing or empty keys', () => {
    expect(
      localValueProblems({
        VITE_SUPABASE_URL: '[SENSITIVE]',
        SUPABASE_SECRET_KEY: ' padded',
        SUPABASE_DB_PASSWORD: 'ok-value',
        PROD_URL: '',
      }),
    ).toEqual(['VITE_SUPABASE_URL: placeholder', 'SUPABASE_SECRET_KEY: whitespace'])
  })
})

describe('typeLabel and parseEnvRecords', () => {
  it.each([
    [{ type: 'sensitive' }, 'Secret'],
    [{ type: 'encrypted', visibility: 'secret' }, 'Secret'],
    [{ type: 'system' }, 'System'],
    [{ type: 'encrypted' }, 'Config'],
    [{ type: 'plain' }, 'Config'],
  ])('labels %j as %s', (record, label) => {
    expect(typeLabel(record)).toBe(label)
  })

  it('keeps names, targets and types only (values are dropped)', () => {
    const parsed = parseEnvRecords({
      envs: [
        { key: 'A', value: 'secret-a', type: 'encrypted', target: ['production', 'preview'] },
        { key: 'B', value: 'secret-b', type: 'sensitive', target: 'production', gitBranch: '' },
        { key: 'C', value: 'secret-c', type: 'encrypted', target: ['preview'], gitBranch: 'dev' },
        { value: 'no key' },
      ],
    })
    expect(parsed).toEqual([
      { key: 'A', targets: ['production', 'preview'], type: 'Config', gitBranch: null },
      { key: 'B', targets: ['production'], type: 'Secret', gitBranch: null },
      { key: 'C', targets: ['preview'], type: 'Config', gitBranch: 'dev' },
    ])
    expect(JSON.stringify(parsed)).not.toContain('secret-')
  })

  it('rejects an unexpected shape', () => {
    expect(() => parseEnvRecords(undefined)).toThrow(SyncError)
    expect(() => parseEnvRecords({ projects: [] })).toThrow(SyncError)
  })
})

describe('classifyRow', () => {
  const config = { type: 'Config' }
  it.each([
    [{ local: undefined, record: config, pulled: 'a' }, STATUS.MISSING_LOCAL],
    [{ local: '', record: undefined, pulled: undefined }, STATUS.MISSING_LOCAL],
    [{ local: 'a', record: undefined, pulled: undefined }, STATUS.MISSING_REMOTE],
    [{ local: 'a', record: { type: 'Secret' }, pulled: '[SENSITIVE]' }, STATUS.SECRET],
    [{ local: 'a', record: config, pulled: undefined }, STATUS.NOT_PULLED],
    [{ local: 'a', record: config, pulled: 'a' }, STATUS.SAME],
    [{ local: 'a', record: config, pulled: 'b' }, STATUS.DIFFERS],
  ])('%j -> %s', (input, status) => {
    expect(classifyRow(input)).toBe(status)
  })
})

describe('buildReport, rowInSync and rowsToWrite', () => {
  it('reports every matrix row, ignoring branch-specific records', () => {
    const records = [
      { key: 'VITE_SUPABASE_URL', targets: ['production'], type: 'Config', gitBranch: null },
      { key: 'VITE_SUPABASE_URL', targets: ['preview'], type: 'Config', gitBranch: 'feature' },
      { key: 'SUPABASE_SECRET_KEY', targets: ['production'], type: 'Secret', gitBranch: null },
    ]
    const pulled = {
      production: {
        VITE_SUPABASE_URL: LOCAL.VITE_SUPABASE_URL,
        SUPABASE_SECRET_KEY: '[SENSITIVE]',
      },
      preview: { VITE_SUPABASE_URL: LOCAL.VITE_SUPABASE_URL },
    }
    const report = buildReport({ ...LOCAL, PROD_URL: undefined }, pulled, records)
    const status = (key, target) => report.find((r) => r.key === key && r.target === target).status
    expect(report).toHaveLength(ROWS.length)
    expect(status('VITE_SUPABASE_URL', 'production')).toBe(STATUS.SAME)
    expect(status('VITE_SUPABASE_URL', 'preview')).toBe(STATUS.MISSING_REMOTE)
    expect(status('SUPABASE_SECRET_KEY', 'production')).toBe(STATUS.SECRET)
    expect(status('PROD_URL', 'development')).toBe(STATUS.MISSING_LOCAL)
  })

  it('treats a Secret as in sync only where the matrix expects a Secret', () => {
    expect(rowInSync({ status: STATUS.SECRET, type: 'secret' })).toBe(true)
    expect(rowInSync({ status: STATUS.SECRET, type: 'config' })).toBe(false)
    expect(rowInSync({ status: STATUS.SAME, type: 'config' })).toBe(true)
    expect(rowInSync({ status: STATUS.MISSING_LOCAL, type: 'config' })).toBe(true)
    expect(rowInSync({ status: STATUS.DIFFERS, type: 'config' })).toBe(false)
  })

  it('writes only missing rows without --force, and also differing or unknown rows with it', () => {
    const report = [
      { key: 'A', status: STATUS.MISSING_REMOTE },
      { key: 'B', status: STATUS.DIFFERS },
      { key: 'C', status: STATUS.SECRET },
      { key: 'D', status: STATUS.SAME },
      { key: 'E', status: STATUS.MISSING_LOCAL },
      { key: 'F', status: STATUS.NOT_PULLED },
    ]
    expect(rowsToWrite(report).map((r) => r.key)).toEqual(['A'])
    expect(rowsToWrite(report, { force: true }).map((r) => r.key)).toEqual(['A', 'B', 'C', 'F'])
  })
})

describe('typeProblems', () => {
  const rec = (key, target, type) => ({ key, targets: [target], type, gitBranch: null })

  it('accepts the planned types', () => {
    expect(typeProblems(parseEnvRecords({ envs: [] }))).toEqual([])
    expect(
      typeProblems([
        rec('VITE_SUPABASE_URL', 'production', 'Config'),
        rec('SUPABASE_SECRET_KEY', 'production', 'Secret'),
        rec('SUPABASE_SECRET_KEY', 'development', 'Config'),
        rec('SOMETHING_ELSE', 'production', 'Secret'),
      ]),
    ).toEqual([])
  })

  it('flags a Secret VITE_ variable, a Config secret key and app keys outside the matrix', () => {
    expect(
      typeProblems([
        rec('VITE_SUPABASE_PUBLISHABLE_KEY', 'production', 'Secret'),
        rec('SUPABASE_SECRET_KEY', 'production', 'Config'),
        rec('SUPABASE_DB_PASSWORD', 'production', 'Secret'),
      ]),
    ).toEqual([
      'VITE_SUPABASE_PUBLISHABLE_KEY production: stored as Secret, must be Config',
      'SUPABASE_SECRET_KEY production: stored as Config, must be Secret',
      'SUPABASE_DB_PASSWORD production: not in the env matrix (remove it: vercel env rm SUPABASE_DB_PASSWORD production)',
    ])
  })
})

describe('envAddArgs and needsGitBranch', () => {
  it('builds shell-safe arguments with the planned type flag', () => {
    const secret = envAddArgs({ key: 'SUPABASE_SECRET_KEY', target: 'production', type: 'secret' })
    const config = envAddArgs(
      { key: 'VITE_SUPABASE_URL', target: 'preview', type: 'config' },
      { force: true },
    )
    expect(secret).toEqual([
      'env',
      'add',
      'SUPABASE_SECRET_KEY',
      'production',
      '--yes',
      '--sensitive',
    ])
    expect(config).toEqual([
      'env',
      'add',
      'VITE_SUPABASE_URL',
      'preview',
      '--yes',
      '--no-sensitive',
      '--force',
    ])
    for (const arg of [...secret, ...config]) expect(SAFE_ARG_RE.test(arg)).toBe(true)
  })

  it('recognises the git-branch refusal', () => {
    expect(needsGitBranch({ stdout: '{"reason":"git_branch_required"}', stderr: '' })).toBe(true)
    expect(needsGitBranch({ stdout: '', stderr: 'Error: provide a Git branch' })).toBe(true)
    expect(needsGitBranch({ stdout: 'already exists', stderr: '' })).toBe(false)
  })
})

describe('syncVercelEnv', () => {
  it('reports an empty project as missing remotely, read-only, without printing values', async () => {
    const fake = fakeVercel()
    const code = await syncVercelEnv(deps(fake))
    expect(code).toBe(1)
    expect(lines.filter((l) => l.endsWith(': missing remotely'))).toHaveLength(ROWS.length)
    expect(fake.calls.some((c) => c.args[1] === 'add')).toBe(false)
    expect(fake.calls.filter((c) => c.args[1] === 'pull').map((c) => c.args[3])).toEqual([
      '--environment=production',
      '--environment=preview',
      '--environment=development',
    ])
    expect(allText()).toContain('env sync: NOT in sync')
    expectNoValues(allText())
  })

  it('--apply adds every missing row with the planned type, values on stdin only, then verifies', async () => {
    const fake = fakeVercel()
    const local = { ...LOCAL }
    delete local.PROD_URL
    const code = await syncVercelEnv(deps(fake, { apply: true, readLocal: () => local }))
    expect(code).toBe(0)
    const adds = fake.calls.filter((c) => c.args[1] === 'add')
    expect(adds).toHaveLength(ROWS.length - 1)
    for (const add of adds) {
      const [, , key, target] = add.args
      const row = ROWS.find((r) => r.key === key && r.target === target)
      expect(add.input).toBe(local[key])
      expect(add.args).toContain(row.type === 'secret' ? '--sensitive' : '--no-sensitive')
      expect(add.args).not.toContain('--force')
      expect(add.args.join(' ')).not.toContain(local[key])
    }
    expect(allText()).toContain('PROD_URL development: missing locally (skipped)')
    expect(allText()).toContain('SUPABASE_SECRET_KEY production: unknown (Secret)')
    expect(lines.at(-1)).toBe('env sync: in sync')
    expectNoValues(allText())
  })

  it('reports an in-sync project as in sync and --apply adds nothing', async () => {
    const fake = fakeVercel(inSyncRecords())
    expect(await syncVercelEnv(deps(fake, { apply: true }))).toBe(0)
    expect(fake.calls.some((c) => c.args[1] === 'add')).toBe(false)
    expect(allText()).toContain('apply: nothing to add')
  })

  it('--apply never overwrites a differing value; --force does', async () => {
    const records = inSyncRecords()
    records.find((r) => r.key === 'SUPABASE_PROJECT_REF').value = 'z'.repeat(20)
    const fake = fakeVercel(records)
    expect(await syncVercelEnv(deps(fake, { apply: true }))).toBe(1)
    expect(fake.calls.some((c) => c.args[1] === 'add')).toBe(false)
    expect(allText()).toContain('SUPABASE_PROJECT_REF development: differs, not overwritten')

    lines = []
    expect(await syncVercelEnv(deps(fake, { apply: true, force: true }))).toBe(0)
    const forced = fake.calls.filter((c) => c.args[1] === 'add')
    expect(forced.map((c) => `${c.args[2]} ${c.args[3]}`)).toEqual([
      'SUPABASE_SECRET_KEY production',
      'SUPABASE_PROJECT_REF development',
    ])
    for (const call of forced) expect(call.args).toContain('--force')
    expectNoValues(allText())
  })

  it('flags a VITE_ variable stored as Secret in production', async () => {
    const records = inSyncRecords()
    records.find((r) => r.key === 'VITE_SUPABASE_URL' && r.target === 'production').type =
      'sensitive'
    expect(await syncVercelEnv(deps(fakeVercel(records)))).toBe(1)
    expect(allText()).toContain(
      'TYPE VITE_SUPABASE_URL production: stored as Secret, must be Config',
    )
  })

  it('falls back to the API when the CLI wants a Git branch for preview', async () => {
    const fake = fakeVercel([], { previewNeedsBranch: true })
    expect(await syncVercelEnv(deps(fake, { apply: true }))).toBe(0)
    const api = fake.calls.filter((c) => c.args[0] === 'api')
    expect(api).toHaveLength(2)
    for (const call of api) {
      expect(call.args).toEqual([
        'api',
        `/v10/projects/${PROJECT.projectId}/env`,
        '--scope',
        PROJECT.orgId,
        '-X',
        'POST',
        '--input',
        '-',
      ])
      const body = JSON.parse(call.input)
      expect(body).toMatchObject({ type: 'encrypted', target: ['preview'] })
      expect(body.value).toBe(LOCAL[body.key])
    }
    expect(allText()).toContain('VITE_SUPABASE_URL preview: added through the API (Config)')
    expectNoValues(allText())
  })

  it('stops before any CLI call when .env.local holds a placeholder', async () => {
    const fake = fakeVercel()
    await expect(
      syncVercelEnv(
        deps(fake, { readLocal: () => ({ ...LOCAL, SUPABASE_SECRET_KEY: '[SENSITIVE]' }) }),
      ),
    ).rejects.toThrow(SyncError)
    expect(fake.calls).toEqual([])
    expect(allText()).toContain('SUPABASE_SECRET_KEY: placeholder')
  })

  it('reports a CLI failure with redacted output', async () => {
    const fake = fakeVercel([], { lsFails: true })
    let error
    try {
      await syncVercelEnv(deps(fake))
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(SyncError)
    expect(error.message).toContain('vercel env ls failed: exit 1')
    expect(error.message).not.toContain(PROJECT.projectId)
    expect(error.message).not.toContain(PROJECT.projectName)
  })
})

describe('makeTempDir and readLinkedProject', () => {
  let root
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'structured-sync-test-'))
  })
  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  it('uses the given base folder when its path is a safe argument', () => {
    const base = join(root, 'base')
    mkdirSync(base)
    const temp = makeTempDir(root, base)
    try {
      expect(existsSync(temp.dir)).toBe(true)
      if (SAFE_ARG_RE.test(base.replace(/\\/g, '/'))) {
        expect(temp.arg).toBe(temp.dir.replace(/\\/g, '/'))
      }
      expect(SAFE_ARG_RE.test(temp.arg)).toBe(true)
    } finally {
      rmSync(temp.dir, { recursive: true, force: true })
    }
  })

  it('falls back to a relative folder inside .vercel/ when the base path is unsafe', () => {
    const base = join(root, 'with space')
    mkdirSync(base)
    mkdirSync(join(root, '.vercel'))
    const temp = makeTempDir(root, base)
    try {
      expect(temp.arg).toMatch(/^\.vercel\/tmp-env-[0-9a-f]{8}-[A-Za-z0-9]{6}$/)
      expect(SAFE_ARG_RE.test(temp.arg)).toBe(true)
      expect(existsSync(temp.dir)).toBe(true)
    } finally {
      rmSync(temp.dir, { recursive: true, force: true })
    }
  })

  it('refuses to run unlinked and reads a linked project', () => {
    expect(() => readLinkedProject(root)).toThrow(/not linked/)
    mkdirSync(join(root, '.vercel'))
    writeFileSync(join(root, '.vercel', 'project.json'), '{"projectId":"p"}')
    expect(() => readLinkedProject(root)).toThrow(/no projectId or orgId/)
    writeFileSync(join(root, '.vercel', 'project.json'), JSON.stringify(PROJECT))
    expect(readLinkedProject(root)).toEqual(PROJECT)
  })
})
