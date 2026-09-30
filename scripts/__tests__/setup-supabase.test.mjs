// Unit tests for the idempotent Supabase bootstrap. The CLI is replaced by a fake runner; no
// network, no real project. Key-shaped fixtures are built at runtime (never literal, P40).
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readEnvFile } from '../lib/env-file.mjs'
import {
  Blocker,
  isActiveProject,
  pickApiKeys,
  projectUrl,
  setupSupabase,
} from '../setup-supabase.mjs'

const ORG = { id: 'orgslug', name: 'Karthi labs', slug: 'orgslug' }
const REF = 'abcdefghijklmnopqrst'
const OTHER_REF = 'zyxwvutsrqponmlkjihg'
const key = (type, n) => ['sb', type, `${'k'.repeat(18)}${n}`].join('_')
const API_KEYS = [
  { name: 'anon', type: 'legacy', api_key: ['eyJ', 'x'.repeat(30)].join('') },
  { name: 'default', type: 'publishable', api_key: key('publishable', 1) },
  { name: 'default', type: 'secret', api_key: key('secret', 1) },
]

function project(overrides = {}) {
  return {
    id: REF,
    ref: REF,
    name: 'structured',
    organization_id: ORG.id,
    organization_slug: ORG.slug,
    region: 'ap-south-1',
    status: 'ACTIVE_HEALTHY',
    ...overrides,
  }
}

function other(overrides = {}) {
  return project({ id: OTHER_REF, ref: OTHER_REF, name: 'other', region: 'x', ...overrides })
}

/**
 * A fake CLI. `state.projects` is what `projects list` returns; `onCreate` decides what
 * `projects create` does.
 */
function fakeCli(state) {
  const calls = []
  const ok = (value) => ({
    status: 0,
    stdout: JSON.stringify(value),
    stderr: 'notice\n',
    timedOut: false,
  })
  const run = (args) => {
    calls.push(args)
    const [a, b] = args
    if (a === 'projects' && b === 'list') {
      const list = typeof state.projects === 'function' ? state.projects() : state.projects
      return args.includes('-o') && state.envelopeOnly
        ? { status: 0, stdout: 'not json', stderr: '', timedOut: false }
        : args.includes('--output-format')
          ? ok({ projects: list, message: '' })
          : ok(list)
    }
    if (a === 'orgs' && b === 'list') return ok(state.orgs ?? [ORG])
    if (a === 'projects' && b === 'create') return state.onCreate(args)
    if (a === 'projects' && b === 'api-keys') {
      const keys = typeof state.keys === 'function' ? state.keys() : (state.keys ?? API_KEYS)
      return ok(keys)
    }
    throw new Error(`unexpected CLI call: ${args.join(' ')}`)
  }
  return { run, calls }
}

