// Server-side environment (Vercel function env; locally .env.local). Only names are ever
// reported, never values: function logs are visible in the Vercel dashboard.

export interface ServerEnv {
  supabaseUrl: string
  secretKey: string
  mcpSecret: string
}

/** Shortest accepted MCP secret: it is the connector's only protection (PLAN.md section 10.2). */
export const MIN_MCP_SECRET_LENGTH = 32

export function readServerEnv(env: Record<string, string | undefined> = process.env): ServerEnv {
  const supabaseUrl = env.SUPABASE_URL?.trim() || env.VITE_SUPABASE_URL?.trim() || ''
  const secretKey = env.SUPABASE_SECRET_KEY?.trim() ?? ''
  const mcpSecret = env.MCP_SECRET?.trim() ?? ''
  const missing: string[] = []
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL')
  if (!secretKey) missing.push('SUPABASE_SECRET_KEY')
  if (mcpSecret.length < MIN_MCP_SECRET_LENGTH) {
    missing.push(`MCP_SECRET (at least ${MIN_MCP_SECRET_LENGTH} characters)`)
  }
  if (missing.length > 0) throw new Error(`MCP server env is incomplete: ${missing.join(', ')}`)
  return { supabaseUrl, secretKey, mcpSecret }
}
