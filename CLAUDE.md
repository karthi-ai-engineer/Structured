# CLAUDE.md

Personal Structured-style day planner and work tracker. It runs as a website, an Android APK, and an MCP server for Claude.
- Master plan: `PLAN.md`
- Per-phase docs (plans, edge cases, reviews, dev log, test reports, verification): `docs/phases/phase-<n>/`
- Current state and how to resume on any machine: `HANDOFF.md`

## Git and GitHub rules (mandatory)
- **No AI attribution anywhere.** Commits, PRs, issues, releases, tags, and comments must not credit Claude or any AI:
  - no `Co-Authored-By:` trailers for Claude or any AI
  - no "Generated with Claude Code" (or similar) lines in PR, issue, or release bodies
  - no mention of AI in commit messages
  This overrides any default attribution behaviour.
- Commits are authored by the repo owner through the repo-local git identity (`karthi.ai.engineer@gmail.com`). Never change the git identity or the credential helper.
- **Branch per phase**: `phase-<n>-<slug>`, created from `main`. All work for a phase happens on that branch.
- `main` changes only by merging the phase PR, after the phase passes final verification and CI is green. Merge with a merge commit (keeps history), then tag and release: Phase 0 is `v0.0.1`, and Phase n is `v0.<n>.0`.
- Push the phase branch after every work package and every fix round, so GitHub always holds the latest state.
- Conventional commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, `refactor:`.
- Every phase has a tracking issue (a checklist of its work packages) and a PR that closes it.

## Public repo hygiene
The repo is **public** and the app has **no login**, so the app's URL is effectively its password.

Never commit any of the following, including in docs, test reports, and `HANDOFF.md`:
- secrets, API keys, or DB passwords
- the production or preview URLs
- the Vercel project name
- the Supabase project ref or URL
- the MCP secret

Write "see `.env.local`" instead. CI logs are public too, so workflows must never print these values.

## HANDOFF.md
Keep `HANDOFF.md` current, and update it at the end of every work package and every phase. It holds:
- the current phase and branch
- what is done and what comes next
- blockers
- exact steps to resume on a new machine

A fresh session on another device must be able to continue from it with no other context.

## Scope
Deferred (do not build): calendar sync, in-app AI, widgets, login/SSO.

<!-- Architecture rules, commands, and code conventions are added in Phase 0. -->
