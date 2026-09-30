// Git helpers shared by the repo checks (scripts/checks/*.mjs). No shell is involved: git is
// spawned directly, and arguments are never interpolated into a command line.

import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { extname } from 'node:path'

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.ico',
  '.webp',
  '.avif',
  '.bmp',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.pdf',
  '.zip',
  '.gz',
  '.tgz',
  '.jar',
  '.keystore',
  '.jks',
  '.apk',
  '.aab',
  '.wasm',
  '.mp3',
  '.mp4',
  '.webm',
])

/** Default commit range when neither --range nor COMMIT_RANGE is given. */
export const DEFAULT_RANGE = 'origin/main..HEAD'

export class CheckError extends Error {
  constructor(message) {
    super(message)
    this.name = 'CheckError'
  }
}

export function git(args, options = {}) {
  try {
    return execFileSync('git', args, {
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    })
  } catch (error) {
    const stderr =
      String(error?.stderr ?? '')
        .trim()
        .split('\n')[0] ?? ''
    throw new CheckError(`git ${args[0]} failed${stderr ? `: ${stderr}` : ''}`)
  }
}

/** Tracked files plus untracked files that are not ignored (paths relative to the repo root). */
export function listRepoFiles(cwd = process.cwd()) {
  const out = git(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd })
  return [...new Set(out.split('\0').filter(Boolean))].sort()
}

/** True for files that are binary by extension. */
export function isBinaryPath(path) {
  return BINARY_EXTENSIONS.has(extname(path).toLowerCase())
}

/** Reads a file, or returns null when it no longer exists (deleted but still in the index). */
export function readBytesOrNull(path) {
  try {
    return readFileSync(path)
  } catch (error) {
    if (error && (error.code === 'ENOENT' || error.code === 'EISDIR')) return null
    throw error
  }
}

/** Binary by extension or by content (a NUL byte in the first 8 KB). */
export function isBinaryContent(path, bytes) {
  return isBinaryPath(path) || bytes.subarray(0, 8192).includes(0)
}

/**
 * The commit range to check: --range, else env COMMIT_RANGE, else origin/main..HEAD.
 * @param {string | undefined} cliRange
 */
export function resolveRange(cliRange, env = process.env) {
  const range = (cliRange ?? '').trim() || (env.COMMIT_RANGE ?? '').trim() || DEFAULT_RANGE
  if (range.startsWith('-')) throw new CheckError(`invalid commit range: ${range}`)
  return range
}

/**
 * Commits in a range, oldest first: sha, author e-mail and full message.
 * @returns {{ sha: string, email: string, message: string }[]}
 */
export function listCommits(range, cwd = process.cwd()) {
  const out = git(['log', '--reverse', '--format=%H%x1f%ae%x1f%B%x1e', range, '--'], { cwd })
  return out
    .split('\x1e')
    .map((record) => record.replace(/^\n+/, ''))
    .filter((record) => record.includes('\x1f'))
    .map((record) => {
      const [sha = '', email = '', message = ''] = record.split('\x1f')
      return { sha, email, message: message.replace(/\n+$/, '') }
    })
}

/** Takes `--name value` out of an argument list (mutates it). */
export function takeOption(args, name) {
  const index = args.indexOf(name)
  if (index === -1) return undefined
  const value = args[index + 1]
  if (value === undefined || value.startsWith('--')) throw new CheckError(`${name} needs a value`)
  args.splice(index, 2)
  return value
}

/** Reads all of stdin as UTF-8 (empty string when nothing is piped in). */
export function readAllStdin() {
  try {
    return readFileSync(0, 'utf8')
  } catch (error) {
    if (error && (error.code === 'EAGAIN' || error.code === 'EOF')) return ''
    throw error
  }
}
