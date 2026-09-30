// Commit and PR text check (docs/phases/phase-0/PLAN.md section 8.8). Enforces the CLAUDE.md
// rules "no attribution trailers or generated-with lines" and "commits are authored by the owner".
//
//   node scripts/checks/commits.mjs [--range a..b] [--text-file body.md ...]
//
// Checks
// - every commit message in --range / COMMIT_RANGE / origin/main..HEAD
// - env PR_TITLE and PR_BODY when set (ci.yml passes them empty for bot-authored PRs)
// - every --text-file (run it on PR, issue and release bodies before `gh ... create/edit`)
// - the author e-mail of every commit in the range (never printed: only the short SHA)
//
// Output: `ATTRIBUTION <where>:<line> matches <rule>` and `AUTHOR <sha7>: e-mail not in the
// allowlist`. Exit 1 on any finding or error.

import { CheckError, listCommits, readBytesOrNull, resolveRange } from '../lib/repo.mjs'

// Fixtures in tests and docs build these names at runtime; this file only holds the rules.
const ASSISTANT_NAMES = [
  'claude',
  'anthropic',
  'openai',
  'chatgpt',
  'copilot',
  'gemini',
  'cursor',
  'codex',
]

/** Attribution rules (case-insensitive). */
export const ATTRIBUTION_RULES = Object.freeze([
  {
    name: 'co-authored-by-assistant',
    regex: new RegExp(`^[\\t >*-]*co-authored-by\\s*:.*(?:${ASSISTANT_NAMES.join('|')})`, 'im'),
    perLine: true,
  },
  { name: 'assistant-noreply-address', regex: /noreply@anthropic\.com/i, perLine: true },
  {
    name: 'generated-with-assistant',
    regex: /generated\s+(?:with|by)\b[\s\S]{0,40}?(?:claude|chatgpt|copilot|gemini|llm|\sai\b)/i,
    perLine: false,
  },
  { name: 'robot-emoji', regex: /\u{1F916}/u, perLine: true },
])

/** Author e-mails allowed in commits (compared case-insensitively). */
export const ALLOWED_AUTHOR_EMAILS = Object.freeze(['karthi.ai.engineer@gmail.com'])
const ALLOWED_AUTHOR_PATTERNS = Object.freeze([
  /^\d+\+karthi-ai-engineer@users\.noreply\.github\.com$/i,
  /^[^@\s]+\[bot\]@users\.noreply\.github\.com$/i,
])

/** True when a commit author e-mail is in the allowlist. */
export function isAllowedAuthorEmail(email) {
  const value = String(email ?? '')
    .trim()
    .toLowerCase()
  if (ALLOWED_AUTHOR_EMAILS.includes(value)) return true
  return ALLOWED_AUTHOR_PATTERNS.some((pattern) => pattern.test(value))
}

function lineOfIndex(text, index) {
  let line = 1
  for (let i = 0; i < index && i < text.length; i += 1) if (text.charCodeAt(i) === 10) line += 1
  return line
}

/**
 * Finds attribution in a text. Returns line numbers and rule names only.
 * @param {string} text
 * @returns {{ line: number, rule: string }[]}
 */
export function findAttribution(text) {
  const findings = []
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n')
  const lines = normalized.split('\n')
  for (const rule of ATTRIBUTION_RULES) {
    if (rule.perLine) {
      lines.forEach((line, index) => {
        if (rule.regex.test(line)) findings.push({ line: index + 1, rule: rule.name })
      })
    } else {
      const global = new RegExp(rule.regex.source, `${rule.regex.flags.replace('g', '')}g`)
      for (const match of normalized.matchAll(global)) {
        findings.push({ line: lineOfIndex(normalized, match.index ?? 0), rule: rule.name })
      }
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.rule.localeCompare(b.rule))
}

function parseArgs(argv) {
  const args = [...argv]
  let range
  const textFiles = []
  while (args.length > 0) {
    const arg = args.shift()
    if (arg === '--range' || arg === '--text-file') {
      const value = args.shift()
      if (value === undefined || value.startsWith('--'))
        throw new CheckError(`${arg} needs a value`)
      if (arg === '--range') range = value
      else textFiles.push(value)
    } else {
      throw new CheckError(`unexpected argument: ${arg}`)
    }
  }
  return { range, textFiles }
}

/** CLI entry point; returns the exit code. */
export function main(
  argv,
  io = { stdout: process.stdout, stderr: process.stderr },
  env = process.env,
) {
  try {
    const { range: cliRange, textFiles } = parseArgs(argv)
    let problems = 0
    const report = (where, text) => {
      for (const f of findAttribution(text)) {
        io.stdout.write(`ATTRIBUTION ${where}:${f.line} matches ${f.rule}\n`)
        problems += 1
      }
    }

    const title = env.PR_TITLE ?? ''
    const body = env.PR_BODY ?? ''
    if (title === '' && body === '') {
      io.stdout.write('PR text: not provided (push event or bot-authored PR)\n')
    } else {
      report('PR title', title)
      report('PR body', body)
      io.stdout.write('PR text: checked (title and body)\n')
    }

    for (const file of textFiles) {
      const bytes = readBytesOrNull(file)
      if (bytes === null) throw new CheckError(`${file}: not found`)
      report(`file ${file}`, bytes.toString('utf8'))
    }
    if (textFiles.length > 0) io.stdout.write(`text files: ${textFiles.length} checked\n`)

    const range = resolveRange(cliRange, env)
    const commits = listCommits(range)
    for (const commit of commits) {
      const sha7 = commit.sha.slice(0, 7)
      report(`commit ${sha7}`, commit.message)
      if (!isAllowedAuthorEmail(commit.email)) {
        io.stdout.write(`AUTHOR ${sha7}: e-mail not in the allowlist\n`)
        problems += 1
      }
    }
    io.stdout.write(
      `commits: ${commits.length} in ${range} checked (messages and author e-mails)\n`,
    )

    if (problems > 0) {
      io.stderr.write(
        `commits: ${problems} problem(s). CLAUDE.md forbids attribution trailers and generated-with ` +
          'lines, and commits must use the repo-local owner identity.\n',
      )
      return 1
    }
    io.stdout.write('commits: ok\n')
    return 0
  } catch (error) {
    if (error instanceof CheckError) {
      io.stderr.write(`error: ${error.message}\n`)
      return 1
    }
    throw error
  }
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2))
}
