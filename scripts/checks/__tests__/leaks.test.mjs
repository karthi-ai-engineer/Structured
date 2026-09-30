import { describe, expect, it } from 'vitest'
import {
  ALLOWED_VERCEL_LABELS,
  GENERIC_PATTERNS,
  buildSensitiveValues,
  findLeaks,
  main,
} from '../leaks.mjs'

// Every fixture is assembled at runtime, so this file never contains a string that the leak
// check (or GitHub push protection) would flag (P40).
const join = (...parts) => parts.join('')
const lower = (n, seed = 'q') => seed.repeat(n)
const token = (n) => 'Ab3'.repeat(Math.ceil(n / 3)).slice(0, n)
const ref = lower(20, 'k')

const SAMPLES = {
  'supabase-secret-key': join('sb_', 'secret_', token(32)),
  'supabase-publishable-key': join('sb_', 'publishable_', token(32)),
  jwt: join('ey', 'J', token(24), '.', token(40), '.', token(20)),
  'supabase-host': join('https://', ref, '.supa', 'base.co', '/rest/v1'),
  'supabase-pooler-user': join('user=', 'postgres', '.', ref),
  'db-url-with-password': join(
    'postgres',
    'ql://',
    'someuser:',
    'Pa55word',
    token(8),
    '@db.host:5432/postgres',
  ),
  'vercel-host': join('https://', 'real-deployment-x1', '.ver', 'cel.app'),
  'vercel-project-id': join('prj', '_', token(24)),
  'vercel-team-id': join('team', '_', token(24)),
}

function fakeIo(stdin = '') {
  const out = { stdout: '', stderr: '' }
  return {
    out,
    io: {
      stdout: { write: (s) => (out.stdout += s) },
      stderr: { write: (s) => (out.stderr += s) },
      stdin: () => stdin,
    },
  }
}

describe('generic patterns', () => {
  it('has a sample for every pattern', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(GENERIC_PATTERNS.map((p) => p.name).sort())
  })

  it.each(Object.entries(SAMPLES))('%s hits and reports its line', (name, sample) => {
    const findings = findLeaks(join('first line\n', 'value: ', sample, '\n'))
    expect(findings).toContainEqual({ line: 2, name })
  })

  it.each(ALLOWED_VERCEL_LABELS)('allowlists the documentation host %s', (label) => {
    expect(findLeaks(join('https://', label, '.vercel', '.app'))).toEqual([])
  })

  it.each([
    ['ref placeholder host', join('https://<ref>', '.supabase', '.co')],
    ['ref placeholder pooler user', join('postgres', '.<ref>')],
    [
      'placeholder password',
      join('postgres', 'ql://postgres.<ref>:[YOUR-PASSWORD]@host:5432/postgres'),
    ],
    ['env-var password', join('postgres', 'ql://postgres:${SUPABASE_DB_PASSWORD}@host/db')],
    ['masked password', join('postgres', 'ql://postgres:***@host/db')],
    ['wildcard host', join('pick the verified *', '.vercel', '.app domain')],
    ['name placeholder host', join('https://<name>', '.vercel', '.app')],
    ['ellipsis keys', join('sb_', 'publishable_… and sb_', 'secret_…')],
    ['short masked key', join('sb_', 'secret_abc...xyz')],
    ['plain prose', 'The Supabase project ref and the Vercel project name live in .env.local.'],
  ])('does not flag %s', (_label, text) => {
    expect(findLeaks(text)).toEqual([])
  })
})

describe('sensitive values', () => {
  const password = join('Zx9', token(29))
  const projectName = join('structured-', lower(8, 'w'))
  const env = {
    SUPABASE_DB_PASSWORD: password,
    VITE_SUPABASE_URL: join('https://', ref, '.supabase', '.co'),
    SUPABASE_PROJECT_REF: ref,
    VERCEL_PROJECT_NAME: projectName,
    PROD_URL: join('https://', projectName, '.vercel', '.app'),
    SUPABASE_SECRET_KEY: 'SENSITIVE_ENV_VALUE_PLACEHOLDER',
    MCP_SECRET: 'short',
    VERCEL_ENV: 'development',
    VERCEL_GIT_PROVIDER: 'github',
    TURBO_CACHE: 'remote-only-cache',
  }

  it('uses the explicit key list, derived hosts and labels, and skips placeholders and short values', () => {
    const names = buildSensitiveValues(env, {
      orgId: join('team', '_', token(24)),
      projectId: join('prj', '_', token(24)),
      projectName,
    }).map((s) => s.name)
    expect(names).toEqual([
      'VITE_SUPABASE_URL',
      'SUPABASE_DB_PASSWORD',
      'SUPABASE_PROJECT_REF',
      'VERCEL_PROJECT_NAME',
      'PROD_URL',
      'VITE_SUPABASE_URL host',
      'PROD_URL host',
      '.vercel/project.json orgId',
      '.vercel/project.json projectId',
    ])
  })

  it('never turns a public word into a sensitive host label', () => {
    const values = buildSensitiveValues({
      PROD_URL: join('https://structured', '.example', '.com'),
    })
    expect(values.map((v) => v.value)).not.toContain('structured')
  })

  it('reports the key name and never the value', () => {
    const sensitive = buildSensitiveValues(env)
    const text = join(
      'line one\n',
      'password is ',
      password,
      '\n',
      'deployed at ',
      projectName.toUpperCase(),
      '\n',
    )
    const findings = findLeaks(text, sensitive)
    expect(findings).toEqual([
      { line: 2, name: 'SUPABASE_DB_PASSWORD' },
      { line: 3, name: 'VERCEL_PROJECT_NAME' },
    ])
    expect(JSON.stringify(findings)).not.toContain(password)
    expect(JSON.stringify(findings).toLowerCase()).not.toContain(projectName)
  })

  it('main --stdin prints the location and pattern name only, and exits 1', () => {
    const secret = SAMPLES['supabase-secret-key']
    const { io, out } = fakeIo(join('log line\n', 'token=', secret, '\n'))
    expect(main(['--stdin'], io)).toBe(1)
    expect(out.stdout).toContain('LEAK stdin:2 matches supabase-secret-key')
    expect(out.stdout + out.stderr).not.toContain(secret)
  })

  it('main --stdin exits 0 on clean text', () => {
    const { io, out } = fakeIo('nothing to see here\n')
    expect(main(['--stdin'], io)).toBe(0)
    expect(out.stdout).toMatch(/^leaks: ok/)
  })

  it('main rejects --range together with --stdin', () => {
    const { io, out } = fakeIo('')
    expect(main(['--stdin', '--range', 'HEAD..HEAD'], io)).toBe(1)
    expect(out.stderr).toMatch(/cannot be combined/)
  })
})
