// Browser Supabase configuration, validated in one place (docs/phases/phase-0/PLAN.md 6.2).
//
// Used by src/data/supabase.ts at runtime and by the production build guard in vite.config.ts,
// which loads this file in plain Node. So it stays dependency-free: no imports at all.
//
// Every problem names the variable and never echoes its value: build logs are public.

export const SUPABASE_URL_VAR = 'VITE_SUPABASE_URL'
export const SUPABASE_KEY_VAR = 'VITE_SUPABASE_PUBLISHABLE_KEY'
/** The browser variables, in display order. */
export const SUPABASE_ENV_VARS = [SUPABASE_URL_VAR, SUPABASE_KEY_VAR] as const

export type SupabaseEnv =
  { ok: true; url: string; publishableKey: string } | { ok: false; problems: readonly string[] }

export interface ReadSupabaseEnvOptions {
  /** Production builds: only a new-style publishable key (`sb_publishable_...`) is accepted. */
  requirePublishable?: boolean
}

/** What `vercel pull` / `vercel env pull` write in place of a Secret (sensitive) value. */
const VERCEL_PLACEHOLDERS: readonly string[] = ['SENSITIVE_ENV_VALUE_PLACEHOLDER', '[SENSITIVE]']
const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1']
const PUBLISHABLE_PREFIX = 'sb_publishable_'
const SECRET_PREFIX = 'sb_secret_'
const KEY_CHARACTERS = /^[A-Za-z0-9_.-]+$/
const BASE64URL = /^[A-Za-z0-9_-]+$/

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code <= 0x1f || code === 0x7f) return true
  }
  return false
}

/** Checks shared by both variables. Returns the first problem, or null. */
function valueProblem(name: string, value: string | undefined): string | null {
  if (value === undefined || value === '') return `${name} is missing`
  if (VERCEL_PLACEHOLDERS.includes(value.trim())) {
    return `${name} is a Vercel Secret placeholder; store it as Config (not sensitive)`
  }
  if (value.trim() !== value) return `${name} has leading or trailing whitespace`
  if (hasControlCharacter(value)) return `${name} contains control characters`
  return null
}

function urlProblem(name: string, value: string): string | null {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return `${name} is not a valid URL`
  }
  const isLocal = LOCAL_HOSTS.includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && isLocal)) {
    return `${name} must use https (http is allowed only for localhost)`
  }
  if (url.username !== '' || url.password !== '') {
    return `${name} must not contain a user name or password`
  }
  if (url.search !== '' || url.hash !== '' || value.includes('?') || value.includes('#')) {
    return `${name} must not have a query string or fragment`
  }
  if (url.pathname !== '/') {
    return `${name} must be the project URL without a path (for example no /rest/v1)`
  }
  return null
}

function decodeBase64Url(segment: string): string | null {
  if (!BASE64URL.test(segment)) return null
  const base64 = segment.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  } catch {
    return null
  }
}

/** The `role` claim of a legacy Supabase JWT key, or null when the value is not such a JWT. */
function legacyJwtRole(value: string): string | null {
  const parts = value.split('.')
  if (parts.length !== 3 || !parts[0]?.startsWith('eyJ')) return null
  const json = decodeBase64Url(parts[1] ?? '')
  if (json === null) return null
  try {
    const payload: unknown = JSON.parse(json)
    if (typeof payload === 'object' && payload !== null && 'role' in payload) {
      return typeof payload.role === 'string' ? payload.role : null
    }
    return null
  } catch {
    return null
  }
}

function keyProblem(name: string, value: string, requirePublishable: boolean): string | null {
  const jwtRole = legacyJwtRole(value)
  if (value.startsWith(SECRET_PREFIX) || jwtRole === 'service_role') {
    return `${name} is a secret key; a secret key must never be used in the browser`
  }
  if (value.startsWith(PUBLISHABLE_PREFIX)) {
    return value.length > PUBLISHABLE_PREFIX.length && KEY_CHARACTERS.test(value)
      ? null
      : `${name} is not a valid publishable key`
  }
  if (requirePublishable) return `${name} must be a publishable key (sb_publishable_...)`
  if (jwtRole !== null) return null // legacy anon JWT, accepted outside production builds
  return `${name} is neither a publishable key nor a legacy anon key`
}

/**
 * Validates the browser Supabase variables. Rejects missing values, Vercel Secret placeholders,
 * surrounding whitespace, control characters, non-root or non-https URLs and secret keys.
 */
export function readSupabaseEnv(
  env: Readonly<Record<string, string | undefined>>,
  options: ReadSupabaseEnvOptions = {},
): SupabaseEnv {
  const url = env[SUPABASE_URL_VAR]
  const key = env[SUPABASE_KEY_VAR]
  const problems: string[] = []

  const urlIssue = valueProblem(SUPABASE_URL_VAR, url) ?? urlProblem(SUPABASE_URL_VAR, url ?? '')
  if (urlIssue !== null) problems.push(urlIssue)

  const keyIssue =
    valueProblem(SUPABASE_KEY_VAR, key) ??
    keyProblem(SUPABASE_KEY_VAR, key ?? '', options.requirePublishable === true)
  if (keyIssue !== null) problems.push(keyIssue)

  if (problems.length > 0 || url === undefined || key === undefined) {
    return { ok: false, problems }
  }
  return { ok: true, url, publishableKey: key }
}
