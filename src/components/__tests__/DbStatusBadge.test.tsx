import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { DbStatusBadge } from '@/components/DbStatusBadge'
import type { DbErrorCode } from '@/data/errors'
import type { DbStatus } from '@/data/health'

function render(status: DbStatus): string {
  return renderToStaticMarkup(<DbStatusBadge status={status} />)
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#x27;': "'",
}

/** The decoded text of the element with this data-testid, or null when it is absent. */
function textOf(markup: string, testId: string): string | null {
  const match = new RegExp(`data-testid="${testId}"[^>]*>([^<]*)<`).exec(markup)
  if (!match) return null
  return (match[1] ?? '').replace(/&(?:amp|lt|gt|quot|#x27);/g, (entity) => ENTITIES[entity] ?? '')
}

const ERROR_COPY: ReadonlyArray<readonly [DbErrorCode, string]> = [
  ['offline', "You're offline. Connect, then check again."],
  ['network', "Can't reach the database. Check your connection."],
  ['timeout', 'The database is slow to respond. Check again in a moment.'],
  [
    'paused',
    'The Supabase project is paused. Restore it in the Supabase dashboard (see HANDOFF.md).',
  ],
  ['invalid-key', 'The API key was rejected. Re-pull the environment and redeploy.'],
  ['schema-missing', 'The database schema is missing. Run npm run db:push.'],
  ['permission', 'Table permissions (grants) are missing.'],
  ['write-not-visible', 'The settings row was written but cannot be read back.'],
  ['unexpected', 'Unexpected database error.'],
  ['pg-23514', 'Unexpected database error.'],
  ['pg-PGRST116', 'Unexpected database error.'],
  ['http-500', 'Unexpected database error.'],
  ['constructor', 'Unexpected database error.'] as unknown as readonly [DbErrorCode, string],
]

const ALL_STATES: ReadonlyArray<readonly [string, DbStatus]> = [
  ['checking', { state: 'checking' }],
  ['connected (found)', { state: 'connected', settingsRow: 'found' }],
  ['connected (created)', { state: 'connected', settingsRow: 'created' }],
  [
    'not-configured',
    {
      state: 'not-configured',
      problems: ['VITE_SUPABASE_URL must use https (http is allowed only for localhost)'],
    },
  ],
  ...ERROR_COPY.map(
    ([code]) => [`error ${code}`, { state: 'error', code }] as readonly [string, DbStatus],
  ),
]

describe('DbStatusBadge', () => {
  it.each(ALL_STATES)('%s: is a polite live status region with test ids', (_label, status) => {
    const markup = render(status)
    expect(markup).toContain('data-testid="db-status"')
    expect(markup).toContain(`data-state="${status.state}"`)
    expect(markup).toContain('role="status"')
    expect(markup).toContain('aria-live="polite"')
    expect(textOf(markup, 'db-status-title')).not.toBeNull()
    // State is conveyed by an icon as well as text, and the icon is hidden from screen readers.
    expect(markup).toMatch(/<svg[^>]*aria-hidden="true"/)
  })

  it.each(ALL_STATES)('%s: never renders a URL', (_label, status) => {
    const markup = render(status)
    expect(markup).not.toContain('://')
    // The only permitted "http" is the http-<status> error code itself (PLAN 6.4).
    const withoutCode =
      status.state === 'error' ? markup.replace(`code: ${status.code}`, '') : markup
    expect(withoutCode.toLowerCase()).not.toContain('http')
  })

  it('shows the checking state without detail or code, with a reduced-motion-safe spinner', () => {
    const markup = render({ state: 'checking' })
    expect(textOf(markup, 'db-status-title')).toBe('Checking database…')
    expect(textOf(markup, 'db-status-detail')).toBeNull()
    expect(textOf(markup, 'db-status-code')).toBeNull()
    expect(markup).toContain('motion-safe:animate-spin')
    expect(markup).not.toMatch(/(^|[\s"])animate-spin/)
  })

  it.each([
    ['found', 'Settings row found'],
    ['created', 'Settings row created'],
  ] as const)('shows exactly "DB connected" with "%s"', (settingsRow, detail) => {
    const markup = render({ state: 'connected', settingsRow })
    expect(textOf(markup, 'db-status-title')).toBe('DB connected')
    expect(textOf(markup, 'db-status-detail')).toBe(detail)
    expect(textOf(markup, 'db-status-code')).toBeNull()
  })

  it.each([
    [
      'both variables',
      ['VITE_SUPABASE_URL is missing', 'VITE_SUPABASE_PUBLISHABLE_KEY is missing'],
      'Missing or invalid: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY',
    ],
    [
      'only the key',
      ['VITE_SUPABASE_PUBLISHABLE_KEY is a Vercel Secret placeholder; store it as Config'],
      'Missing or invalid: VITE_SUPABASE_PUBLISHABLE_KEY',
    ],
    [
      'no known variable (no client)',
      [],
      'Missing or invalid: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY',
    ],
  ] as const)('names the variables only (%s)', (_label, problems, detail) => {
    const markup = render({ state: 'not-configured', problems })
    expect(textOf(markup, 'db-status-title')).toBe('Database not configured')
    expect(textOf(markup, 'db-status-detail')).toBe(detail)
    for (const problem of problems) {
      expect(markup).not.toContain(problem.slice(problem.indexOf(' ') + 1))
    }
  })

  it.each(ERROR_COPY)('shows the fixed copy and the code for error %s', (code, detail) => {
    const markup = render({ state: 'error', code })
    expect(textOf(markup, 'db-status-title')).toBe('Database error')
    expect(textOf(markup, 'db-status-detail')).toBe(detail)
    expect(textOf(markup, 'db-status-code')).toBe(`code: ${code}`)
    expect(markup).toMatch(/data-testid="db-status-code"[^>]*class="[^"]*font-mono/)
  })
})
