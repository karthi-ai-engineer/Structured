# Phase 0: final verification

- **Date:** 2026-09-30
- **Branch:** `phase-0-foundation` at the head of PR #2
- **Verdict: PASS**, ready to ship as `v0.0.1`

The phase was verified directly with fresh evidence. The pipeline's two separate test rounds were skipped: the owner asked for a faster process, and every check they would run is covered below.

| Check | Evidence | Result |
|---|---|---|
| Full local gate | `npm run verify`: typecheck, lint (0 warnings), format check, 25 test files and **796 tests**, coverage for `src/core` 99.45 / 99.13 / 100 / 99.4 %, build, and repo checks (hygiene, leaks, commit attribution, plain-Node core) | ✅ exit 0 |
| CI on the PR | `ci-verify` green on the latest pushes of PR #2 | ✅ |
| Real database | `npm run test:integration`: **7/7** against the live Supabase project (read and write on `__test__` rows); `npm run db:ping` returns 200 | ✅ |
| Production app | Headless Edge render of the production URL: the page shows **"DB connected"** and carries a `build-sha` meta tag | ✅ |
| Branch protection | Ruleset "main protection" is active: PR required, merge commits only, `ci-verify` required, no force-push or deletion | ✅ |
| Deploy secrets | `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `PROD_URL` present as repo secrets | ✅ |
| Code scanning | CodeQL default setup `configured`; languages are confirmed after the merge (HANDOFF "Ship follow-ups") | ✅ |
| Repo presentation | Description and 12 topics set; README rewritten | ✅ |
| Public-repo privacy | No `.env.local` value (keys, URLs, project names) in files, commit messages, the PR #2 or issue #1 text, or comments; no AI attribution anywhere | ✅ |

## Open item for the owner (optional)
**AC 24 bullet 2, the "first load recreates the settings row" test on production.** It needs the live `settings` row deleted, which requires the owner's explicit OK.
- **Covered meanwhile by:** the unit tests of the settings repository, the integration tests, and the production "DB connected" read.
- **To run it:**
  1. Delete the row with a one-off secret-key command.
  2. Load production: the page must show `Settings row created`.
  3. Reload: the page must show `Settings row found`.
