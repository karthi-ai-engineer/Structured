// Global setup and teardown for the e2e suite: soft-deletes every live task whose title starts
// with `__test__` (the same `deleted_at` write the app's Delete button makes), so an aborted run
// never leaves test tasks in the planner. Reads .env.local; values are never printed.
import { readFileSync } from 'node:fs'

function readEnvLocal(): Record<string, string> {
  const env: Record<string, string> = {}
  for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line)
    if (match?.[1] && match[2] !== undefined) env[match[1]] = match[2].replace(/^"|"$/g, '')
  }
  return env
}

export default async function retireTestTasks(): Promise<void> {
  const env = readEnvLocal()
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) throw new Error('e2e cleanup: .env.local lacks the Supabase URL or key')

  const filter = 'title=like.__test__*&deleted_at=is.null'
  const response = await fetch(`${url}/rest/v1/tasks?${filter}`, {
    method: 'PATCH',
    headers: {
      apikey: key,
      'content-type': 'application/json',
      prefer: 'return=representation',
    },
    body: JSON.stringify({ deleted_at: new Date().toISOString() }),
  })
  if (!response.ok) throw new Error(`e2e cleanup: HTTP ${response.status}`)
  const rows = (await response.json()) as unknown[]
  if (rows.length > 0) console.log(`e2e cleanup: retired ${rows.length} leftover test task(s)`)
}