let dir
let envPath
const lines = []
const deps = (run, extra = {}) => ({
  run,
  envPath,
  log: (line) => lines.push(line),
  sleep: async () => {},
  pollIntervalMs: 1,
  keysIntervalMs: 1,
  createPassword: () => 'P'.repeat(32),
  ...extra,
})

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'setup-supabase-'))
  envPath = join(dir, '.env.local')
  lines.length = 0
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('setupSupabase', () => {
  it('creates the project once, persists the password first, then ref, URL and keys', async () => {
    const state = {
      projects: [other()],
      onCreate: (args) => {
        // The password is already persisted when the create call runs.
        expect(readEnvFile(envPath).SUPABASE_DB_PASSWORD).toBe('P'.repeat(32))
        expect(args).toContain('--db-password=' + 'P'.repeat(32))
        expect(args).toEqual(expect.arrayContaining(['--org-id', ORG.id, '--region', 'ap-south-1']))
        state.projects = [other(), project()]
        return { status: 0, stdout: JSON.stringify(project()), stderr: '', timedOut: false }
      },
    }
    const cli = fakeCli(state)
    await expect(setupSupabase(deps(cli.run))).resolves.toEqual({ ref: REF })
    const env = readEnvFile(envPath)
    expect(env.SUPABASE_PROJECT_REF).toBe(REF)
    expect(env.VITE_SUPABASE_URL).toBe(projectUrl(REF))
    expect(env.VITE_SUPABASE_PUBLISHABLE_KEY).toBe(key('publishable', 1))
    expect(env.SUPABASE_SECRET_KEY).toBe(key('secret', 1))
    expect(cli.calls.filter(([a, b]) => a === 'projects' && b === 'create')).toHaveLength(1)
    // Never prints values.
    const output = lines.join('\n')
    for (const value of [REF, 'P'.repeat(32), key('secret', 1), key('publishable', 1)]) {
      expect(output).not.toContain(value)
    }
    expect(lines.slice(-5)).toEqual([
      'SUPABASE_PROJECT_REF: set',
      'SUPABASE_DB_PASSWORD: set',
      'VITE_SUPABASE_URL: set',
      'VITE_SUPABASE_PUBLISHABLE_KEY: set',
      'SUPABASE_SECRET_KEY: set',
    ])
  })

  it('is idempotent: a second run reuses the project, password and keys without creating', async () => {
    const state = { projects: [other(), project()], onCreate: () => expect.unreachable() }
    writeFileSync(
      envPath,
      [
        '# comment kept',
        `SUPABASE_PROJECT_REF=${REF}`,
        'SUPABASE_DB_PASSWORD=' + 'Q'.repeat(32),
        `VITE_SUPABASE_URL=${projectUrl(REF)}`,
        `VITE_SUPABASE_PUBLISHABLE_KEY=${key('publishable', 1)}`,
        `SUPABASE_SECRET_KEY=${key('secret', 1)}`,
        'VERCEL_PROJECT_NAME=kept-name',
        '',
      ].join('\n'),
    )
    const before = readFileSync(envPath, 'utf8')
    const cli = fakeCli(state)
    await setupSupabase(deps(cli.run))
    expect(readFileSync(envPath, 'utf8')).toBe(before)
    expect(cli.calls.some(([a, b]) => a === 'projects' && b === 'create')).toBe(false)
  })

  it('never regenerates an existing password when it has to create', async () => {
    writeFileSync(envPath, 'SUPABASE_DB_PASSWORD=' + 'R'.repeat(32) + '\n')
    const state = {
      projects: [],
      onCreate: (args) => {
        expect(args).toContain('--db-password=' + 'R'.repeat(32))
        state.projects = [project()]
        return {
          status: 0,
          stdout: JSON.stringify({ project: project() }),
          stderr: '',
          timedOut: false,
        }
      },
    }
    await setupSupabase(deps(fakeCli(state).run, { createPassword: () => expect.unreachable() }))
    expect(readEnvFile(envPath).SUPABASE_DB_PASSWORD).toBe('R'.repeat(32))
  })

  it.each([
    ['a failed create', { status: 1, stdout: '', stderr: 'error', timedOut: false }],
    ['an unparsable create output', { status: 0, stdout: 'Created!', stderr: '', timedOut: false }],
    ['a timed-out create', { status: null, stdout: '', stderr: '', timedOut: true }],
  ])('re-lists after %s and adopts the project instead of retrying', async (_label, result) => {
    let created = false
    let listsAfterCreate = 0
    const cli = fakeCli({
      // The project shows up in the re-list, still starting; the next poll sees it healthy.
      projects: () => {
        if (!created) return []
        listsAfterCreate += 1
        return [project({ status: listsAfterCreate > 1 ? 'ACTIVE_HEALTHY' : 'COMING_UP' })]
      },
      onCreate: () => {
        created = true
        return result
      },
    })
    await setupSupabase(deps(cli.run))
    expect(listsAfterCreate).toBe(2)
    expect(cli.calls.filter(([a, b]) => a === 'projects' && b === 'create')).toHaveLength(1)
    expect(readEnvFile(envPath).SUPABASE_PROJECT_REF).toBe(REF)
  })

  it('stops with a blocker when the create failed and no project appeared', async () => {
    const state = {
      projects: [],
      onCreate: () => ({
        status: 1,
        stdout: '',
        stderr: 'boom ' + 'P'.repeat(32),
        timedOut: false,
      }),
    }
    const cli = fakeCli(state)
    await expect(setupSupabase(deps(cli.run))).rejects.toThrow(/project creation failed/)
    expect(cli.calls.filter(([a, b]) => a === 'projects' && b === 'create')).toHaveLength(1)
    expect(lines.join('\n')).not.toContain('P'.repeat(32))
    // The password stays saved for the next run.
    expect(readEnvFile(envPath).SUPABASE_DB_PASSWORD).toBe('P'.repeat(32))
  })

  it('adopts an existing project named structured when the password is in .env.local', async () => {
    writeFileSync(envPath, 'SUPABASE_DB_PASSWORD=' + 'S'.repeat(32) + '\n')
    const cli = fakeCli({ projects: [project()], onCreate: () => expect.unreachable() })
    await setupSupabase(deps(cli.run))
    expect(readEnvFile(envPath).SUPABASE_PROJECT_REF).toBe(REF)
    expect(lines.join('\n')).toContain('adopted the existing')
  })

  it('refuses to adopt an existing project without a password', async () => {
    const cli = fakeCli({ projects: [project()], onCreate: () => expect.unreachable() })
    await expect(setupSupabase(deps(cli.run))).rejects.toThrow(/reset the database password/i)
  })

  it('refuses two projects named structured', async () => {
    const cli = fakeCli({
      projects: [project(), project({ id: OTHER_REF, ref: OTHER_REF })],
      onCreate: () => expect.unreachable(),
    })
    await expect(setupSupabase(deps(cli.run))).rejects.toThrow(/more than one project/)
  })

  it('stops at the free project limit and never creates', async () => {
    const cli = fakeCli({
      projects: [other(), other({ id: 'bbbbbbbbbbbbbbbbbbbb', ref: 'bbbbbbbbbbbbbbbbbbbb' })],
      onCreate: () => expect.unreachable(),
    })
    await expect(setupSupabase(deps(cli.run))).rejects.toThrow(/free project limit reached/)
  })

  it('does not count paused projects against the free limit', async () => {
    const state = {
      projects: [
        other(),
        other({ id: 'bbbbbbbbbbbbbbbbbbbb', ref: 'bbbbbbbbbbbbbbbbbbbb', status: 'INACTIVE' }),
      ],
      onCreate: () => {
        state.projects = [project()]
        return { status: 0, stdout: JSON.stringify(project()), stderr: '', timedOut: false }
      },
    }
    await setupSupabase(deps(fakeCli(state).run))
    expect(readEnvFile(envPath).SUPABASE_PROJECT_REF).toBe(REF)
  })

  it('refuses a recorded ref that the login cannot see', async () => {
    writeFileSync(envPath, `SUPABASE_PROJECT_REF=${REF}\nSUPABASE_DB_PASSWORD=x\n`)
    const cli = fakeCli({ projects: [other()], onCreate: () => expect.unreachable() })
    await expect(setupSupabase(deps(cli.run))).rejects.toThrow(
      /not a project this login can access/,
    )
  })

  it('requires exactly one organization named Karthi labs (case-insensitive)', async () => {
    const none = fakeCli({ projects: [], orgs: [{ id: 'x', name: 'Other', slug: 'x' }] })
    await expect(setupSupabase(deps(none.run))).rejects.toThrow(/exactly one organization/)
    const lower = fakeCli({
      projects: [project()],
      orgs: [{ ...ORG, name: 'karthi LABS' }],
      onCreate: () => expect.unreachable(),
    })
    writeFileSync(envPath, 'SUPABASE_DB_PASSWORD=x\n')
    await expect(setupSupabase(deps(lower.run))).resolves.toEqual({ ref: REF })
  })

  it('falls back to --output-format json when -o json does not parse', async () => {
    writeFileSync(envPath, `SUPABASE_PROJECT_REF=${REF}\nSUPABASE_DB_PASSWORD=x\n`)
    const cli = fakeCli({
      projects: [project()],
      envelopeOnly: true,
      onCreate: () => expect.unreachable(),
    })
    await setupSupabase(deps(cli.run))
    expect(cli.calls.some((args) => args.includes('--output-format'))).toBe(true)
  })

  it('waits for ACTIVE_HEALTHY and times out with a blocker', async () => {
    writeFileSync(envPath, `SUPABASE_PROJECT_REF=${REF}\nSUPABASE_DB_PASSWORD=x\n`)
    let t = 0
    const cli = fakeCli({
      projects: [project({ status: 'COMING_UP' })],
      onCreate: () => expect.unreachable(),
    })
    await expect(
      setupSupabase(
        deps(cli.run, {
          now: () => t,
          sleep: async (ms) => void (t += ms),
          pollIntervalMs: 60_000,
        }),
      ),
    ).rejects.toThrow(/not healthy after 10 minutes \(status COMING_UP\)/)
  })

  it('retries the API keys until both new-style keys exist, and never uses legacy keys', async () => {
    writeFileSync(envPath, `SUPABASE_PROJECT_REF=${REF}\nSUPABASE_DB_PASSWORD=x\n`)
    let reads = 0
    const cli = fakeCli({
      projects: [project()],
      keys: () => {
        reads += 1
        return reads < 3 ? [API_KEYS[0]] : API_KEYS
      },
      onCreate: () => expect.unreachable(),
    })
    await setupSupabase(deps(cli.run))
    expect(reads).toBe(3)
    expect(readEnvFile(envPath).VITE_SUPABASE_PUBLISHABLE_KEY).toBe(key('publishable', 1))
  })

  it('stops with a blocker when only legacy keys exist', async () => {
    writeFileSync(envPath, `SUPABASE_PROJECT_REF=${REF}\nSUPABASE_DB_PASSWORD=x\n`)
    let t = 0
    const cli = fakeCli({
      projects: [project()],
      keys: [API_KEYS[0]],
      onCreate: () => expect.unreachable(),
    })
    await expect(
      setupSupabase(
        deps(cli.run, {
          now: () => t,
          sleep: async (ms) => void (t += ms),
          keysIntervalMs: 60_000,
        }),
      ),
    ).rejects.toThrow(Blocker)
    expect(readEnvFile(envPath).VITE_SUPABASE_PUBLISHABLE_KEY).toBeUndefined()
  })
})

describe('helpers', () => {
  it('pickApiKeys keeps a current key that still exists, else takes the first', () => {
    const keys = [...API_KEYS, { type: 'secret', api_key: key('secret', 2) }]
    expect(pickApiKeys(keys, { secret: key('secret', 2) }).secret).toBe(key('secret', 2))
    expect(pickApiKeys(keys, { secret: key('secret', 9) }).secret).toBe(key('secret', 1))
    expect(pickApiKeys([API_KEYS[0]])).toEqual({ publishable: undefined, secret: undefined })
  })

  it('isActiveProject ignores paused and removed projects', () => {
    expect(isActiveProject({ status: 'ACTIVE_HEALTHY' })).toBe(true)
    expect(isActiveProject({ status: 'COMING_UP' })).toBe(true)
    expect(isActiveProject({ status: 'INACTIVE' })).toBe(false)
    expect(isActiveProject({ status: 'REMOVED' })).toBe(false)
  })
})
