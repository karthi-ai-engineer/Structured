// Unit tests for the Vercel CLI helper. No CLI is spawned. Host-, ID- and key-shaped fixtures are
// built at runtime, so this file never contains a string the leak check would flag (P40).
import { describe, expect, it } from 'vitest'
import {
  SAFE_ARG_RE,
  VERCEL_CLI,
  VercelCliError,
  assertSafeArgs,
  describeFailure,
  parseJson,
  redact,
  vercelCommand,
} from '../vercel.mjs'

const join = (...parts) => parts.join('')
const vercelHost = (label) => [label, 'vercel', 'app'].join('.')
const supabaseHost = join('k'.repeat(20), '.', 'supabase', '.co')
const projectId = join('prj', '_', 'Ab3'.repeat(8))
const teamId = join('team', '_', 'Xy9'.repeat(8))
const publishable = ['sb', 'publishable', 'Q1w2E3r4T5y6U7i8O9p0'].join('_')

describe('VERCEL_CLI', () => {
  it('is one exact version (never a range)', () => {
    expect(VERCEL_CLI).toMatch(/^vercel@\d+\.\d+\.\d+$/)
  })
})

describe('assertSafeArgs and vercelCommand', () => {
  it.each([
    ['env', 'pull', 'C:/Users/me/AppData/Local/Temp/x/production.env', '--environment=production'],
    ['api', '/v10/projects/p/env', '--scope', 'team_1', '-X', 'POST', '--input', '-'],
    ['link', '--yes', '--project', 'structured-abc123', '--team', 'my-team'],
  ])('accepts shell-safe arguments %#', (...args) => {
    expect(() => assertSafeArgs(args)).not.toThrow()
    expect(vercelCommand(args)).toBe(`npx --yes ${VERCEL_CLI} ${args.join(' ')} --non-interactive`)
  })

  it.each([
    'a b',
    'x;rm',
    'a&b',
    'a|b',
    '$(x)',
    '`x`',
    '"q"',
    "'q'",
    'C:\\Temp',
    '%PATH%',
    'a>b',
    '?x=1',
    '',
  ])('rejects %j without echoing it', (bad) => {
    let error
    try {
      assertSafeArgs(['env', bad])
    } catch (caught) {
      error = caught
    }
    expect(error).toBeInstanceOf(VercelCliError)
    expect(error.message).toContain('#2')
    if (bad.length > 2) expect(error.message).not.toContain(bad)
    expect(SAFE_ARG_RE.test(bad)).toBe(false)
  })

  it('rejects non-string arguments', () => {
    expect(() => assertSafeArgs(['env', 1])).toThrow(VercelCliError)
  })
})

describe('parseJson', () => {
  it.each([
    ['an object', '{"envs":[]}', { envs: [] }],
    ['JSON after a notice', 'Vercel CLI 61\n{"a":1}\n', { a: 1 }],
    ['an array', '[1,2]', [1, 2]],
  ])('parses %s', (_label, text, expected) => {
    expect(parseJson(text)).toEqual(expected)
  })

  it.each(['', '  ', 'no json here', '{broken', undefined])('returns undefined for %j', (text) => {
    expect(parseJson(text)).toBeUndefined()
  })
})

describe('redact', () => {
  it('masks known values, case-insensitively, longest first', () => {
    const name = 'structured-abc123'
    const text = `Linked karthi/${name.toUpperCase()} and ${name}-extra with SECRETVALUE1`
    const out = redact(text, [name, `${name}-extra`, 'SECRETVALUE1', undefined, null, 'short'])
    expect(out).not.toMatch(/structured-abc123/i)
    expect(out).not.toContain('SECRETVALUE1')
    expect(out).toContain('***')
  })

  it('masks URLs, hosts, IDs, keys and the project-name shape without known values', () => {
    const text = [
      `Production: https://${vercelHost('my-proj-x1y2')} [3s]`,
      `alias ${vercelHost('structured-q1w2e3r4')}`,
      `db ${supabaseHost}`,
      `project ${projectId} in ${teamId}`,
      `key ${publishable}`,
      'scope karthi-team/structured-zz99yy88 and structured-aa11bb22',
    ].join('\n')
    const out = redact(text)
    expect(out).not.toMatch(/https?:\/\//)
    expect(out).not.toMatch(/vercel\.app/)
    expect(out).not.toMatch(/supabase\.co/)
    expect(out).not.toContain(projectId)
    expect(out).not.toContain(teamId)
    expect(out).not.toContain(publishable)
    expect(out).not.toMatch(/structured-[a-z0-9]{6,}/)
    expect(out).toContain('[redacted-url]')
    expect(out).toContain('[redacted-scope/project]')
  })

  it('leaves ordinary text alone', () => {
    expect(redact('Build completed successfully.')).toBe('Build completed successfully.')
  })
})

describe('describeFailure', () => {
  it('reports the exit status and a redacted tail', () => {
    const result = {
      status: 1,
      stdout: `Error: project ${projectId} not found\n`,
      stderr: 'x\n'.repeat(30),
      timedOut: false,
    }
    const text = describeFailure(result, [], 5)
    expect(text.split('\n')[0]).toBe('exit 1')
    expect(text.split('\n')).toHaveLength(6)
    expect(text).not.toContain(projectId)
  })

  it('reports timeouts and spawn errors', () => {
    expect(describeFailure({ status: null, stdout: '', stderr: '', timedOut: true })).toBe(
      'timed out',
    )
    expect(
      describeFailure({ status: null, stdout: '', stderr: '', timedOut: false, error: 'ENOENT' }),
    ).toBe('exit ENOENT')
  })
})
