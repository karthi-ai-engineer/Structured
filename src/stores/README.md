# src/stores

Client-side UI state (zustand stores), added from Phase 1 (PLAN.md section 6).
Stores hold view state only (selected day, open sheets, drafts); server data lives in the TanStack Query cache through `src/data/queries`.
Never import `server/` or `@supabase/*` here (enforced by ESLint).
