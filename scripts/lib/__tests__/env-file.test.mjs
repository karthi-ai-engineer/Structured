import { spawnSync } from 'node:child_process'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  APP_KEYS,
  EnvFileError,
  PLACEHOLDERS,
  SENSITIVE_KEYS,
  checkAppKeys,
  classifyValue,
  decodeEnvBytes,
  formatEnvValue,
  isPlaceholder,
  main,
  parseEnvText,
  readEnvFile,
  updateEnvFile,
} from '../env-file.mjs'

const SCRIPT = fileURLToPath(new URL('../env-file.mjs', import.meta.url))
const BOM = [0xef, 0xbb, 0xbf]

let dir
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'env-file-test-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function runCli(args, input) {
  return spawnSync(process.execPath, [SCRIPT, ...args], { input, encoding: 'utf8', cwd: dir })
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

describe('key lists', () => {
  it('has the 7 app keys of .env.example and the extra sensitive keys', () => {
    expect(APP_KEYS).toHaveLength(8)
    expect(SENSITIVE_KEYS).toEqual([...APP_KEYS, 'VERCEL_OIDC_TOKEN'])
    expect(SENSITIVE_KEYS).toContain('MCP_SECRET')
  })
})

describe('decodeEnvBytes / readEnvFile', () => {
  it('strips a UTF-8 BOM', () => {
    const file = join(dir, 'bom.env')
    writeFileSync(file, Buffer.concat([Buffer.from(BOM), Buffer.from('A=1\nB=two\n')]))
    expect(readEnvFile(file)).toEqual({ A: '1', B: 'two' })
  })

  it.each([
    ['UTF-16 LE BOM', [0xff, 0xfe, 0x41, 0x00]],
    ['UTF-16 BE BOM', [0xfe, 0xff, 0x00, 0x41]],
    ['NUL bytes without BOM', [0x41, 0x00, 0x3d, 0x00]],
  ])('throws on %s', (_label, bytes) => {
    expect(() => decodeEnvBytes(Uint8Array.from(bytes), 'x.env')).toThrow(EnvFileError)
    expect(() => decodeEnvBytes(Uint8Array.from(bytes), 'x.env')).toThrow(/UTF-8 without BOM/)
  })

  it('throws on invalid UTF-8 (for example a cp932 file)', () => {
    expect(() => decodeEnvBytes(Uint8Array.from([0x41, 0x3d, 0x82, 0xa0]), 'x.env')).toThrow(
      /not valid UTF-8/,
    )
  })

  it('returns {} for a missing file and parses CRLF files', () => {
    expect(readEnvFile(join(dir, 'missing.env'))).toEqual({})
    const file = join(dir, 'crlf.env')
    writeFileSync(file, 'A=1\r\nB=2\r\n')
    expect(readEnvFile(file)).toEqual({ A: '1', B: '2' })
  })
})

describe('placeholders and classification', () => {
  it.each(PLACEHOLDERS)('detects the Vercel placeholder %s', (value) => {
    expect(isPlaceholder(value)).toBe(true)
    expect(isPlaceholder(` ${value} `)).toBe(true)
    expect(classifyValue(value)).toBe('placeholder')
  })

  it('does not treat ordinary values as placeholders', () => {
    expect(isPlaceholder('abc')).toBe(false)
    expect(isPlaceholder('')).toBe(false)
    expect(isPlaceholder(undefined)).toBe(false)
  })

  it.each([
    [undefined, 'missing'],
    ['', 'empty'],
    [' padded', 'whitespace'],
    ['padded ', 'whitespace'],
    ['tab\there', 'whitespace'],
    ['fine-value', 'ok'],
  ])('classifies %j as %s', (value, status) => {
    expect(classifyValue(value)).toBe(status)
  })

  it('checkAppKeys reports names and statuses only, honouring --allow-missing', () => {
    const env = Object.fromEntries(APP_KEYS.map((key) => [key, `value-of-${key.toLowerCase()}`]))
    delete env.PROD_URL
    const allowed = checkAppKeys(env, { allowMissing: ['PROD_URL'] })
    expect(allowed.ok).toBe(true)
    expect(allowed.lines).toContain('PROD_URL: missing (allowed)')
    const strict = checkAppKeys(env)
    expect(strict.ok).toBe(false)
    expect(strict.lines).toContain('PROD_URL: missing')
    expect(strict.lines.join('\n')).not.toContain('value-of-')
  })
})

