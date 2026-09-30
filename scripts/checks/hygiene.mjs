// Repo hygiene check (docs/phases/phase-0/PLAN.md section 8.7).
//
// 1. Encoding: every tracked or untracked-not-ignored text file is valid UTF-8 without a BOM and
//    has no CR byte (except *.cmd, *.bat and *.ps1, which are CRLF by .gitattributes).
// 2. Lockfile natives: every native-binding family in package-lock.json has win32-x64,
//    linux-x64 (gnu) and darwin-arm64 entries, so `npm ci` works on Windows, CI and a Mac.
// 3. Pins and workflow invariants: .nvmrc and engines.node agree on Node 24, the Vercel CLI pin
//    is identical wherever it appears, and ci.yml keeps the ci-verify job without path filters.
//
// Output: one `FAIL <what>: <reason>` line per problem, then a summary. Exit 1 on any failure.

import { existsSync, readFileSync } from 'node:fs'
import { extname } from 'node:path'
import { CheckError, isBinaryContent, listRepoFiles, readBytesOrNull } from '../lib/repo.mjs'

const CRLF_EXTENSIONS = new Set(['.cmd', '.bat', '.ps1'])

/** Native families whose platform packages must all be in the lockfile (P10, F26). */
export const NATIVE_FAMILIES = Object.freeze([
  '@rolldown/binding-',
  'lightningcss-',
  '@tailwindcss/oxide-',
  '@supabase/cli-',
])

/** Platforms that must be present for every family found in the lockfile. */
export const REQUIRED_PLATFORMS = Object.freeze([
  { label: 'win32-x64', matches: (rest) => /^(?:win32|windows)-x64(?:-|$)/.test(rest) },
  { label: 'linux-x64', matches: (rest) => /^linux-x64(?:-gnu)?$/.test(rest) },
  { label: 'darwin-arm64', matches: (rest) => /^darwin-arm64(?:-|$)/.test(rest) },
])

/** Files that must carry the same exact Vercel CLI pin (D0-24). */
export const VERCEL_PIN_FILES = Object.freeze([
  '.github/workflows/deploy.yml',
  'scripts/ci/deploy-prod.sh',
  'scripts/lib/vercel.mjs',
])

const EXPECTED_NODE_MAJOR = '24'

/**
 * Encoding problems of one text file.
 * @param {string} path
 * @param {Uint8Array} bytes
 * @returns {string[]}
 */
export function encodingProblems(path, bytes) {
  const problems = []
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    problems.push('UTF-8 BOM')
  }
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    problems.push('not valid UTF-8')
  }
  if (!CRLF_EXTENSIONS.has(extname(path).toLowerCase()) && bytes.includes(0x0d)) {
    problems.push('CR line endings (must be LF)')
  }
  return problems
}

/** Package name from a package-lock `packages` key (`node_modules/a/node_modules/@s/b` -> `@s/b`). */
function packageNameOfKey(key) {
  const marker = 'node_modules/'
  const index = key.lastIndexOf(marker)
  return index === -1 ? null : key.slice(index + marker.length)
}

/**
 * Missing native platform entries in a parsed package-lock.json.
 * @param {{ packages?: Record<string, unknown> }} lock
 * @returns {string[]} problems such as `@rolldown/binding-: no darwin-arm64 entry`
 */
export function lockfileNativeProblems(lock) {
  const names = Object.keys(lock?.packages ?? {})
    .map(packageNameOfKey)
    .filter((name) => name !== null)
  const problems = []
  for (const family of NATIVE_FAMILIES) {
    const rests = names
      .filter((name) => name.startsWith(family))
      .map((name) => name.slice(family.length))
    if (rests.length === 0) continue
    for (const platform of REQUIRED_PLATFORMS) {
      if (!rests.some((rest) => platform.matches(rest))) {
        problems.push(`${family}: no ${platform.label} entry`)
      }
    }
  }
  return problems
}

/** The Vercel CLI pins (`vercel@x.y.z`) found in a text. */
export function vercelPins(text) {
  return [...new Set([...text.matchAll(/\bvercel@(\d+\.\d+\.\d+)\b/g)].map((m) => m[1]))]
}

