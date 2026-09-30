# HANDOFF

> Read this first when resuming on any device. It is updated at the end of every work package, every phase, and before every machine switch.

## Current status
- **Phase:** 0 (Foundation), implementation in progress
- **Branch:** `phase-0-foundation`
- **Last updated:** 2026-09-30 13:25 UTC+9
- **Pipeline stage reached:** stage 7 (implement). Stages 1 to 6 are done:
  - plan, edge-case research, replan and design review: `docs/phases/phase-0/PLAN.md` (approved in `review-r2.md`)
  - tracking issue **#1** ("Phase 0: Foundation", labels `phase`, `phase-0`)
- **Work packages:**
  - **WP1 done** (scaffold and repo hygiene): Vite 8 + React 19 + TypeScript 6.0 strict app in the repo root, `@/` alias (TS and Vite), `.gitattributes` (LF), `.editorconfig`, `.nvmrc` 24, `engines.node` 24.x, privacy metas, strict dev/preview ports, favicon and `robots.txt`. Details: `docs/phases/phase-0/DEVLOG.md`.
  - **WP2 done** (styling, lint and architecture rules): Tailwind CSS v4 (`@tailwindcss/vite`, entry `src/styles/index.css`), shadcn/ui 4.21.0 (`radix-nova`, `cn`, `Button` rendered as a disabled "Check again" placeholder), type-aware ESLint with the boundary and clock rules (six negative probes verified), Prettier (`format`, `format:check`), README-only placeholders in `src/features`, `src/stores`, `src/data/queries`, `server` and `api`, and `CLAUDE.md` part 1 (architecture, import rules, code and data conventions, migrations checklist, Windows rules, session-start ritual). Details: `docs/phases/phase-0/DEVLOG.md`.
  - **WP3 done** (tests, CI and repo checks): Vitest 5 (hermetic: `TZ=America/St_Johns` set in `vitest.config.ts`, blanked `VITE_*`, a rejecting `fetch` stub), the `.env` tool `scripts/lib/env-file.mjs` (`env:check`), the repo checks `check:hygiene`, `check:leaks`, `check:commits` and `check:core` (`npm run check`), and `npm run verify` as the full local gate. `.github/workflows/ci.yml` runs the **`ci-verify`** job on every push and PR (Node 24 from `.nvmrc`, npm cache); it is green on the push and the PR. Also `.github/dependabot.yml`, the PR template and issue forms, and the labels `dependencies` and `ci`. Details: `docs/phases/phase-0/DEVLOG.md`.
  - **WP4 done** (time-zone core): `src/core/dates.ts` has the full PLAN §6.1 API. It uses `date-fns` 4.4 and `@date-fns/tz` 1.5; zone offsets are computed exactly from Intl wall-clock parts, because `tzOffset()` gets historical sub-hour negative offsets wrong. It has 320 table-driven tests (API signatures, zones including Kolkata, New York, Chatham, London, Santiago, Lord Howe and historical DST, times, calendar, formatting) and the coverage thresholds 95/95/100/90 in `vitest.config.ts` (actual: 99.45 % statements, 99.13 % branches, 100 % functions). `check:core` prints `ok src/core/dates.ts`, and CI is green on Node 24. The deviations (exact offsets, true start of day, `msUntilNextDayIn` across a repeated midnight) are in `docs/phases/phase-0/DEVLOG.md`.
  - **WP5 done** (Supabase): the cloud project `structured` (ap-south-1, organization "Karthi labs") was created by the idempotent `npm run db:setup` (`scripts/setup-supabase.mjs`: every CLI call uses `--agent no` with stdin ignored, JSON shapes are normalised, `projects create` runs once with a re-list fallback). `supabase/migrations/0001_init.sql` (full schema, grants, `open_access` RLS, triggers, realtime, `notify pgrst`) is pushed: `npm run db:migrations` shows `0001` locally and remotely, and a dry-run push says the remote is up to date. `src/data/database.types.ts` is generated (`npm run db:types`, no drift). Opt-in `npm run test:integration` passes 7/7 with 0 skipped. `.env.local` has the 6 keys (`PROD_URL` comes in WP7), and `.env.example` documents all 7. Details and deviations: `docs/phases/phase-0/DEVLOG.md`.
  - **WP6 done** (the "DB connected" home page):
    - `src/data`: `env.ts` validates the browser variables without ever echoing a value. `supabase.ts` is the typed client (`null` when unconfigured). `repo/settings.ts` makes every query with `.retry(false)` and the caller's abort signal. `health.ts` has `checkDatabase` (one shared 12 s deadline for read, insert and re-read; typed error codes) and `singleflight`. `dbCheck.ts` is `startDbCheck`.
    - `src/platform`: time zone and online adapters.
    - UI: `DbStatusBadge` (fixed copy per code, `role="status"`, no URLs), `RootErrorBoundary`, and `App` (React 19 `use()` under `Suspense`; "Check again" runs as a transition; no `useEffect`).
    - `vite.config.ts` refuses a production build (`REQUIRE_SUPABASE_ENV=1` or `VERCEL_ENV=production`) with an invalid env, naming only the variable. It stamps `<meta name="build-sha">` (`dev` unless `VITE_BUILD_SHA` is a SHA).
    - Manual checks: M1 ("DB connected") passed in Chrome. M2 passed: the first load created the **settings row with `timezone=Asia/Tokyo`** (the browser's zone), and a reload showed "found". M3 passed: an unconfigured build shows "Database not configured" with no console errors.
    - 705 unit tests; CI green.
    - Details and deviations are in `docs/phases/phase-0/DEVLOG.md`. Among them: the ESLint server-import rule now allows `react-dom/server`.
  - **WP7 done** (Vercel and the first production deploy):
    - The Vercel project was created once in the "Karthi Labs" team, with the secret name from `.env.local` (`VERCEL_PROJECT_NAME`), and linked (`.vercel/project.json`, gitignored). Settings: Git integration **off** (no Git link; `vercel.json` has `git.deploymentEnabled: false`), framework Vite, Node.js 24.x, **Standard Protection** (`prod_deployment_urls_and_all_previews`: the production domain is public, generated deployment URLs need a Vercel login).
    - `vercel.json` (SPA rewrite that never touches `/api` or `/assets/`, privacy headers, region `bom1`) and `.vercelignore`.
    - `npm run env:sync-vercel` (`scripts/sync-vercel-env.mjs`): the env matrix of PLAN §5.11 is in sync. All 7 app keys are in the Vercel **development** env (so `vercel env pull` restores `.env.local`), `VITE_*` are Config in production and preview, and the secret key is Secret in production.
    - `scripts/ci/deploy-prod.sh` (pull, build with the env guard, exact-value bundle check, prebuilt deploy, smoke) is the one deploy path, for `.github/workflows/deploy.yml` and for local runs. `scripts/ci/smoke.mjs` checks the build SHA, routes, headers and a live DB probe without printing URLs.
    - Production is deployed (commit `9c23319`) and passed the smoke check and the protection probe. In the owner's Chrome it shows **"DB connected"**. `PROD_URL` is in `.env.local` and the Vercel development env.
    - GitHub secrets `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` and `PROD_URL` are set (with `VERCEL_TOKEN`, 4 in total). The clean-clone rehearsal proved a tokenless `vercel build`, so `deploy.yml` should work at Ship.
    - 796 unit tests; CI green. Details and deviations: `docs/phases/phase-0/DEVLOG.md`.
  - **WP8 done** (GitHub repo settings):
    - **Ruleset 24225914** ("main protection", active, on `~DEFAULT_BRANCH`, no bypass actors) is applied from the committed `.github/rulesets/main.json` with the idempotent GET-then-PUT/POST snippet (PLAN §9.5); a second run took the PUT path and kept one ruleset. `main` now requires a PR (0 approvals, merge commits only) and the `ci-verify` check (GitHub Actions, integration 15368, strict off), and blocks force-pushes and deletion. The phase branch has no rules. PR #2 is still `CLEAN`/`MERGEABLE`.
    - **CodeQL default setup** is `configured` with language auto-detection, but has no languages yet: `main` holds only Markdown, so the request naming `javascript-typescript` and `actions` was refused with HTTP 422 ("One or more languages you selected are not present in the repository"). Follow-up at Ship: see "Next".
    - **Description and all 12 topics** are set.
    - Details and deviations (including GitHub's default `require_extra_approval_for_unattributed_changes`, which has no effect with 0 approvals): `docs/phases/phase-0/DEVLOG.md`.
  - WP9: not started.
- **Resume with:** `resumeFrom: "implement"`, `skipWPs: ["WP1", "WP2", "WP3", "WP4", "WP5", "WP6", "WP7", "WP8"]`
- **IDs:** tracking issue #1, draft PR #2 (`phase-0-foundation` → `main`, `Closes #1`), ruleset **24225914** ("main protection"; re-apply only with the PLAN §9.5 snippet, never a second POST).
- **Pipeline for Phase 0:** `.claude/workflows/phase-pipeline.js`, with args in `docs/phases/phase-0/pipeline-args.json`
- **Cloud resources created so far:**
  - Supabase project `structured` in ap-south-1, organization "Karthi labs" (it uses the second and last free slot). Its URL, ref, keys and database password are in `.env.local` and in the Vercel development env (never in the repo).
  - Vercel project (secret name: see `.env.local`) in the "Karthi Labs" team, deployed to production from this machine with `scripts/ci/deploy-prod.sh`. The production URL is `PROD_URL` in `.env.local` (never in the repo).
- **Already set up:** GitHub repo; repo secrets `VERCEL_TOKEN` (Vercel scope "Karthi Labs"), `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` and `PROD_URL`; the `main` ruleset 24225914; CodeQL default setup (configured, auto-detect); the repo description and 12 topics; Supabase org "Karthi labs".
- **Next:** WP9 (CLAUDE.md part 2, README, final HANDOFF, the resume rehearsal and the final sweep), then the QA rounds, final verification and Ship.
  - **Post-merge follow-up for Ship (PLAN §17.1 step 8): CodeQL languages.** Right after the merge, run `gh api repos/karthi-ai-engineer/Structured/code-scanning/default-setup --jq '.state, .languages'`. It must show `configured` with `javascript-typescript` and `actions` (default setup adds languages by itself once `main` has code). If a language is missing, run the PLAN §9.5 request again: `printf '{"state":"configured","query_suite":"default","languages":["javascript-typescript","actions"]}' | gh api -X PATCH repos/karthi-ai-engineer/Structured/code-scanning/default-setup --input -`. The same follow-up is in the PR #2 body under "Post-merge follow-ups".
  - **The Ship merge must use `gh pr merge 2 --merge`** (the ruleset allows merge commits only) and needs a green `ci-verify` on the PR head.
  - **Open item from WP7 (for QA or the owner):** repeat M2 against production (AC 24 bullet 2). Delete the `settings` row with a one-off secret-key command, then load production in the owner's Chrome: the first load must show `Settings row created`, and a reload `Settings row found`; `node scripts/supabase.mjs settings` must show Chrome's zone. The WP7 session was not permitted to delete the row, so it was left as is (DEVLOG WP7, deviation 7).
  - **WP9 must add to the HANDOFF link steps:** `vercel link` rewrites `.env.local` (it pulls the development env) and appends `.vercel`/`.env*` to `.gitignore`. Back up `.env.local` before linking, and run `git checkout -- .gitignore` after it (DEVLOG WP7, deviation 4).
  - Production serves commit `9c23319`; the next production deploy is the `Deploy` workflow at Ship. To rerun the smoke check without deploying, see DEVLOG WP7 "Notes for testers".
  - Best-effort items (§0.1): the pin check and the `--expect-protected` probe are done. `env:sync-vercel -- --apply --force` is implemented and unit-tested, but was not run against the live project (the session was not permitted to overwrite); the substitute is `vercel env rm <NAME> <target> --yes`, then `--apply`. The preview API fallback is implemented but was not needed.
  - The `settings` row already exists (`Asia/Tokyo`, created by Chrome in WP6). Any test that deletes it must let a real browser on the owner's machine recreate it, never a headless one.
  - The opening ritual includes `npm run db:ping` (must print `db: ok (200)`).
  - After Phase 0, Phase 1 runs the **team workflow**: `docs/process/TEAM_WORKFLOW.md`, `.claude/workflows/team-pipeline.js`, and `docs/phases/phase-1/pipeline-args.json`.
- **Blockers:** none.
- **Notes:**
  - Local Node 26 prints an `EBADENGINE` warning for `engines.node = 24.x`; this is expected (CI and Vercel use Node 24).
  - The owner's commit `28df4fd` (balanced team-pipeline profile) landed after the plan baseline `1195168`; WP2 kept its `CLAUDE.md` paragraph verbatim (see DEVLOG WP1 and WP2).
  - Local gate: `npm run verify` (typecheck, lint, format:check, test:coverage, build, and `npm run check`). Run `npm run check:commits` and `npm run check:leaks` before every push; run `node scripts/checks/commits.mjs --text-file <file>` on any PR, issue or release text before `gh … create/edit`.
  - CI: `CI / ci-verify` runs on every push and PR. The `main` ruleset (24225914) requires it; never rename the job, add path filters or use `[skip ci]`, or the merge into `main` stays blocked.
  - A local `npm run build` with `.env.local` present bundles the real Supabase URL and publishable key into `dist/`. `dist/` is gitignored; never commit, upload or paste it. CI builds are unconfigured by design, and show "Database not configured". The same applies to `.vercel/` after a local deploy (`project.json`, `.env.production.local` and `output/`).
  - The Vercel development env is the source of truth for `.env.local` on other machines. Run `npm run env:sync-vercel` (a read-only report that prints names only) before any `vercel env pull`, and `npm run env:sync-vercel -- --apply` after adding a local key.
  - Local production deploy (same script as CI): `PROD_URL="$(node scripts/lib/env-file.mjs get .env.local PROD_URL)" DEPLOY_LOG_DIR=<scratch folder> bash scripts/ci/deploy-prod.sh`. It needs the link (`.vercel/project.json`) and prints no URLs; delete the log folder afterwards, because it holds the generated deployment URL.
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
6. Restore the secrets from the Vercel development env:
   1. `npx --yes vercel@61.1.0 project ls --scope <team>` (the team slug from `npx --yes vercel@61.1.0 teams ls`) must list exactly one `structured-…` project. `npx --yes vercel@61.1.0 project inspect <that name> --scope <team>` must succeed before linking.
   2. `npx --yes vercel@61.1.0 link --yes --project <that name> --team <team>`. Stop if the CLI says it is creating a project.
   3. `git checkout -- .gitignore` (link appends lines to it), then `npx --yes vercel@61.1.0 env pull .env.local --yes`.
   4. `npm run env:check` (all 7 keys `ok`), `npm run db:link`, `npm run db:migrations` (`0001` local and remote) and `npm run db:ping` (`db: ok (200)`).

   WP9 rehearses and finalises this sequence.
7. Open Claude Code in the repo and say, for example: *"Read HANDOFF.md and CLAUDE.md, then resume the Phase 0 pipeline."* Claude should:
   - take `docs/phases/phase-0/pipeline-args.json`
   - fill in `root` (this clone's absolute path), `today`, `envNotes` (this machine's tools), `resumeFrom` and `skipWPs` (from **Current status** above)
   - run `Workflow({ scriptPath: ".claude/workflows/phase-pipeline.js", args: <that JSON> })`

## How we work
See `CLAUDE.md` ("Running a phase") and `PLAN.md` §14. Every phase: branch → tracking issue → pipeline → PR → CI → merge → deploy → release. No AI attribution anywhere.
