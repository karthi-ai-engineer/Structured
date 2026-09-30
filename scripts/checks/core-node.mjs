// Core load check (docs/phases/phase-0/PLAN.md section 8.9, D0-23, F35). Imports every non-test
// module in src/core with plain Node (type stripping), the way a Phase 2 Vercel function or a
// Node script would. It fails on `@/` aliases, extensionless relative imports, TypeScript syntax
// that cannot be stripped (enums, namespaces, parameter properties) and browser-only globals at
// module load time.
//
// Output: `ok <file>` or `FAIL <file>: <error code>`. Exit 1 on any failure.

import { readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

export const CORE_DIR = join('src', 'core')

/**
 * Non-test TypeScript modules under a folder (sorted, POSIX-style relative paths).
 * @param {string} root repo root
 */
export function listCoreModules(root = process.cwd()) {
  const base = join(root, CORE_DIR)
  let entries
  try {
    entries = readdirSync(base, { recursive: true, withFileTypes: true })
  } catch (error) {
    if (error && error.code === 'ENOENT') return []
    throw error
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .filter(
      (file) =>
        file.endsWith('.ts') &&
        !file.endsWith('.d.ts') &&
        !/\.(?:test|spec)\.ts$/.test(file) &&
        !file.split('/').includes('__tests__'),
    )
    .sort()
}

/** CLI entry point; resolves to the exit code. */
export async function main(argv, io = { stdout: process.stdout, stderr: process.stderr }) {
  if (argv.length > 0) {
    io.stderr.write(`error: unexpected arguments: ${argv.join(' ')}\n`)
    return 1
  }
  const files = listCoreModules()
  if (files.length === 0) {
    io.stdout.write('core: no modules in src/core yet (nothing to load)\n')
    return 0
  }
  let failed = 0
  for (const file of files) {
    try {
      await import(pathToFileURL(join(process.cwd(), file)).href)
      io.stdout.write(`ok ${file}\n`)
    } catch (error) {
      failed += 1
      // Only the code: messages can contain absolute paths of the machine.
      io.stdout.write(`FAIL ${file}: ${error?.code ?? error?.name ?? 'Error'}\n`)
    }
  }
  if (failed > 0) {
    io.stderr.write(
      `core: ${failed} of ${files.length} module(s) do not load in plain Node. src/core must use ` +
        'relative imports with .ts extensions, no @/ aliases and only erasable TypeScript syntax.\n',
    )
    return 1
  }
  io.stdout.write(`core: ok (${files.length} module(s) load in plain Node ${process.version})\n`)
  return 0
}

if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2))
}
