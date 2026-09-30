# api/

Vercel functions, added in Phase 2: `api/mcp/[secret].ts` serves the MCP server from `server/mcp` (PLAN.md section 10).
Vercel turns every `.js`/`.ts` file in this folder into a function, so keep only function entry points here.
Functions import `server/` and `src/core` only, and read secrets from Vercel environment variables, never from the repo.
Before adding TypeScript here, give it a tsconfig referenced from `tsconfig.json` (see CLAUDE.md, Architecture).
