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
- **Process weight (overrides the pipeline sections below):** build directly in the session and ship fast. Never run long multi-agent pipelines for a phase; Phase 0's day-long pipeline was far too slow for the work. Use at most one reviewer agent per PR and one QA agent per phase. Keep the GitHub footprint (issue and PR per work package, review verdicts, bug issues, release). State the expected time before any long-running step.
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

The pipeline runs the **balanced profile** (`TEAM_WORKFLOW.md` §7): 2 design-review rounds; 1 or 2 edge-case lenses and QA round 2 only on large phases; concise documents; a faster model only for mechanical steps. The per-phase values live in each `pipeline-args.json`.

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

## Architecture
A single package (not a monorepo): the Vite + React 19 + TypeScript app in `src/`, server-only code in `server/`, Vercel functions in `api/`, and SQL migrations in `supabase/migrations/` (PLAN.md section 6).

| Folder | Holds |
|---|---|
| `src/core/` | Pure TypeScript domain logic (dates, recurrence, schedule, slots, energy, goals, stats, quick add). Shared with `server/`. |
| `src/data/` | The Supabase client (`supabase.ts`), the generated `database.types.ts`, CRUD functions (`repo/`), TanStack Query hooks (`queries/`, Phase 1) and realtime. |
| `src/features/` | One folder per feature (timeline, inbox, task editor, week, month, focus, goals, stats, review, settings, search), from Phase 1. |
| `src/components/` | Shared UI. `src/components/ui/` is generated by shadcn: add components with `npx shadcn add <name>` (the pinned devDependency), then `npm run format`. |
| `src/platform/` | Adapters for browser and Capacitor APIs (time zone, network, notifications, haptics). |
| `src/stores/` | Client UI state (zustand), from Phase 1. |
| `src/styles/` | The Tailwind v4 entry and design tokens (`index.css`, also shadcn's `tailwind.css`). |
| `src/lib/` | UI helpers such as `cn`. |
| `src/test/` | Unit-test setup. |
| `server/` | Server-only code (Phase 2): the Supabase admin client and the MCP server. |
| `api/` | Vercel functions (Phase 2): `api/mcp/[secret].ts`. Every `.js`/`.ts` file here becomes a function. |
| `supabase/migrations/` | SQL migrations (see "Database migrations"). |
| `scripts/` | Repo tooling: env files, Supabase and Vercel helpers, repo checks, the deploy script. |
| `tests/integration/` | Opt-in integration tests against the real database (never in CI). |

- A folder without code yet holds only a short `README.md` (purpose and import rules), never an empty file.
- **New top-level TypeScript folders** (`server/` and `api/` in Phase 2) need their own tsconfig (for example `tsconfig.server.json`) referenced from `tsconfig.json`. Otherwise type-aware ESLint fails with "was not found by the project service".

## Import rules
Enforced by ESLint (`eslint.config.js`, run by `npm run lint`) and, for `src/core`, by `npm run check:core`.
- `src/core` is pure: no React, no Supabase, no `@/` alias, no dynamic `import()`. It imports only other `src/core` files (and pure libraries such as `date-fns`), through relative paths with explicit `.ts` extensions (`import { todayIn } from './dates.ts'`), so plain Node and Vercel functions can load it.
- `src/**` never imports `server/`. `server/` and `api/` may import `src/core`.
- Only `src/data` imports `@supabase/*`. Everything else goes through `src/data` (repo functions, query hooks).
- `src/platform` wraps browser and Capacitor APIs; other code calls the adapter, not the API.
- Only `src/core/dates.ts` reads the clock (`new Date()` without arguments, `Date.now()`). Everything else calls `todayIn` / `nowMinutesIn` or passes an explicit instant.

## Code conventions
- TypeScript strict, no `any` (an ESLint error), named exports (default exports only where a tool requires them, such as config files).
- File names: React components in PascalCase (`DbStatusBadge.tsx`); `src/components/ui/*` keeps shadcn's kebab-case (`button.tsx`); other modules in camelCase or lowercase (`dbCheck.ts`, `dates.ts`).
- Import with `@/…` everywhere outside `src/core` (which uses relative `.ts` imports, see above). Type-only imports use `import type`.
- All date and time logic goes through `src/core/dates.ts`.
- Tests live in a `__tests__/` folder next to the code. Every test passes an explicit instant (`now`); the one default-clock test uses fake timers.
- Case-only file renames use `git mv -f <old> <new>` (the Windows file system ignores case).
- Prettier owns formatting (`npm run format`). Markdown, `docs/` and `.claude/` are never reformatted.

## Data conventions
- Dates are `YYYY-MM-DD`, times are `HH:mm` (24 h) in the user's time zone (`settings.timezone`), and durations are integer minutes (PLAN.md section 10.3).
- Task IDs are a UUID, or `<seriesId>:<date>` for a recurring occurrence.
- MCP tool responses are a short human summary line followed by compact JSON.
- MCP writes set `source='mcp'` and return a `batch_id`. They validate input with the zod schemas in `server/mcp/tools.ts` and return warnings (overlap, outside day hours, in the past, past midnight; the energy limit from Phase 3) instead of failing.
- **One database for development and production.** Tests touch only rows whose title or name starts with `__test__`, delete them afterwards, and never write `settings`.
- **The `settings` row already exists.** Phase 0 creates it on the first app load, with the browser's time zone. So "no settings row" can **not** trigger the Phase 1 seeding of the default "Rise and Shine" and "Wind Down" tasks (PLAN.md section 14, Phase 1). Phase 1 must pick another trigger, for example a seed marker such as `settings.seeded_at`, set by a conditional update (`… where seeded_at is null`) so that only one device seeds.
- Optimistic concurrency: `.update(patch).eq('id', id).eq('updated_at', seen)`. Zero rows updated means a conflict: refetch.
- `updated_at` is stamped by the database trigger (`public.touch_updated_at()`); the client never sets it.
- Realtime (Phase 1): invalidate everything on every (re)subscribe. DELETE payloads carry only the primary key. Your own writes echo back, so dedupe by `id` + `updated_at`.

## App structure (Phase 1)
- **Domain** (`src/core/tasks.ts`, `src/core/settings.ts`): task and settings models, draft validation, day layout, pill sizing, and the optimistic `applyPatch`/`belongsTo` helpers.
- **Data** (`src/data/`): `mappers.ts` (row ↔ domain), `repo/tasks.ts` and `repo/appSettings.ts` (codes-only errors via `DataError`), and `queries/` (TanStack Query keys, hooks with optimistic mutations, realtime sync, the `QueryClient`).
  - Every task list is cached under `['tasks', …]`. `writeTaskToCache` moves a task across all cached lists (day ↔ inbox, delete).
  - Mutations roll back on failure with a notice, and always refetch on settle.
- **Features** (`src/features/`): `shell` (layout, `QueryState`, `Fab`), `timeline` (day view, week strip, task rows, `useClock`), `editor` (one dialog for the whole app, opened with `useEditor()`), `inbox`, `settings` (with `ThemeSync`).
- **Routes:** `/` (today), `/day/YYYY-MM-DD`, `/inbox` and `/settings`. Vercel's SPA rewrite serves them all.
- **Phone versus desktop:** under `lg`, bottom tabs, a floating add button and a bottom-sheet editor. From `lg`, a sidebar and an inbox panel next to the timeline.
- **Safety net:** `platform/unload.ts` asks before leaving the page while a mutation is pending.
- **Recurring tasks (Phase 3):**
  - **Rules:** `src/core/recurrence.ts`, an RRULE subset stored in `repeat_rule`:
    - `FREQ=DAILY|WEEKLY|MONTHLY|YEARLY` and `INTERVAL`
    - weekly `BYDAY`
    - monthly and yearly `BYMONTHDAY`, set only when a series is continued from a clamped day (Feb 28 of a series on the 31st)
    - monthly and yearly use the last day of shorter months
  - **Storage:** a series row has `repeat_rule`, and its `date` is the first occurrence. An override row (`series_id` + `occurrence_date`) is a full copy of one occurrence's own values (moved, edited, completed, or `is_cancelled`).
  - **Occurrences** are never stored. `src/core/series.ts` expands them per range, with the id `<seriesId>:<occurrenceDate>`, which stays the same when the occurrence moves.
  - **Edit and delete scopes** are planned in `src/core/seriesEdits.ts` (pure) and run by `TasksRepo.applySeriesWrite`:
    - *this* upserts the override (`onConflict: series_id,occurrence_date`)
    - *future* calls the `split_series` database function (atomic). Completed occurrences, and the edited occurrence's own override (`p_keep`), move to the new series with its values.
    - *all* calls `update_series` (atomic) with only the fields the user changed, plus the end date
  - **Moving one occurrence** to another day:
    - daily, monthly and yearly series offer *this* or *this and future* (the new series starts on the picked day)
    - weekly series offer *this* only; moving them is a rule change ("every week on Tuesday")
    - a new day plus a new end date must be saved one at a time
    - `planEdit` refuses any scope that `scopesFor` does not offer
  - **Rule changes** are offered only as *this and future*, starting on the picked date, so history never changes retroactively. From the first occurrence, *this and future* rewrites the whole series.
  - **Defaults:** "Rise and Shine" / "Wind Down" are created once by the `seed_default_tasks` function, guarded by `settings.seeded_at` (`src/data/queries/seed.ts`).
  - **MCP:** `listRange` and `listDates` include occurrences (`repeats` and `read_only` in the task view). Writes refuse occurrence ids; "overdue" and search cover one-off tasks only.

## MCP server (Phase 2)
Claude reads and writes the planner through a remote MCP server at `https://<app>/api/mcp/<MCP_SECRET>`. The official `@modelcontextprotocol/server` v2 `createMcpHandler` serves it statelessly: the 2026-07-28 protocol natively, plus the 2025 Streamable HTTP fallback.

- **Layout:**
  - `api/mcp/[secret].ts`: thin Vercel entry
  - `server/mcp/entry.ts`: secret check (constant time; 404 on a mismatch and when the env is incomplete, logging only the missing variable names)
  - `server/mcp/server.ts`: builds an `McpServer` per request
  - `server/mcp/tools.ts` and `server/mcp/prompts.ts`
  - `server/store.ts`: Supabase with the secret key, behind the `TaskStore` interface
  - `server/env.ts`
- **Imports:** `server/` imports `src/core` with relative `.ts` paths. The root `tsconfig.json` sets `rewriteRelativeImportExtensions`, because Vercel compiles each file to `.js` and would otherwise leave `.ts` specifiers that crash at runtime. After changing imports, check with `npx --yes vercel@61.1.0 build --yes`, then run the built `.vercel/output/functions/api/mcp/[secret].func/api/mcp/[secret].js`.
- **Tool conventions:** a one-line summary plus compact JSON (`server/mcp/format.ts`); `isError` for refusals; dates `YYYY-MM-DD` and times `HH:mm` in `settings.timezone`; durations in minutes.
- **Adding a write tool:**
  1. Validate the whole input first; write nothing if anything is invalid.
  2. Compute warnings with `plannedTaskWarnings`.
  3. `saveBatch` **before** writing, with one undo op per task: `updateOp(task, changes)` records the before and after values, a `create` op records the created values, and appended subtasks use `subtasks_added` with their ids.
  4. Tag the writes with the batch id, and return `batch_id`.
  5. Make sure `undo_batch` can revert it.
  6. Add a case to `server/__tests__/mcp.test.ts` (the MCP client against `MemoryStore`), and extend `tests/integration/mcp.test.ts` when it touches the database.
- **Undo semantics:** `undo_batch` reverts ops newest first. It skips a task whose current values differ from the op's `after` (the user changed it since) and lists it as `skipped`; `force: true` reverts those too. A failed request leaves the batch open: the revert ops are idempotent, so calling it again is safe. The batch is marked undone only when everything was reverted.
- **Atomicity:** `create_tasks` is one insert, and `set_completion` / `delete_tasks` are one `updateMany` statement. `move_tasks` writes row by row; if one fails, it answers with the `batch_id` and the rows already moved.
- **Secret:** `MCP_SECRET` (at least 32 characters) is in `.env.local` and Vercel (a Secret in production, Config in development). Rotate it by changing both, then re-adding the connector in Claude. Never put the full URL in the repo, issues, PRs or logs.
- **Connecting a client:**
  - **Claude web, desktop and mobile:** Settings → Connectors → Add custom connector → paste the URL (no auth).
  - **Claude Code:** `claude mcp add --transport http structured <URL>`.
  - **Local testing:** `npx @modelcontextprotocol/inspector`, or the MCP client pattern in the tests.

## Database migrations
- Files are `supabase/migrations/NNNN_<name>.sql`: four digits, sequential (`0001_init.sql`, `0002_goals.sql`, …), created by hand. **Never** run `supabase migration new` (its timestamp names sort after `0002…` and block `db push`), and never rename or edit a migration that has been applied; add a new one.
- Apply with `npm run db:push`, and check with `npm run db:migrations`.
- **New-table checklist** (every table, every time):
  1. `grant select, insert, update, delete on table public.<t> to anon, authenticated, service_role;` (new Supabase projects do not expose new tables automatically; without the grant every call fails with `42501`)
  2. `alter table public.<t> enable row level security;`
  3. the `open_access` policy for `anon, authenticated` (until SSO)
  4. an `updated_at timestamptz not null default now()` column and a `before update` trigger that runs `public.touch_updated_at()`
  5. `alter publication supabase_realtime add table public.<t>;` if the UI syncs it
  6. end the migration with `notify pgrst, 'reload schema';`
  7. `npm run db:types`, then commit `src/data/database.types.ts`; the drift check is `npm run db:types && git diff --exit-code src/data/database.types.ts`
  8. add the table to the table list in `tests/integration/supabase.test.ts`

## Windows and shell rules
- Run repo scripts and multi-step commands in Git Bash. npm scripts run in `cmd.exe`, so they call Node scripts instead of using `$VAR`.
- Never write repo files or `.env*` files with PowerShell redirection (`>`), `Set-Content` or `Out-File`: they write a BOM, UTF-16 or the system code page. Use the editor tools or Node (UTF-8 without a BOM, LF).
- Git Bash rewrites leading-`/` arguments into Windows paths. Prefix `MSYS_NO_PATHCONV=1` for `/…` arguments, and write `gh api` paths without a leading `/` (`gh api repos/…`).
- Git Bash drops `TZ=…` for child processes. Set the zone inside the program instead (the Vitest config sets `process.env.TZ`).
- Stop dev and preview servers with `taskkill /PID <pid> /T /F`, then confirm that `netstat -ano | findstr ":5173 :4173"` prints nothing. The ports are strict, so an orphaned server makes the next start fail.

## Session-start ritual
At the start of every session, work package and fix round:
1. `gh api user --jq .login` prints `karthi-ai-engineer`, and `git config user.email` prints the repo-local identity above.
2. You are on the phase branch, updated with `git pull --ff-only` (never force-push).
3. Nothing listens on the dev ports: `netstat -ano | findstr ":5173 :4173"` prints nothing.
4. Run `npm ci` if `package-lock.json` changed.
5. `npm run db:ping` prints `ok` (a paused project: see the recovery steps in `HANDOFF.md`).
6. If environment keys changed on another machine, run `npm run env:sync-vercel` (a read-only report) first, then `npx --yes vercel@61.1.0 env pull .env.local --yes`.

## Work package checklist
**Opening:** the session-start ritual above.

**Closing.** A work package or fix round is not done until all of these have happened:
1. `npm run verify` passes.
2. `HANDOFF.md` status is updated: phase and branch, "Last updated" with time and zone (for example `2026-09-30 21:40 UTC+9`), done, next, blockers, the IDs (tracking issue, PR, ruleset) and the pipeline `resumeFrom` / `skipWPs`.
3. A section is appended to the phase's `DEVLOG.md`: what was done, commands run, deviations, and notes for testers. Mask every value.
4. Conventional commits, with no AI attribution. `npm run check:commits` and `npm run check:leaks` pass.
5. `git push origin <phase branch>`.
6. The tracking issue is updated: re-read its body, tick **only** this work package, and write it back (run `check:commits --text-file` on the new body first).
7. Every dev or preview server is stopped (`taskkill /PID <pid> /T /F`), and the ports are free.

## Commands
Run these from the repo root, in Git Bash on Windows. `npm run verify` is the full local gate, and CI runs the same steps.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on port 5173 (strict: fails if the port is taken) |
| `npm run build` | `tsc -b`, then the production bundle in `dist/`. With `.env.local` present the bundle contains the real Supabase URL and publishable key, so never commit, upload or paste `dist/`. |
| `npm run preview` | Serves `dist/` on port 4173 (strict) |
| `npm run typecheck` | `tsc -b` over the app, node and test projects |
| `npm run lint` | Type-aware ESLint with the architecture rules, 0 warnings allowed |
| `npm run format` | Prettier, writing (Markdown, `docs/` and `.claude/` are ignored) |
| `npm run format:check` | Prettier, check only (CI) |
| `npm test` | Unit tests (Vitest). Hermetic: process zone `America/St_Johns`, `fetch` rejects, `VITE_*` blanked |
| `npm run test:watch` | Unit tests in watch mode |
| `npm run test:coverage` | Unit tests plus the `src/core` coverage thresholds (95 % lines and statements, 100 % functions, 90 % branches) |
| `npm run test:integration` | Opt-in tests against the real database. Needs `.env.local`, never runs in CI, and touches only `__test__` rows. |
| `npm run test:e2e` | Opt-in Playwright tests in the installed Microsoft Edge (no browser download) against the dev server on port 5173 and the real database. Never in CI. Test tasks start with `__test__`; `tests/e2e/cleanup.ts` soft-deletes any live leftovers before and after every run. Assert on loaded data (wait for `[aria-busy="true"]` to disappear) and wait for the write to be confirmed before reloading, since the UI updates optimistically. |
| `npm run check` | The four repo checks below |
| `npm run check:hygiene` | No BOM, valid UTF-8, no CR; lockfile native bindings for Windows, Linux and macOS; the Node and Vercel CLI pins; the `ci-verify` invariants |
| `npm run check:leaks` | Secrets, hosts, IDs and the project name in files and commit messages. `-- --stdin` scans piped text (CI logs); `-- --files <paths>` scans given files. |
| `npm run check:commits` | AI attribution and the author e-mail allowlist over the commit range. `-- --text-file <file>` also checks PR, issue or release text. |
| `npm run check:core` | Every `src/core` module loads in plain Node |
| `npm run verify` | typecheck, lint, format:check, test:coverage, build and check. Run it before every push. |
| `npm run db:setup` | Idempotent Supabase bootstrap: creates or reuses the project `structured` and writes `.env.local` (prints `KEY: set` lines only) |
| `npm run db:link` | Links the Supabase CLI to `SUPABASE_PROJECT_REF` |
| `npm run db:push` | Applies new migrations. `node scripts/supabase.mjs push --dry-run` previews them. |
| `npm run db:migrations` | Lists local and remote migration versions |
| `npm run db:types` | Regenerates `src/data/database.types.ts` (UTF-8, LF) |
| `npm run db:ping` | One REST probe: `db: ok (200)`, or `PAUSED (540)` |
| `npm run env:check` | Status of the 8 app keys in `.env.local` (`ok`, `missing`, `empty`, `placeholder`, `whitespace`); never values |
| `npm run env:sync-vercel` | Read-only report: `.env.local` against the Vercel env matrix. `-- --apply` adds missing rows; `-- --apply --force` also overwrites rows that differ. |

Other tools:
- `node scripts/supabase.mjs settings`: whether the `settings` row exists, with its time zone.
- `node scripts/lib/env-file.mjs get .env.local <KEY>` prints one raw value for piping (never to the screen). `… set <KEY>` reads the value from stdin.
- `bash scripts/ci/deploy-prod.sh`: the production deploy, shared by CI and local runs (see `HANDOFF.md`).
- `node scripts/ci/smoke.mjs`: the production smoke check. It needs `PROD_URL`, `EXPECTED_SHA` and `SUPABASE_ENV_FILE`, and prints paths only.
- `npx shadcn add <name>`: adds a shadcn/ui component (the pinned devDependency). Run `npm run format` afterwards.

## Environment variables
Values live only in `.env.local` (gitignored), in the Vercel project and in GitHub secrets. `.env.example` lists the names. `npm run env:sync-vercel` enforces this matrix:

| Variable | `.env.local` | Vercel production | Vercel preview | Vercel development | GitHub secret |
|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` | yes | Config | Config | Config | – |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | Config | Config | Config | – |
| `SUPABASE_SECRET_KEY` | yes | Secret | – | Config | – |
| `SUPABASE_DB_PASSWORD` | yes | – | – | Config | – |
| `SUPABASE_PROJECT_REF` | yes | – | – | Config | – |
| `VERCEL_PROJECT_NAME` | yes | – | – | Config | – |
| `PROD_URL` | yes | – | – | Config | yes |
| `MCP_SECRET` | yes | Secret | – | Config | – |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | in `.vercel/project.json` | – | – | – | yes |
| `VERCEL_TOKEN` | – | – | – | – | yes |

- **The Vercel development env is the source of truth** for `.env.local` on every machine. Run `npm run env:sync-vercel` (the report) before `npx --yes vercel@61.1.0 env pull .env.local --yes`.
- **Sync a new local-only key before anyone pulls:** `npm run env:sync-vercel -- --apply`. Otherwise the next pull on another machine does not have it.
- `--apply` never overwrites a remote value, so a machine with an old `.env.local` cannot undo a rotation. A deliberate overwrite is `-- --apply --force`, or `npx --yes vercel@61.1.0 env rm <NAME> <target> --yes` followed by `--apply`.
- `VITE_*` values are bundled into the browser code, so they must be **Config**, never Secret, in production. A Secret is only a placeholder at build time, and the production build refuses it.
- The secret key never gets a `VITE_` prefix, and build steps never read it.
- `vercel env pull` merges into `.env.local` and adds `VERCEL_OIDC_TOKEN` (a short-lived token). Treat it like a secret; the checks ignore other `VERCEL_*` keys.
- `vercel link` and `vercel env pull` append `.vercel` / `.env*` to `.gitignore` (with CRLF on Windows, which fails `check:hygiene`). Run `git checkout -- .gitignore` after either; the existing rules already ignore both.
- A new app key goes into all of these in one change: `.env.example`, `APP_KEYS` in `scripts/lib/env-file.mjs`, `MATRIX` in `scripts/sync-vercel-env.mjs`, and the table above.

## CI/CD flow

- **Before merging a PR, wait for its CI run to exist.** Right after a push, `gh pr checks --watch` exits at once with "no checks reported". Poll until a `ci-verify` check appears, then watch it. Only `main` enforces the check through the ruleset; `phase-*` branches do not.
1. Work happens on the phase branch `phase-<n>-<slug>` (from Phase 1: feature and fix PRs into it, see the team workflow), in small conventional commits.
2. Push after every work package. `CI / ci-verify` runs on every push and on every PR (opened, synchronize, reopened, edited), whatever its base branch.
3. The phase PR (`Closes #<tracking issue>`) stays a draft until the Ship stage.
4. The `main` ruleset ("main protection") requires a PR (0 approvals, merge commits only) and a green `ci-verify`, and blocks force-pushes and deletion. Nobody can bypass it.
5. A merge into `main` triggers `Deploy` (`.github/workflows/deploy.yml`). It runs only from the head of `main`: verify, Vercel pull, build (with the env guard), exact-value bundle check, prebuilt deploy, then the smoke check (build SHA, routes, headers, database probe). It never prints a URL.
6. Tag and release: `v0.0.1` for Phase 0, `v0.<n>.0` after that.
7. CodeQL (default setup) analyses PRs and `main`. Dependabot opens grouped weekly PRs for npm and GitHub Actions, and they must pass `ci-verify` like any other PR.

Rules:
- **`ci-verify` is the required check.** Never rename the job, never reuse its name for another job, never add `paths` or `paths-ignore` filters to `ci.yml`, and never use `[skip ci]`. Each of these leaves the required check pending, and the merge into `main` stays blocked. `check:hygiene` checks the name and the missing filters.
- **Every merge into `main` deploys production, and so does every merged Dependabot PR.** Merge only what should go live.
- **Bot PRs.** The title and body of a bot-authored PR (Dependabot) are not scanned by `check:commits`, because they quote upstream release notes. Its commit messages and authors are always checked.
- **The Vercel CLI is pinned** to exactly `vercel@61.1.0` in `.github/workflows/deploy.yml`, `scripts/ci/deploy-prod.sh` and `scripts/lib/vercel.mjs`. Bump all three in one commit (`check:hygiene` fails if they differ), and update the version in the docs that quote it.
- **Deploys come only from GitHub Actions.** The Vercel Git integration is off, and `vercel.json` has `git.deploymentEnabled: false`. Redeploy with `gh workflow run deploy.yml --ref main`. A local deploy uses the same script (see `HANDOFF.md`).
- **After merging a Dependabot npm PR, run `npm ci` on Windows**, then `npm run verify`.

### When a Dependabot PR is blocked
- **`check:hygiene` rejects the lockfile.** Dependabot regenerates it on Linux, which can drop the Windows or macOS native bindings. On Windows, in Git Bash:
  1. `gh pr checkout <n>`
  2. `rm -rf node_modules && npm install`, then `npm run check:hygiene`
  3. If it still fails: `rm -rf node_modules package-lock.json && npm install`. This re-resolves within the caret ranges, which is acceptable for a minor/patch group.
  4. `npm run verify`
  5. Commit `chore: regenerate lockfile with all platform bindings` and `git push` to the Dependabot branch.

  Dependabot stops rebasing that PR afterwards, which is expected. Merge it once `ci-verify` is green.
- **The PR title or body trips the attribution scan.** This cannot happen for bot-authored PRs, because their title and body are skipped.
- **A commit message trips `check:leaks` or `check:commits`** (third-party text). The message cannot be fixed on that branch. Close the PR and make the bump by hand in a normal PR.

## Secrets
- Read values, never print them. `node scripts/lib/env-file.mjs get .env.local <KEY>` writes one raw value for a shell variable or a pipe (`… | gh secret set <NAME>`). `… set <KEY>` reads the value from stdin.
- Write output that can contain a secret, a URL, an ID or the project name (the Vercel and Supabase CLIs, `vercel env pull`, deploy logs) to a file in a scratch folder. Let a script read it, print only names, counts or statuses, and delete the file afterwards.
- Mask values in docs, test reports, `DEVLOG.md` and `HANDOFF.md`: write "see `.env.local`".
- Never paste a key-shaped string, a `*.vercel.app` or Supabase host, a Vercel `prj_`/`team_` ID or an attribution trailer into a file, **even a fake one**. Tests build such fixtures at runtime by concatenation.
- In GitHub Actions, mask derived values with `::add-mask::` before any step could print them, and pass PR text to scripts only through `env:`.
- Before every push, run `npm run check:leaks` and `npm run check:commits`.
- Before any `gh pr|issue|release create|edit`, write the text to a file and run `node scripts/checks/commits.mjs --text-file <file>` and the PR-text word check, which must print nothing:
  ```bash
  sed -E 's/karthi-ai-engineer//g; s/CLAUDE\.md//g' <file> | grep -niwE 'ai|claude|anthropic|llm'
  ```
- `dist/` after a local build and `.vercel/` after a local deploy contain real values. Both are gitignored: never commit, upload or paste them.
- If something leaks, follow the leak-response runbook in `HANDOFF.md`. Rotation is the fix, because history on `main` cannot be rewritten.

## Runbooks
In `HANDOFF.md`, section "Recovery and runbooks":
- paused database (HTTP 540)
- database commands that cannot connect (outbound TCP 5432)
- production rollback
- leak response
- a GPG signing failure (stop and ask the owner)
