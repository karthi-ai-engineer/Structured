// Writes the database's session-pooler connection URL (with the password) to stdout, for piping
// only, never to the screen. The backup workflow needs it as the GitHub secret SUPABASE_DB_URL:
//
//   node scripts/lib/db-url.mjs | gh secret set SUPABASE_DB_URL
//
// The pooler address comes from `supabase/.temp/pooler-url` (written by `npm run db:link`), the
// password from .env.local. GitHub runners have no IPv6, so the direct database host would not
// work there; the session pooler (port 5432) supports pg_dump.
import { readFileSync } from 'node:fs'
import { readEnvFile } from './env-file.mjs'

const POOLER_FILE = 'supabase/.temp/pooler-url'

let pooler
try {
  pooler = new URL(readFileSync(POOLER_FILE, 'utf8').trim())
} catch {
  console.error(`db-url: ${POOLER_FILE} is missing; run npm run db:link first`)
  process.exit(1)
}
const password = readEnvFile('.env.local').SUPABASE_DB_PASSWORD
if (!password) {
  console.error('db-url: SUPABASE_DB_PASSWORD is missing in .env.local')
  process.exit(1)
}
pooler.password = encodeURIComponent(password)
pooler.port = '5432'
process.stdout.write(pooler.toString())
