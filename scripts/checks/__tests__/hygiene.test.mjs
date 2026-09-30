import { describe, expect, it } from 'vitest'
import {
  NATIVE_FAMILIES,
  ciWorkflowProblems,
  encodingProblems,
  lockfileNativeProblems,
  vercelPins,
} from '../hygiene.mjs'

const bytes = (text) => new TextEncoder().encode(text)

describe('encodingProblems', () => {
  it('accepts UTF-8 with LF', () => {
    expect(encodingProblems('a.ts', bytes('const a = "é"\n'))).toEqual([])
  })

  it('flags a BOM, CR bytes and invalid UTF-8', () => {
    expect(encodingProblems('a.md', Uint8Array.from([0xef, 0xbb, 0xbf, 0x41]))).toEqual([
      'UTF-8 BOM',
    ])
    expect(encodingProblems('a.json', bytes('{}\r\n'))).toEqual(['CR line endings (must be LF)'])
    expect(encodingProblems('a.env', Uint8Array.from([0x41, 0x82, 0xa0]))).toEqual([
      'not valid UTF-8',
    ])
  })

  it.each(['run.cmd', 'run.bat', 'Run.PS1'])('allows CRLF in %s', (file) => {
    expect(encodingProblems(file, bytes('echo 1\r\n'))).toEqual([])
  })
})

describe('lockfileNativeProblems', () => {
  const lockWith = (...names) => ({
    packages: Object.fromEntries([['', {}], ...names.map((n) => [`node_modules/${n}`, {}])]),
  })

  it('passes when every family has win32-x64, linux-x64 and darwin-arm64', () => {
    const lock = lockWith(
      '@rolldown/binding-win32-x64-msvc',
      '@rolldown/binding-linux-x64-gnu',
      '@rolldown/binding-linux-x64-musl',
      '@rolldown/binding-darwin-arm64',
      'lightningcss',
      'lightningcss-win32-x64-msvc',
      'lightningcss-linux-x64-gnu',
      'lightningcss-darwin-arm64',
      '@supabase/cli-windows-x64',
      '@supabase/cli-linux-x64',
      '@supabase/cli-darwin-arm64',
    )
    expect(lockfileNativeProblems(lock)).toEqual([])
  })

  it('reports each missing platform of a family that is present', () => {
    const lock = lockWith(
      '@tailwindcss/oxide',
      '@tailwindcss/oxide-linux-x64-musl',
      '@tailwindcss/oxide-win32-x64-msvc',
    )
    expect(lockfileNativeProblems(lock)).toEqual([
      '@tailwindcss/oxide-: no linux-x64 entry',
      '@tailwindcss/oxide-: no darwin-arm64 entry',
    ])
  })

  it('reads nested node_modules keys and ignores absent families', () => {
    const lock = lockWith(
      'x/node_modules/lightningcss-win32-x64-msvc',
      'x/node_modules/lightningcss-linux-x64-gnu',
      'x/node_modules/lightningcss-darwin-arm64',
    )
    expect(lockfileNativeProblems(lock)).toEqual([])
    expect(NATIVE_FAMILIES).toContain('@supabase/cli-')
  })
})

describe('pins and workflow invariants', () => {
  it('extracts exact Vercel CLI pins', () => {
    expect(vercelPins('VERCEL_CLI: vercel@61.1.0\nnpx --yes vercel@61.1.0 whoami')).toEqual([
      '61.1.0',
    ])
    expect(vercelPins('npx vercel@latest')).toEqual([])
  })

  it('requires the ci-verify job name and forbids path filters', () => {
    const ok = 'jobs:\n  verify:\n    name: ci-verify # required check\n'
    expect(ciWorkflowProblems(ok)).toEqual([])
    expect(ciWorkflowProblems('on:\n  push:\n    paths-ignore: [docs/**]\n' + ok)).toHaveLength(1)
    expect(ciWorkflowProblems('jobs:\n  verify:\n    name: verify\n')).toHaveLength(1)
  })
})