describe('formatEnvValue', () => {
  it.each([
    ['plain', 'abc_DEF-123.x:y/z@w+v='],
    ['spaces', 'hello world'],
    ['hash', 'a#b'],
    ['single quote', "it's"],
    ['double quote', 'say "hi"'],
    ['both quotes', `it's "x"`],
    ['dollar', '$HOME'],
    ['backslash n', 'a\\nb'],
    ['leading space', '  x'],
    ['empty', ''],
  ])('round-trips a value with %s', (_label, value) => {
    const formatted = formatEnvValue('K', value)
    expect(parseEnvText(`K=${formatted}\n`).K).toBe(value)
  })

  it('leaves safe values unquoted', () => {
    expect(formatEnvValue('K', 'abc')).toBe('abc')
  })

  it.each([['a\nb'], ['a\rb'], ['a\u0007b']])('rejects %j', (value) => {
    expect(() => formatEnvValue('K', value)).toThrow(EnvFileError)
  })
})

describe('updateEnvFile', () => {
  it('keeps other keys and comments, replaces in place, appends new keys; LF and no BOM', () => {
    const file = join(dir, '.env.local')
    const original = [
      '# header comment',
      'KEEP=1',
      'export TARGET=old',
      '',
      '# trailing',
      'TARGET=dup',
      '',
    ]
    writeFileSync(file, Buffer.concat([Buffer.from(BOM), Buffer.from(original.join('\r\n'))]))
    updateEnvFile(file, { TARGET: 'new value', ADDED: 'x' })
    const bytes = readFileSync(file)
    expect([...bytes.subarray(0, 3)]).not.toEqual(BOM)
    expect(bytes.includes(0x0d)).toBe(false)
    expect(bytes.toString('utf8')).toBe(
      ['# header comment', 'KEEP=1', "TARGET='new value'", '', '# trailing', 'ADDED=x', ''].join(
        '\n',
      ),
    )
    expect(readEnvFile(file)).toEqual({ KEEP: '1', TARGET: 'new value', ADDED: 'x' })
  })

  it('creates the file when missing and leaves no temp file behind', () => {
    const file = join(dir, 'new.env')
    updateEnvFile(file, { A: '1' })
    expect(readFileSync(file, 'utf8')).toBe('A=1\n')
    expect(readdirSync(dir)).toEqual(['new.env'])
  })

  it('rejects invalid names and newline values without touching the file', () => {
    const file = join(dir, 'x.env')
    writeFileSync(file, 'A=1\n')
    expect(() => updateEnvFile(file, { 'BAD-NAME': 'x' })).toThrow(EnvFileError)
    expect(() => updateEnvFile(file, { A: 'two\nlines' })).toThrow(/newline/)
    expect(readFileSync(file, 'utf8')).toBe('A=1\n')
  })
})

describe('CLI', () => {
  it('set reads the value from stdin and trims exactly one trailing newline', () => {
    const lf = runCli(['set', 'A', '--file', 'a.env'], 'value one\n')
    expect(lf.status).toBe(0)
    expect(lf.stdout).toBe('A: set\n')
    const crlf = runCli(['set', 'B', '--file', 'a.env'], 'two\r\n')
    expect(crlf.status).toBe(0)
    expect(readEnvFile(join(dir, 'a.env'))).toEqual({ A: 'value one', B: 'two' })
    const twoNewlines = runCli(['set', 'C', '--file', 'a.env'], 'x\n\n')
    expect(twoNewlines.status).toBe(1)
    expect(twoNewlines.stderr).toMatch(/newline/)
  })

  it('set refuses an empty value', () => {
    const result = runCli(['set', 'A', '--file', 'a.env'], '')
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/no value on stdin/)
  })

  it('get prints the raw value without a newline, nothing for a missing key, and fails for a missing file', () => {
    writeFileSync(join(dir, 'g.env'), "A='with space'\n")
    expect(runCli(['get', 'g.env', 'A'])).toMatchObject({ status: 0, stdout: 'with space' })
    expect(runCli(['get', 'g.env', 'NOPE'])).toMatchObject({ status: 0, stdout: '' })
    expect(runCli(['get', 'missing.env', 'A']).status).toBe(1)
  })

  it('check prints names and statuses only, never values', () => {
    const values = Object.fromEntries(APP_KEYS.map((key, i) => [key, `secret-value-${i}-abcdef`]))
    writeFileSync(
      join(dir, 'c.env'),
      Object.entries(values)
        .map(([k, v]) => `${k}=${v}`)
        .join('\n'),
    )
    const ok = runCli(['check', '--file', 'c.env'])
    expect(ok.status).toBe(0)
    expect(ok.stdout.trim().split('\n')).toEqual(APP_KEYS.map((key) => `${key}: ok`))
    expect(ok.stdout + ok.stderr).not.toContain('secret-value-')
    writeFileSync(join(dir, 'p.env'), `VITE_SUPABASE_URL=${PLACEHOLDERS[0]}\n`)
    const bad = runCli(['check', '--file', 'p.env'])
    expect(bad.status).toBe(1)
    expect(bad.stdout).toContain('VITE_SUPABASE_URL: placeholder')
  })

  it('main() rejects unknown commands with a usage error', () => {
    const { io, out } = fakeIo()
    expect(main(['nope'], io)).toBe(1)
    expect(out.stderr).toMatch(/usage/)
  })
})