/**
 * Invariants of .github/workflows/ci.yml that keep the required check reliable (P36).
 * @param {string} text
 */
export function ciWorkflowProblems(text) {
  const problems = []
  if (/^\s*paths(?:-ignore)?\s*:/m.test(text)) {
    problems.push('has paths/paths-ignore filters (the required check would stay pending)')
  }
  if (!/^\s*name:\s*ci-verify\s*(?:#.*)?$/m.test(text)) {
    problems.push('the job name ci-verify (required status check) is missing')
  }
  return problems
}

function pinProblems() {
  const problems = []
  const notes = []

  const nvmrc = readBytesOrNull('.nvmrc')
  if (nvmrc === null) problems.push('.nvmrc: missing')
  else if (nvmrc.toString('utf8').trim() !== EXPECTED_NODE_MAJOR) {
    problems.push(`.nvmrc: must be ${EXPECTED_NODE_MAJOR}`)
  }

  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  if (pkg?.engines?.node !== `${EXPECTED_NODE_MAJOR}.x`) {
    problems.push(`package.json: engines.node must be ${EXPECTED_NODE_MAJOR}.x`)
  }

  const present = VERCEL_PIN_FILES.filter((file) => existsSync(file))
  if (present.length === 0) {
    notes.push('vercel pin: no deploy files yet (checked once they exist)')
  } else {
    const all = new Set()
    for (const file of VERCEL_PIN_FILES) {
      if (!existsSync(file)) {
        problems.push(
          `${file}: missing (the Vercel CLI pin must exist in all of ${VERCEL_PIN_FILES.join(', ')})`,
        )
        continue
      }
      const pins = vercelPins(readFileSync(file, 'utf8'))
      if (pins.length === 0) problems.push(`${file}: no exact vercel@x.y.z pin`)
      if (pins.length > 1) problems.push(`${file}: several Vercel CLI pins (${pins.join(', ')})`)
      for (const pin of pins) all.add(pin)
    }
    if (all.size > 1)
      problems.push(`Vercel CLI pins differ: ${[...all].join(', ')} (bump all three in one commit)`)
    else if (all.size === 1) notes.push(`vercel pin: ${[...all][0]} in ${present.length} files`)
  }

  const ci = readBytesOrNull('.github/workflows/ci.yml')
  if (ci === null) notes.push('ci.yml: not present yet')
  else
    for (const p of ciWorkflowProblems(ci.toString('utf8')))
      problems.push(`.github/workflows/ci.yml: ${p}`)

  return { problems, notes }
}

/** CLI entry point; returns the exit code. */
export function main(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  if (argv.length > 0) {
    io.stderr.write(`error: unexpected arguments: ${argv.join(' ')}\n`)
    return 1
  }
  try {
    const failures = []
    let textFiles = 0
    for (const file of listRepoFiles()) {
      const bytes = readBytesOrNull(file)
      if (bytes === null || isBinaryContent(file, bytes)) continue
      textFiles += 1
      for (const problem of encodingProblems(file, bytes)) failures.push(`${file}: ${problem}`)
    }

    const lockBytes = readBytesOrNull('package-lock.json')
    if (lockBytes === null) failures.push('package-lock.json: missing')
    else {
      for (const problem of lockfileNativeProblems(JSON.parse(lockBytes.toString('utf8')))) {
        failures.push(
          `package-lock.json: ${problem} (regenerate the lockfile on Windows: see CLAUDE.md)`,
        )
      }
    }

    const { problems, notes } = pinProblems()
    failures.push(...problems)

    for (const failure of failures) io.stdout.write(`FAIL ${failure}\n`)
    for (const note of notes) io.stdout.write(`note: ${note}\n`)
    if (failures.length > 0) {
      io.stderr.write(`hygiene: ${failures.length} problem(s)\n`)
      return 1
    }
    io.stdout.write(
      `hygiene: ok (${textFiles} text files: UTF-8, no BOM, LF; lockfile natives; pins)\n`,
    )
    return 0
  } catch (error) {
    if (error instanceof CheckError || error instanceof SyntaxError) {
      io.stderr.write(`error: ${error.message}\n`)
      return 1
    }
    throw error
  }
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2))
}
