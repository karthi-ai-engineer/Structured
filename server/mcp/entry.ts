// Request entry for the Vercel function api/mcp/[secret].ts (kept here so it is unit-testable).
// The secret path segment is the connector's only protection (PLAN.md section 10.2): any other
// path, and a misconfigured deployment, answer 404 without revealing whether the endpoint exists.

import { createHash, timingSafeEqual } from 'node:crypto'
import { readServerEnv, type ServerEnv } from '../env.ts'
import { createAdminDb, createSupabaseStore, type TaskStore } from '../store.ts'
import { createHandler } from './server.ts'

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest()
}

/** Constant-time comparison of the path secret. */
export function secretMatches(given: string, expected: string): boolean {
  return timingSafeEqual(digest(given), digest(expected))
}

/** The last path segment of `/api/mcp/<secret>` (URL-decoded), or null. */
export function secretFromUrl(url: string): string | null {
  const match = /\/api\/mcp\/([^/?#]+)\/?(?:[?#].*)?$/.exec(new URL(url).pathname)
  if (!match?.[1]) return null
  try {
    return decodeURIComponent(match[1])
  } catch {
    return null
  }
}

const notFound = () =>
  new Response('Not found', { status: 404, headers: { 'cache-control': 'no-store' } })

export interface EntryOptions {
  env?: () => ServerEnv
  store?: (env: ServerEnv) => TaskStore
  clock?: () => Date
}

/** Builds the function body. Env and store are created once per instance (cold start). */
export function createEntry(options: EntryOptions = {}): (request: Request) => Promise<Response> {
  let cached: { env: ServerEnv; handle: (request: Request) => Promise<Response> } | undefined
  const init = () => {
    if (!cached) {
      const env = (options.env ?? readServerEnv)()
      const store = (
        options.store ?? ((e) => createSupabaseStore(createAdminDb(e.supabaseUrl, e.secretKey)))
      )(env)
      const handler = createHandler(() => store, options.clock)
      cached = { env, handle: (request) => handler.fetch(request) }
    }
    return cached
  }

  return async (request) => {
    let entry: ReturnType<typeof init>
    try {
      entry = init()
    } catch (error) {
      // Misconfigured deployment: log the cause for the owner (readServerEnv names variables,
      // never values) and answer like any unknown path, so the endpoint is not revealed.
      console.error(error instanceof Error ? error.message : 'MCP server init failed')
      return notFound()
    }
    const given = secretFromUrl(request.url)
    if (given === null || !secretMatches(given, entry.env.mcpSecret)) return notFound()
    return entry.handle(request)
  }
}
