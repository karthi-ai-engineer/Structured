# src/features

One folder per feature (timeline, inbox, task editor, week, month, focus, goals, stats, review, settings, search), added from Phase 1 (PLAN.md section 6).
Features compose `src/components`, read and write data only through `src/data` (repo functions and query hooks), and take all date and time logic from `src/core`.
Never import `server/` or `@supabase/*` here (enforced by ESLint).
