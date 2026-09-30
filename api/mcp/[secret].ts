// The MCP server for Claude (PLAN.md section 10): https://<app>/api/mcp/<MCP_SECRET>.
// Stateless Streamable HTTP (2026-07-28 protocol, with the 2025 fallback), served by
// server/mcp/entry.ts. This file stays a thin Vercel entry point.

import { createEntry } from '../../server/mcp/entry.ts'

const entry = createEntry()

export function POST(request: Request): Promise<Response> {
  return entry(request)
}

export function GET(request: Request): Promise<Response> {
  return entry(request)
}

export function DELETE(request: Request): Promise<Response> {
  return entry(request)
}
