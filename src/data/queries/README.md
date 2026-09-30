# src/data/queries

TanStack Query hooks (`useDay`, `useRange`, `useInbox`, ...), added in Phase 1 (PLAN.md section 6).
Hooks call the CRUD functions in `src/data/repo`; features use these hooks instead of calling Supabase directly.
Only `src/data` may import `@supabase/*`, and nothing in `src/` may import `server/` (enforced by ESLint).
