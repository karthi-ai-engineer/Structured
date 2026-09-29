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

## Working agreements with the owner
- This is a personal, single-user app. Don't add login, auth, or security hardening unless asked. Mention a trade-off once, briefly, then move on.
- Use free tiers (Supabase, Vercel Hobby, GitHub Actions). Prefer rapid, phase-by-phase delivery.
- Report after each phase and ask before starting the next one.
- The owner works from more than one machine. GitHub plus `HANDOFF.md` is the only shared state, so push often and never leave important progress only on one machine.
- Contributions must be credited to the owner, who is earning GitHub achievements through real PRs and merges. Never add AI attribution (see above).

## Team workflow (Phase 1 onward): work like a software company
From Phase 1, every phase runs as a GitHub-native team process, described in **`docs/process/TEAM_WORKFLOW.md`** (the source of truth) and executed by `.claude/workflows/team-pipeline.js`. In short:
- milestone + epic issue + integration branch `phase-<n>-<slug>`
- design PR reviewed by the systems designer (blockers become `type:design` issues)
- one issue + `feat/…` PR per work package, with a code review (verdict line, inline comments) before merge
- QA rounds 1 and 2 file bug issues; one `fix/…` PR per bug; QA verifies and closes each issue
- release-prep PR (CHANGELOG, HANDOFF), then the release PR to `main` gated by `gate/final-verification`
- merge, `production` deployment, tag, and GitHub Release with generated notes; milestone and epic closed

Gates are shown with labels (`gate:*`, `status:*`) and commit statuses (`gate/design-review`, `gate/code-review`, `gate/final-verification`). One account plays every role, so reviews are comment reviews that start with `Verdict: APPROVED` or `Verdict: CHANGES REQUESTED`.

## Running a phase (multi-agent pipeline)
Phase 0 runs through the saved workflow `.claude/workflows/phase-pipeline.js` (Phase 1 onward uses `team-pipeline.js`, which has the same resume options):
1. Expert plan
2. Two edge-case researchers
3. Replan
4. Systems-designer approval loop
5. Credentials preflight
6. GitHub tracking issue
7. One developer agent per work package
8. QA test round with a fix loop
9. Adversarial test round with a fix loop
10. Final verifier
11. Ship: PR ready, CI green, merge, deploy, release

- **Start a phase**: copy the previous phase's `docs/phases/phase-<n>/pipeline-args.json`, adapt it, and run `Workflow({ name: 'phase-pipeline', args: <that JSON> })` (or pass `scriptPath: '.claude/workflows/phase-pipeline.js'`). Fill in `root`, `today`, and `envNotes` for the current machine first.
- **Resume after switching machines**: set `resumeFrom` to the first unfinished stage (`plan | edge | replan | review | implement | test1 | test2 | final | ship`), as recorded in `HANDOFF.md`. Earlier stages are read from `docs/phases/phase-<n>/`. Use `skipWPs` for finished work packages and `reviewRoundStart` to continue review numbering.
- **Before shutting down a machine mid-phase**: stop the workflow, commit every finished stage's docs on the phase branch, record the exact `resumeFrom` value in `HANDOFF.md`, and push.

<!-- Architecture rules, commands, and code conventions are added in Phase 0. -->
