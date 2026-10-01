/**
 * Task search (PLAN.md T17), shared by the app and the MCP server: the `ilike` pattern for a
 * query, safe inside a PostgREST `or` filter.
 */

/** The `ilike` pattern for a search, or null when nothing searchable is left. PostgREST `or`
 *  syntax characters are removed, `*` (PostgREST's wildcard) too, and LIKE wildcards are
 *  escaped, so the query always matches literally. */
export function searchPattern(query: string): string | null {
  const clean = query
    .replace(/[,()"*]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (clean === '') return null
  return `%${clean.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}
