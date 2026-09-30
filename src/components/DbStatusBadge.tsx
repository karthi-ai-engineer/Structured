import {
  CircleAlert,
  CircleCheck,
  LoaderCircle,
  TriangleAlert,
  WifiOff,
  type LucideIcon,
} from 'lucide-react'
import { SUPABASE_ENV_VARS } from '@/data/env'
import type { DbErrorCode } from '@/data/errors'
import type { DbStatus } from '@/data/health'
import { cn } from '@/lib/utils'

// Fixed copy per state and error code (docs/phases/phase-0/PLAN.md 6.6, D0-30). The badge never
// renders a URL, a key or a server message: only this copy, variable names and the error code.

type KnownErrorCode = Extract<
  DbErrorCode,
  | 'offline'
  | 'network'
  | 'timeout'
  | 'paused'
  | 'invalid-key'
  | 'schema-missing'
  | 'permission'
  | 'write-not-visible'
>

const ERROR_DETAIL: Readonly<Record<KnownErrorCode, string>> = {
  offline: "You're offline. Connect, then check again.",
  network: "Can't reach the database. Check your connection.",
  timeout: 'The database is slow to respond. Check again in a moment.',
  paused: 'The Supabase project is paused. Restore it in the Supabase dashboard (see HANDOFF.md).',
  'invalid-key': 'The API key was rejected. Re-pull the environment and redeploy.',
  'schema-missing': 'The database schema is missing. Run npm run db:push.',
  permission: 'Table permissions (grants) are missing.',
  'write-not-visible': 'The settings row was written but cannot be read back.',
}
const UNEXPECTED_DETAIL = 'Unexpected database error.'

function isKnownErrorCode(code: DbErrorCode): code is KnownErrorCode {
  return Object.hasOwn(ERROR_DETAIL, code)
}

function errorDetail(code: DbErrorCode): string {
  return isKnownErrorCode(code) ? ERROR_DETAIL[code] : UNEXPECTED_DETAIL
}

/** The variable names behind the problems (each problem starts with its variable's name). */
function missingVariables(problems: readonly string[]): string {
  const named = SUPABASE_ENV_VARS.filter((name) => problems.some((p) => p.startsWith(name)))
  return (named.length > 0 ? named : SUPABASE_ENV_VARS).join(', ')
}

interface BadgeView {
  title: string
  detail: string | null
  code: string | null
  Icon: LucideIcon
  iconClassName: string
}

function viewOf(status: DbStatus): BadgeView {
  switch (status.state) {
    case 'checking':
      return {
        title: 'Checking database…',
        detail: null,
        code: null,
        Icon: LoaderCircle,
        iconClassName: 'text-muted-foreground motion-safe:animate-spin',
      }
    case 'connected':
      return {
        title: 'DB connected',
        detail: status.settingsRow === 'created' ? 'Settings row created' : 'Settings row found',
        code: null,
        Icon: CircleCheck,
        iconClassName: 'text-emerald-600',
      }
    case 'not-configured':
      return {
        title: 'Database not configured',
        detail: `Missing or invalid: ${missingVariables(status.problems)}`,
        code: null,
        Icon: CircleAlert,
        iconClassName: 'text-amber-600',
      }
    case 'error':
      return {
        title: 'Database error',
        detail: errorDetail(status.code),
        code: status.code,
        Icon: status.code === 'offline' ? WifiOff : TriangleAlert,
        iconClassName: 'text-destructive',
      }
  }
}

/** The database status: state in text plus an icon (never colour alone), announced politely. */
export function DbStatusBadge({ status }: { status: DbStatus }) {
  const { title, detail, code, Icon, iconClassName } = viewOf(status)
  return (
    <div
      data-testid="db-status"
      data-state={status.state}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-card-foreground shadow-xs"
    >
      {/* Inline SVG in HTML needs no namespace; dropping it keeps the badge free of any URL. */}
      <Icon aria-hidden="true" xmlns={undefined} className={cn('mt-0.5 size-5', iconClassName)} />
      <div className="min-w-0 flex-1 space-y-1">
        <p data-testid="db-status-title" className="font-medium">
          {title}
        </p>
        {detail === null ? null : (
          <p data-testid="db-status-detail" className="text-sm text-muted-foreground">
            {detail}
          </p>
        )}
        {code === null ? null : (
          <p data-testid="db-status-code" className="font-mono text-xs text-muted-foreground">
            code: {code}
          </p>
        )}
      </div>
    </div>
  )
}
