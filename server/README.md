# server/

Server-only code, added in Phase 2: the Supabase admin client (`db.ts`, secret key) and the MCP server (`mcp/`) (PLAN.md sections 6 and 10).
It may import `src/core` (relative paths with `.ts` extensions); nothing under `src/` may ever import `server/`.
Before adding TypeScript here, add a `tsconfig.server.json` referenced from `tsconfig.json` (see CLAUDE.md, Architecture).
