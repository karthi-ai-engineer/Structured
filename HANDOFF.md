# HANDOFF

> Read this first when resuming on any device. It is updated at the end of every work package, every phase, and before every machine switch.

## Current status
- **Phase:** 0 (Foundation), implementation in progress
- **Branch:** `phase-0-foundation`
- **Last updated:** 2026-09-30 11:53 UTC+9
- **Pipeline stage reached:** stage 7 (implement). Stages 1 to 6 are done:
  - plan, edge-case research, replan and design review: `docs/phases/phase-0/PLAN.md` (approved in `review-r2.md`)
  - tracking issue **#1** ("Phase 0: Foundation", labels `phase`, `phase-0`)
- **Work packages:**
  - **WP1 done** (scaffold and repo hygiene): Vite 8 + React 19 + TypeScript 6.0 strict app in the repo root, `@/` alias (TS and Vite), `.gitattributes` (LF), `.editorconfig`, `.nvmrc` 24, `engines.node` 24.x, privacy metas, strict dev/preview ports, favicon and `robots.txt`. Details: `docs/phases/phase-0/DEVLOG.md`.
  - **WP2 done** (styling, lint and architecture rules): Tailwind CSS v4 (`@tailwindcss/vite`, entry `src/styles/index.css`), shadcn/ui 4.21.0 (`radix-nova`, `cn`, `Button` rendered as a disabled "Check again" placeholder), type-aware ESLint with the boundary and clock rules (six negative probes verified), Prettier (`format`, `format:check`), README-only placeholders in `src/features`, `src/stores`, `src/data/queries`, `server` and `api`, and `CLAUDE.md` part 1 (architecture, import rules, code and data conventions, migrations checklist, Windows rules, session-start ritual). Details: `docs/phases/phase-0/DEVLOG.md`.
  - **WP3 done** (tests, CI and repo checks): Vitest 5 (hermetic: `TZ=America/St_Johns` set in `vitest.config.ts`, blanked `VITE_*`, a rejecting `fetch` stub), the `.env` tool `scripts/lib/env-file.mjs` (`env:check`), the repo checks `check:hygiene`, `check:leaks`, `check:commits` and `check:core` (`npm run check`), and `npm run verify` as the full local gate. `.github/workflows/ci.yml` runs the **`ci-verify`** job on every push and PR (Node 24 from `.nvmrc`, npm cache); it is green on the push and the PR. Also `.github/dependabot.yml`, the PR template and issue forms, and the labels `dependencies` and `ci`. Details: `docs/phases/phase-0/DEVLOG.md`.
  - **WP4 done** (time-zone core): `src/core/dates.ts` has the full PLAN §6.1 API. It uses `date-fns` 4.4 and `@date-fns/tz` 1.5; zone offsets are computed exactly from Intl wall-clock parts, because `tzOffset()` gets historical sub-hour negative offsets wrong. It has 320 table-driven tests (API signatures, zones including Kolkata, New York, Chatham, London, Santiago, Lord Howe and historical DST, times, calendar, formatting) and the coverage thresholds 95/95/100/90 in `vitest.config.ts` (actual: 99.45 % statements, 99.13 % branches, 100 % functions). `check:core` prints `ok src/core/dates.ts`, and CI is green on Node 24. The deviations (exact offsets, true start of day, `msUntilNextDayIn` across a repeated midnight) are in `docs/phases/phase-0/DEVLOG.md`.
  - WP5 to WP9: not started.
- **Resume with:** `resumeFrom: "implement"`, `skipWPs: ["WP1", "WP2", "WP3", "WP4"]`
- **IDs:** tracking issue #1, draft PR #2 (`phase-0-foundation` → `main`, `Closes #1`), ruleset: none yet (WP8).
- **Pipeline for Phase 0:** `.claude/workflows/phase-pipeline.js`, with args in `docs/phases/phase-0/pipeline-args.json`
- **Cloud resources created so far:** none. The Supabase project (WP5) and the Vercel project (WP7) are created later in this phase.
- **Already set up:** GitHub repo, `VERCEL_TOKEN` repo secret (Vercel scope "Karthi Labs"), Supabase org "Karthi labs".
- **Next:** WP5: the Supabase project `structured` (ap-south-1), the migration `0001_init.sql`, generated types, the env tooling and the integration tests. The opening ritual gains `npm run db:ping` from WP5 on. Then WP6 to WP9, QA rounds, final verification and Ship. After Phase 0, Phase 1 runs the **team workflow**: `docs/process/TEAM_WORKFLOW.md`, `.claude/workflows/team-pipeline.js`, and `docs/phases/phase-1/pipeline-args.json`.
- **Blockers:** none.
- **Notes:**
  - Local Node 26 prints an `EBADENGINE` warning for `engines.node = 24.x`; this is expected (CI and Vercel use Node 24).
  - The owner's commit `28df4fd` (balanced team-pipeline profile) landed after the plan baseline `1195168`; WP2 kept its `CLAUDE.md` paragraph verbatim (see DEVLOG WP1 and WP2).
  - Local gate: `npm run verify` (typecheck, lint, format:check, test:coverage, build, and `npm run check`). Run `npm run check:commits` and `npm run check:leaks` before every push; run `node scripts/checks/commits.mjs --text-file <file>` on any PR, issue or release text before `gh … create/edit`.
  - CI: `CI / ci-verify` runs on every push and PR. The `main` ruleset (WP8) will require it; never rename the job or add path filters.
  - All date and time logic goes through `src/core/dates.ts` (ESLint blocks reading the clock anywhere else). The coverage thresholds for `src/core` are enforced by `npm run test:coverage` (part of `verify` and CI).
- **Optional before Phase 1:** run `gh auth refresh -s project` so the pipeline can maintain a GitHub Project board.

## How to continue on another machine
Run these in Git Bash.
1. Install Node 24 (the version in `.nvmrc`), Git, GitHub CLI, and Claude Code.
2. `gh auth login` (account `karthi-ai-engineer`), then `git clone -b phase-0-foundation https://github.com/karthi-ai-engineer/Structured.git`, then `cd Structured`.
3. Inside the repo, set the identity and credentials (single quotes, so Git Bash does not expand `!`):
   - `git config user.email karthi.ai.engineer@gmail.com`
   - `git config credential.https://github.com.helper ''`
   - `git config --add credential.https://github.com.helper '!gh auth git-credential'`
4. `npm ci`, then `npm run verify` (must exit 0).
5. Log in to the clouds (same accounts as before): `npx supabase login` and `npx vercel login`.
6. Once the cloud projects exist (WP5 and WP7), restore the secrets: `npx vercel link` (pick the existing `structured-*` project in "Karthi Labs"; never create a new one), then `npx vercel env pull .env.local`, then `npx supabase link --project-ref <SUPABASE_PROJECT_REF from .env.local>`. WP9 replaces this step with the rehearsed, link-safe sequence.
7. Open Claude Code in the repo and say, for example: *"Read HANDOFF.md and CLAUDE.md, then resume the Phase 0 pipeline."* Claude should:
   - take `docs/phases/phase-0/pipeline-args.json`
   - fill in `root` (this clone's absolute path), `today`, `envNotes` (this machine's tools), `resumeFrom` and `skipWPs` (from **Current status** above)
   - run `Workflow({ scriptPath: ".claude/workflows/phase-pipeline.js", args: <that JSON> })`

## How we work
See `CLAUDE.md` ("Running a phase") and `PLAN.md` §14. Every phase: branch → tracking issue → pipeline → PR → CI → merge → deploy → release. No AI attribution anywhere.
