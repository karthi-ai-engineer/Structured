# Phase 0: Foundation, final implementation plan

| | |
|---|---|
| Phase | 0 (Foundation), size S |
| Branch | `phase-0-foundation` (tracks `origin`). `main` changes only in the Ship stage (merge commit). Release tag `v0.0.1`. |
| Master plan | `PLAN.md` §5 (stack), §6 (repo structure), §7 (data model), §8 (`dates.ts`), §10.3 (conventions), §13 (setup), §14 Phase 0 |
| Inputs | `plan-v1.md` (expert plan), `edge-cases-functional.md` (F1 to F37), `edge-cases-platform.md` (P1 to P44) |
| Rules | `CLAUDE.md`: no AI attribution anywhere, public-repo hygiene, `HANDOFF.md` updated after every work package (WP) |
| Written | 2026-09-30 (facts re-verified on this date, see §2) |
| Status | Final plan, **revision r1** (answers `review-r1.md`; changelog at the end), input for design review round 2 |

> **Public repo.** This file is committed. It never contains secret values, the Vercel project name, app URLs, account user names or the Supabase project ref/URL. The plan writes placeholders such as `$VERCEL_PROJECT_NAME`, `$PROD_URL`, `<ref>` and `<name>`. Real values live only in `.env.local`. The Vercel project name comes from the phase task instructions (the exact name is given there) and is stored only in `.env.local` as `VERCEL_PROJECT_NAME` and in Vercel.

---

## 0. How to use this plan

- **Developers:** read §1 to §10 once, then your WP in §11. The edge-case coverage table (§15) says where each researched risk is handled. If the plan is wrong in a detail (an API changed), do the correct thing and record the deviation in `docs/phases/phase-0/DEVLOG.md`.
- **Pipeline duties that are not WPs:** the pipeline creates the tracking issue (labels `phase`, `phase-0`) before WP1, and each developer opens the draft PR on its first push (`Closes #<issue>`). WPs never create a second issue or PR (look up first: `gh issue list --state all --search "Phase 0: Foundation in:title"`, `gh pr list --head phase-0-foundation --state all`).
- **Testers and the final verifier:** the acceptance criteria are in §12, the test plan in §13.
- **Ship stage:** follow §17.
- **"Exact" files and Prettier.** After writing any file this plan gives as "exact" (YAML, JSON, config), run `npm run format`. CI runs `format:check`, so Prettier's whitespace, quote and wrapping changes are expected. They are **not** plan deviations and need no DEVLOG entry; only changes in content do.

### 0.1 Best-effort items (r1)
The items below are useful but must not stall a size-S phase. Try each one. If an item costs more than about 30 minutes, stop and record `deferred: <item>, <reason>, <substitute used>` in `DEVLOG.md` and under HANDOFF "Next". The dependent acceptance-criterion bullet is then met by the substitute named here.

| Item | Where | Substitute if deferred |
|---|---|---|
| `sync-vercel-env.mjs --force` (overwrite `differs`/`unknown` rows) | §8.5 item 4 | `npx --yes vercel@61.1.0 env rm <NAME> <target> --yes`, then `npm run env:sync-vercel -- --apply` |
| `sync-vercel-env.mjs` preview API fallback | §8.5 item 5 | The **preview values stay mandatory** (deliverable 7). If the CLI refuses `preview` without a branch, add the two `VITE_*` preview variables once by hand, using the same API call from Git Bash with the JSON body written by Node to a scratch file (§8.5 item 5), then delete the file |
| `smoke.mjs --expect-protected` probe | §8.11 item 8, §9.3 step 6 | AC 26 bullet 1: the protection JSON shows `prod_deployment_urls_and_all_previews` (configuration evidence only) |
| `check:hygiene` pins and workflow invariants | §8.7 item 3 | A one-off check in WP7 verification: `grep -c 'vercel@61.1.0' .github/workflows/deploy.yml scripts/ci/deploy-prod.sh scripts/lib/vercel.mjs` gives ≥ 1 for each file. The pin rules are also written in `CLAUDE.md` |

**Always mandatory:** `check:leaks`, `check:commits` (attribution and author), `scripts/ci/deploy-prod.sh` with the smoke check, and the WP9 resume rehearsal (deliverable 13).

### Changes since plan-v1 (summary)
1. **Production cannot silently ship broken.** A production build refuses an invalid Supabase environment. The deploy checks that the exact configured values are in the bundle. The smoke check asserts the build SHA, the routes and a live database probe (F1, F2, P25, P33).
2. **One deploy code path.** `scripts/ci/deploy-prod.sh` is used by `deploy.yml` and by the local WP7 deploy. Deploys run only from the head of `main`, after verification (P32, F3). Vercel CLI pinned to exactly `vercel@61.1.0` (P13). `VERCEL_INSTALL_COMPLETED=1` stops the second `npm install` (P24).
3. **Deployment Protection is Standard.** The production domain stays public, and generated deployment URLs need a Vercel login. This replaces "disable" (P26).
4. **Idempotent Supabase bootstrap** (committed `scripts/setup-supabase.mjs`): reuses the project, never regenerates the password, uses an alphanumeric password (F5, F6, P17 to P19).
5. **Leak checker rebuilt:** explicit key list, extra patterns, commit-range scan in CI, and runtime-built test fixtures (F23, P39, P40). New checks:
   - `check:hygiene`: encoding, line endings, lockfile native entries, pin consistency (P5, P10)
   - `check:commits`: no AI attribution, allowed author e-mail (P1, P4)
   - `check:core`: `src/core` loads in plain Node (F35)
6. **`dates.ts` hardened:**
   - Postgres time shapes and end-of-day `24:00`
   - year range
   - offset zones rejected
   - Santiago and Lord Howe cases
   - `startOfDayInstant` and `msUntilNextDayIn`
   - formatting that does not depend on Intl

   (F15 to F20)
7. **Health check matches supabase-js 2.117 reality.** Errors come back as values. Per-query `.retry(false)` and one shared deadline. Typed error codes with fixed copy. Singleflight under StrictMode. A root error boundary. Accessibility basics (F8 to F12).
8. **Integration tests never write `settings`;** they use `__test__` rows (F7). The migration adds `settings` checks, `day_notes.updated_at` and `notify pgrst` (F29, F32, F33).
9. **HANDOFF resume steps reordered and shell-safe:**
   - clone the live branch
   - single-quoted helper
   - Git Bash
   - link-safety checks
   - session-start ritual
   - runbooks

   (F21, F22, P42 to P44)

---

## 1. Goal

When Phase 0 is done, there is a clean, strictly typed Vite + React 19 + Tailwind v4 + shadcn/ui app that:

- deploys to Vercel production **only through GitHub Actions** (Vercel's Git integration stays off, so no bot comments and no URLs appear in the public repo)
- reads and writes a real Supabase Postgres database whose full schema (`0001_init.sql`) is applied from the CLI
- shows "Structured" and a **"DB connected"** status that comes from reading the single `settings` row, or creating it with the browser's time zone if it is missing

It also ships these foundations:

- the tested time-zone core (`src/core/dates.ts`)
- the folder skeleton, with architecture rules enforced by ESLint and a plain-Node load check
- CI/CD:
  - CI with a required check
  - a guarded deploy workflow
  - CodeQL
  - Dependabot
  - templates
  - a ruleset on `main`
- repo checks for leaks, attribution, encoding and lockfile portability
- a polished README
- a `HANDOFF.md` whose resume steps were rehearsed on a fresh clone

**Done when** (from the task):
- typecheck, lint, test and build pass locally and in GitHub Actions CI on the PR
- production shows "DB connected", with Supabase read and write both verified
- no secrets, app URLs or Vercel project name appear in the repo or in public CI logs
- `HANDOFF.md` is accurate

**Out of scope:**
- calendar sync, in-app AI, widgets
- login, SSO and auth screens
- feature UI (timeline, inbox and so on)
- a CI migration workflow
- Capacitor
- a keep-alive or backup workflow (Phase 3; see open question 8)

### 1.1 Deviations from the master plan (deliberate; the final verifier accepts these)
| Master plan | Phase 0 does | Why |
|---|---|---|
| §14 "Vercel project connected to GitHub" | Deploys come from GitHub Actions (`deploy.yml`, Vercel CLI prebuilt). The Vercel Git integration is **off**. | Task deliverable 10: no Vercel bot comments or URLs in the public repo. The §14 checkbox is ticked on this basis. |
| §14 "`git init`" | Already done before the phase | The repo exists. |
| §7.1 schema verbatim | Superset: `settings` check constraints, `day_notes.updated_at` plus trigger, explicit Data API grants, `notify pgrst` | D0-9, D0-21, D0-22. |
| §13.3 `gen types … > file` | `npm run db:types` (Node writes UTF-8 without a BOM) | PowerShell redirection writes BOM or UTF-16 (P5). |
| §5 "Vercel functions Node 20+" | Node 24.x everywhere | Vercel's highest runtime; 20.x is deprecated from 2026-10-01. |
| §16 / §10.7 "turn off Deployment Protection for production" | Standard Protection: production domains public, generated deployment URLs protected | Same effect for the app and the future MCP URL, and old deployment URLs are not public forever (P26). |
| §13.1 "repo (private)" | The repo is public | Existing reality. The hygiene rules in `CLAUDE.md` apply. |

---

## 2. Verified facts (re-checked 2026-09-30 on this machine)

### 2.1 Versions
| Package / tool | Version to use | Notes |
|---|---|---|
| create-vite | 9.2.1 | The `react-ts` template defaults to Oxlint. Pass `--eslint` to get the ESLint flat config. Non-interactive: `--no-interactive --no-immediate`. |
| vite | ^8.3 (8.3.1) | Rolldown-based. Native bindings per platform (see P10). |
| @vitejs/plugin-react | ^6.1 | oxc, needs vite 8 |
| react / react-dom | ^19.3 | |
| typescript | **~6.0.3** (not 7.x) | 7.0.2 is `latest`, but `typescript-eslint@8.71.0` peers on `typescript >=4.8.4 <6.1.0` (re-checked). |
| typescript-eslint | ^8.71 | Type-aware linting with `projectService: true` |
| eslint / @eslint/js | ^10.11 / ^10.0 | Flat config (`defineConfig`, `globalIgnores` from `eslint/config`) |
| eslint-plugin-react-hooks / -react-refresh | ^7.1 / ^0.5 | `only-export-components` must be off for `src/components/ui/**` |
| eslint-config-prettier / prettier / prettier-plugin-tailwindcss | ^10.1 / ^3.9 / ^0.8 | |
| tailwindcss / @tailwindcss/vite | ^4.3 | CSS-first: `@import "tailwindcss";` |
| shadcn (CLI) | 4.21.0 | Base UI has been the default base since July 2026, so pass `--base radix`. The `nova` preset gives style `radix-nova`. The generated CSS imports `shadcn/tailwind.css`, so `shadcn` stays a devDependency (P12, accepted). `init` installs the `cn` package (maintained by shadcn), and `src/lib/utils.ts` is `export { cn } from "cn"`, which still satisfies AC 6. |
| vitest / @vitest/coverage-v8 | ^5.0 | |
| @supabase/supabase-js | ^2.117 (2.117.2) | See §2.2 items 7 and 11. |
| supabase (CLI devDependency) | ^2.118 | JS shim plus **8 platform `optionalDependencies` of about 150 MB each** (`@supabase/cli-<os>-<arch>`). npm downloads only the local platform's package; the shim throws if it is missing (P10). 2.118 is a rewrite (Bun shim plus Go sidecar) that auto-detects AI agents (`--agent auto`), so the scripts always pass `--agent no` (§2.2 item 13). |
| date-fns / @date-fns/tz | ^4.4 / ^1.5 | |
| vercel (CLI) | **exactly 61.1.0** | Released 2026-09-29 23:42Z, the day after plan-v1 researched 61.0.0. That proves the range moves (P13). Not a dependency: `npx --yes vercel@61.1.0` locally, and a global install in CI. |
| GitHub Actions | `actions/checkout@v7`, `actions/setup-node@v7` | |
| actionlint | 1.7.12 | Local check only (release binary in the scratchpad) |

### 2.2 Platform facts that shape the design
1. **Supabase Data API grants.** New projects (since 2026-05-30) do not expose new `public` tables automatically. Every table needs `grant select, insert, update, delete … to anon, authenticated, service_role`, otherwise the result is `42501`. PostgREST may answer `PGRST205` until its schema cache reloads (P18, F29).
2. **Supabase keys.** Publishable keys (`sb_publishable_…`, browser-safe) and secret keys (`sb_secret_…`, server-only) replace anon and service_role. The app refuses a secret key in a browser variable.
3. **Supabase free tier.** The account's single org ("Karthi labs") has **one** active project today (in another region) and none named `structured`. Creating `structured` uses the last free slot (P17). Projects pause after 7 days without activity and then answer **HTTP 540** (F27).
4. **Vercel Node runtime.** `project update --node-version` offers 24.x at most, so `engines.node = "24.x"` and `.nvmrc` = `24`. Local Node 26.3.1 / npm 11.17 prints an `EBADENGINE` **warning**. CI uses Node 24 (npm 11.19).
5. **Vercel env types.** `env add --no-sensitive` stores "Config", which can be pulled back. `--sensitive` stores "Secret", which `vercel pull` / `env pull` return as a placeholder (`SENSITIVE_ENV_VALUE_PLACEHOLDER` or `[SENSITIVE]`). Development-target variables cannot be sensitive. So the `VITE_*` variables must be Config in production, or the bundle ships without them (F1, P25).
6. **`vercel env pull` (CLI 61)** merges into an existing file and keeps local-only keys. It writes placeholders for Secret values and adds `VERCEL_OIDC_TOKEN` (a 12-hour JWT) and possibly `VERCEL_*` system variables (P28, F23).
7. **supabase-js 2.117 errors are values, not throws.**
   - A network failure is `status 0` with a `TypeError…` message and a stack trace in `details`.
   - GET requests are retried (1 s, 2 s, 4 s) on network errors and on 520/503. `.retry(false)` per query, or `db: { retry: false }` on the client, disables retries.
   - An `AbortError` (from `AbortController.abort()`) is not retried and comes back as `status 0`, `message 'AbortError: …'`.
   - `AbortSignal.timeout()` produces a `TimeoutError` DOMException, which **is** retried. So the plan uses a manual `AbortController` (F8, F10, verified in the 2.117.2 source).
   - `maybeSingle()` lives on the transform builder and `retry()` returns `this`, so the chain `.eq(…).abortSignal(s).retry(false).maybeSingle()` typechecks.
8. **The supabase-js bundle itself contains the literals `sb_publishable_` and `supabase.co`** (verified: 4 and 14 files). A post-build grep for those literals proves nothing. The deploy script therefore checks for the **exact configured values** (§8.10).
9. **Vercel CLI 61.1.0 behaviour (read in the shipped source):**
   - **Protection.** `project protection enable <name> --sso` sets `deploymentType: prod_deployment_urls_and_all_previews`, which is Standard Protection. Vercel's docs say "Standard Protection protects all deployments except production domains" (P26).
   - **Build install.** `vercel build` runs `npm install` through `@vercel/static-build` unless `VERCEL_INSTALL_COMPLETED=1` is set. The skip path is `installCompletedCovers()` in `@vercel/build-utils` (P24).
   - **Auto-connect.** Linking an **existing** project does not auto-connect Git. The "new project" path (an unresolvable `--project`, or `pull`/`build` without `.vercel/` and without IDs) creates a project and auto-connects `origin` in agent mode (P27).
   - **Rollback.** After an Instant Rollback, Vercel **turns off auto-assignment of production domains** until a deployment is promoted, so an automatic rollback in CI would silently stall later deploys. Hobby can roll back only to the previous deployment (F3; see D0-25).
   - **Commands.** `vercel api` (beta) exists, and so do `env add --value/--sensitive/--no-sensitive/--force/--yes`, `git disconnect --yes`, `project inspect --format json`, `link --project … --team …`, `deploy --prebuilt --prod --skip-domain` and `rollback`/`promote`.
10. **Windows specifics** (verified):
    - Git Bash rewrites leading-`/` arguments for native programs (`/v9/…` becomes `C:/Program Files/Git/v9/…`). Use `MSYS_NO_PATHCONV=1`, and write `gh api` paths without a leading `/` (P6).
    - Git Bash drops `TZ` for child processes (P6).
    - PowerShell 5.1 on this ja-JP system writes BOM, UTF-16 or cp932 files (P5).
    - `core.ignorecase=true` (P8).
    - Node refuses to spawn `.cmd` files without a shell (P29).
11. **@date-fns/tz (verified 2026-09-30):**
    - `TZDate`'s constructor resolves **ambiguous** wall times inconsistently: the earlier instant for New York and London, the later one for Pacific/Chatham (2026-04-05 03:00 gives 14:15Z; the earlier is 13:15Z) and Australia/Lord_Howe (2026-04-05 01:45 gives 15:15Z; the earlier is 14:45Z). So `zonedDateTimeToInstant` resolves offsets itself with `tzOffset()`.
    - `tzOffset('Mars/X', d)` is `NaN` without throwing.
    - Intl canonicalizes: Node 26 reports `Asia/Calcutta` for `Asia/Kolkata`, `Europe/Kiev` for `Europe/Kyiv`, and `America/Panama` for `EST`. It accepts lower case and `+05:30`.
12. **This machine:**
    - zone Asia/Tokyo (UTC+9), locale en-GB
    - commits are GPG-signed by a global key GitHub cannot verify: the last 3 commits show `verified=false, reason=unknown_key` (P2)
    - two `gh` accounts, with `karthi-ai-engineer` active and the token scopes including `workflow` (P3, P38)
    - `uv`/`uvx` installed (for `check-jsonschema`)
    - no `fnm`, no `jq`
13. **GitHub repo today:**
    - public; secret scanning and push protection **on**; non-provider patterns off; Dependabot security updates off
    - default workflow permissions read-only
    - no rulesets; CodeQL `not-configured`
    - default labels only; no issues or PRs
    - one secret (`VERCEL_TOKEN`)
    - merge, squash and rebase all allowed
13. **Supabase CLI 2.118.0 output (verified 2026-09-30, r1; shapes and key names only, no values printed):**
    - `--agent auto|yes|no` is a global flag (default `auto`). `--agent no` is accepted by every command used here.
    - There are two output flags. `--output-format text|json|stream-json` is the general one, and `projects list --help` documents it for machine-readable output. `-o/--output env|pretty|json|toml|yaml|table|csv` is described as "output format of status variables", but `projects api-keys --help` still shows `--output json` in its example.
    - The shapes differ:
      - `projects list -o json` and `orgs list -o json` return a **bare array**.
      - `--output-format json` returns an **envelope** (`{ projects, message }` or `{ organizations, message }`).
    - `projects list` rows have the keys `created_at, database, id, linked, name, organization_id, organization_slug, ref, region, status`. `orgs list` rows have `id, name, slug`.
    - `projects list` writes one line to stderr even on success, so stderr is never treated as failure. Only the exit code and the parsed stdout count.
14. **Vercel CLI 61.1.0 (help re-read, r1):**
    - `env add <name> [target]` has `--value`, `--sensitive`/`--no-sensitive`, `--type config|secret`, `--force`, `--yes`, and an optional `--git-branch` for preview.
    - `vercel api <endpoint>` takes `--scope <team>` for team-scoped endpoints (its own example), plus `-X` and `--input -`.
    - `project ls` has `--filter <substring>`, `--limit` (up to 100) and `--format json`. The JSON is `{ projects, pagination, contextName, elapsed }`.
    - `--scope` accepts the team **ID** (`team_…`, the `orgId` in `.vercel/project.json`) as well as the slug. Verified for `project ls --format json` and `vercel api /v9/projects`; the team had 0 projects on 2026-09-30.
    - `--non-interactive` is the default when an agent is detected.

---

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| D0-1 | Scaffold with create-vite into the scratchpad, then copy the needed files into the repo with `cp -n`. Never run create-vite on the repo folder. | create-vite refuses non-empty folders, and `--overwrite` would delete the docs. |
| D0-2 | TypeScript `~6.0.3`. Dependabot ignores TS majors. | typescript-eslint peer range. |
| D0-3 | Type-aware ESLint with boundary rules:<br>- `src/core` is pure, uses relative imports only, has no dynamic `import()`, and imports no React or Supabase<br>- `src/**` never imports `server/`<br>- only `src/data/**` imports `@supabase/*`<br>- only `src/core/dates.ts` reads the clock (`new Date()` without arguments, `Date.now()`) | PLAN §6 and §8 rules, made executable (F15, F35). |
| D0-4 | Prettier ignores `**/*.md`, `docs/`, `.claude/`, the lockfile and generated types. ESLint ignores `.claude/` and `docs/`. | Keeps hand-formatted docs and the pipeline scripts untouched. `npm run format` would otherwise rewrite `.claude/workflows/*.js` and `pipeline-args.json`. |
| D0-5 | The Tailwind entry is `src/styles/index.css` (with `@source not` for `docs/`, `PLAN.md` and `.claude/`), pointed to by `components.json`. `src/lib/utils.ts` stays where shadcn puts it. | PLAN §6 `styles/`, and Tailwind v4 auto-detection scans Markdown (P15). |
| D0-6 | Vitest runs in `process.env.TZ = 'America/St_Johns'` (set inside `vitest.config.ts`). `test.env` blanks the `VITE_*` variables, and a setup file stubs `fetch` to reject. | Local time leaks fail the tests, and runs are hermetic: identical locally and in CI (F14, P14, P6). |
| D0-7 | Unit tests: `src/**/__tests__/*.test.{ts,tsx}` and `scripts/**/__tests__/*.test.mjs` (run in CI). Integration tests: `tests/integration/*.test.ts` (opt-in, use `.env.local`, never in CI). | CI has no secrets. Dependabot PRs must pass CI. |
| D0-8 | Migrations: `0001_init.sql`, then `NNNN_<name>.sql`, four-digit sequential, created by hand. **Never** `supabase migration new` (timestamps would sort after `0002…` and block `db push`), and never rename an applied migration. | PLAN §6 shows `0002_goals.sql`, and consistent numbering avoids out-of-order pushes. P21 is chosen over F30. |
| D0-9 | The migration ends with explicit Data API grants and `notify pgrst, 'reload schema';`. | §2.2 item 1. |
| D0-10 | On load, the home page reads the settings row and inserts `{id: 1, timezone: <browser zone>}` if it is missing. Integration tests **never** create or update `settings`. | This is the read/write proof. The first writer is always a real browser, so the zone is right (F7). |
| D0-11 | The DB status uses React 19 `use()` in a child under `<Suspense>`. The promise lives in `App` state, is created by a **singleflight** starter, and "Check again" runs in `startTransition`. There is no `useEffect` for fetching. | StrictMode-safe (F11). No fallback flash (F12). |
| D0-12 | **One deploy path:** `scripts/ci/deploy-prod.sh` runs pull, build, bundle check, deploy and smoke. `deploy.yml` calls it, and so does the local WP7 deploy in Git Bash. | What is rehearsed locally is exactly what CI runs at Ship. |
| D0-13 | All Vercel CLI output goes to files. On failure only a redacted tail is printed. In CI these are masked with `::add-mask::`:<br>- the production host<br>- its first label<br>- `projectName` from `.vercel/project.json`<br>- the Supabase host and key | Public logs must never show URLs or the project name (P34). |
| D0-14 | Deployment Protection is **Standard** (`project protection enable <name> --sso`). | The production domain is public (app now, MCP later), while generated deployment URLs (which embed the project name and keep old env snapshots) need a login (P26). |
| D0-15 | Privacy headers in `vercel.json`: `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`. Plus `<meta name="robots">` and `<meta name="referrer">`. `robots.txt` is **allow-all**. | The URL acts as the password. A `Disallow: /` would hide the `noindex` signal from crawlers (P31). |
| D0-16 | Repo checks (`npm run check`):<br>- `check:leaks`: explicit key list plus generic patterns, over files, commit messages and `--stdin` logs<br>- `check:hygiene`: BOM, UTF-8, CR, lockfile natives, pin consistency (pins are best effort, §0.1)<br>- `check:commits`: AI attribution and allowed author e-mail, over the commit range plus PR title and body (the title and body of bot-authored PRs are skipped, §10.1)<br>- `check:core`: plain-Node import of `src/core`<br>All four run locally before every push and in CI. | Defence in depth for the user's hard rules (P1, P4, P5, P10, P39, F35). |
| D0-17 | CI runs on `push` to any branch and on `pull_request` (types opened, synchronize, reopened, edited). Concurrency is per event and ref, cancelling in progress except on `main`. The job name **`ci-verify`** is the required check. For PRs opened by a bot (`github.event.pull_request.user.type == 'Bot'`), the PR title and body are not scanned. Their commit messages and authors still are. | `edited` re-checks a PR body change. The unique name avoids ambiguity (P36). Dependabot bodies quote upstream release notes, which can contain third-party trailers. The ruleset has no bypass actors, so such a PR could otherwise never merge (review r1, S1). |
| D0-18 | Supabase CLI tasks go through `scripts/supabase.mjs`. It loads `.env.local` through the shared parser `scripts/lib/env-file.mjs`, resolves the local CLI bin, always passes `--agent no`, redacts output, and never prints values. | npm scripts run in `cmd.exe` on Windows (no `$VAR`). `.env.local` encoding traps (F13). |
| D0-19 | `VERCEL_PROJECT_NAME` and `PROD_URL` are also stored in the Vercel **development** env. | `vercel env pull` then restores all 7 app keys. |
| D0-20 | Repo merge settings stay unchanged. The ruleset restricts `allowed_merge_methods` to `["merge"]`. | `CLAUDE.md`: merge with a merge commit. |
| D0-21 | `settings` gets check constraints: `week_start` 0 to 6, `theme` in (system, light, dark), `default_duration` 1 to 1440, `energy_limit > 0`, `focus_minutes > 0`, `break_minutes >= 0`. | Values the app cannot handle are rejected while the DB is empty (F32). The meaning of `day_end ≤ day_start` is a Phase 1 decision. |
| D0-22 | `day_notes` gets `updated_at` and the touch trigger. | It is edited from several devices and published to realtime (F33). |
| D0-23 | `src/core` uses **relative imports with explicit `.ts` extensions** (`allowImportingTsExtensions`, `verbatimModuleSyntax`, `erasableSyntaxOnly`). `npm run check:core` imports every core module in plain Node 24 (type stripping). | Phase 2 Vercel functions and plain Node cannot resolve `@/` or extensionless imports (F35). |
| D0-24 | The Vercel CLI is pinned to exactly `vercel@61.1.0` in `deploy.yml`, `scripts/ci/deploy-prod.sh` and `scripts/lib/vercel.mjs`. `check:hygiene` asserts all three match (best effort, §0.1; the substitute is the WP7 grep). | P13. |
| D0-25 | Deploy guards:<br>- the job runs only on `refs/heads/main`<br>- it skips if the SHA is no longer the head of `main`<br>- typecheck, lint and tests run before the build<br>- the token is checked first<br>- a failed CLI install fails loudly<br>**No automatic rollback:** a red run plus the documented one-command rollback (§17.2). | P32, F3. An automatic `vercel rollback` disables production auto-assignment, so later deploys would silently not go live. |
| D0-26 | The build injects `<meta name="build-sha" content="<sha>">` (a public git SHA). The smoke check requires it to equal the deployed commit. | Proves the new deployment is live, not the previous one (F2, P33). |
| D0-27 | `vercel.json` sets `"regions": ["bom1"]`, next to the ap-south-1 database. | Phase 2 functions inherit it; Hobby allows one region (F28, P23). |
| D0-28 | `readSupabaseEnv` rejects placeholders, whitespace, control characters, non-root URL paths and secret keys. A production build (`REQUIRE_SUPABASE_ENV=1` or `VERCEL_ENV=production`) **fails** when the env is invalid. | F1, F13, P25. |
| D0-29 | The Supabase bootstrap is a committed, idempotent script (`scripts/setup-supabase.mjs`). | It can be re-run on any machine after a partial failure without making a second project or a new password (F5, P17). |
| D0-30 | Health errors surface **codes only** (fixed UI copy per code). `details`, `hint` and messages are never shown. | They carry stack traces and bundle URLs (F8, F9). |
| D0-31 | The SPA rewrite excludes `/api`, `/api/…` and `/assets/…` (exact JSON source in §5.9). | Missing `/assets/*` gives a 404, not cached HTML, and `/api` without a slash is not swallowed (F4, P30). |

---

## 4. Resulting file tree (end of Phase 0)

```
structured/
├── .claude/workflows/…               UNCHANGED (pipeline scripts; ignored by ESLint/Prettier/Tailwind)
├── .editorconfig                     NEW  utf-8 (no BOM), LF, 2 spaces
├── .env.example                      NEW  7 app keys, no values
├── .gitattributes                    NEW  * text=auto eol=lf (+ binaries, crlf for .cmd/.bat/.ps1)
├── .gitignore                        EXTENDED (§5.2)
├── .nvmrc                            NEW  24
├── .prettierignore / .prettierrc.json NEW
├── .vercelignore                     NEW  (only matters for the remote-build fallback)
├── .vscode/extensions.json           NEW  eslint, prettier, tailwind
├── .github/
│   ├── ISSUE_TEMPLATE/{bug_report.yml, feature_request.yml, config.yml}   NEW
│   ├── dependabot.yml                NEW
│   ├── pull_request_template.md      NEW
│   ├── rulesets/main.json            NEW  exact payload applied through gh api
│   └── workflows/{ci.yml, deploy.yml} NEW
├── CLAUDE.md                         EXTENDED (existing lines kept verbatim; §11 WP2 and WP9)
├── HANDOFF.md                        UPDATED after every WP (template §11 WP9)
├── PLAN.md                           UNCHANGED (only §14 Phase 0 checkboxes, ticked by the final verifier)
├── README.md                         REWRITTEN (no app URLs)
├── api/README.md                     NEW  placeholder (Phase 2: mcp/[secret].ts)
├── components.json                   NEW  shadcn (style radix-nova, css src/styles/index.css)
├── docs/phases/phase-0/              plan-v1, edge cases, THIS FILE, DEVLOG.md, reviews, test reports
├── eslint.config.js                  NEW
├── index.html                        NEW
├── package.json / package-lock.json  NEW
├── public/{favicon.svg, robots.txt}  NEW
├── scripts/
│   ├── lib/env-file.mjs              NEW  .env parser/writer (BOM/UTF-16 aware) + CLI: check|get|set
│   ├── lib/vercel.mjs                NEW  VERCEL_CLI pin + safe spawn helper
│   ├── lib/__tests__/env-file.test.mjs NEW
│   ├── checks/leaks.mjs              NEW
│   ├── checks/hygiene.mjs            NEW
│   ├── checks/commits.mjs            NEW
│   ├── checks/core-node.mjs          NEW
│   ├── checks/__tests__/{leaks,commits}.test.mjs NEW
│   ├── ci/deploy-prod.sh             NEW  shared production deploy (CI + local)
│   ├── ci/smoke.mjs                  NEW  production smoke check (never prints URLs)
│   ├── ci/redact-log.sh              NEW
│   ├── setup-supabase.mjs            NEW  idempotent project bootstrap
│   ├── supabase.mjs                  NEW  link|push|migrations|types|ping|settings
│   └── sync-vercel-env.mjs           NEW  compare/apply .env.local → Vercel env matrix
├── server/README.md                  NEW  placeholder (Phase 2)
├── src/
│   ├── App.tsx                       NEW
│   ├── main.tsx                      NEW
│   ├── env.d.ts                      NEW
│   ├── components/
│   │   ├── DbStatusBadge.tsx         NEW
│   │   ├── RootErrorBoundary.tsx     NEW
│   │   ├── __tests__/DbStatusBadge.test.tsx NEW
│   │   └── ui/button.tsx             NEW  shadcn generated
│   ├── core/
│   │   ├── dates.ts                  NEW
│   │   └── __tests__/{environment,dates.api,dates.zone,dates.time,dates.calendar,dates.format}.test.ts NEW
│   ├── data/
│   │   ├── database.types.ts         GENERATED (npm run db:types)
│   │   ├── dbCheck.ts                NEW  startDbCheck() singleflight bound to the real client
│   │   ├── env.ts                    NEW  readSupabaseEnv() (dependency-free; also used by vite.config.ts)
│   │   ├── errors.ts                 NEW  toDbErrorCode()
│   │   ├── health.ts                 NEW  checkDatabase() (pure, store injected)
│   │   ├── supabase.ts               NEW  typed client (null when not configured)
│   │   ├── repo/settings.ts          NEW  createSettingsStore(db)
│   │   ├── queries/README.md         NEW  placeholder (Phase 1)
│   │   └── __tests__/{env,errors,health,settings-store}.test.ts NEW
│   ├── features/README.md            NEW  placeholder
│   ├── lib/utils.ts                  NEW  shadcn cn()
│   ├── platform/{timezone.ts, network.ts} NEW
│   ├── stores/README.md              NEW  placeholder
│   ├── styles/index.css              NEW
│   └── test/setup.ts                 NEW  unit-test fetch stub
├── supabase/{.gitignore, config.toml} GENERATED by `supabase init` (no project ref inside)
├── supabase/migrations/0001_init.sql NEW
├── tests/integration/supabase.test.ts NEW
├── tsconfig.json / tsconfig.app.json / tsconfig.node.json / tsconfig.test.json NEW
├── vercel.json                       NEW
├── vite.config.ts / vitest.config.ts / vitest.integration.config.ts NEW
```

Never committed:
- `.env.local`
- `.vercel/`
- `supabase/.temp/`
- `node_modules/`
- `dist/`
- `coverage/`
- `.claude/settings.local.json`

**Placeholder policy.** A folder that must exist but has no code yet gets a 3 to 6 line `README.md` stating its purpose and import rules, nothing else, and never an empty file (P16). The folders are `src/features`, `src/stores`, `src/data/queries`, `server` and `api`. Vercel builds only `.js`/`.ts` files in `api/` as functions.

---

## 5. Configuration files (exact where short)

### 5.1 `.gitattributes`
```gitattributes
* text=auto eol=lf
*.cmd text eol=crlf
*.bat text eol=crlf
*.ps1 text eol=crlf
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.webp binary
*.woff binary
*.woff2 binary
*.jar binary
*.keystore binary
```
After adding it, run `git add --renormalize .`. Today every tracked file is LF, so the diff must be empty.

### 5.2 `.gitignore` additions (keep every existing line)
```gitignore
# typescript build info
*.tsbuildinfo

# personal Claude Code settings (never committed)
.claude/settings.local.json
```
Already present: `.env`, `.env.*`, `!.env.example`, `*.local`, `.vercel/`, `coverage/`, `supabase/.temp/` and `!.vscode/extensions.json`.

### 5.3 `.editorconfig`, `.nvmrc`
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false

[*.{cmd,bat,ps1}]
end_of_line = crlf
```
`.nvmrc` contains the single line `24` (no BOM; checked by `check:hygiene`).

### 5.4 `package.json` (target shape)
```jsonc
{
  "name": "structured",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "description": "Personal visual day planner and work tracker with a Claude MCP connector",
  "repository": "github:karthi-ai-engineer/Structured",
  "engines": { "node": "24.x" },
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b",
    "lint": "eslint . --max-warnings=0",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check": "npm run check:hygiene && npm run check:leaks && npm run check:commits && npm run check:core",
    "check:hygiene": "node scripts/checks/hygiene.mjs",
    "check:leaks": "node scripts/checks/leaks.mjs",
    "check:commits": "node scripts/checks/commits.mjs",
    "check:core": "node scripts/checks/core-node.mjs",
    "verify": "npm run typecheck && npm run lint && npm run format:check && npm run test:coverage && npm run build && npm run check",
    "db:setup": "node scripts/setup-supabase.mjs",
    "db:link": "node scripts/supabase.mjs link",
    "db:push": "node scripts/supabase.mjs push",
    "db:migrations": "node scripts/supabase.mjs migrations",
    "db:types": "node scripts/supabase.mjs types",
    "db:ping": "node scripts/supabase.mjs ping",
    "env:check": "node scripts/lib/env-file.mjs check",
    "env:sync-vercel": "node scripts/sync-vercel-env.mjs"
  }
}
```
`vite.config.ts` sets `server.strictPort` and `preview.strictPort`, so an orphaned server makes the next start fail instead of silently moving to another port (P7).

Scripts are added in the WP that creates what they call. `package.json` gets **no** `packageManager` field; CI uses explicit `cache: npm`.

**Dependencies** (caret ranges; the lockfile pins exact versions):
- **dependencies:**
  - `react`, `react-dom`
  - `@supabase/supabase-js`
  - `date-fns`, `@date-fns/tz`
  - the runtime packages shadcn adds (`radix-ui`, `class-variance-authority`, `cn`, `lucide-react`)
- **devDependencies:**
  - build: `typescript@~6.0.3`, `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@types/node@^24`
  - lint and format: `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `eslint-config-prettier`, `prettier`, `prettier-plugin-tailwindcss`
  - test: `vitest`, `@vitest/coverage-v8`
  - Supabase CLI: `supabase`
  - build-time CSS: `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`, `shadcn`, `@fontsource-variable/geist` (CSS only). Move them out of `dependencies` if shadcn put them there.
- Never install with `--omit=optional` or `--no-optional` (P10).

### 5.5 TypeScript
`tsconfig.json` (solution file):
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.test.json" }
  ],
  "compilerOptions": { "paths": { "@/*": ["./src/*"] } }
}
```
`tsconfig.app.json` is the create-vite file, keeping everything it has. In particular keep:
- `"moduleResolution": "bundler"`
- `"allowImportingTsExtensions": true`
- `"verbatimModuleSyntax": true`
- `"erasableSyntaxOnly": true`
- `"noEmit": true`
- `"noUnusedLocals"`, `"noUnusedParameters"`, `"noFallthroughCasesInSwitch"`
- `"types": ["vite/client"]`
- `"include": ["src"]`

Add:
- `"strict": true` (TS 6 already defaults to strict, and create-vite no longer sets it. It is written explicitly so that `tsc --showConfig` in AC 5 shows it.)
- `"noUncheckedIndexedAccess": true`
- `"noImplicitOverride": true`
- `"forceConsistentCasingInFileNames": true`
- `"paths": { "@/*": ["./src/*"] }`

**No `baseUrl`** (it is deprecated in TS 6; `paths` works without it).

`tsconfig.node.json` is the create-vite file plus `"strict": true`, `"types": ["node"]` and `"include": ["vite.config.ts", "vitest.config.ts", "vitest.integration.config.ts"]`. `vite.config.ts` imports `./src/data/env.ts`. If `tsc -b` then reports TS6307, add `"src/data/env.ts"` to this `include`.

`tsconfig.test.json`:
```json
{
  "extends": "./tsconfig.app.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.test.tsbuildinfo",
    "types": ["node", "vite/client"]
  },
  "include": ["tests"]
}
```

### 5.6 `vite.config.ts`
```ts
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import { readSupabaseEnv } from './src/data/env.ts'

// <meta name="build-sha"> lets the deploy smoke check prove which commit is live (public SHA only).
function buildShaMeta(): Plugin {
  const raw = process.env.VITE_BUILD_SHA ?? ''
  const sha = /^[0-9a-f]{7,40}$/.test(raw) ? raw : 'dev'
  return {
    name: 'structured:build-sha',
    transformIndexHtml: (html) =>
      html.replace('</head>', `  <meta name="build-sha" content="${sha}" />\n  </head>`),
  }
}

export default defineConfig(({ mode }) => {
  // Production builds must never ship without a valid browser Supabase config (placeholders,
  // empty values and secret keys are rejected). CI's verify build is intentionally unconfigured.
  if (process.env.REQUIRE_SUPABASE_ENV === '1' || process.env.VERCEL_ENV === 'production') {
    const env = readSupabaseEnv(loadEnv(mode, process.cwd(), 'VITE_'), { requirePublishable: true })
    if (!env.ok) {
      throw new Error(`Production build refused; invalid Supabase env: ${env.problems.join('; ')}`)
    }
  }
  return {
    plugins: [react(), tailwindcss(), buildShaMeta()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    server: { strictPort: true },
    preview: { strictPort: true },
  }
})
```

### 5.7 `vitest.config.ts`, `src/test/setup.ts`, `vitest.integration.config.ts`
```ts
// vitest.config.ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Every unit test runs in a half-hour-offset zone with DST, so accidental use of the machine's
// zone fails (asserted by src/core/__tests__/environment.test.ts). Set here, because Git Bash
// strips TZ from child processes on Windows.
process.env.TZ = 'America/St_Johns'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.mjs'],
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    // Hermetic: .env.local must not leak real Supabase values into unit tests (same as CI).
    env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '', VITE_BUILD_SHA: '' },
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/__tests__/**'],
      thresholds: { lines: 95, statements: 95, functions: 100, branches: 90 }, // added in WP4
    },
  },
})
```
```ts
// src/test/setup.ts: unit tests never touch the network. Tests that need HTTP pass their own
// fetch to createClient({ global: { fetch } }).
import { vi } from 'vitest'
vi.stubGlobal('fetch', () => Promise.reject(new Error('network disabled in unit tests')))
```
```ts
// vitest.integration.config.ts
import { fileURLToPath, URL } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    env: loadEnv(mode, process.cwd(), ''), // reads .env.local; values are never printed
    testTimeout: 45_000,
    hookTimeout: 45_000,
    fileParallelism: false,
  },
}))
```

### 5.8 ESLint (`eslint.config.js`)
```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier/flat'
import { defineConfig, globalIgnores } from 'eslint/config'

const noServer = {
  group: ['**/server/**', 'server', 'server/*'],
  message: 'src/ must never import server/ (PLAN.md section 6).',
}
const supabaseOnlyInData = { group: ['@supabase/*'], message: 'Only src/data may use Supabase.' }
const coreOnly = [
  noServer,
  { group: ['@supabase/*'], message: 'src/core must not depend on Supabase.' },
  { group: ['react', 'react/*', 'react-dom', 'react-dom/*'], message: 'src/core is pure TypeScript: no React.' },
  {
    group: ['@/*'],
    message: 'src/core uses relative imports with .ts extensions only (plain Node and Vercel functions cannot resolve @/).',
  },
  {
    group: ['**/data/**', '**/features/**', '**/components/**', '**/platform/**', '**/stores/**', '**/lib/**', '**/styles/**'],
    message: 'src/core may only import from src/core.',
  },
]
const clock = [
  { selector: "NewExpression[callee.name='Date'][arguments.length=0]", message: 'Read the clock only through src/core/dates.ts (todayIn/nowMinutesIn) or pass an explicit instant.' },
  { selector: "CallExpression[callee.object.name='Date'][callee.property.name='now']", message: 'Read the clock only through src/core/dates.ts.' },
]
const noDynamicImport = { selector: 'ImportExpression', message: 'No dynamic import() in src/core.' }

export default defineConfig([
  globalIgnores(['dist', 'coverage', '.vercel', '.claude', 'docs', 'src/data/database.types.ts', 'supabase/.temp']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  // no-restricted-imports / no-restricted-syntax options do not merge across config objects:
  // each block below repeats everything that must apply to its files.
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [noServer, supabaseOnlyInData] }],
      'no-restricted-syntax': ['error', ...clock],
    },
  },
  { files: ['src/data/**/*.{ts,tsx}'], rules: { 'no-restricted-imports': ['error', { patterns: [noServer] }] } },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: coreOnly }],
      'no-restricted-syntax': ['error', ...clock, noDynamicImport],
    },
  },
  { files: ['src/core/dates.ts'], rules: { 'no-restricted-syntax': ['error', noDynamicImport] } },
  { files: ['src/components/ui/**/*.tsx'], rules: { 'react-refresh/only-export-components': 'off' } },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  prettier,
])
```

### 5.9 Prettier, CSS entry, `index.html`, `vercel.json`, `.vercelignore`, `robots.txt`
`.prettierrc.json`:
```json
{
  "$schema": "https://json.schemastore.org/prettierrc",
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "endOfLine": "lf",
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./src/styles/index.css",
  "tailwindFunctions": ["cn", "cva"]
}
```
`.prettierignore`:
```
dist
coverage
.vercel
node_modules
package-lock.json
src/data/database.types.ts
supabase/.temp
docs
.claude
**/*.md
```
`src/styles/index.css` starts with the lines below. shadcn's `init` adds its imports, `@theme` and tokens after them:
```css
@import "tailwindcss";
@source not "../../docs";
@source not "../../PLAN.md";
@source not "../../.claude";
```
`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="robots" content="noindex, nofollow" />
    <meta name="referrer" content="no-referrer" />
    <meta name="color-scheme" content="light" />
    <title>Structured</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```
The theme stays light-only until Phase 1 dark mode. `color-scheme: light` stops Android auto-dark and a future WebView from inverting the page (F12).

`vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "git": { "deploymentEnabled": false },
  "regions": ["bom1"],
  "rewrites": [{ "source": "/((?!api(?:/|$)|assets/).*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Robots-Tag", "value": "noindex, nofollow" },
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```
Routing:
- Static files match first (filesystem precedence).
- `/api`, `/api/*` and `/assets/*` are never rewritten, so a missing asset or an unknown API path returns 404.
- Everything else serves the SPA.

If `vercel build` rejects `regions` on Hobby, remove the key, run `vercel project update --help` to find the function-region option, and record the change in `DEVLOG.md`.

`.vercelignore` (only used by the remote-build fallback, because prebuilt deploys upload only `.vercel/output`):
```
.env*
!.env.example
supabase/.temp
docs
coverage
```
`public/robots.txt` (allow-all, so crawlers can see `noindex`):
```
User-agent: *
Allow: /
```

### 5.10 `.env.example`
```dotenv
# Copy to .env.local (gitignored) or restore it with `npx --yes vercel@61.1.0 env pull .env.local --yes`.
# Never commit real values. Never print them in docs, reports or CI logs.
# Write this file with an editor or Node only (never PowerShell redirection: BOM/UTF-16 breaks the scripts).

# Browser (bundled into the client; still kept out of the repo)
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

# Server only. Never prefix with VITE_.
SUPABASE_SECRET_KEY=

# Supabase CLI (local tooling)
SUPABASE_DB_PASSWORD=
SUPABASE_PROJECT_REF=

# Deployment bookkeeping (local only; the project name and URL are secret)
VERCEL_PROJECT_NAME=
PROD_URL=

# Phase 2 (not used yet)
# MCP_SECRET=
```

### 5.11 Environment variable placement (the matrix `sync-vercel-env.mjs` enforces)
| Variable | `.env.local` | Vercel production | Vercel preview | Vercel development | GitHub secret |
|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` | yes | Config | Config | Config | – |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | Config | Config | Config | – |
| `SUPABASE_SECRET_KEY` | yes | **Secret (sensitive)** | – | Config (dev cannot be sensitive) | – |
| `SUPABASE_DB_PASSWORD` | yes | – | – | Config | – |
| `SUPABASE_PROJECT_REF` | yes | – | – | Config | – |
| `VERCEL_PROJECT_NAME` | yes | – | – | Config (D0-19) | – |
| `PROD_URL` | yes | – | – | Config (D0-19) | `PROD_URL` |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | (in `.vercel/project.json`) | – | – | – | yes |
| `VERCEL_TOKEN` | – | – | – | – | yes (already set by the user) |

Rules:
- `VITE_*` must **never** be Secret in production. If a team policy forces "sensitive", the production build fails loudly (D0-28). The owner then turns that policy off.
- Build steps never read `SUPABASE_SECRET_KEY`. In the prebuilt flow it is a placeholder at build time, while functions get the real value at runtime.
- **The Vercel development env is the source of truth.** Run `npm run env:sync-vercel` (the report) before any `env pull` on a second device (F24).

---

## 6. Key code designs

### 6.1 `src/core/dates.ts`
Pure. It imports only `date-fns` and `@date-fns/tz`, uses relative imports (none today) with `.ts` extensions, and is the **only** module allowed to read the clock.

Conventions (PLAN §10.3):
- dates are `YYYY-MM-DD`
- times are `HH:mm` (24 h) in the user's zone
- durations are integer minutes

Timeline maths is **wall-clock** time: a DST day has 23 or 25 hours, and a 01:00 to 03:00 task on a spring-forward day is 2 h on the timeline but 1 h elapsed. This is stated in the file's header comment (F18).

Error policy:
- Invalid input raises a `RangeError` with a message that names the problem.
- `is*` guards never throw.
- Every function that takes `now` defaults it to `new Date()`.
```ts
export type ISODate = string                       // 'YYYY-MM-DD', within MIN_ISO_DATE..MAX_ISO_DATE
export type TimeFormat = '12h' | '24h'
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6   // 0 = Sunday … 6 = Saturday (settings.week_start)
export interface TimeOptions { endOfDay?: boolean } // allow '24:00' (= 1440) for end times / day_end
export const MINUTES_PER_DAY = 1440
export const MIN_ISO_DATE = '1900-01-01'
export const MAX_ISO_DATE = '2999-12-31'

// Zones
export function isValidTimeZone(tz: string): boolean       // Intl accepts it; not '', not padded, not an offset ('+05:30', '-03:30')
export function assertTimeZone(tz: string): void           // RangeError if !isValidTimeZone
export function normalizeTimeZone(tz: string): string      // Intl's canonical spelling (case, aliases); RangeError if invalid

// Calendar dates (arithmetic via Date.UTC + getUTC*; the range guarantees 4-digit years)
export function isISODate(value: string): boolean          // /^\d{4}-\d{2}-\d{2}$/, real calendar day, within range
export function parseISODate(value: string): { year: number; month: number; day: number } // RangeError
export function addDays(date: ISODate, days: number): ISODate      // integer days; RangeError if result out of range
export function diffDays(later: ISODate, earlier: ISODate): number
export function dayOfWeek(date: ISODate): WeekStart                // 0 = Sun
export function toWeekStart(n: number): WeekStart                  // integer 0..6 else RangeError
export function startOfWeek(date: ISODate, weekStart: WeekStart): ISODate
export function weekRange(date: ISODate, weekStart: WeekStart):
  { start: ISODate; end: ISODate; days: readonly ISODate[] }       // 7 consecutive days, end inclusive

// Clock (time-zone aware)
export function todayIn(tz: string, now?: Date): ISODate           // RangeError on invalid tz or Invalid Date
export function nowMinutesIn(tz: string, now?: Date): number       // 0..1439 wall-clock minutes (jumps/repeats at DST)
export function msUntilNextDayIn(tz: string, now?: Date): number   // ms until the next local midnight (> 0); Phase 1 day rollover

// Times of day
export function isTime(value: string, options?: TimeOptions): boolean
export function toMinutes(time: string, options?: TimeOptions): number
//   accepts 'HH:mm', 'HH:mm:ss', 'HH:mm:ss.fff…' (Postgres `time` output; seconds are floored away)
//   hours 00..23, minutes/seconds 00..59; '24:00' / '24:00:00' / '24:00:00.0…' → 1440 ONLY with { endOfDay: true }
export function fromMinutes(minutes: number): string              // integer 0..1440 → 'HH:mm'; 1440 → '24:00'
export function addMinutesToTime(time: string, delta: number): { time: string; dayOffset: number }
//   integer delta; '23:30' + 60 → { '00:30', 1 }; '24:00' + 0 → { '00:00', 1 }

// Wall clock → instant
export function zonedDateTimeToInstant(date: ISODate, time: string, tz: string): Date
//   time via toMinutes(time, { endOfDay: true }); 1440 means 00:00 of the next day.
//   DST rule ('compatible'): nonexistent wall time → shifted forward by the gap; ambiguous → EARLIER instant.
//   Implemented with tzOffset(), NOT the TZDate constructor (inconsistent for Chatham and Lord Howe, §2.2 item 11):
//     wall = Date.UTC(y, m-1, d, hh, mm)
//     offsets = unique([tzOffset(tz, new Date(wall - 36h)), tzOffset(tz, new Date(wall + 36h))])
//     candidates = offsets.map(o => wall - o*60_000).filter(i => tzOffset(tz, new Date(i))*60_000 === wall - i)
//     candidates.length ? min(candidates) : wall - tzOffset(tz, new Date(wall - 36h))*60_000   // gap
export function startOfDayInstant(date: ISODate, tz: string): Date   // zonedDateTimeToInstant(date, '00:00', tz)

// Display (never uses Intl: output is identical on every Node/ICU/browser)
export function formatTime(minutes: number, format: TimeFormat): string
//   integer 0..1440; 570 → '09:30' | '9:30 AM'; 0 → '00:00' | '12:00 AM'; 720 → '12:00 PM'; 1440 → '24:00' | '12:00 AM'
export function formatDuration(minutes: number): string
//   finite ≥ 0, rounded to the nearest minute, no upper bound: 0 '0m', 45 '45m', 60 '1h', 90 '1h 30m', 1500 '25h'
export function formatDateLabel(date: ISODate, pattern?: string): string
//   date-fns format (en-US default locale, no Intl) on new TZDate(y, m-1, d, 'UTC'); default 'EEE, d MMM' → 'Tue, 29 Sep'
```
Implementation notes:
- `todayIn` and `nowMinutesIn`: `assertTimeZone`, reject an Invalid Date, then read the components of `new TZDate(now, tz)`.
- `msUntilNextDayIn = startOfDayInstant(addDays(todayIn(tz, now), 1), tz) - now`.
- There are no module-level side effects.
- `sameTimeZone(a, b)` and `dayWindowMinutes(start, end)` are **Phase 1** (they need the device-zone banner and the `day_end` semantics decision).

### 6.2 `src/data/env.ts` (dependency-free; imported by `vite.config.ts` too)
```ts
export type SupabaseEnv =
  | { ok: true; url: string; publishableKey: string }
  | { ok: false; problems: readonly string[] }        // e.g. 'VITE_SUPABASE_URL is missing'; never values

export function readSupabaseEnv(
  env: Readonly<Record<string, string | undefined>>,
  options?: { requirePublishable?: boolean },         // true for production builds
): SupabaseEnv
```
Rules. Each problem names the variable and never echoes the value:
- **Both variables:**
  - missing or empty is a problem
  - leading or trailing whitespace, or control characters (`[\u0000-\u001f\u007f]`), are a problem (F13)
  - a Vercel placeholder (`SENSITIVE_ENV_VALUE_PLACEHOLDER`, `[SENSITIVE]`) is a problem ("is a Vercel Secret placeholder; store it as Config", F1, P28)
- **URL:**
  - it must parse
  - protocol `https:` (or `http:` only for `localhost`/`127.0.0.1`)
  - pathname exactly `/`, which catches a pasted `/rest/v1`
  - no search, hash, user name or password
- **Key:**
  - `sb_secret_…` is rejected ("secret key must never be used in the browser")
  - with `requirePublishable`, the key must start with `sb_publishable_`
  - otherwise a legacy JWT (`eyJ…`) is accepted

### 6.3 `src/data/supabase.ts`
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { readSupabaseEnv, type SupabaseEnv } from './env'

export type Db = SupabaseClient<Database>
export const supabaseEnv: SupabaseEnv = readSupabaseEnv(import.meta.env)
export const supabase: Db | null = supabaseEnv.ok
  ? createClient<Database>(supabaseEnv.url, supabaseEnv.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null
```
`null` means "not configured": a CI build or a clone without `.env.local`. The app renders "Database not configured" instead of a white screen. `src/env.d.ts` declares `VITE_SUPABASE_URL?`, `VITE_SUPABASE_PUBLISHABLE_KEY?` and `VITE_BUILD_SHA?` as optional strings.

### 6.4 `src/data/errors.ts`, `src/data/repo/settings.ts`, `src/data/health.ts`, `src/data/dbCheck.ts`
```ts
// errors.ts
export type DbErrorCode =
  | 'offline' | 'network' | 'timeout' | 'paused' | 'invalid-key' | 'schema-missing' | 'permission'
  | 'write-not-visible' | 'unexpected' | `pg-${string}` | `http-${number}`
export function toDbErrorCode(r: { status: number; error: { message: string; code?: string } }): DbErrorCode
//   status 0 and message starts with 'AbortError' or 'TimeoutError' → 'timeout'; other status 0 → 'network'
//   540 → 'paused'; code 'PGRST205' → 'schema-missing'; code '42501' → 'permission'
//   401/403 with empty code → 'invalid-key'; any other non-empty code → `pg-${code}`; else `http-${status}`

// repo/settings.ts
export type DbResult<T> = { ok: true; value: T } | { ok: false; code: DbErrorCode }
export interface SettingsStore {
  readSettingsId(signal: AbortSignal): Promise<DbResult<number | null>>
  insertDefaultSettings(timezone: string, signal: AbortSignal): Promise<DbResult<'inserted' | 'exists'>>
}
export function createSettingsStore(db: Db): SettingsStore
//   read:   db.from('settings').select('id').eq('id', 1).abortSignal(signal).retry(false).maybeSingle()
//   insert: db.from('settings').insert({ id: 1, timezone }).abortSignal(signal).retry(false)
//           error code '23505' → { ok: true, value: 'exists' } (another tab or device won the race)
//   never throws; never returns error.message / details / hint

// health.ts (pure; store injected)
export type DbStatus =
  | { state: 'checking' }
  | { state: 'not-configured'; problems: readonly string[] }
  | { state: 'connected'; settingsRow: 'found' | 'created' }
  | { state: 'error'; code: DbErrorCode }
export async function checkDatabase(input: {
  env: SupabaseEnv; store: SettingsStore | null; timezone: string; online: boolean; timeoutMs?: number // default 12_000
}): Promise<DbStatus>                                  // never rejects
export function singleflight<T>(start: () => Promise<T>): () => Promise<T> // reuse the pending promise

// dbCheck.ts (binds the real client; the only module App uses)
export const startDbCheck: (input: { timezone: string; online: boolean }) => Promise<DbStatus>
```
`checkDatabase` flow:
1. If `env.ok` is false, or `store` is null, return `not-configured`.
2. If `online` is false, return `error/offline` immediately (F10).
3. Create one `AbortController`. `setTimeout(() => ctrl.abort(), timeoutMs)` covers the whole read, insert and re-read sequence, and the timer is cleared in `finally`.
4. Read. An error returns `error/<code>`. A row returns `connected/found`.
5. Insert `{id: 1, timezone}`. An error returns `error/<code>`. The result `exists` means another tab won.
6. Re-read. A row returns `connected/created` (or `found` if the insert said `exists`). No row returns `error/write-not-visible`.
7. Any throw returns `error/unexpected`.

`startDbCheck` is `async` (a synchronous throw becomes an error state, F11) and singleflight. The two StrictMode initializer calls in development share one promise, so "created" and "found" are deterministic.

### 6.5 Platform adapters
- `src/platform/timezone.ts`: `detectTimeZone(): string`. It returns `normalizeTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)` inside try/catch, and `'UTC'` if the zone is invalid or anything throws.
- `src/platform/network.ts`: `isOnline(): boolean`. It returns `typeof navigator === 'undefined' || navigator.onLine !== false`.

### 6.6 `src/App.tsx`, `src/components/DbStatusBadge.tsx`, `src/components/RootErrorBoundary.tsx`, `src/main.tsx`
```tsx
function DbStatusView({ promise }: { promise: Promise<DbStatus> }) {
  return <DbStatusBadge status={use(promise)} />
}

export function App() {
  const run = () => startDbCheck({ timezone: detectTimeZone(), online: isOnline() })
  const [status, setStatus] = useState(run)          // App itself never suspends, so the state survives
  const [isPending, startTransition] = useTransition()
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Structured</h1>
      <Suspense fallback={<DbStatusBadge status={{ state: 'checking' }} />}>
        <DbStatusView promise={status} />
      </Suspense>
      <Button size="lg" variant="outline" className="min-h-11" disabled={isPending} aria-busy={isPending}
        onClick={() => startTransition(() => setStatus(run()))}>
        Check again
      </Button>
    </main>
  )
}
```
`DbStatusBadge` markup:
- a container with `data-testid="db-status"`, `data-state=<state>`, `role="status"` and `aria-live="polite"`
- a title `data-testid="db-status-title"` and a detail `data-testid="db-status-detail"`
- state is conveyed by text plus a lucide icon, not colour alone
- a spinner, if any, uses `motion-safe:animate-spin`

| State / code | Title | Detail |
|---|---|---|
| checking | Checking database… | – |
| connected | **DB connected** (exact text) | Settings row found / Settings row created |
| not-configured | Database not configured | Missing or invalid: <variable names> |
| error `offline` | Database error | You're offline. Connect, then check again. |
| error `network` | Database error | Can't reach the database. Check your connection. |
| error `timeout` | Database error | The database is slow to respond. Check again in a moment. |
| error `paused` | Database error | The Supabase project is paused. Restore it in the Supabase dashboard (see HANDOFF.md). |
| error `invalid-key` | Database error | The API key was rejected. Re-pull the environment and redeploy. |
| error `schema-missing` | Database error | The database schema is missing. Run `npm run db:push`. |
| error `permission` | Database error | Table permissions (grants) are missing. |
| error `write-not-visible` | Database error | The settings row was written but cannot be read back. |
| any other error | Database error | Unexpected database error. |

Every error state also shows its code in small monospace text. The badge never renders a URL, a key or a server message.

`RootErrorBoundary` (a class component) wraps `<App />` in `main.tsx` inside `<StrictMode>`. It shows "Something went wrong" and a "Reload" button (`min-h-11`) instead of a white screen (F11).

### 6.7 Data flow at runtime
```
browser → main.tsx → RootErrorBoundary → App → startDbCheck({ timezone: detectTimeZone(), online: isOnline() })
        → checkDatabase({ env: supabaseEnv, store: supabase && createSettingsStore(supabase), … })
        → supabase-js (publishable key, retry off, shared 12 s deadline) → PostgREST /rest/v1/settings
        ← row / insert result / typed error code → DbStatus → DbStatusBadge ("DB connected")
```

---

## 7. Migration `supabase/migrations/0001_init.sql` (exact)

This is PLAN §7.1 and §7.2 plus the deliberate additions D0-9, D0-21 and D0-22. Keep the §7.1 columns, defaults, checks and FKs character for character. Only comments may differ.
```sql
-- 0001_init.sql: initial schema (PLAN.md sections 7.1 and 7.2). Apply with `npm run db:push`.
-- Single user, no login: no user_id columns. RLS is on with open_access policies for anon and
-- authenticated; SSO later replaces them (PLAN.md section 14, "Later: SSO / login").
-- Deliberate additions to PLAN.md 7.1 (docs/phases/phase-0/PLAN.md D0-9, D0-21, D0-22):
--   settings check constraints, day_notes.updated_at + trigger, explicit Data API grants,
--   and a PostgREST schema-cache reload.

create extension if not exists pgcrypto;

-- settings (exactly one row)
create table public.settings (
  id               smallint primary key default 1 check (id = 1),
  timezone         text     not null default 'UTC',            -- set from the browser on first app open
  time_format      text     not null default '24h' check (time_format in ('12h','24h')),
  week_start       smallint not null default 1 check (week_start between 0 and 6),   -- 0 = Sun, 1 = Mon
  day_start        time     not null default '07:00',
  day_end          time     not null default '22:00',
  default_duration int      not null default 30 check (default_duration between 1 and 1440),
  default_alerts   int[]    not null default '{0}',            -- minutes before start
  energy_enabled   boolean  not null default true,
  energy_limit     int      not null default 30 check (energy_limit > 0),
  focus_minutes    int      not null default 25 check (focus_minutes > 0),
  break_minutes    int      not null default 5 check (break_minutes >= 0),
  theme            text     not null default 'system' check (theme in ('system','light','dark')),
  updated_at       timestamptz not null default now()
);

-- goals (targets / projects)
create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  color         text not null default 'blue',
  icon          text,
  target_type   text not null default 'tasks' check (target_type in ('tasks','minutes','percent')),
  target_value  int,
  manual_value  int not null default 0,
  start_date    date,
  deadline      date,
  status        text not null default 'active' check (status in ('active','done','archived')),
  sort_order    double precision not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- tasks: one-off, inbox, recurring series and per-occurrence overrides (PLAN.md 7.1)
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  notes           text,
  icon            text,
  color           text not null default 'coral',
  subtasks        jsonb not null default '[]',
  date            date,
  start_time      time,
  duration_min    int not null default 30 check (duration_min between 0 and 1440),
  is_all_day      boolean not null default false,
  energy          smallint check (energy between -1 and 3),
  priority        smallint check (priority between 1 and 3),
  due_date        date,
  goal_id         uuid references public.goals on delete set null,
  alerts          int[],
  repeat_rule     text,
  repeat_until    date,
  series_id       uuid references public.tasks on delete cascade,
  occurrence_date date,
  is_cancelled    boolean not null default false,
  completed_at    timestamptz,
  inbox_order     double precision not null default 0,
  source          text not null default 'app' check (source in ('app','mcp','template','import')),
  batch_id        uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (series_id, occurrence_date)
);
create index tasks_date_idx      on public.tasks (date)      where deleted_at is null;
create index tasks_series_idx    on public.tasks (series_id) where series_id is not null;
create index tasks_recurring_idx on public.tasks (date)      where repeat_rule is not null and deleted_at is null;
create index tasks_goal_idx      on public.tasks (goal_id);

-- focus sessions (actual time log)
create table public.focus_sessions (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid references public.tasks on delete set null,
  goal_id     uuid references public.goals on delete set null,
  kind        text not null default 'focus' check (kind in ('focus','break')),
  started_at  timestamptz not null,
  ended_at    timestamptz,
  planned_min int,
  created_at  timestamptz not null default now()
);

-- day notes (shutdown review / journal); updated_at added (D0-22)
create table public.day_notes (
  date        date primary key,
  note        text,
  mood        smallint check (mood between 1 and 5),
  energy      smallint check (energy between 1 and 5),
  reviewed_at timestamptz,
  updated_at  timestamptz not null default now()
);

-- templates (Phase 5)
create table public.templates (
  id    uuid primary key default gen_random_uuid(),
  name  text not null,
  items jsonb not null default '[]'
);

-- Data API grants: projects created after 2026-05-30 do not expose new public tables automatically.
grant select, insert, update, delete on table
  public.settings, public.goals, public.tasks, public.focus_sessions, public.day_notes, public.templates
  to anon, authenticated, service_role;

-- Row level security: open access for now (single user, no login).
alter table public.settings       enable row level security;
alter table public.goals          enable row level security;
alter table public.tasks          enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.day_notes      enable row level security;
alter table public.templates      enable row level security;

create policy "open_access" on public.settings       for all to anon, authenticated using (true) with check (true);
create policy "open_access" on public.goals          for all to anon, authenticated using (true) with check (true);
create policy "open_access" on public.tasks          for all to anon, authenticated using (true) with check (true);
create policy "open_access" on public.focus_sessions for all to anon, authenticated using (true) with check (true);
create policy "open_access" on public.day_notes      for all to anon, authenticated using (true) with check (true);
create policy "open_access" on public.templates      for all to anon, authenticated using (true) with check (true);

-- updated_at trigger (server-stamped; empty search_path avoids the advisor warning)
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger settings_touch  before update on public.settings  for each row execute function public.touch_updated_at();
create trigger goals_touch     before update on public.goals     for each row execute function public.touch_updated_at();
create trigger tasks_touch     before update on public.tasks     for each row execute function public.touch_updated_at();
create trigger day_notes_touch before update on public.day_notes for each row execute function public.touch_updated_at();

-- Realtime
alter publication supabase_realtime add table public.tasks, public.goals, public.settings, public.day_notes;

-- Ask PostgREST to reload its schema cache (avoids PGRST205 right after the push).
notify pgrst, 'reload schema';
```
Expected advisor warnings: "RLS policy always true" on the 6 tables. This is by design until SSO (PLAN §16). No "function search_path mutable" warning is expected.

---

## 8. Scripts (all Node ESM `.mjs` unless noted; none prints a secret, URL, ref or project name)

### 8.1 `scripts/lib/env-file.mjs`
- `readEnvFile(path)`:
  1. reads the file as bytes
  2. throws on a UTF-16 BOM (`FF FE` / `FE FF`) with the message "re-save as UTF-8 without BOM"
  3. strips a UTF-8 BOM
  4. parses with `util.parseEnv`
  5. returns an object, or `{}` if the file is missing
- `APP_KEYS` holds the 7 keys of §5.10. `SENSITIVE_KEYS` is `APP_KEYS` plus `VERCEL_OIDC_TOKEN` and `MCP_SECRET`.
- `PLACEHOLDERS = ['SENSITIVE_ENV_VALUE_PLACEHOLDER', '[SENSITIVE]']`. `isPlaceholder(v)` checks against them.
- `updateEnvFile(path, updates)`:
  1. atomic write: a temp file in the same folder, then rename
  2. keeps every other line and key
  3. writes LF and UTF-8 without a BOM
  4. quotes a value only when it has characters outside `[A-Za-z0-9_.:/@+=-]`

  Values containing a newline are rejected.
- CLI:
  - `check [--file .env.local] [--allow-missing KEY,…]` prints `KEY: ok|missing|empty|placeholder|whitespace` for the 7 app keys. It exits 1 on anything not ok.
  - `get <file> <KEY>` writes the raw value to stdout with no newline, for piping into a shell variable only. A missing key prints nothing and exits 0. It exits 1 only when the file is missing or cannot be decoded, which is why callers add `|| true` and then check for an empty value.
  - `set <KEY> [--file .env.local]` reads the value from **stdin** and trims one trailing newline.

### 8.2 `scripts/lib/vercel.mjs`
- `export const VERCEL_CLI = 'vercel@61.1.0'`.
- `runVercel(args, { input })` builds `npx --yes ${VERCEL_CLI} ${args.join(' ')}` and runs it with `spawnSync(command, { shell: true, input, encoding: 'utf8', env: { ...process.env, VERCEL_TELEMETRY_DISABLED: '1' } })`.
  - A shell is needed because `npx` is `npx.cmd` on Windows (P29).
  - Every arg must match `/^[A-Za-z0-9_@.:=\/-]+$/`, so there is no quoting risk. Values never go in args; they go through `input`, without a trailing newline.
  - It returns `{ status, stdout, stderr }`. Callers never print stdout or stderr raw: they print a summary, or text passed through `redact(text, knownValues)`.

### 8.3 `scripts/supabase.mjs <link|push|migrations|types|ping|settings> [--dry-run]`
- Loads `.env.local` through `readEnvFile`. A missing or placeholder value that the subcommand needs fails with the variable name.
- Resolves the CLI with `createRequire(import.meta.url).resolve('supabase/package.json')` and the `bin` field, then spawns `process.execPath` with that bin path. There is no shell. Every call gets **`--agent no`** (§2.2 item 13) and `stdio: ['ignore', 'pipe', 'pipe']`, so a prompt receives EOF instead of hanging. The child env sets `SUPABASE_DB_PASSWORD`. The child's stdout and stderr are captured and printed only after the ref, the DB password and the project host are replaced with `<ref>`, `***` and `<host>`.
- `link` runs `link --project-ref <ref>`. The password comes from the env. If the CLI still asks, use `--password=<pw>` (with `=`, never a separate arg, F6).
- `push` runs `db push --linked --yes [--dry-run]`. It retries up to 3 times over about 3 minutes, **only** on connection or "Tenant or user not found" errors (P18). It never uses `--skip-pooler` (P20).
- `migrations` runs `migration list --linked`.
- `types` runs `gen types --lang typescript --project-id <ref> --schema public` (Management API; no DB port needed). It captures stdout, asserts it contains `export type Database`, normalises to LF with one trailing newline, and writes `src/data/database.types.ts` with `fs.writeFileSync(…, 'utf8')` (P5).
- `ping` sends `GET <url>/rest/v1/settings?select=id&limit=1` with an `apikey: <publishable>` header and a 10 s timeout. It prints one line:
  - `db: ok (200)`
  - `db: PAUSED (540): restore the project in the Supabase dashboard (HANDOFF.md, Recovery)`
  - `db: http-<code>`
  - `db: network error (<cause code>)`
- `settings` reads the settings row and prints `settings row: present, timezone=<zone>, updated_at=<iso>` or `settings row: missing`. This is used by M2 and AC 19.

### 8.4 `scripts/setup-supabase.mjs` (idempotent bootstrap, D0-29)
Every CLI call uses the same spawn helper as §8.3 (`--agent no`, stdin ignored) and captures its output in memory. Raw output is never printed. Success means exit code 0 plus parsable stdout; stderr is ignored (§2.2 item 13).

**JSON handling** (§2.2 item 13):
- Read-only calls (`projects list`, `orgs list`, `projects api-keys`) use `-o json`. If stdout does not parse, the same **read-only** call is run once more with `--output-format json`.
- `rows(json)` normalises both shapes: a bare array is returned as is. For an object, it returns the single array-valued property (`projects`, `organizations`, or whatever the key list holds).
- `projects create` is **never** run twice (a second call could create a second project or fail on the duplicate name). An unparsable create output goes straight to the re-list in step 4.

1. **Preconditions.** `projects list` works (the user is logged in). `orgs list` has exactly one org named "Karthi labs" (case-insensitive). Otherwise it stops with a blocker.
2. **Load `.env.local`.**
   - **`SUPABASE_PROJECT_REF` is set:** the ref must exist in the list, otherwise stop with a blocker. Resume at step 5.
   - **A project named `structured` already exists in the org** (and `.env.local` has no ref): adopt its ref. This needs `SUPABASE_DB_PASSWORD` in `.env.local`. If it is missing, stop: "reset the database password in the Supabase dashboard (Project settings, Database), put it into `.env.local`, re-run".
   - **More than one project is named `structured`:** stop with a blocker.
3. **Free limit.** If creation is needed and 2 or more free projects are already active, stop with the blocker "free project limit reached". Never pause or delete another project.
4. **Create.**
   1. Generate `SUPABASE_DB_PASSWORD` **only if `.env.local` has none**: 32 characters drawn uniformly from `[A-Za-z0-9]` with `crypto.randomInt`. Persist it first.
   2. Run `projects create structured --org-id <id> --region ap-south-1 --db-password=<pw> -o json --yes --agent no`, **once**.
   3. Read the ref from `ref ?? id` of the parsed object (or of the single object inside an envelope).
   4. On **any** error, non-zero exit or unparsable output, run `projects list` again **before** deciding, and adopt the project named `structured` if it is there. Never retry the create blindly, and never retry it with another output flag.
   5. Persist `SUPABASE_PROJECT_REF` and `VITE_SUPABASE_URL=https://<ref>.supabase.co` immediately.
5. **Poll** `projects list` every 10 s until the status is `ACTIVE_HEALTHY` (timeout 10 min).
6. **Keys.** `projects api-keys --project-ref <ref> --reveal -o json` (with the read-only `--output-format json` fallback above), retried every 20 s for up to 5 min (P18). Take the first `type === 'publishable'` key as `VITE_SUPABASE_PUBLISHABLE_KEY` and the first `type === 'secret'` key as `SUPABASE_SECRET_KEY`. If either is still missing, stop with the blocker "create a publishable and a secret API key in the dashboard (Settings, API Keys)". Never fall back to the legacy keys.
7. **Summary.** Print `KEY: set` lines only.

### 8.5 `scripts/sync-vercel-env.mjs [--apply] [--force]`
1. Reads `.env.local`.
   - A key absent from `.env.local` is reported as `missing locally (skipped)`. `PROD_URL` is absent until WP7 step 5.
   - A placeholder, whitespace or control character in a present value is an error.
2. **Report (default, read-only).** For each target, runs `env pull <tmp> --environment=<target> --yes` into a file under `os.tmpdir()`, which is deleted in `finally`. Then prints one line per (variable, target) in the §5.11 matrix:
   - `same`
   - `differs`
   - `missing remotely`
   - `unknown (Secret)`

   Only names and targets are printed.
3. **`--apply`** adds `missing remotely` rows with `env add <NAME> <target> --yes --no-sensitive|--sensitive`. The value goes on stdin with no trailing newline.
4. **`--apply --force`** (*best effort*, §0.1) also overwrites `differs` and `unknown` rows (`--force`). Without `--force`, `--apply` never overwrites, which protects against device B overwriting a key that device A rotated (F24).
5. **Preview target** (*fallback is best effort*, §0.1; the preview values themselves are mandatory). If the CLI demands a Git branch for `preview`, fall back to the API with the JSON body on stdin: `vercel api /v10/projects/<projectId>/env --scope <team> -X POST --input -` with `{"key","value","type":"encrypted","target":["preview"]}`.
   - The endpoint has **no query string**: `?` and `&` would fail the §8.2 argument check, and the fallback only adds missing rows, so `upsert` is not needed.
   - `--scope` comes from `.vercel/project.json` `orgId` (§2.2 item 14).
   - Values never go in argv. `MSYS_NO_PATHCONV` is not needed, because the call is spawned from Node.
6. **Verify.** Re-runs the report (every row must be `same`, or `unknown (Secret)` for the production secret key). Then checks types with `env ls --format json`, parsed into names, targets and types only:
   - `VITE_*` in production and preview must be Config.
   - `SUPABASE_SECRET_KEY` in production must be Secret.

### 8.6 `scripts/checks/leaks.mjs [--stdin] [--files <paths…>] [--range <a..b>]`
- **Sensitive values** (only when `.env.local` exists):
  - the values of `SENSITIVE_KEYS`, if at least 8 characters and not a placeholder
  - the hosts derived from `VITE_SUPABASE_URL` and `PROD_URL`, and the host's first label if it has at least 8 characters
  - `orgId`, `projectId` and `projectName` from `.vercel/project.json`

  Vercel system keys (`VERCEL_*`, `TURBO_*`, `NX_*`) and every other key are ignored (F23, P39).
- **Generic patterns** (used in CI too):
  | Pattern | Name |
  |---|---|
  | `sb_secret_[A-Za-z0-9_-]{16,}` | `supabase-secret-key` |
  | `sb_publishable_[A-Za-z0-9_-]{16,}` | `supabase-publishable-key` |
  | `eyJ[\w-]{20,}\.[\w-]{20,}\.` | `jwt` |
  | `\b[a-z]{20}\.supabase\.(co\|in)\b` | `supabase-host` |
  | `\bpostgres\.[a-z]{20}\b` | `supabase-pooler-user` |
  | `postgres(ql)?://[^\s:@/]+:[^\s@/]+@` | `db-url-with-password` |
  | `\b[a-z0-9-]+\.vercel\.app\b` | `vercel-host` (`example`, `my-app`, `your-app` and `my-project` are allowlisted) |
  | `\bprj_[A-Za-z0-9]{20,}` | `vercel-project-id` |
  | `\bteam_[A-Za-z0-9]{20,}` | `vercel-team-id` |
- **Scanned:**
  - text files from `git ls-files -z --cached --others --exclude-standard` (binary = NUL byte or a binary extension)
  - commit messages in the range: `--range`, else env `COMMIT_RANGE`, else `origin/main..HEAD`
  - `--stdin` (for `gh run view --log`)
  - `--files` (explicit files, used for the fake-leak self-test in the scratchpad, P40)
- **Output:** `LEAK <file|commit <sha7>|stdin>:<line> matches <KEY or pattern name>`. It never prints the value, and exits 1 on any hit.
- **Exports** the pure `findLeaks(text, sensitive)` for unit tests.

### 8.7 `scripts/checks/hygiene.mjs`
1. **Encoding.** Every tracked or untracked-not-ignored text file must have no UTF-8 BOM, be valid UTF-8 (`TextDecoder('utf-8', { fatal: true })`), and contain no CR byte, except `*.cmd`, `*.bat` and `*.ps1` (P5).
2. **Lockfile natives** (P10, F26). For each native family present in `package-lock.json` `packages`, there must be keys for the win32-x64 (or windows-x64), linux-x64 (gnu or plain) **and** darwin-arm64 variants. The families are:
   - `@rolldown/binding-`
   - `lightningcss-`
   - `@tailwindcss/oxide-`
   - `@supabase/cli-`
3. **Pins and workflow invariants** (*best effort*, §0.1; items 1 and 2 are mandatory).
   - `.nvmrc` is `24`.
   - `package.json` `engines.node` is `24.x`.
   - The Vercel CLI pin is identical in `deploy.yml`, `scripts/ci/deploy-prod.sh` and `scripts/lib/vercel.mjs` (D0-24).
   - `ci.yml` has no `paths`/`paths-ignore` and keeps the job name `ci-verify` (P36).

### 8.8 `scripts/checks/commits.mjs [--range <a..b>] [--text-file <file>]`
- **Range:** `--range`, else `COMMIT_RANGE`, else `origin/main..HEAD`.
- **Texts:** the commit messages, env `PR_TITLE` / `PR_BODY` when set, and `--text-file`. The file form is used locally before `gh pr create/edit`, `gh issue create/edit`, `gh release create` and annotated tags (P1).
- **Bot PRs.** `ci.yml` passes empty `PR_TITLE`/`PR_BODY` for bot-authored PRs (D0-17). When both are empty, the script prints `PR text: not provided (push event or bot-authored PR)` and still checks every commit message and author.
- **Attribution rules** (case-insensitive):
  - a `Co-Authored-By:` line naming claude, anthropic, openai, chatgpt, copilot, gemini, cursor or codex
  - `noreply@anthropic.com`
  - `generated (with|by)` followed within 40 characters by claude, chatgpt, copilot, gemini, llm or " ai"
  - the robot-face emoji (U+1F916)
- **Author e-mail** of every commit in the range must be one of:
  - `karthi.ai.engineer@gmail.com`
  - `<id>+karthi-ai-engineer@users.noreply.github.com`
  - any `…[bot]@users.noreply.github.com`

  A failure prints only `AUTHOR <sha7>: e-mail not in the allowlist`, **never the e-mail** (P4: no work domain in public logs).
- **Exports** the pure `findAttribution(text)` for unit tests. Fixtures are built at runtime by concatenation.

### 8.9 `scripts/checks/core-node.mjs`
Imports every non-test `src/core/**/*.ts` with plain `node` (`await import(pathToFileURL(file))`, using Node 24 type stripping). It prints `ok <file>` or `FAIL <file>: <error.code>` and exits 1 on any failure (F35).

### 8.10 `scripts/ci/deploy-prod.sh` (exact; D0-12)
```bash
#!/usr/bin/env bash
# Production deploy shared by .github/workflows/deploy.yml (Linux) and local runs (Git Bash).
# Never prints URLs, IDs, keys or the Vercel project name: CLI output goes to files and only a
# redacted tail is shown on failure.
set -euo pipefail

VERCEL_CLI_PIN="vercel@61.1.0"   # keep identical in deploy.yml and scripts/lib/vercel.mjs (check:hygiene)
VERCEL="${VERCEL_BIN:-npx --yes $VERCEL_CLI_PIN}"
VERCEL_BUILD="${VERCEL_BUILD_BIN:-$VERCEL}"          # rehearsal only: build with an empty global config
LOG_DIR="${DEPLOY_LOG_DIR:-${RUNNER_TEMP:-$(mktemp -d)}}"
mkdir -p "$LOG_DIR"
export VERCEL_TELEMETRY_DISABLED=1

in_ci() { [ "${GITHUB_ACTIONS:-}" = "true" ]; }
mask() { if in_ci && [ -n "${1:-}" ]; then echo "::add-mask::$1"; fi; }
fail() {
  if in_ci; then echo "::error::$1"; else echo "error: $1" >&2; fi
  if [ -n "${2:-}" ] && [ -f "$2" ]; then bash scripts/ci/redact-log.sh "$2"; fi
  exit 1
}

token="${VERCEL_TOKEN:-}"; unset VERCEL_TOKEN          # the build step never sees the token (P24)
auth=(); if [ -n "$token" ]; then auth=(--token="$token"); fi
expected_sha="${EXPECTED_SHA:-$(git rev-parse HEAD)}"

if in_ci; then
  [ -n "$token" ] || fail "VERCEL_TOKEN is not set"
  [ -n "${VERCEL_ORG_ID:-}" ] && [ -n "${VERCEL_PROJECT_ID:-}" ] || fail "VERCEL_ORG_ID or VERCEL_PROJECT_ID is not set"
  [ -n "${PROD_URL:-}" ] || fail "PROD_URL is not set"
else
  # Never let the CLI take its "new project" path (it would create a project and connect Git).
  [ -f .vercel/project.json ] || [ -n "${VERCEL_PROJECT_ID:-}" ] || fail "not linked: follow the Vercel link step in HANDOFF.md"
  [ -z "$(git status --porcelain)" ] || echo "warning: uncommitted changes; build-sha will still say $expected_sha"
fi

# 1. Authentication
$VERCEL whoami "${auth[@]}" > "$LOG_DIR/vercel-whoami.log" 2>&1 \
  || fail "Vercel authentication failed: the token is invalid or expired; create a new token and update the VERCEL_TOKEN secret"

# 2. Production settings and environment
$VERCEL pull --yes --environment=production "${auth[@]}" > "$LOG_DIR/vercel-pull.log" 2>&1 \
  || fail "vercel pull failed" "$LOG_DIR/vercel-pull.log"
mask "$(node -e "try{process.stdout.write(require('./.vercel/project.json').projectName||'')}catch{}")"
env_file=.vercel/.env.production.local
sb_url="$(node scripts/lib/env-file.mjs get "$env_file" VITE_SUPABASE_URL || true)"
sb_key="$(node scripts/lib/env-file.mjs get "$env_file" VITE_SUPABASE_PUBLISHABLE_KEY || true)"
mask "$sb_url"; mask "${sb_url#https://}"; mask "$sb_key"
[ -n "$sb_url" ] && [ -n "$sb_key" ] \
  || fail "the production env from vercel pull lacks VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY (store them as Config)"

# 3. Build (dependencies are already installed; production env is validated by vite.config.ts)
VERCEL_INSTALL_COMPLETED=1 REQUIRE_SUPABASE_ENV=1 VITE_BUILD_SHA="$expected_sha" \
  $VERCEL_BUILD build --prod --yes > "$LOG_DIR/vercel-build.log" 2>&1 \
  || fail "vercel build failed" "$LOG_DIR/vercel-build.log"

# 4. The bundle must contain the exact configured values (supabase-js itself contains the bare
#    literals 'sb_publishable_' and 'supabase.co', so a pattern grep would prove nothing).
assets=.vercel/output/static/assets
grep -rqF -- "$sb_key" "$assets" || fail "bundle does not contain the configured publishable key"
grep -rqF -- "${sb_url#https://}" "$assets" || fail "bundle does not contain the configured Supabase host"
echo "Bundle check passed."

# 5. Deploy the prebuilt output to production
$VERCEL deploy --prebuilt --prod "${auth[@]}" > "$LOG_DIR/vercel-deploy.out" 2> "$LOG_DIR/vercel-deploy.err" \
  || fail "vercel deploy failed" "$LOG_DIR/vercel-deploy.err"
echo "Deployed to production (URL intentionally not printed)."

# 6. Smoke check (build SHA, routes, headers, live database probe)
if [ -z "${PROD_URL:-}" ]; then
  echo "PROD_URL is not set: smoke check skipped (allowed only for the very first local deploy)."
  exit 0
fi
EXPECTED_SHA="$expected_sha" SUPABASE_ENV_FILE="$env_file" node scripts/ci/smoke.mjs
```
Locally, the first WP7 deploy runs without `PROD_URL`. Every later run, in CI and locally, includes the smoke check. Local runs set `DEPLOY_LOG_DIR="$SCRATCH/deploy-logs"`. Delete that folder after the WP, because it holds the deploy output with the generated deployment URL.

### 8.11 `scripts/ci/smoke.mjs`
- **Inputs (env):**
  - `PROD_URL`, trimmed of all whitespace (F2); only its origin is used
  - `EXPECTED_SHA`
  - `SUPABASE_ENV_FILE`
  - optional `--expect-protected <deploy.out file>` (WP7 only)
- In CI it first emits `::add-mask::` for the host, the Supabase host and the key.
- **Checks.** Each prints `ok|FAIL <METHOD> <path> (<status>[, detail])`. Paths only, never the origin.
  1. `GET /` must return 200, `content-type` text/html, and `<meta name="build-sha" content="<EXPECTED_SHA>">`. It retries 6 times, 10 s apart, until the SHA matches (alias propagation).
  2. `/` headers include `x-robots-tag` with `noindex` and `referrer-policy: no-referrer`.
  3. `GET /day/2026-01-01` returns 200 text/html (SPA rewrite).
  4. `GET /assets/does-not-exist.js` returns 404.
  5. `GET /api` returns 404, and `GET /api/not-a-function` returns 404.
  6. `GET /robots.txt` returns 200.
  7. **DB probe:** `GET <VITE_SUPABASE_URL>/rest/v1/settings?select=id&limit=1` with `apikey` must return 200. A 540 fails with "Supabase project is paused (restore it in the dashboard)", and 401/403 with "publishable key rejected".
  8. With `--expect-protected` (*best effort*, §0.1), it reads the deployment URL from the file (never printed) and expects 401, 403 or a 30x to the Vercel login (Standard Protection).
- `fetch` errors print only `network error (<cause.code>)`. Node puts the host in the message, so the message is never printed.
- It exits 1 on any FAIL.

### 8.12 `scripts/ci/redact-log.sh` (exact)
```bash
#!/usr/bin/env bash
# Prints a redacted tail of a CLI log (used only on failure). Masks from deploy-prod.sh apply too.
sed -E \
  -e 's#https?://[^[:space:]"<>]+#[redacted-url]#g' \
  -e 's#[A-Za-z0-9.-]+\.vercel\.app#[redacted-host]#g' \
  -e 's#[a-z]{20}\.supabase\.(co|in)#[redacted-host]#g' \
  -e 's#(prj|team)_[A-Za-z0-9]{10,}#[redacted-id]#g' \
  -e 's#[A-Za-z0-9._-]+/structured-[a-z0-9]{6,}#[redacted-scope/project]#g' \
  -e 's#structured-[a-z0-9]{6,}#[redacted-project]#g' \
  "$1" | tail -n 150
```

---

## 9. Infrastructure procedures (exact commands)

The shell is **Git Bash** unless noted. `SCRATCH` is the session scratchpad. Values are read without echoing:
```bash
envget() { node scripts/lib/env-file.mjs get .env.local "$1"; }
```
- Never start `gh api` paths with `/`.
- Use `MSYS_NO_PATHCONV=1` for any native command that takes a `/…` argument (P6).
- Output that could contain a secret goes to a file in `SCRATCH`, which is deleted after use.

### 9.1 Preconditions (checked, not performed)
- `gh api user --jq .login` prints `karthi-ai-engineer`, and `gh auth status` lists the `workflow` scope (P3, P38).
- `git config user.email` prints `karthi.ai.engineer@gmail.com`, and the current branch is `phase-0-foundation`.
- The Supabase CLI is logged in: `npx --yes supabase@2.118.0 projects list -o json --agent no > "$SCRATCH/p.json"` exits 0 (then delete the file).
- The Vercel CLI is logged in: `npx --yes vercel@61.1.0 whoami > /dev/null` exits 0. The Karthi Labs team is visible in `npx --yes vercel@61.1.0 teams ls` (use its slug below as `<team>`).
- `gh secret list` shows `VERCEL_TOKEN` (name only).
- **Commit signing:** if `git commit` fails with a GPG or pinentry error, **stop** and report a blocker. Never pass `--no-gpg-sign` and never change git config (P2).

### 9.2 Supabase (WP5)
```bash
npx supabase init                                       # supabase/config.toml + supabase/.gitignore (no ref inside)
printf '%s' '<Vercel project name from the task>' | node scripts/lib/env-file.mjs set VERCEL_PROJECT_NAME
npm run db:setup                                        # §8.4, idempotent; prints KEY: set lines only
# write supabase/migrations/0001_init.sql (§7)
npm run db:link
node scripts/supabase.mjs push --dry-run                # must list 0001_init.sql
npm run db:push
npm run db:migrations                                   # 0001 local and remote
npm run db:types && git diff --stat src/data/database.types.ts
npm run db:ping                                         # db: ok (200)
npm run env:check -- --allow-missing PROD_URL
npm run test:integration
```
Recovery:
- The CLI applies each migration in a transaction. If the push fails, fix the SQL and push again.
- As a last resort, **only on this empty project**, run `npx supabase db reset --linked` and record it in `DEVLOG.md`.
- `db` commands need outbound TCP 5432 to the pooler. REST working does not prove the database port is open (P20).
- Docker-only commands (`db diff`, `db pull`, `start`) are not used.

### 9.3 Vercel (WP7)
```bash
NAME="$(envget VERCEL_PROJECT_NAME)"; [ -n "$NAME" ] || { echo "VERCEL_PROJECT_NAME missing"; exit 1; }
V="npx --yes vercel@61.1.0"
cp .env.local "$SCRATCH/env.local.bak"
# 1. Create only if missing, then link to the EXISTING project (never the CLI's new-project path, P27)
$V project inspect "$NAME" --scope <team> --format json > "$SCRATCH/v-inspect.json" 2>&1 \
  || $V project add "$NAME" --scope <team> > "$SCRATCH/v-add.log" 2>&1
$V project inspect "$NAME" --scope <team> --format json > "$SCRATCH/v-inspect.json"      # must succeed now
$V link --yes --project "$NAME" --team <team> > "$SCRATCH/v-link.log" 2>&1
node -e "const p=require('./.vercel/project.json'); if(!p.projectId||!p.orgId) process.exit(1)"
cmp -s .env.local "$SCRATCH/env.local.bak" || cp "$SCRATCH/env.local.bak" .env.local
$V project ls --scope <team> --filter structured- --limit 100 --format json > "$SCRATCH/v-ls.json"
NAME="$NAME" node -e "const p=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8')).projects;
  const exact=p.filter(x=>x.name===process.env.NAME).length, pre=p.filter(x=>x.name.startsWith('structured-')).length;
  console.log('named VERCEL_PROJECT_NAME: '+exact+', starting with structured-: '+pre); process.exit(exact===1&&pre===1?0:1)" "$SCRATCH/v-ls.json"
# Counts only; both must be 1. Other projects in the team do not matter (review r1, S5).
# 2. No Git integration, Vite, Node 24, Standard Protection
$V git disconnect --yes > "$SCRATCH/v-git.log" 2>&1 || true                             # "not connected" is fine
$V project update "$NAME" --framework vite --node-version 24.x --yes > "$SCRATCH/v-upd.log" 2>&1
$V project protection enable "$NAME" --sso > "$SCRATCH/v-prot.log" 2>&1
$V project protection "$NAME" --json > "$SCRATCH/v-prot.json"                          # sso deploymentType = prod_deployment_urls_and_all_previews
$V project inspect "$NAME" --format json > "$SCRATCH/v-inspect.json"                   # no Git link
# 3. Environment variables (§5.11)
npm run env:sync-vercel                          # report
npm run env:sync-vercel -- --apply               # add missing
npm run env:sync-vercel                          # all same / unknown (Secret) for the prod secret key
# 4. First production deploy through the shared script (PROD_URL not known yet → smoke skipped)
export DEPLOY_LOG_DIR="$SCRATCH/deploy-logs"
bash scripts/ci/deploy-prod.sh
git diff --exit-code package-lock.json           # vercel build must not have reinstalled anything (P24)
# 5. Discover the production domain → PROD_URL (never printed)
PID="$(node -e "process.stdout.write(require('./.vercel/project.json').projectId)")"
OID="$(node -e "process.stdout.write(require('./.vercel/project.json').orgId)")"
MSYS_NO_PATHCONV=1 $V api "/v9/projects/$PID/domains" --scope "$OID" > "$SCRATCH/v-domains.json"   # team-scoped (§2.2 item 14)
node -e "<pick the verified *.vercel.app domain with no redirect; print 'https://'+name to stdout>" "$SCRATCH/v-domains.json" \
  | node scripts/lib/env-file.mjs set PROD_URL
# Fallback if the API call fails: `$V inspect <url from $LOG_DIR/vercel-deploy.out> --format json` → aliases (same selection).
npm run env:sync-vercel -- --apply               # adds PROD_URL (development)
# 6. Full deploy with smoke check (mandatory), then the protection probe (best effort, §0.1;
#    it reads the generated URL from the deploy output and never prints it)
bash scripts/ci/deploy-prod.sh
PROD_URL="$(envget PROD_URL)" EXPECTED_SHA="$(git rev-parse HEAD)" SUPABASE_ENV_FILE=.vercel/.env.production.local \
  node scripts/ci/smoke.mjs --expect-protected "$DEPLOY_LOG_DIR/vercel-deploy.out"
# 7. GitHub secrets via stdin (never echoed)
node -e "process.stdout.write(require('./.vercel/project.json').orgId)"     | gh secret set VERCEL_ORG_ID
node -e "process.stdout.write(require('./.vercel/project.json').projectId)" | gh secret set VERCEL_PROJECT_ID
envget PROD_URL | gh secret set PROD_URL
gh secret list                                                               # names only
rm -rf "$SCRATCH"/v-*.json "$SCRATCH"/v-*.log "$SCRATCH/env.local.bak" "$DEPLOY_LOG_DIR"
```
If `vercel build` fails on Windows, use the fallback remote build:
```bash
$V deploy --prod --build-env REQUIRE_SUPABASE_ENV=1 --build-env VITE_BUILD_SHA=<sha> > "$SCRATCH/v-remote.out" 2>&1
```
Record it in `DEVLOG.md`. The CI rehearsal (§9.4) must still prove the prebuilt path on a clean clone.

### 9.4 Env-var link rehearsal (proves `deploy.yml`'s mode, WP7)
1. `git clone -b phase-0-foundation https://github.com/karthi-ai-engineer/Structured.git "$SCRATCH/ci-rehearsal"`, then `npm ci` inside it. The clone has no `.vercel/`.
2. Export `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` (read from the real checkout's `.vercel/project.json`, never echoed).
3. Run `mkdir -p "$SCRATCH/empty-vc"`, then `DEPLOY_LOG_DIR="$SCRATCH/rehearsal-logs" VERCEL_BUILD_BIN="npx --yes vercel@61.1.0 -Q $SCRATCH/empty-vc" PROD_URL="$(cd <repo> && envget PROD_URL)" bash scripts/ci/deploy-prod.sh`.
   - `whoami`, `pull` and `deploy` use the logged-in CLI.
   - `vercel build` alone runs with an **empty global config**, which proves the CI build step needs no token or login.
   - The run redeploys the same commit to production, and the smoke check must pass.
4. If the tokenless build fails, give `build` the token in `deploy-prod.sh` as well (step-scoped), and record the change.
5. Clean up (P9):
   1. Stop all processes.
   2. `rm -f` the clone's `.env*` and `rm -rf` its `.vercel`, then the whole clone, `$SCRATCH/empty-vc` and `$SCRATCH/rehearsal-logs`.
   3. `test ! -e "$SCRATCH/ci-rehearsal" && test ! -e "$SCRATCH/rehearsal-logs"`.

### 9.5 GitHub (WP3, WP8)
```bash
R=karthi-ai-engineer/Structured
# Labels used by Dependabot (WP3). The pipeline creates phase / phase-0 / type:* itself.
gh label create dependencies -R $R --color 0366D6 --description "Dependency updates" --force
gh label create ci           -R $R --color 1D76DB --description "CI/CD and automation" --force
# Ruleset (WP8), idempotent (P37): update if it exists, else create
ID="$(gh api repos/$R/rulesets --jq '.[] | select(.name=="main protection") | .id')"
if [ -n "$ID" ]; then gh api -X PUT "repos/$R/rulesets/$ID" --input .github/rulesets/main.json
else gh api -X POST "repos/$R/rulesets" --input .github/rulesets/main.json; fi
gh api repos/$R/rules/branches/main                      # deletion, non_fast_forward, pull_request, required_status_checks
# Code scanning default setup (WP8)
printf '{"state":"configured","query_suite":"default","languages":["javascript-typescript","actions"]}' \
  | gh api -X PATCH repos/$R/code-scanning/default-setup --input - > "$SCRATCH/codeql.json" 2>&1; echo "exit=$?"
gh api repos/$R/code-scanning/default-setup --jq '.state'
# Presentation (WP8)
gh repo edit $R --description "Personal visual day planner and work tracker (Structured-style) with goals, focus tracking and a Claude MCP connector. React, TypeScript, Vite, Tailwind, Supabase." \
  --add-topic planner,time-blocking,todo,productivity,react,typescript,vite,tailwindcss,supabase,capacitor,mcp,model-context-protocol
gh repo view $R --json description,repositoryTopics
```
**CodeQL fallback:**
- If the PATCH is refused only because `main` has no supported language yet (it holds Markdown until Ship), record the exact API message:
  - in `HANDOFF.md` ("Next: enable CodeQL default setup right after the Ship merge", with the command)
  - in the PR body under "Post-merge follow-ups"
  - in §17 step 8
- Add `.github/workflows/codeql.yml` (advanced setup, `github/codeql-action@v4`, languages `javascript-typescript` and `actions`, `permissions: security-events: write, contents: read`) **only** if the API says default setup is unavailable for this repo.

---

## 10. CI/CD

Every "exact" file in this section is run through `npm run format` after it is written. Prettier's formatting is expected and is not a deviation (§0).

### 10.1 `.github/workflows/ci.yml` (exact)
```yaml
name: CI

on:
  push:
    branches: ['**'] # branches only; tag pushes are ignored
  pull_request:
    types: [opened, synchronize, reopened, edited]
# Never add paths / paths-ignore here: the required check would stay pending (P36).

permissions:
  contents: read

concurrency:
  group: ci-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

jobs:
  verify:
    name: ci-verify # required status check in the main ruleset; never rename or reuse this name
    runs-on: ubuntu-latest
    timeout-minutes: 15
    env:
      COMMIT_RANGE: ${{ github.event_name == 'pull_request' && format('{0}..{1}', github.event.pull_request.base.sha, github.event.pull_request.head.sha) || '' }}
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0 # commit-range scans (leaks, attribution, author)
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - name: Typecheck
        run: npm run typecheck
      - name: Lint
        run: npm run lint
      - name: Format check
        run: npm run format:check
      - name: Unit tests (coverage thresholds for src/core)
        run: npm run test:coverage
      - name: Build (unconfigured by design)
        run: npm run build
      - name: Repo hygiene (encoding, line endings, lockfile natives, pins)
        run: npm run check:hygiene
      - name: Core loads in plain Node
        run: npm run check:core
      - name: Leak check (generic patterns, files and commit messages)
        run: npm run check:leaks
      - name: Commit and PR text checks (attribution trailers, author e-mail)
        env:
          # Bot PRs (Dependabot) quote upstream release notes in the body, which can contain
          # third-party trailers. Their title and body are skipped; commits and authors are always checked.
          PR_TITLE: ${{ github.event.pull_request.user.type != 'Bot' && github.event.pull_request.title || '' }}
          PR_BODY: ${{ github.event.pull_request.user.type != 'Bot' && github.event.pull_request.body || '' }}
        run: npm run check:commits
```
- PR text reaches the script only through `env:` and is never inlined into `run:`, so it cannot inject a script.
- On `push` events `COMMIT_RANGE` is empty and the scripts use `origin/main..HEAD`, which is empty on `main` itself. `github.event.pull_request` is null there, so both PR variables are `''`.
- The bot condition uses `user.type` (the PR author), not `github.actor`. A human re-running or pushing to a Dependabot PR does not turn the body scan back on. Human-authored PRs are always scanned.

### 10.2 `.github/workflows/deploy.yml` (exact)
```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: deploy-production
  cancel-in-progress: false

jobs:
  deploy:
    name: deploy-production
    if: github.ref == 'refs/heads/main' # a dispatch from any other branch never deploys (P32)
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      VERCEL_CLI: vercel@61.1.0 # keep identical in scripts/ci/deploy-prod.sh and scripts/lib/vercel.mjs
      VERCEL_TELEMETRY_DISABLED: '1'
    steps:
      - name: Check required secrets
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
          PROD_URL: ${{ secrets.PROD_URL }}
        run: |
          missing=0
          for name in VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID PROD_URL; do
            if [ -z "${!name}" ]; then echo "::error::Repository secret $name is not set"; missing=1; fi
          done
          exit "$missing"
      - name: Mask production host
        env:
          PROD_URL: ${{ secrets.PROD_URL }}
        run: |
          url="$(printf '%s' "$PROD_URL" | tr -d '[:space:]')"
          host="${url#*://}"; host="${host%%/*}"
          echo "::add-mask::$host"
          echo "::add-mask::${host%%.*}"
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - name: Skip unless this commit is still the head of main
        id: head
        run: |
          head="$(git ls-remote origin refs/heads/main | cut -f1)"
          if [ "$head" = "$GITHUB_SHA" ]; then
            echo "current=true" >> "$GITHUB_OUTPUT"
          else
            echo "::notice::This run is for an older commit than the head of main; skipping the deploy."
            echo "current=false" >> "$GITHUB_OUTPUT"
          fi
      - uses: actions/setup-node@v7
        if: steps.head.outputs.current == 'true'
        with:
          node-version-file: .nvmrc
          package-manager-cache: false # no dependency cache in the privileged deploy workflow
      - name: Install dependencies
        if: steps.head.outputs.current == 'true'
        run: npm ci
      - name: Verify (typecheck, lint, unit tests)
        if: steps.head.outputs.current == 'true'
        run: npm run typecheck && npm run lint && npm test
      - name: Install Vercel CLI
        if: steps.head.outputs.current == 'true'
        run: |
          npm install --global "$VERCEL_CLI" > "$RUNNER_TEMP/vercel-cli.log" 2>&1 \
            || { echo "::error::Vercel CLI install failed"; tail -n 40 "$RUNNER_TEMP/vercel-cli.log"; exit 1; }
      - name: Pull, build, deploy and smoke-check production
        if: steps.head.outputs.current == 'true'
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
          PROD_URL: ${{ secrets.PROD_URL }}
          VERCEL_BIN: vercel
          EXPECTED_SHA: ${{ github.sha }}
        run: bash scripts/ci/deploy-prod.sh
```
`deploy.yml` first runs in the Ship stage, because `push: main` and `workflow_dispatch` need the file on `main`. Before then it is validated three ways:
- actionlint
- the local runs of the **same** `deploy-prod.sh` (§9.3)
- the clean-clone env-var rehearsal (§9.4)

Merged Dependabot PRs deploy too (documented in `CLAUDE.md`).

### 10.3 `.github/dependabot.yml` (exact)
```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly, day: monday, time: '06:00', timezone: Asia/Kolkata }
    open-pull-requests-limit: 5
    labels: [dependencies]
    commit-message: { prefix: chore, include: scope }
    groups:
      npm-minor-and-patch:
        update-types: [minor, patch]
    ignore:
      # typescript-eslint supports TypeScript < 6.1 only; revisit when it supports 7.x.
      - dependency-name: typescript
        update-types: ['version-update:semver-major']
      # Keep Node types on the runtime major (engines 24.x).
      - dependency-name: '@types/node'
        update-types: ['version-update:semver-major']
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly, day: monday, time: '06:00', timezone: Asia/Kolkata }
    labels: [dependencies, ci]
    commit-message: { prefix: ci }
    groups:
      actions-minor-and-patch:
        update-types: [minor, patch]
```
A Dependabot lockfile regenerated on Linux can drop other-platform entries. The `check:hygiene` step in `ci-verify` then blocks that PR (P10).

**Fix paths for a blocked Dependabot PR** (also written in `CLAUDE.md`, WP9):
- **`check:hygiene` rejects the lockfile.** On Windows, in Git Bash:
  1. `gh pr checkout <n>`
  2. `rm -rf node_modules && npm install`, then `npm run check:hygiene`
  3. If it still fails, run `rm -rf node_modules package-lock.json && npm install`. This re-resolves within the caret ranges, which is acceptable for a minor/patch group.
  4. `npm run verify`
  5. Commit `chore: regenerate lockfile with all platform bindings` and `git push` to the Dependabot branch.

  Dependabot stops rebasing that PR afterwards, which is expected. Merge it once `ci-verify` is green.
- **The PR title or body trips the attribution scan.** This cannot happen for bot-authored PRs (D0-17).
- **A commit message trips `check:leaks` or `check:commits`** (third-party text). The message cannot be fixed on that branch. Close the PR and make the bump by hand in a normal PR.

### 10.4 Templates
Deliverable 11e requires "No AI mentions". No template may contain the words AI, Claude, Anthropic or LLM (in any case), or any URL other than a GitHub path. This is checked by the word grep below (WP3 verification, AC 33).
- **`pull_request_template.md`:**
  - Summary
  - Linked issue (`Closes #`)
  - Changes
  - Checklist:
    - `npm run verify` passes
    - `ci-verify` is green
    - `HANDOFF.md` updated
    - no secrets, app URLs or project names
    - Commit and PR text pass `npm run check:commits -- --text-file <body>`
  - Notes
- **Issue forms:**
  - `bug_report.yml`: what happened, expected, steps, platform, phase. The platform dropdown options are exactly `Web`, `Android` and `MCP server`.
  - `feature_request.yml`: problem, proposal, PLAN.md section, priority (P1–P4)
  - `config.yml`: `blank_issues_enabled: true`
- **Template word check** (must print nothing; the command review r1 asked for):
  ```bash
  grep -niwE 'ai|claude|anthropic|llm' .github/pull_request_template.md .github/ISSUE_TEMPLATE/*
  ```
  `-w` treats hyphens and dots as word boundaries, so the templates must **not** contain the owner handle (`karthi-ai-engineer`, which appears in repo URLs) or the file name `CLAUDE.md`. The templates need neither: `config.yml` has no contact links, and templates use relative paths only.
- **PR-text word check** (must print nothing), used on the Ship PR body and on release notes (§17.1). These legitimately name `CLAUDE.md` and may link `github.com/karthi-ai-engineer/…`, so the two known tokens are stripped first:
  ```bash
  sed -E 's/karthi-ai-engineer//g; s/CLAUDE\.md//g' <file> | grep -niwE 'ai|claude|anthropic|llm'
  ```
  Verified in r1: on sample text, the raw grep gives 2 false positives (the handle and the file name) and the stripped form gives 0. The stripped form still reports real mentions such as "AI helper", "claude" or "LLM".
- **Local schema validation** (P35): `uvx check-jsonschema --builtin-schema vendor.dependabot .github/dependabot.yml`. Do the same for `vendor.github-issue-forms` (each form), `vendor.github-issue-config` (`config.yml`) and `vendor.github-workflows` (both workflows).

### 10.5 `.github/rulesets/main.json` (exact)
```json
{
  "name": "main protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [{ "context": "ci-verify", "integration_id": 15368 }]
      }
    }
  ]
}
```
- Apply it only after `gh pr checks` shows a check named exactly `ci-verify`.
- If the API rejects `allowed_merge_methods` (422), drop that key and record the change.
- No `required_signatures` rule until P2 is resolved.
- Phase 1's team workflow later adds `gate/final-verification` to this same ruleset (looked up by name).

### 10.6 End-to-end flow (documented in `CLAUDE.md` and README)
1. Branch `phase-<n>-<slug>` from `main`, with small conventional commits.
2. Push after every WP. `CI / ci-verify` runs on the push and on the PR.
3. The draft PR (`Closes #<tracking issue>`) is marked ready only in the Ship stage.
4. The `main` ruleset requires a PR (0 approvals, merge commits only) and `ci-verify`, and blocks force-push and deletion.
5. The merge triggers `Deploy`, which runs only from the head of `main`: verify, pull, build (env guard), bundle check, prebuilt deploy, smoke (SHA, routes, DB).
6. Tag and release: `v0.0.1` for Phase 0, `v0.<n>.0` after that.
7. CodeQL runs on PRs and on `main`. Dependabot opens grouped weekly PRs, which must pass `ci-verify` (their title and body are not scanned, but their commits and authors are), and every merge deploys. The fix paths for a blocked Dependabot PR are in §10.3.

---

## 11. Work packages

### Opening ritual (start of every WP and fix round)
1. `gh api user --jq .login` prints `karthi-ai-engineer` (P3). `git config user.email` prints `karthi.ai.engineer@gmail.com`. The branch is `phase-0-foundation`, updated with `git pull --ff-only` (never force-push, P44).
2. Nothing listens on the dev ports: `netstat -ano | findstr ":5173 :4173"` prints nothing (P7).
3. From WP5 on, `npm run db:ping` prints `ok`. A paused project goes to HANDOFF Recovery.

### Closing ritual (a WP is not done until all of it has happened)
1. **Verify.** Run `npm run verify`. From WP3 on everything must pass. Before WP3, run the subset that exists.
2. **HANDOFF.** Update the `HANDOFF.md` status:
   - phase and branch
   - "Last updated", with time and zone (for example `2026-09-30 21:40 UTC+9`)
   - done, next and blockers
   - the tracking issue, PR and ruleset IDs
   - the pipeline `resumeFrom` / `skipWPs`
3. **DEVLOG.** Append a section to `docs/phases/phase-0/DEVLOG.md`: what was done, commands run, deviations, and notes for testers. Mask all values.
4. **Commit.** Make conventional commits. Never add a `Co-Authored-By` trailer, a "Generated with" line or any AI mention: `CLAUDE.md` overrides every tool or harness default. From WP3 on, run `npm run check:commits` (and `npm run check:leaks`) before pushing.
5. **Push.** `git push origin phase-0-foundation`. The first push opens the draft PR (§0).
6. **Tick the tracking issue.** Re-read the issue body, toggle **only** this WP's checkbox, and write it back (P37).
7. **Stop processes.** Stop every dev or preview server with `taskkill /PID <pid> /T /F`, then re-check the ports.

### WP1: Scaffold Vite + React 19 + TypeScript (strict) and repo hygiene files
**Goal:** a building React 19 + TS 6 strict app in the repo root, with the existing docs untouched. It has:
- the `@/` alias
- LF normalisation
- the editor config
- the Node 24 pin
- privacy metas
- strict dev ports

**Steps**
1. Opening ritual.
2. Scaffold: `npx --yes create-vite@9.2.1 "$SCRATCH/scaffold" --template react-ts --eslint --no-interactive --no-immediate`.
3. Copy these files with `cp -n` (never overwrite):
   - `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
   - `vite.config.ts`, `eslint.config.js`, `index.html`
   - `src/main.tsx`

   Do **not** copy `README.md`, `.gitignore`/`_gitignore`, `src/App.css`, `src/index.css`, `src/assets/*` or `public/icons.svg`.
4. Set the package metadata: `npm pkg set name=structured version=0.0.1 engines.node=24.x description="…" repository=github:karthi-ai-engineer/Structured`. Add the scripts `dev`, `build`, `preview` and `typecheck` from §5.4.
5. Install: `npm install`, then `npm install -D typescript@~6.0.3 @types/node@^24`.
6. Apply the §5.5 tsconfig changes. Apply the §5.6 `vite.config.ts` **without** the env guard, the build-SHA plugin and Tailwind (those come in WP2 and WP6). Keep the `@` alias and `strictPort`.
7. Write the app shell:
   - a minimal `src/App.tsx` (named export `App`, heading "Structured")
   - `src/main.tsx` rendering `<StrictMode><App /></StrictMode>`
   - `index.html` from §5.9
   - `public/favicon.svg`, a simple rounded-pill glyph
   - `public/robots.txt`, allow-all
8. Add `.gitattributes`, `.editorconfig`, `.nvmrc`, the `.gitignore` additions and `.vscode/extensions.json`. Run `git add --renormalize .`, which must produce no diff.
9. Check the lockfile. `package-lock.json` must have `@rolldown/binding-` keys for win32-x64-msvc, linux-x64-gnu **and** darwin-arm64: `grep -c` each ≥ 1. If any is missing, delete `node_modules` and `package-lock.json` and run `npm install` again.
10. Commit:
    - `chore: add line-ending and editor config`
    - `chore: scaffold Vite React TypeScript app`

    Push. The pipeline duty opens the draft PR.

**Verification**
- `npm run typecheck` and `npm run build` exit 0.
- `git diff 1195168 -- PLAN.md CLAUDE.md README.md .claude docs/process` is empty (the planning baseline; see AC 3).
- `git ls-files --eol | grep -v 'i/lf' | grep -v 'i/-text' | grep -v 'i/none'` prints nothing.
- `npx tsc --showConfig -p tsconfig.app.json` shows `"strict": true`, `noUncheckedIndexedAccess` and the `paths` entry, and has no `baseUrl`.
- The lockfile has rolldown bindings for win32-x64, linux-x64 and darwin-arm64.
- The branch is pushed, and a draft PR from `phase-0-foundation` to `main` exists.

### WP2: Tailwind v4, shadcn/ui, ESLint, Prettier, folder skeleton, architecture rules, CLAUDE.md part 1
**Goal:** the styling and component stack works, lint and format are strict, and the architecture rules are enforced by ESLint and documented in `CLAUDE.md`.

**Steps**
1. Tailwind:
   1. `npm install -D tailwindcss @tailwindcss/vite`.
   2. Add the plugin to `vite.config.ts`.
   3. Create `src/styles/index.css` with the four lines from §5.9.
   4. Import it in `main.tsx`.
2. shadcn:
   1. Run `npx --yes shadcn@4.21.0 init --template vite --base radix --preset nova --yes --no-monorepo < /dev/null`.
   2. Expect `components.json`, `src/components/ui/button.tsx` and `src/lib/utils.ts`, with the tokens written into `src/styles/index.css`.
   3. Confirm `components.json` has `tailwind.css` = `src/styles/index.css` and the style `radix-nova`. Fix it by hand if needed.
   4. If the CLI prompts or hangs, stop it and check `init --help`. Never use `--defaults`, which forces Next.js and Base UI.
   5. Record the exact working command in `DEVLOG.md`.
   6. Move the build-time packages to devDependencies (§5.4).
   7. Check that `tsconfig.app.json` still has no `baseUrl`, and remove it if shadcn added one.
3. Lint and format:
   1. `npm install -D eslint-config-prettier prettier prettier-plugin-tailwindcss`.
   2. Write `eslint.config.js` (§5.8), `.prettierrc.json` and `.prettierignore` (§5.9).
   3. Add the scripts `lint`, `format` and `format:check`.
   4. Run `npm run format` once, then confirm with `git status` that nothing under `docs/`, `.claude/` or any `*.md` changed.
4. Button: render the shadcn `Button` in `App.tsx` (disabled placeholder "Check again", `size="lg"`, `min-h-11`) until WP6.
5. Skeleton: create `src/features/README.md`, `src/stores/README.md`, `src/data/queries/README.md`, `server/README.md` and `api/README.md`. Each has 3 to 6 lines stating purpose and import rules. `src/core`, `src/data/repo` and `src/platform` get real files in WP4 to WP6. Until then, a `src/core/README.md` stand-in may exist (removed in WP4).
6. **CLAUDE.md part 1.** Append; keep every existing line verbatim. Only the trailing placeholder comment `<!-- Architecture rules, commands, and code conventions are added in Phase 0. -->` is replaced. Add these sections:
   - **Architecture.** Folder responsibilities from PLAN §6, plus:
     - `src/lib`: UI helpers such as `cn`
     - `src/test`: test setup
     - `scripts/`: tooling
     - **New top-level TypeScript folders** (`server/`, `api/` in Phase 2) need their own tsconfig (for example `tsconfig.server.json`) referenced from `tsconfig.json`. Otherwise type-aware ESLint fails with "was not found by the project service" (verified in review r1).
   - **Import rules** (enforced by ESLint and `check:core`):
     - `src/core` is pure: no React, no Supabase, no `@/` (relative imports with `.ts` extensions only), no dynamic `import()`
     - `src/**` never imports `server/`
     - only `src/data` imports `@supabase/*`
     - `src/platform` wraps browser and Capacitor APIs
     - only `src/core/dates.ts` reads the clock
   - **Code conventions:**
     - TS strict, no `any`, named exports
     - PascalCase component files; `components/ui/*` stays shadcn kebab-case; other modules camelCase or lowercase
     - `@/` imports outside `src/core`
     - all dates and times go through `src/core/dates.ts`
     - tests live in `__tests__` next to the code, and every test passes an explicit instant
     - case-only renames use `git mv -f` (P8)
   - **Data conventions:**
     - PLAN §10.3: dates, times and durations; ID forms; summary plus JSON responses; `source='mcp'`; `batch_id`; zod validation; warnings not failures
     - **one database for dev and prod**: tests touch only `__test__…` rows and delete them, and never write `settings`
     - **the `settings` row already exists** (Phase 0 creates it on first app load, D0-10). So "no settings row" can **not** trigger the Phase 1 seeding of "Rise and Shine" and "Wind Down" (master PLAN §14 Phase 1). Phase 1 must pick another trigger, for example a seed marker such as `settings.seeded_at`, set by a conditional update so that only one device seeds.
     - optimistic concurrency: `.update(patch).eq('id', id).eq('updated_at', seen)`, where zero rows means a conflict, so refetch
     - realtime (Phase 1): invalidate everything on every (re)subscribe; DELETE payloads carry only the primary key; own writes echo back, so dedupe by `id` + `updated_at`
   - **Database migrations:**
     - D0-8 naming: `NNNN_<name>.sql`, never `supabase migration new`, never rename an applied file
     - **new-table checklist:** grants to anon, authenticated and service_role; enable RLS; `open_access` policy; `updated_at` column plus trigger; realtime publication if the UI syncs it; `notify pgrst, 'reload schema';`; `npm run db:types` plus the drift check; add the table to the integration test's table list
   - **Windows and shell rules:**
     - run scripts in Git Bash
     - never write repo or `.env*` files with PowerShell redirection, `Set-Content` or `Out-File` (use the editor tools or Node, UTF-8 without a BOM)
     - `MSYS_NO_PATHCONV=1` for `/…` arguments, and `gh api` paths without a leading `/`
     - `TZ=…` is dropped by Git Bash
     - stop servers with `taskkill /PID <pid> /T /F`
   - **Session-start ritual:** the opening ritual above, plus `npm ci` if the lockfile changed and `npx --yes vercel@61.1.0 env pull .env.local --yes` if keys changed (after the sync report)
7. Commit:
   - `feat: add Tailwind CSS v4 and shadcn/ui`
   - `chore: add ESLint and Prettier configuration`
   - `chore: add folder skeleton`
   - `docs: add architecture and conventions to contributor guide`

**Verification**
- `npm run lint` (0 warnings), `npm run format:check`, `npm run typecheck` and `npm run build` all pass.
- `npm run dev` shows the styled button. Then stop the server and confirm the port is free.
- **Negative lint tests.** Create each as a temporary, uncommitted file, check that lint fails with the configured message, then delete it:
  1. `src/core/tmp.ts` importing `react`
  2. `src/core/tmp.ts` importing `@/lib/utils`
  3. `src/core/tmp.ts` with `await import('./x.ts')`
  4. `src/lib/tmp.ts` importing `../../server/x`
  5. `src/components/Tmp.tsx` importing `@supabase/supabase-js`
  6. `src/components/Tmp.tsx` containing `new Date()`
- `git diff 1195168 -- CLAUDE.md | grep '^-[^-]'` prints only the placeholder line.

### WP3: Vitest setup, CI workflow, repo checks, Dependabot and templates
**Goal:** from here on, every push is verified by the `ci-verify` job, and leaks, AI attribution, encoding, lockfile portability and core loadability are checked automatically.

**Steps**
1. Vitest:
   1. `npm install -D vitest @vitest/coverage-v8`.
   2. Write `vitest.config.ts` (§5.7) **without** `coverage.thresholds` (WP4 adds them) and `src/test/setup.ts`.
   3. Write `src/core/__tests__/environment.test.ts` (§13.1).
   4. Add the scripts `test`, `test:watch` and `test:coverage`.
   5. Remove the `src/core/README.md` stand-in, if any.
2. Write the scripts and their npm entries:
   - `scripts/lib/env-file.mjs` (§8.1)
   - `scripts/checks/leaks.mjs`, `hygiene.mjs`, `commits.mjs` and `core-node.mjs` (§8.6 to §8.9)
   - the unit tests `scripts/lib/__tests__/env-file.test.mjs` and `scripts/checks/__tests__/{leaks,commits}.test.mjs`
   - npm scripts: `check*`, `verify`, `env:check`

   Fixtures are built at runtime and never contain a matching literal (P40).
3. Write the GitHub files:
   - `.github/workflows/ci.yml` (§10.1)
   - `.github/dependabot.yml` (§10.3)
   - `.github/pull_request_template.md` and `.github/ISSUE_TEMPLATE/*` (§10.4)
4. Validate:
   1. `npm run format` first (§0: Prettier changes to the exact files are expected).
   2. `gh release download v1.7.12 -R rhysd/actionlint -p '*windows_amd64.zip' -D "$SCRATCH/al"`, unzip, then `"$SCRATCH/al/actionlint.exe" .github/workflows/*.yml`.
   3. `uvx check-jsonschema` for the dependabot, issue-forms, issue-config and workflows schemas.
   4. The **template** word check from §10.4.
5. Create the labels `dependencies` and `ci` (§9.5).
6. Commit:
   - `test: add Vitest setup`
   - `chore: add repo checks for leaks, hygiene, attribution and core loading`
   - `ci: add CI workflow with ci-verify job`
   - `ci: add Dependabot configuration`
   - `chore: add pull request and issue templates`

**Verification**
- actionlint and `check-jsonschema` report nothing.
- **Templates contain no AI mentions** (deliverable 11e): `grep -niwE 'ai|claude|anthropic|llm' .github/pull_request_template.md .github/ISSUE_TEMPLATE/*` prints nothing.
- `npm run verify` passes locally.
- `gh pr checks` shows `ci-verify` passing on the PR, for both the push and the pull_request run. The run log shows Node 24.x, and the npm cache is used from the second run on.
- **Fake leak.** Write a key-shaped string, built at runtime, into `$SCRATCH/fake.txt` (`printf 'sb_%s_%s' secret "$(head -c 32 /dev/urandom | base64 | tr -dc A-Za-z0-9 | head -c 24)"`). `node scripts/checks/leaks.mjs --files "$SCRATCH/fake.txt"` must exit 1 and print only the file and the pattern name. Then delete the file.
- **Fake attribution.** Write a trailer line, built at runtime, to `$SCRATCH/body.md`. `node scripts/checks/commits.mjs --text-file "$SCRATCH/body.md"` must exit 1. Then delete the file.
- **Bot PR text skip.** With `PR_TITLE=` and `PR_BODY=` empty, `npm run check:commits` prints `PR text: not provided …` and still checks the commit range. The `ci.yml` expression is reviewed against §10.1.

### WP4: `src/core/dates.ts` and tests
**Goal:** the full §6.1 API, with the §13.1 tests and coverage of at least 95 % lines and statements, 100 % functions and at least 90 % branches for `src/core`.

**Steps**
1. `npm install date-fns @date-fns/tz`.
2. Implement `src/core/dates.ts` (§6.1), including the custom gap and ambiguity resolution, the range guards and Intl-free formatting.
3. Write the test files from §13.1:
   - `dates.api.test.ts`: `expectTypeOf` on every export's signature
   - `dates.zone.test.ts`, `dates.time.test.ts`, `dates.calendar.test.ts`, `dates.format.test.ts`: table-driven `it.each`
   - every call passes an explicit `now`; the single default-clock test uses `vi.useFakeTimers()` with `vi.setSystemTime(…)`

   Add `coverage.thresholds` to `vitest.config.ts`.
4. Commit:
   - `feat: add time-zone-aware date helpers in core`
   - `test: cover date helpers across DST and time zones`

**Verification**
- `npm run test:coverage` passes the thresholds.
- Every row of the §13.1 tables exists as a test case (count the `it.each` rows).
- `npm run check:core` prints `ok src/core/dates.ts`.
- `npm run lint` passes, and `dates.ts` imports only `date-fns` and `@date-fns/tz`.
- CI `ci-verify` is green.

### WP5: Supabase project, migration, types, env tooling and integration tests
**Goal:** the cloud project `structured` (ap-south-1) exists and its schema is applied, typed and verified by opt-in integration tests. `.env.local` holds the six Supabase and Vercel keys, and `.env.example` documents all seven.

**Preconditions:** §9.1.

**Steps**
1. Install and script:
   1. `npm install -D supabase@^2.118.0` and `npm install @supabase/supabase-js`.
   2. Write `scripts/supabase.mjs` (§8.3) and `scripts/setup-supabase.mjs` (§8.4).
   3. Add the `db:*` scripts.
   4. Run `npm run check:hygiene`: the lockfile must have `@supabase/cli-` entries for windows-x64, linux-x64 and darwin-arm64.
2. Write `.env.example` (§5.10).
3. Follow §9.2 from `npx supabase init` to `npm run db:ping`.
4. Integration tests:
   1. Add `tsconfig.test.json`, `vitest.integration.config.ts` and `tests/integration/supabase.test.ts` (§13.2).
   2. Add the `test:integration` script.
   3. Run it. The output must show all tests passed and **0 skipped**.
5. Commit:
   - `chore: add Supabase CLI configuration and scripts`
   - `feat: add initial database schema migration`
   - `feat: add generated database types`
   - `test: add Supabase integration tests`
   - `docs: add environment variable template`

**Verification**
- `npm run db:migrations` shows `0001` locally and remotely. `node scripts/supabase.mjs push --dry-run` reports that nothing is left to push.
- `database.types.ts` contains `Database['public']['Tables']` entries for the 6 tables and passes typecheck.
- There is no drift: `npm run db:types && git diff --exit-code src/data/database.types.ts`.
- `npm run test:integration` passes with 0 skipped.
- `npm run env:check -- --allow-missing PROD_URL` prints `ok` for the other 6 keys.
- `npm run check:leaks` passes with `.env.local` present. `supabase/config.toml` holds no ref, and the types file holds no URL.
- `git status --ignored --short` lists `.env.local` and `supabase/.temp` only as ignored (`!!`).

### WP6: Typed client, health check and the "DB connected" home page
**Goal:** the running app proves read and write against Supabase with typed error states. It degrades gracefully when unconfigured. A production build refuses an invalid env and stamps the build SHA.

**Steps**
1. Implement:
   - `src/env.d.ts`
   - `src/data/env.ts`, `errors.ts`, `supabase.ts`, `repo/settings.ts`, `health.ts`, `dbCheck.ts`
   - `src/platform/timezone.ts`, `network.ts`
   - `src/components/DbStatusBadge.tsx`, `RootErrorBoundary.tsx`
   - `src/App.tsx`, `src/main.tsx`

   (§6.2 to §6.6.)
2. Complete `vite.config.ts` with the env guard and `buildShaMeta` (§5.6).
3. Write the unit tests from §13.1:
   - `src/data/__tests__/env.test.ts`, `errors.test.ts`, `settings-store.test.ts` (real `createClient` with `global.fetch` stubs), `health.test.ts` (fake store, fake timers)
   - `src/components/__tests__/DbStatusBadge.test.tsx` (`react-dom/server` `renderToStaticMarkup`)
4. Manual checks M1 to M3 and the production-guard check (§13.3).
5. Commit:
   - `feat: add typed Supabase client, settings repository and health check`
   - `feat: show database connection status on home page`
   - `feat: refuse production builds without valid Supabase env`
   - `test: cover env parsing, error mapping and the health check`

**Verification**
- Unit tests and CI are green, which proves the unconfigured build works.
- M1 passes: "DB connected" locally.
- M2 passes: "Settings row created", then "found", with the zone equal to the browser's (`node scripts/supabase.mjs settings`).
- M3 passes: the unconfigured build shows "Database not configured" with no console error.
- `REQUIRE_SUPABASE_ENV=1 VITE_SUPABASE_URL= npx vite build --outDir "$SCRATCH/x"` exits non-zero with a names-only message.
- A normal build's `dist/index.html` contains `<meta name="build-sha" content="dev"`.
- react-hooks lint is clean, and no `useEffect` is used for fetching.

### WP7: Vercel project, env vars, vercel.json, deploy script and workflow, first production deploy
**Goal:** a publicly reachable production deployment that shows "DB connected", deployed through the same `deploy-prod.sh` that `deploy.yml` runs. Git integration is off, Standard Protection is on, the env matrix matches §5.11, and the GitHub secrets are set.

**Preconditions:** §9.1 (Vercel CLI login done).

**Steps**
1. Write:
   - `vercel.json` and `.vercelignore` (§5.9)
   - `scripts/lib/vercel.mjs` (§8.2) and `scripts/sync-vercel-env.mjs` (§8.5)
   - `scripts/ci/deploy-prod.sh`, `smoke.mjs` and `redact-log.sh` (§8.10 to §8.12)
   - `.github/workflows/deploy.yml` (§10.2)

   Add the `env:sync-vercel` script. Run `npm run format`, actionlint and `npm run check:hygiene` (pin consistency is best effort, §0.1).
2. Follow §9.3 steps 1 to 7.
3. Run the env-var link rehearsal (§9.4) and clean it up.
4. Run the production checks E1 to E5 (§13.3).
5. Commit:
   - `feat: add Vercel configuration with SPA rewrite, privacy headers and region`
   - `ci: add production deploy script, smoke check and deploy workflow`
   - `chore: add Vercel env sync script`

**Verification**
- `bash scripts/ci/deploy-prod.sh` ran end-to-end with the smoke check passing (SHA equals HEAD, routes, headers, DB probe). **Mandatory.**
- The `--expect-protected` check passed, or its deferral is recorded (best effort, §0.1).
- `v-inspect.json` shows no Git link. The §9.3 step 1 count prints `named VERCEL_PROJECT_NAME: 1, starting with structured-: 1`.
- Vercel CLI pin: `npm run check:hygiene` passes with the pin check, or (if that check was deferred) `grep -c 'vercel@61.1.0' .github/workflows/deploy.yml scripts/ci/deploy-prod.sh scripts/lib/vercel.mjs` gives ≥ 1 for each file.
- `v-prot.json` shows `prod_deployment_urls_and_all_previews`.
- The sync report shows every matrix row `same` (or `unknown (Secret)` for the production secret key), and `env ls` shows `VITE_*` as Config in production.
- `gh secret list` shows `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` and `PROD_URL`.
- The rehearsal passed with a tokenless build, and its clone is gone.
- There are no Vercel bot comments on the PR (`gh pr view --json comments`).
- `npm run check:leaks` passes, and `git diff --exit-code package-lock.json` is clean.

### WP8: GitHub repo settings: ruleset, CodeQL default setup, description and topics
**Goal:** `main` is protected exactly as the task requires without blocking the Ship merge, code scanning is on (or its deferral is recorded), and the repo presents itself.

**Steps**
1. Write `.github/rulesets/main.json` (§10.5), run `npm run format`, commit it as `ci: add main branch ruleset definition` and push.
2. Confirm `gh pr checks` lists `ci-verify`.
3. Apply the ruleset idempotently, then set up CodeQL default setup, the description and the topics (§9.5).
4. Record the ruleset ID (and the CodeQL outcome) in `HANDOFF.md`.

**Verification**
- `gh api repos/$R/rulesets` lists exactly one "main protection" ruleset with `enforcement: active`.
- `gh api repos/$R/rules/branches/main` shows `deletion`, `non_fast_forward`, `pull_request` (0 approvals, merge only) and `required_status_checks` with the context `ci-verify` (integration 15368).
- The code-scanning default-setup state is `configured` with `javascript-typescript` and `actions`, or the deferral is recorded in HANDOFF and the PR body together with the API message.
- `gh repo view --json description,repositoryTopics` shows the description and all 12 topics.
- The PR is still mergeable: `gh pr view --json mergeStateStatus` is not `BLOCKED` for reasons other than the draft state.

### WP9: Documentation, resume rehearsal and final sweep
**Goal:** `CLAUDE.md`, the README and `HANDOFF.md` are complete and accurate, the HANDOFF resume steps are proven on a fresh clone, and the branch is clean of leaks and attribution.

**Steps**
1. **CLAUDE.md part 2.** Append; keep everything existing. Add:
   - **Commands:** every npm script with one line each.
   - **Environment variables:** the §5.11 matrix (names only), plus "the Vercel development env is the source of truth; run `env:sync-vercel` before `env pull`; sync a new local-only key before anyone pulls".
   - **CI/CD flow:** §10.6, plus:
     - the `ci-verify` rules: no path filters, never `[skip ci]`, never reuse the name
     - "Dependabot merges deploy"
     - bot PR titles and bodies are not scanned, but their commits and authors are (D0-17)
     - the §10.3 fix paths for a blocked Dependabot PR
     - the pinned Vercel CLI (bump all three places in one commit)
     - "after merging a Dependabot npm PR, run `npm ci` on Windows"
   - **Secrets:**
     - write secret-bearing output to files and read values with `env-file.mjs get`
     - mask values in docs
     - never paste key-shaped strings, even fake ones
   - **Runbooks:** links to HANDOFF (rollback, leak response, paused DB).
   - **Per-WP checklist:** the opening and closing rituals.
2. **Rewrite README.md:**
   - title and pitch
   - CI badge `![CI](https://github.com/karthi-ai-engineer/Structured/actions/workflows/ci.yml/badge.svg)`
   - planned features grouped as in PLAN §3, with status
   - tech stack and an architecture sketch
   - a roadmap and status table for Phases 0 to 6
   - local setup (Node 24, `npm ci`, `vercel env pull` or `.env.example`, `npm run dev`)
   - a scripts table
   - rules (link to CLAUDE.md)
   - a "no login yet" note
   - "find the live branch"

   It contains **no app URL**.
3. **HANDOFF.md** final shape. Keep the current status section format:
   1. Current status (phase, branch, last updated with zone, pipeline stage and `resumeFrom`/`skipWPs`, done, next, blockers, IDs: tracking issue, PR, ruleset). **"Next" carries these forward notes for the next planners** (review r1, S3 and S6):
      - **Phase 1 seeding trigger.** The `settings` row already exists, so the master plan's "no settings row → seed Rise and Shine / Wind Down" never fires. Phase 1 must choose another trigger, for example a `settings.seeded_at` marker set by a conditional update.
      - **Phase 2 early checks.**
        - Give `server/` and `api/` a tsconfig referenced from `tsconfig.json` (type-aware ESLint).
        - Verify early that Vercel's function bundling resolves `src/core`'s `.ts`-suffixed relative imports, for example with `rewriteRelativeImportExtensions` or Node 24 type stripping in the function runtime.
      - Any §0.1 best-effort item that was deferred, with its substitute.
   2. **Find the live branch:** `git ls-remote --heads https://github.com/karthi-ai-engineer/Structured` lists the branches. The newest `phase-*` branch holds the live HANDOFF; otherwise `main` (F21).
   3. **New machine** (Git Bash; each step has a check):
      1. Install Node 24: `winget install Schniz.fnm`, then `fnm install 24 && fnm use 24`, or nvm-windows `nvm install 24 && nvm use 24` (it ignores `.nvmrc`). Also Git and gh. For PowerShell use, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` (P43).
      2. `gh auth login` as `karthi-ai-engineer`, then `gh auth refresh -s workflow`. Check: `gh api user --jq .login` (P38).
      3. `git clone -b <live branch> https://github.com/karthi-ai-engineer/Structured.git && cd Structured` (P42).
      4. Identity and credentials, all inside the repo:
         - `git config user.name "<your name>"`
         - `git config user.email karthi.ai.engineer@gmail.com`
         - `git config credential.https://github.com.helper ''`
         - `git config --add credential.https://github.com.helper '!gh auth git-credential'` (single quotes)

         Checks: `git config --get-all credential.https://github.com.helper` prints an empty line and then the gh helper, and `git ls-remote origin` works without a prompt. If commits must not show "Unverified", see open question 1 (P2, P4, F25).
      5. `npm ci`.
      6. Vercel (the owner logs in with a browser; `VERCEL_TOKEN` in the env is the headless alternative):
         1. `npx --yes vercel@61.1.0 login`.
         2. `npx --yes vercel@61.1.0 project ls --scope <team>` shows the `structured-…` project.
         3. `project inspect <name> --scope <team>` must succeed before linking.
         4. `npx --yes vercel@61.1.0 link --yes --project <name> --team <team>`. Abort if the CLI says it is creating a project.
         5. `npx --yes vercel@61.1.0 git disconnect --yes`, then `project inspect` shows no Git link (F22, P27).
         6. `npx --yes vercel@61.1.0 env pull .env.local --yes`.
      7. `npm run env:check`: all 7 keys `ok` (P28).
      8. Supabase: `npx supabase login` (browser; `SUPABASE_ACCESS_TOKEN` is the headless alternative), then `npm run db:link`, `npm run db:migrations` and `npm run db:ping`.
      9. `npm run verify`, then `npm run dev` shows "DB connected" (stop the server afterwards).
      10. Continue from **Next**, or resume the pipeline with `resumeFrom` as recorded.
   4. **Returning to an existing clone** (P44, F24):
      1. `git fetch --prune && git switch <branch> && git pull --ff-only`
      2. `npm ci` if `package-lock.json` changed
      3. `npm run env:sync-vercel` (report), then `env pull` if keys differ
      4. `npm run db:ping`
      5. `npm run db:migrations`
   5. **Recovery and runbooks:**
      - paused DB (HTTP 540): Dashboard, Restore project, then `npm run db:migrations`
      - DB commands need outbound TCP 5432
      - production rollback (§17.2)
      - leak response (§17.3)
      - GPG signing failure: stop and ask the owner
4. **Resume rehearsal** (P42, P9). Follow the HANDOFF "New machine" steps literally in `$SCRATCH/resume`:
   1. Clone with `-b phase-0-foundation`.
   2. Run the identity and credential lines inside the throwaway clone only.
   3. `npm ci`.
   4. The Vercel link-safety sequence, then `env pull`.
   5. `npm run env:check`.
   6. `npm run db:link`, `db:migrations` and `db:ping`.
   7. `npm run verify` and `npm run test:integration`.
   8. Compare the app keys with the original `.env.local`. Print only `KEY: match|differs|missing`; extra `VERCEL_*` keys are ignored (F23).
   9. Clean up: stop processes, remove the clone's `.env*`, `.vercel` and `supabase/.temp`, then the clone, and assert that it is gone.
5. **Final sweep:**
   1. AC 36 (leaks, including the logs of **every** CI run on the branch, failed ones too, P34)
   2. AC 37 (attribution and authorship checks)
   3. AC 38 (process)
   4. Update the PR body. It is still a draft: summary, verification notes, "Post-merge follow-ups", and no URLs. Before `gh pr edit`, check the body file with `check:commits --text-file` and with the §10.4 **PR-text** word check. Both must be clean.
6. Commit:
   - `docs: add commands, environment and CI/CD flow to contributor guide`
   - `docs: rewrite README`
   - `docs: update handoff for phase 0 completion`

**Verification**
- ACs 1 to 38 (§12) are self-checked and recorded in `DEVLOG.md`.
- The rehearsal passed, with every app key `match`.
- The rehearsal clone is gone.
- The README contains no `vercel.app`, `supabase.co` or project name (`npm run check:leaks` with `.env.local`).

---

## 12. Acceptance criteria

"Local" means this Windows machine (Node 26; the engines warning is allowed). "CI" means the `ci-verify` job (Node 24). Every criterion names its test.

**Scaffold and tooling**
1. **Local commands pass.** `npm ci`, `npm run typecheck`, `npm run lint` (`--max-warnings=0`), `npm run format:check`, `npm run test:coverage`, `npm run build` and `npm run check` all exit 0 locally.
2. **CI green on the PR.** `gh pr checks <pr>` shows `ci-verify` passing on the PR head commit, and the job log shows Node 24.x from `.nvmrc`.
3. **Existing docs preserved.** The baseline is `1195168`, the last commit on `phase-0-foundation` before this plan. `main` is not the baseline, because `CLAUDE.md` was already edited on the branch before the phase.
   - `git diff 1195168 -- PLAN.md` is empty. After final verification, only `- [ ]` → `- [x]` in §14 Phase 0 may differ.
   - `git diff 1195168 -- CLAUDE.md | grep '^-[^-]'` prints at most the one placeholder comment line.
   - `git diff 1195168 --stat -- .claude docs/process docs/phases/phase-1 docs/phases/phase-0/plan-v1.md docs/phases/phase-0/edge-cases-functional.md docs/phases/phase-0/edge-cases-platform.md docs/phases/phase-0/pipeline-args.json` is empty.
4. **Stack and runtime pins.**
   - `npm ls react vite typescript tailwindcss vitest eslint` shows React 19.x, Vite 8.x, TypeScript 6.0.x, Tailwind 4.x, Vitest 5.x and ESLint 10.x.
   - `package.json` has `engines.node` = `24.x`, and `.nvmrc` is `24`.
5. **TypeScript strict and alias.**
   - `npx tsc --showConfig -p tsconfig.app.json` shows `strict: true`, `noUncheckedIndexedAccess: true` and `paths` `@/*`, and no `baseUrl`.
   - `tsconfig.json` has the same `paths`, and `vite.config.ts` has the `@` alias.
   - `src/App.tsx` imports `@/components/ui/button`, and the build succeeds.
6. **shadcn/ui.**
   - `components.json` exists with style `radix-nova` and `tailwind.css` = `src/styles/index.css`.
   - `src/lib/utils.ts` exports `cn`.
   - `src/components/ui/button.tsx` exists and is rendered by `App.tsx`.
7. **Line endings and encoding.**
   - `.gitattributes` exists.
   - `git ls-files --eol | grep -v 'i/lf' | grep -v 'i/-text' | grep -v 'i/none'` prints nothing.
   - `npm run check:hygiene` passes (no BOM, valid UTF-8, no CR).
8. **Skeleton.**
   - `git ls-files` includes files under `src/core`, `src/data`, `src/features`, `src/components`, `src/platform`, `src/stores`, `server`, `api` and `supabase/migrations`.
   - The placeholder folders (`src/features`, `src/stores`, `src/data/queries`, `server`, `api`) contain only a `README.md`.
   - No feature UI exists beyond the status page.
9. **Architecture rules enforced.** The six temporary-file lint tests of WP2 each fail `npx eslint <file>` with the configured message:
   1. core importing react
   2. core importing `@/lib/utils`
   3. core with dynamic `import()`
   4. `src/lib` importing server
   5. a component importing `@supabase/supabase-js`
   6. a component calling `new Date()`
10. **Core loads in plain Node.**
    - `npm run check:core` prints `ok` for every non-test `src/core/*.ts`.
    - `grep -rn "from '@/" src/core` prints nothing (no alias imports).
    - `grep -rnE "from '\.{1,2}/[^']*'" src/core --include=*.ts | grep -v "\.ts'"` prints nothing (every relative import has a `.ts` extension).

**Core (`dates.ts`)**
11. **API.** `src/core/__tests__/dates.api.test.ts` asserts the exact signature of every §6.1 export with `expectTypeOf`, and it passes.
12. **Behaviour and coverage.**
    - Every row of the §13.1 tables is a test case: New York, London, Chatham, Kolkata, Santiago and Lord Howe DST and midnight cases; invalid input; week ranges for week starts 0, 1 and 6; the date range bounds; the `24:00` and fractional-second times; Intl-free formatting.
    - `npm run test:coverage` reports at least 95 % lines and statements, 100 % functions and at least 90 % branches for `src/core`.
13. **Hermetic test environment.** `environment.test.ts` passes. It proves:
    - the process zone is `America/St_Johns` (offset 210)
    - `import.meta.env.VITE_SUPABASE_URL` is empty even with `.env.local` present
    - global `fetch` rejects

**Database**
14. **Migration content.** `supabase/migrations/0001_init.sql` contains:
    - 6 `create table`
    - 4 `create index`
    - one grant statement naming the 6 tables and `anon, authenticated, service_role`
    - 6 `enable row level security`
    - 6 `create policy "open_access"`
    - 4 `create trigger`
    - the publication line with `tasks, goals, settings, day_notes`
    - `notify pgrst`
    - the D0-21 check constraints

    Verified with `grep -c` per item.
15. **Migration applied.** `npm run db:migrations` shows version `0001` both locally and remotely, and `node scripts/supabase.mjs push --dry-run` reports that the remote is up to date.
16. **Integration tests.** `npm run test:integration` passes with 0 skipped. It proves:
    - (a) anon can select every public table (no `42501` or `PGRST205`)
    - (b) anon full CRUD on a `__test__` templates row, removed afterwards
    - (c) the `updated_at` trigger fires for an **anon** update of a `__test__` goal
    - (d) a realtime UPDATE event on that goal arrives (resend loop, at most 20 s)
    - (e) inserting `settings` with `id = 2` fails with `23514`
    - (f) the secret key works from Node (`tasks` count ≥ 0)
    - (g) the last test deletes the `__test__` rows and a secret-key count shows none remain in `goals` or `templates`
17. **Types generated, no drift.**
    - `src/data/database.types.ts` has `Tables` entries for all 6 tables.
    - `npm run db:types && git diff --exit-code src/data/database.types.ts` exits 0.
18. **Env files.**
    - `npm run env:check` prints `ok` for all 7 keys.
    - `git check-ignore -q .env.local` succeeds.
    - `.env.example` lists the 7 keys with empty values.
    - `.env.local` has no BOM: `node -e "process.exit(require('fs').readFileSync('.env.local')[0]===0xEF?1:0)"`.
19. **Settings row seeded by a real browser.** `node scripts/supabase.mjs settings` prints `present` with `timezone=` equal to the zone the owner's Chrome reports (`Intl.DateTimeFormat().resolvedOptions().timeZone`, compared after `normalizeTimeZone`), not `UTC`.

**App**
20. **Status states.**
    - With `.env.local`, the page shows "Structured" and `[data-testid=db-status-title]` is exactly `DB connected` with `data-state="connected"` (M1).
    - After the settings row is deleted, the first load shows `Settings row created`, then `Settings row found` after a reload (M2).
    - A build without env shows `Database not configured` with `data-state="not-configured"` and no console exception (M3).
    - Unit tests cover every error code's copy.
21. **Env safety.**
    - Unit tests show `readSupabaseEnv` rejects `sb_secret_` keys, both placeholders, whitespace, control characters, non-root URL paths and `http:` for non-local hosts, and that no problem message contains the value.
    - `REQUIRE_SUPABASE_ENV=1 VITE_SUPABASE_URL= npx vite build --outDir "$SCRATCH/x"` exits non-zero, naming only the variable.
    - The badge never renders `http` (unit test over every state).
22. **Accessibility basics.**
    - The badge markup has `role="status"` and `aria-live="polite"` (unit test).
    - The "Check again" button has `min-h-11` and is disabled with `aria-busy` while a check is pending.
    - `index.html` has `lang="en"` and `color-scheme` light.

**Vercel and production**
23. **Smoke check passes against production** (`scripts/ci/smoke.mjs`):
    - `/` returns 200 with `build-sha` equal to the deployed commit
    - `/day/2026-01-01` returns 200
    - `/assets/does-not-exist.js`, `/api` and `/api/not-a-function` return 404
    - `robots.txt` returns 200
    - the `x-robots-tag` noindex and `referrer-policy: no-referrer` headers are present
    - the DB probe returns 200
24. **Production DB read and write.**
    - Opening production in a browser shows `DB connected`.
    - After the settings row is deleted, the first production load shows `Settings row created`, and AC 19 holds afterwards.
    - No committed screenshot shows the address bar.
25. **No Git integration.**
    - `vercel project inspect --format json` shows no Git link.
    - `vercel.json` has `git.deploymentEnabled: false`.
    - `gh pr view --json comments` has no comment from the Vercel bot.
    - `vercel project ls --scope <team> --filter structured- --limit 100 --format json` has exactly **one** project named `$VERCEL_PROJECT_NAME` and exactly **one** whose name starts with `structured-` (§9.3 step 1; counts only). Unrelated projects in the team do not affect this criterion.
26. **Standard Protection.**
    - `vercel project protection <name> --json` shows SSO with `prod_deployment_urls_and_all_previews`.
    - An unauthenticated request to the production domain returns 200.
    - An unauthenticated request to a generated deployment URL returns 401, 403 or a 30x (`smoke.mjs --expect-protected`). *Best effort* (§0.1): if the probe is deferred, this bullet is met by the first bullet, and the deferral is recorded in DEVLOG and HANDOFF.
27. **Env matrix.**
    - `npm run env:sync-vercel` reports every §5.11 row as `same` (the production `SUPABASE_SECRET_KEY` as `unknown (Secret)`).
    - `vercel env ls --format json`, parsed into names, targets and types, shows `VITE_*` as Config in production and preview, and `SUPABASE_SECRET_KEY` as Secret in production.
28. **Project settings.** `vercel project inspect --format json` shows Node.js 24.x and framework Vite.

**CI/CD and GitHub**
29. **Workflows.**
    - `ci.yml` and `deploy.yml` pass actionlint.
    - Both declare only `permissions: contents: read`, and every action is pinned to `@v7`.
    - `ci.yml` has concurrency with `cancel-in-progress`, the job name `ci-verify` and no path filters.
    - `deploy.yml` has the `refs/heads/main` job guard, the stale-head skip, the secrets check, the verify step and the pinned CLI install, and delegates to `deploy-prod.sh`.
    - `grep -nE 'echo[^|]*\$\{?(PROD_URL|VERCEL_TOKEN|token|sb_url|sb_key)' .github/workflows/*.yml scripts/ci/*.sh` prints nothing (no value is echoed).
    - `deploy-prod.sh` ran end-to-end locally (WP7) with the smoke check passing.
30. **Secrets.** `gh secret list` shows `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` and `PROD_URL`.
31. **Ruleset.** `gh api repos/karthi-ai-engineer/Structured/rulesets` has exactly one active "main protection" ruleset on `~DEFAULT_BRANCH`. `gh api …/rules/branches/main` shows:
    - `deletion`
    - `non_fast_forward`
    - `pull_request` (0 approvals, `allowed_merge_methods` `["merge"]` unless the API refused it, which is recorded)
    - `required_status_checks` (`ci-verify`, integration 15368, strict off)
32. **Code scanning.** `gh api repos/karthi-ai-engineer/Structured/code-scanning/default-setup --jq .state` is `configured`, or the deferral with the API message is recorded in `HANDOFF.md` and in the PR body's post-merge follow-ups.
33. **Automation files.**
    - `check-jsonschema` passes for `dependabot.yml` (npm and github-actions, weekly, grouped minor/patch), both issue forms, `config.yml` and both workflows.
    - `pull_request_template.md` exists.
    - The templates contain no AI mentions (deliverable 11e): `grep -niwE 'ai|claude|anthropic|llm' .github/pull_request_template.md .github/ISSUE_TEMPLATE/*` prints nothing.
    - The `ci-verify` commit-check step passes empty `PR_TITLE`/`PR_BODY` for bot-authored PRs and keeps the commit and author checks (§10.1).
    - The labels `dependencies` and `ci` exist.
34. **Repo presentation.**
    - `gh repo view --json description,repositoryTopics` shows the description and all 12 topics.
    - README has the CI badge, features, tech stack, roadmap/status table and local setup sections.
    - `npm run check:leaks` finds no app URL, Supabase host or project name in README.

**Handoff and hygiene**
35. **HANDOFF resume works.**
    - The WP9 rehearsal followed the HANDOFF "New machine" steps literally on a fresh clone, and every step's check passed.
    - `npm run env:check` in the clone was all `ok`, and every app key compared `match`.
    - `npm run verify` and `npm run test:integration` passed in the clone.
    - The clone is deleted, with `test ! -e` confirming it.
    - HANDOFF states the current phase, branch, last update with zone, done, next (including the WP9 forward notes), blockers and IDs.
36. **No leaks.** `npm run check:leaks` passes with `.env.local` present over:
    - tracked and untracked files
    - all commit messages in `origin/main..HEAD`
    - the logs of **every** CI run on the branch, including failed ones: `for id in $(gh run list -b phase-0-foundation -L 100 --json databaseId -q '.[].databaseId'); do gh run view $id --log | node scripts/checks/leaks.mjs --stdin || echo "LEAK in run $id"; done` prints no LEAK line
37. **Attribution and authorship checks pass.**
    - `npm run check:commits` passes for `origin/main..HEAD`.
    - The PR title and body pass `check:commits --text-file` and the §10.4 PR-text word check.
    - `gh issue view <n> --json body,comments` and `gh pr view --json body,comments`, piped through the same check, pass.
    - Every commit's author e-mail is in the allowlist.
38. **Process.**
    - Every WP produced conventional commits and was pushed.
    - The tracking-issue checkbox is ticked for WP1 to WP9.
    - `HANDOFF.md` and `DEVLOG.md` have an entry per WP.
    - The PR is still a draft (it is marked ready in Ship).
    - `netstat -ano | findstr ":5173 :4173"` is empty, and no background process is left running.

---

## 13. Test plan

### 13.1 Unit tests (Vitest, run in CI; every call passes an explicit instant)
`src/core/__tests__/environment.test.ts`:
- `new Date(2026, 0, 1).getTimezoneOffset() === 210`
- `Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/St_Johns'`
- `(import.meta.env.VITE_SUPABASE_URL ?? '') === ''`
- `await fetch('https://example.invalid')` rejects

`dates.zone.test.ts`, for `todayIn` / `nowMinutesIn`. All values were verified on 2026-09-30 with Intl and @date-fns/tz:
| Instant (UTC) | Zone | `todayIn` | `nowMinutesIn` |
|---|---|---|---|
| 2026-09-28T18:40Z | Asia/Kolkata | 2026-09-29 | 10 |
| 2026-09-28T18:40Z | America/New_York | 2026-09-28 | 880 |
| 2026-09-28T18:40Z | Pacific/Chatham | 2026-09-29 | 505 |
| 2026-09-28T18:40Z | Europe/London | 2026-09-28 | 1180 |
| 2026-09-28T18:40Z | UTC | 2026-09-28 | 1120 |
| 2026-09-28T18:29:59.999Z | Asia/Kolkata | 2026-09-28 | 1439 |
| 2026-09-28T18:30Z | Asia/Kolkata | 2026-09-29 | 0 |
| 2026-03-08T06:59Z / 07:00Z | America/New_York | 2026-03-08 | 119 / 180 (spring forward) |
| 2026-11-01T05:30Z / 06:30Z | America/New_York | 2026-11-01 | 90 / 90 (repeated hour) |
| 2026-03-29T00:59Z / 01:00Z | Europe/London | 2026-03-29 | 59 / 120 |
| 2026-10-25T00:30Z / 01:30Z | Europe/London | 2026-10-25 | 90 / 90 |
| 2026-09-26T13:59Z / 14:00Z | Pacific/Chatham | 2026-09-27 | 164 / 225 |
| 2026-04-04T13:59Z / 14:00Z | Pacific/Chatham | 2026-04-05 | 224 / 165 |
| 2026-12-31T11:00Z | Pacific/Chatham | 2027-01-01 | 45 (year boundary) |
| 2026-09-06T03:59Z / 04:00Z | America/Santiago | 2026-09-05 / 2026-09-06 | 1439 / 60 (midnight does not exist) |
| 2026-10-03T15:29Z / 15:30Z | Australia/Lord_Howe | 2026-10-04 | 119 / 150 (30-minute DST gap) |
| 2026-04-04T14:45Z / 15:15Z | Australia/Lord_Howe | 2026-04-05 | 105 / 105 (repeated half hour) |

`zonedDateTimeToInstant` and `startOfDayInstant`:
| Wall time | Zone | Expected instant | Why |
|---|---|---|---|
| 2026-03-08 02:30 | America/New_York | 2026-03-08T07:30:00Z | gap, shifted forward |
| 2026-11-01 01:30 | America/New_York | 2026-11-01T05:30:00Z | ambiguous, earlier |
| 2026-03-29 01:30 | Europe/London | 2026-03-29T01:30:00Z | gap |
| 2026-10-25 01:30 | Europe/London | 2026-10-25T00:30:00Z | ambiguous, earlier |
| 2026-09-27 03:00 | Pacific/Chatham | 2026-09-26T14:15:00Z | gap |
| 2026-04-05 03:00 | Pacific/Chatham | **2026-04-04T13:15:00Z** | ambiguous, earlier (TZDate says 14:15Z) |
| 2026-09-29 09:00 | Asia/Kolkata | 2026-09-29T03:30:00Z | |
| 2026-09-06 00:00 | America/Santiago | 2026-09-06T04:00:00Z | midnight gap = start of day |
| 2026-10-04 02:15 | Australia/Lord_Howe | 2026-10-03T15:45:00Z | 30-minute gap |
| 2026-04-05 01:45 | Australia/Lord_Howe | **2026-04-04T14:45:00Z** | ambiguous, earlier (TZDate says 15:15Z) |
| 2026-09-29 24:00 | Asia/Kolkata | 2026-09-29T18:30:00Z | end of day = next midnight |
| `startOfDayInstant('2026-09-30','Asia/Tokyo')` | | 2026-09-29T15:00:00Z | |

`msUntilNextDayIn`:
| Zone | `now` | Expected ms | Why |
|---|---|---|---|
| Asia/Kolkata | 2026-09-28T18:40Z | 85 800 000 | 23 h 50 min |
| America/New_York | 2026-11-01T04:00Z | 90 000 000 | 25-hour day |
| America/New_York | 2026-03-08T05:00Z | 82 800 000 | 23-hour day |

Zone validation:
- `isValidTimeZone`:
  - `''` → false
  - `' Asia/Kolkata'` → false
  - `'+05:30'` → false
  - `'-03:30'` → false
  - `'Mars/Olympus'` → false
  - `'asia/kolkata'` → true
  - `'UTC'` → true
- `normalizeTimeZone('asia/kolkata')` matches `/^Asia\/(Kolkata|Calcutta)$/`. Never assert one exact canonical spelling.
- `normalizeTimeZone('Mars/X')` → RangeError.

Errors:
- `todayIn('Mars/Olympus', now)` → RangeError
- `todayIn('UTC', new Date(NaN))` → RangeError
- `zonedDateTimeToInstant('2026-02-30', '09:00', 'UTC')` → RangeError

Default clock (the only test that relies on it): `vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-28T18:40:00Z'))`, then `todayIn('Asia/Kolkata')` is `'2026-09-29'`.

`dates.time.test.ts`:
- **`toMinutes`:**
  | Input | Result |
  |---|---|
  | `'00:00'` | 0 |
  | `'09:30'` | 570 |
  | `'23:59'` | 1439 |
  | `'07:00:00'` | 420 |
  | `'23:59:59'` | 1439 |
  | `'09:30:00.5'` | 570 |
  | `'23:59:59.999'` | 1439 |
  | `'24:00'` (default) | RangeError |
  | `'24:00'` with `{ endOfDay: true }` | 1440 |
  | `'24:00:00'` with `{ endOfDay: true }` | 1440 |

  RangeError for:
  - `'24:01'`, `'24:00:01'` (even with `endOfDay`), `'24:30'`
  - `''`, `'9:30'`, `'12:60'`, `'ab:cd'`
  - `' 09:30'`, `'09:30 '`, `'09:30:60'`, `'-01:00'`, `'0930'`
- **`fromMinutes`:**
  - 0 → `'00:00'`, 570 → `'09:30'`, 1439 → `'23:59'`, 1440 → `'24:00'`
  - RangeError for −1, 1441, 1.5, NaN and Infinity
  - property: `toMinutes(fromMinutes(n), { endOfDay: true }) === n` for every n in 0..1440
- **`addMinutesToTime`:**
  | Input | Result |
  |---|---|
  | `'23:30'` + 60 | `{'00:30', 1}` |
  | `'00:15'` − 30 | `{'23:45', −1}` |
  | `'09:00'` + 0 | `{'09:00', 0}` |
  | `'10:00'` + 2880 | `{'10:00', 2}` |
  | `'24:00'` + 0 | `{'00:00', 1}` |
  | a non-integer delta | RangeError |
- **`isTime`** agrees with `toMinutes` validity for every case above, including the `endOfDay` option.

`dates.calendar.test.ts`:
- **`isISODate`:**
  - accepts `'2028-02-29'`, `'1900-01-01'` and `'2999-12-31'`
  - rejects `'2026-02-29'`, `'2026-02-30'`, `'2026-13-01'`, `'2026-1-1'`, `'26-01-01'`, `'0026-01-01'`, `'1899-12-31'`, `'3000-01-01'`, `'2026-01-01T00:00'` and `''`
- **`addDays`:**
  | Input | Result |
  |---|---|
  | 2026-01-31 + 1 | 2026-02-01 |
  | 2028-02-28 + 1 | 2028-02-29 |
  | 2026-12-31 + 1 | 2027-01-01 |
  | 2026-03-08 + 1 | 2026-03-09 (the process zone has DST) |
  | 2026-11-01 − 1 | 2026-10-31 |
  | + 0 | the same date |
  | + 365 | one year later |

  RangeError for: an invalid date, 1.5 days, `'2999-12-31'` + 1, `'1900-01-01'` − 1, and + 1e9.
- **`diffDays`:** `('2027-01-01', '2026-12-31')` → 1, and it is the inverse of `addDays`.
- **`dayOfWeek`:** 2026-09-29 → 2, 2027-01-01 → 5.
- **`weekRange('2026-09-29', …)`:**
  | weekStart | Range |
  |---|---|
  | 1 | 2026-09-28 to 2026-10-04 |
  | 0 | 2026-09-27 to 2026-10-03 |
  | 6 | 2026-09-26 to 2026-10-02 |

  Also:
  - `('2027-01-01', 1)` → 2026-12-28 to 2027-01-03, across the year boundary
  - a date that is itself the week start returns itself as `start`
  - `days` has length 7 and holds consecutive dates
  - `toWeekStart(7)` and `toWeekStart(1.5)` → RangeError
  - `startOfWeek` agrees with `weekRange`

`dates.format.test.ts`:
- **`formatTime`:**
  | Minutes | `24h` | `12h` |
  |---|---|---|
  | 570 | `'09:30'` | `'9:30 AM'` (plain ASCII space) |
  | 0 | `'00:00'` | `'12:00 AM'` |
  | 720 | | `'12:00 PM'` |
  | 1439 | `'23:59'` | `'11:59 PM'` |
  | 1440 | `'24:00'` | `'12:00 AM'` |

  Out of range → RangeError.
- **`formatDuration`:**
  | Minutes | Result |
  |---|---|
  | 0 | `'0m'` |
  | 1 | `'1m'` |
  | 45 | `'45m'` |
  | 60 | `'1h'` |
  | 90 | `'1h 30m'` |
  | 1440 | `'24h'` |
  | 1500 | `'25h'` |
  | 2.5 | `'3m'` |
  | 90.4 | `'1h 30m'` |

  RangeError for −5, NaN and Infinity.
- **`formatDateLabel`:**
  - `'2026-09-29'` → `'Tue, 29 Sep'`
  - with the pattern `'d MMMM yyyy'` → `'29 September 2026'`
  - identical under the St_Johns process zone

`src/data/__tests__/env.test.ts`:
- a valid pair → ok
- both missing → both names listed
- whitespace, a control character, `/rest/v1`, `?x=1`, `#h` and `http://example.com` → one problem each, naming the variable
- `http://localhost:54321` → ok
- `sb_secret_…` (built at runtime) → the browser-safety problem
- `SENSITIVE_ENV_VALUE_PLACEHOLDER` and `[SENSITIVE]` → the placeholder problem
- a legacy JWT (built at runtime) → ok, but rejected with `requirePublishable`
- no message contains the value

`errors.test.ts`: every row of the §6.4 mapping, including `TimeoutError`, `AbortError`, 540, `PGRST205`, `42501`, 401 without a code, `23514` → `pg-23514`, and 500 without a code → `http-500`.

`settings-store.test.ts`. A real `createClient(url, key, { global: { fetch: stub } })`, with the stub returning:
| Stub response | Expected result |
|---|---|
| 200 `[{"id":1}]` | read `1` |
| 200 `[]` | read `null` |
| 201 | `'inserted'` |
| 409 `{code:'23505'}` | `'exists'` |
| a rejected `TypeError('Failed to fetch')` | `network` |
| a rejected `DOMException('…','AbortError')` | `timeout` |
| 540 | `paused` |
| 404 `{code:'PGRST205'}` | `schema-missing` |
| 401 `{code:'42501'}` | `permission` |
| 401 without a code | `invalid-key` |

It also asserts that the stub was called **once** per read (retries are off).

`health.test.ts` (fake store):
- not configured → `not-configured`
- offline → `error/offline`, with no store call
- row found → `connected/found`, with no insert
- missing, insert, re-read → `connected/created`
- insert `exists` → `connected/found`
- re-read empty → `error/write-not-visible`
- a store error code is passed through
- a store that throws → `error/unexpected`
- a hung store with fake timers → `error/timeout` at 12 s, and the abort signal fired
- `singleflight`: two calls share one promise, and a call after settling starts a new one

`DbStatusBadge.test.tsx` (`renderToStaticMarkup`), for every state and every error code:
- `data-testid="db-status"`, `data-state`, `role="status"` and `aria-live="polite"`
- the exact title `DB connected` for connected
- the detail copy from §6.6
- no `http` substring

`scripts/lib/__tests__/env-file.test.mjs`:
- a BOM is stripped
- UTF-16 throws
- placeholders are detected
- `updateEnvFile` keeps other keys and comments and writes no BOM and LF only
- `set` via stdin trims one newline

`scripts/checks/__tests__/leaks.test.mjs`, with fixtures built by concatenation at runtime:
- every generic pattern hits
- the allowlisted example hosts and `<ref>`-style placeholders do not
- sensitive-value matching reports the key name and never the value

`scripts/checks/__tests__/commits.test.mjs`:
- each attribution rule hits
- `feat: add generated database types` and "Claude MCP connector" feature wording do not

### 13.2 Integration tests (opt-in `npm run test:integration`; never in CI)
`tests/integration/supabase.test.ts` reads `.env.local` through the integration config. If variables are missing or are placeholders, it fails with the variable names (the WP runs require 0 skipped). The first request of the suite retries on `PGRST205` for up to 30 s (P18). Test rows are named `__test__<uuid>` and are always deleted in `afterAll`. **`settings` is never inserted into or updated, except the constraint probe (e).**
1. **(a) Grants.** For each of the 6 tables, an anon `select('*').limit(1)` returns no error.
2. **(b) CRUD.** Anon insert, select, update and delete on a `templates` row `__test__<uuid>`.
3. **(c) Trigger.** Anon inserts a `goals` row `__test__<uuid>` and reads `updated_at`. After 1.1 s it updates `title`, reads again, and `updated_at` must be later.
4. **(d) Realtime.** Anon subscribes to `postgres_changes` UPDATE on `public.goals` with the filter `id=eq.<id>`. After `SUBSCRIBED`, it updates the row every 2 s until at least one event arrives (at most 20 s; duplicates are accepted), then calls `removeAllChannels()` (F34).
5. **(e) Constraint.** An anon insert into `settings` with `{ id: 2 }` fails with code `23514`, so no row is created.
6. **(f) Secret key.** A secret-key client (Node, no browser User-Agent) counts `tasks` (≥ 0).
7. **(g) Cleanup.** The **last** test deletes this run's `__test__` rows, then asserts with a secret-key count (`title`/`name` `like '__test__%'`) that none remain in `goals` or `templates`. `afterAll` repeats the deletion as a safety net for failed runs.

### 13.3 End-to-end and manual
- **M1 (local UI).** `npm run dev`: the page shows "Structured", `DB connected` and "Check again", and the button re-runs the check without the badge flashing. Stop the server.
- **M2 (write proof).**
  1. Delete the settings row with a one-off Node command using the secret key (`process.loadEnvFile('.env.local')` and supabase-js; not a committed script).
  2. Load the page in the owner's Chrome. It shows `Settings row created`, and after a reload `Settings row found`.
  3. `node scripts/supabase.mjs settings` shows `timezone` equal to Chrome's zone.

  Headless browsers must not set another `timezoneId` when they create this row. Any test that deletes the row must leave it recreated by a real browser on the owner's machine (F7).
- **M3 (unconfigured build).** In Git Bash, run `VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= npx vite build --outDir "$SCRATCH/dist-unconf" && npx vite preview --outDir "$SCRATCH/dist-unconf" --strictPort`. Empty process values override `.env.local`; confirm this and record it. The page shows `Database not configured` and the console has no exception. `.env.local` is never renamed.
- **Production-guard check.** `REQUIRE_SUPABASE_ENV=1 VITE_SUPABASE_URL= npx vite build --outDir "$SCRATCH/x"` exits 1 with a names-only message.
- **E1 to E4 (production HTTP).** Run `node scripts/ci/smoke.mjs` with `PROD_URL`, `EXPECTED_SHA` and `SUPABASE_ENV_FILE` (AC 23), plus `--expect-protected` (AC 26). It never prints the URL.
- **E5 (production browser).** Open the production URL (from `.env.local`) in Chrome (Claude in Chrome tools, or manually). Read `[data-testid=db-status-title]`: it must be `DB connected`. Repeat M2 against production. Screenshots, if any, never show the address bar and are not committed.
- **E6 (Ship stage).** The `Deploy` run on `main` is green, including the smoke check with the SHA match and the DB probe. Its log passes `check:leaks --stdin`. The browser shows `DB connected` after that CI deploy (F1).

### 13.4 Static checks
- actionlint on both workflows
- `check-jsonschema` on the automation files
- `tsc -b`
- type-aware ESLint
- Prettier
- `npm run check` (hygiene, leaks, commits, core)
- the Supabase advisors in the dashboard (expected: only "RLS policy always true")

---

## 14. Risks and mitigations

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R1 | TypeScript 7 is `latest` and typescript-eslint rejects it | High / High | Pin `~6.0.3`. Dependabot ignores TS majors. |
| R2 | shadcn CLI behaviour changes (base, presets, prompts) | Medium / Medium | Pinned `shadcn@4.21.0` with explicit flags and stdin from `/dev/null`. Record the command. |
| R3 | Data API grants are missing, so every call returns 42501 | High without the fix / High | Explicit grants in 0001, the all-tables integration test and the new-table checklist. |
| R4 | The Supabase free-project limit is reached, or the bootstrap is re-run | Medium / High | Idempotent `setup-supabase.mjs` and a blocker at the limit. Never touch other projects. |
| R5 | Production ships without Supabase config (Secret placeholder, deleted var) | Medium / High | The vite build guard, the exact-value bundle check, the smoke DB probe and `VITE_*` stored as Config. |
| R6 | A stray Vercel project or Git auto-connect (bot comments, URLs) | Medium / High | Link only to an existing project (inspect first, `--team`, a name-based count: exactly one `$VERCEL_PROJECT_NAME` and one `structured-*`), `git disconnect` plus verify, and `git.deploymentEnabled: false`. |
| R7 | CI logs leak the URL or project name | Medium / High | CLI output to files, redacted failure tails, masks for host, label, projectName and Supabase values, and the log scan (AC 36) over every run. |
| R8 | `deploy.yml` first runs at Ship and fails | Medium / Medium | The same `deploy-prod.sh` ran locally, plus the clean-clone env-var rehearsal, actionlint and the secrets pre-check. Fix forward with a PR (§17.2). |
| R9 | Standard Protection also blocks the production domain | Low / High | Verified by unauthenticated requests (AC 26). If the domain is protected, switch to `protection disable --sso`, as the task requires production to be public, and record it. |
| R10 | CodeQL default setup is refused while `main` holds only Markdown | Medium / Low | Retry right after the Ship merge, recorded in HANDOFF and the PR body. `codeql.yml` only if the feature is unavailable. |
| R11 | The required check name does not match, so the ruleset blocks Ship | Low / High | Apply the ruleset only after `gh pr checks` shows `ci-verify`. Integration 15368, strict off. The JSON is in the repo and applied idempotently. |
| R12 | Windows specifics (`cmd.exe` scripts, CRLF, TZ stripping, MSYS path conversion, BOM files, `vercel build` on Windows) | Medium / Medium | Node wrapper scripts, `.gitattributes` plus `check:hygiene`, TZ set in the vitest config, `MSYS_NO_PATHCONV`, CLAUDE.md rules and a remote-build fallback. |
| R13 | Lockfile portability (native bindings; Dependabot on Linux drops entries; npm 11.17 vs 11.19) | Medium / Medium | `check:hygiene` lockfile natives in every CI run. If CI `npm ci` reports the lockfile out of sync, regenerate the lockfile and record it; open question 6 covers Node 24 locally. |
| R14 | `TZDate` ambiguity errors (Chatham, Lord Howe) reach alert times later | Medium / Medium | `tzOffset`-based resolution with explicit tests. |
| R15 | Secrets reach committed docs or reports | Medium / High | `check:leaks` locally and in CI, runtime-built fixtures, masking rules and GitHub push protection. |
| R16 | Integration tests damage real data or seed the wrong zone | Low / Medium | `__test__` rows only, `settings` never written, cleanup verified (AC 16g), AC 19. |
| R17 | AI attribution slips in through a tool default | Medium / Critical | `check:commits` in `ci-verify` (blocks merge) and before every `gh` text write. Open question 2 (harness setting). |
| R18 | GPG signing fails non-interactively, or commits show "Unverified" | Medium / Medium | Stop with a blocker, never bypass. Open question 1. |
| R19 | The wrong `gh` account is active | Low / High | The opening ritual checks the login. |
| R20 | The Supabase project pauses between sessions | Medium / Medium | `db:ping` in the opening ritual, the smoke DB probe, 540 → `paused` in the UI, the HANDOFF runbook. |
| R21 | The realtime test is flaky | Medium / Low | Resend loop up to 20 s, never in CI. |
| R22 | A Dependabot PR can never merge: its body quotes third-party trailers, or its Linux lockfile drops native entries (the ruleset has no bypass actors) | Medium / Medium | Bot PR title and body are not scanned, while commits and authors are (D0-17). Documented fix paths in §10.3 and `CLAUDE.md`: regenerate the lockfile on Windows, or close the PR and bump by hand. |
| R23 | Supabase CLI 2.118 agent auto-detection or output-shape drift (array vs envelope) breaks the bootstrap | Medium / Medium | `--agent no` on every call, a shape normaliser, a read-only `--output-format json` retry, and `projects create` run once with a re-list fallback (§8.4, §2.2 item 13). |
| R24 | Phase 1 never seeds the default anchor tasks, because Phase 0 already created the `settings` row | High (if unnoticed) / Low | Forward notes in `CLAUDE.md` data conventions and HANDOFF "Next" (WP2, WP9). No Phase 0 code change. |
| R25 | Phase 2 TypeScript in `server/`/`api/` fails type-aware lint, or Vercel functions cannot resolve `src/core`'s `.ts` imports | Medium / Medium | `CLAUDE.md` tsconfig rule. The HANDOFF "Next" tells Phase 2 to verify function bundling early. |
| R26 | A best-effort item (§0.1) stalls the phase | Medium / Low | Time box of about 30 minutes, deferral recorded in DEVLOG and HANDOFF, and a named substitute for each dependent AC bullet. |

---

## 15. Edge-case coverage

Every id from `edge-cases-functional.md` and `edge-cases-platform.md`.

| Id | Handling |
|---|---|
| F1 | Implemented: §6.2 placeholder rejection; §5.6 production build guard (D0-28); §8.10 exact-value bundle check (bare-literal grep rejected: supabase-js contains the literals, §2.2 item 8); §8.11 DB probe; §5.11 `VITE_*` as Config and checked in WP7; §17 step 7 browser check after the CI deploy; CLAUDE.md "never read the secret key at build time". Tests: AC 21, 23, 27; E6. |
| F2 | Implemented: `build-sha` meta (D0-26), SHA-matching smoke with retries, DB probe, `PROD_URL` whitespace trimmed (§8.11, deploy.yml). AC 23. |
| F3 | Stale-head guard, token check and loud CLI-install failure in deploy.yml and `deploy-prod.sh` (WP7, AC 29). **Automatic rollback rejected:** a Vercel rollback turns off production auto-assignment (verified in the docs), so later deploys would silently not go live. Replaced by a red run plus the one-command rollback runbook (§17.2, D0-25). |
| F4 | Rewrite source excludes `api` (with or without a slash) and `assets/` (D0-31). Smoke asserts 404s (AC 23). The `vite:preloadError` reload is **deferred to Phase 1** (no lazy routes exist yet). |
| F5 | `scripts/setup-supabase.mjs` check-then-act: reuse, never regenerate the password, persist immediately, re-list after errors, atomic `.env.local` writes (§8.4, WP5). |
| F6 | Alphanumeric 32-character password via `crypto.randomInt`, and the `--db-password=`/`--password=` forms (§8.3, §8.4). |
| F7 | Integration tests never write `settings`; trigger and realtime tests use `__test__` goals with the anon client (§13.2). AC 19 checks the zone equals the browser's; M2 rule for headless tests; CLAUDE.md data conventions (WP2). |
| F8 | `errors.ts` mapping of returned `{status, error}`, `.maybeSingle()`, `.retry(false)`, codes only (D0-30). Tests use a real `createClient` with stubbed fetch (§13.1 `settings-store.test.ts`). |
| F9 | Fixed copy per code with the code in monospace (§6.6). Unit test for every code (AC 20). |
| F10 | `navigator.onLine` short-circuit, one shared 12 s `AbortController` deadline, retries off (§6.4). **Auto re-check on `online`/`pageshow`/`visibilitychange` deferred to Phase 1**, where TanStack Query's refetch-on-reconnect and refetch-on-focus replace this diagnostic page. |
| F11 | Singleflight `startDbCheck`, async starter, `RootErrorBoundary` (§6.4, §6.6). Test: `health.test.ts` singleflight; M2 deterministic in dev. |
| F12 | `startTransition` with a disabled, `aria-busy` button; `role="status"` and `aria-live="polite"`; text plus icon; `min-h-11`; `lang="en"`; `color-scheme` light; `motion-safe:` spinner (§5.9, §6.6). AC 22. |
| F13 | `scripts/lib/env-file.mjs` (UTF-16 rejected, BOM stripped, loud failures); `readSupabaseEnv` whitespace, control-character and path checks; CLAUDE.md PowerShell rule; `.env.example` note. Tests: env-file and env unit tests, AC 18. |
| F14 | `test.env` blanks the `VITE_*` values, a fetch-stub setup file, and the badge rendered via `renderToStaticMarkup` in the node environment (§5.7). M3 via empty process env, not renaming `.env.local`. AC 13. |
| F15 | Explicit `now` in every test; fake timers for the one default test; ESLint clock rule for all of `src/**` except `dates.ts` (§5.8). |
| F16 | `toMinutes` accepts `HH:mm:ss(.f)`; `{ endOfDay }` for `24:00`; `formatTime(1440)` gives `'24:00'`; `addMinutesToTime('24:00', 0)` gives the next day (§6.1). Tests §13.1. |
| F17 | Supported range 1900-01-01 to 2999-12-31 in `isISODate`/`parseISODate`/`addDays` (§6.1). Tests §13.1. |
| F18 | Santiago and Lord Howe rows; `startOfDayInstant`, `msUntilNextDayIn`; the wall-clock note in the file header (§6.1, §13.1). |
| F19 | `formatTime` built by hand; `formatDateLabel` via date-fns en-US without Intl; `formatDuration` takes finite ≥ 0, rounded, unbounded (§6.1). Tests §13.1. |
| F20 | Offset zones rejected, `normalizeTimeZone` added and used by `detectTimeZone`; tests never assert one canonical spelling. **`sameTimeZone` deferred to Phase 1** (its only consumer is the device-zone banner, whose equality semantics are a Phase 1 product decision). |
| F21 | HANDOFF "Find the live branch", time plus zone in "Last updated", post-Ship HANDOFF written before merge (pipeline Ship step 1 and §17 step 3) (WP9). |
| F22 | HANDOFF Vercel steps: inspect before link, `--team`, abort on create, `git disconnect` plus verify, find the name with `project ls` (WP9). |
| F23 | `leaks.mjs` uses the explicit key list and ignores `VERCEL_*`, `TURBO_*` and `NX_*`; the rehearsal compares app keys only; CLAUDE.md "sync a new local-only key before anyone pulls" (§8.6, WP9). |
| F24 | `sync-vercel-env.mjs` diffs first, and `--apply` never overwrites (§8.5). `--force` is best effort (§0.1); if deferred, an overwrite is a deliberate manual `env rm` plus `--apply`, so the protection holds either way. "Development env is the source of truth" (CLAUDE.md); "Returning to an existing clone" steps (HANDOFF). |
| F25 | HANDOFF sets `user.name` and `user.email` on new machines (an owner action). Not changed in-session, because CLAUDE.md forbids changing the git identity. |
| F26 | `check:hygiene` requires win32, linux and darwin-arm64 entries for every native family (§8.7). **CI portability matrix rejected for now**: lockfile completeness covers the realistic failure; revisit if the owner's second device is macOS and hits a platform bug. |
| F27 | 540 mapped to `paused` (UI copy), `npm run db:ping`, the smoke DB probe, HANDOFF Recovery. **Keep-alive deferred to Phase 3** (backup workflow); open question 8. |
| F28 | Region fixed at ap-south-1 by the granted permissions (a Supabase project's region cannot be changed later, so the plan never deviates from the grant; open question 7 was withdrawn in r1); `vercel.json` `regions: ["bom1"]` (D0-27). The Dependabot time zone is cosmetic (kept Asia/Kolkata). |
| F29 | `notify pgrst` in 0001; the new-table checklist in CLAUDE.md; integration test (a) over all tables (AC 16). |
| F30 | **Rejected in favour of P21:** sequential hand-made `NNNN_name.sql`, never `supabase migration new` (D0-8). Both avoid the out-of-order failure; the sequential scheme matches PLAN §6. |
| F31 | `db:types` plus `git diff --exit-code` in the WP5 verification, AC 17 and the CLAUDE.md migration ritual. |
| F32 | `settings` checks (D0-21, §7). **`day_end ≤ day_start` semantics and `dayWindowMinutes` deferred to Phase 1** (the settings page design decides). |
| F33 | `day_notes.updated_at` plus trigger (D0-22); optimistic concurrency and realtime conventions in CLAUDE.md (WP2). |
| F34 | The realtime test resends every 2 s for up to 20 s and accepts duplicates (§13.2); Phase 1 realtime rules in CLAUDE.md. |
| F35 | `src/core` uses relative `.ts` imports only; the `@/` ban and dynamic-import ban in ESLint; `check:core` in CI; negative lint tests (D0-23, AC 9, 10). |
| F36 | §17 step 2 merges `origin/main` if it moved; "no path filters on ci.yml" in CLAUDE.md and in `check:hygiene` (that check is best effort, §0.1; the CLAUDE.md rule is not). |
| F37 | The pipeline reuses the issue and PR (§0); the ruleset GET-then-PUT/POST (§9.5); IDs recorded in HANDOFF; the tracking-issue edit toggles one line (closing ritual). |
| P1 | `check:commits` in `ci-verify` (blocks merge) plus `--text-file` before every `gh` text write (§8.8, WP3). The titles and bodies of bot-authored PRs are skipped, because they quote third-party text, while their commits and authors are still checked (D0-17). Templates pass the §10.4 template word check (AC 33). The Ship PR body and release notes pass the PR-text word check (AC 37, §17.1). Committing `.claude/settings.json` with `attribution` needs **owner approval** (open question 2); not done in this phase. |
| P2 | Open question 1; never `--no-gpg-sign`; stop on a signing failure (§9.1); no `required_signatures` rule. The Ship merge commit is signed by GitHub. |
| P3 | Opening ritual `gh api user --jq .login`; HANDOFF expected account. |
| P4 | HANDOFF sets name and e-mail per clone; `check:commits` author allowlist that never prints e-mails (§8.8). |
| P5 | CLAUDE.md rule (WP2); `check:hygiene` BOM, UTF-8 and CR checks; `db:types` writes through Node; `.editorconfig` utf-8. |
| P6 | `MSYS_NO_PATHCONV=1` for `vercel api`; `gh api` without a leading slash; TZ set inside the vitest config; CLAUDE.md rules. |
| P7 | `strictPort` for dev and preview; `taskkill /T /F`; port checks in both rituals. |
| P8 | `git mv -f` rule in CLAUDE.md; `forceConsistentCasingInFileNames`. |
| P9 | Explicit secret-file deletion and a `test ! -e` assertion for both rehearsal clones (§9.4, WP9). |
| P10 | Fact corrected (§2.1); `check:hygiene` lockfile natives including `@supabase/cli-`; never omit optional dependencies; CI download cost accepted. A Dependabot lockfile that drops natives is fixed by regenerating it on Windows and pushing to the Dependabot branch (§10.3, CLAUDE.md). |
| P11 | CI Node 24 is authoritative for `npm ci`; R13 fallback; open question 6 (Node 24 locally via fnm). |
| P12 | **Accepted:** `shadcn` stays a devDependency (its CSS import is needed; `npx shadcn add` uses the pinned CLI). Vendoring the CSS rejected as churn for no runtime gain. |
| P13 | Exactly `vercel@61.1.0` everywhere; `check:hygiene` pin consistency (D0-24; best effort, §0.1, with the WP7 grep as substitute). 61.1.0 shipped the day after research, which proves the risk. |
| P14 | Same as F14. |
| P15 | `@source not` for `docs`, `PLAN.md` and `.claude` (§5.9). |
| P16 | Placeholders are never empty files; the AC 7 grep excludes `i/none`. |
| P17 | `setup-supabase.mjs` (list first, adopt or resume, limit blocker, re-list after errors). One project currently active, verified. |
| P18 | `api-keys` retried for 5 min; `push` retried on connection or tenant errors; `notify pgrst`; the integration suite retries `PGRST205` for 30 s. |
| P19 | `=` flag forms, alphanumeric password, output captured in memory and parsed (`-o json`, bare array or envelope via the normaliser), `--yes`, `--agent no`, stdin ignored; `projects create` run once; raw output never printed (§8.4, §2.2 item 13). |
| P20 | Never `--skip-pooler`; HANDOFF troubleshooting line; no Docker-only commands (§9.2). |
| P21 | D0-8 naming rule plus the grants checklist in CLAUDE.md; all-tables integration test. |
| P22 | `db:ping` in the opening ritual; the smoke DB probe; keep-alive deferred (see F27). |
| P23 | Same as F28. |
| P24 | `VERCEL_INSTALL_COMPLETED=1` (verified in the 61.1.0 source); the token is unset before the build; `git diff --exit-code package-lock.json` after the local build; secrets are step-scoped. |
| P25 | Same as F1. |
| P26 | Standard Protection (D0-14), verified with the protection JSON and an unauthenticated production 200; the deployment-URL 401/30x probe is best effort (§0.1) (AC 26); R9 fallback. |
| P27 | Inspect before link, `project add` only when missing, `--team`, `project.json` check, a name-based project count (exactly one `$VERCEL_PROJECT_NAME`, one `structured-*`), disconnect plus inspect (§9.3); the local deploy refuses to run unlinked (§8.10); repeated in the HANDOFF steps. |
| P28 | `env:check` is subset-based and rejects placeholders; `readSupabaseEnv` rejects placeholders; the scripts fail on placeholders with the Config advice. |
| P29 | `scripts/lib/vercel.mjs` (shell command string with validated tokens, values on stdin without a newline, JSON outputs parsed into names only). |
| P30 | Same as F4. |
| P31 | robots.txt allow-all plus the noindex header and meta (D0-15). |
| P32 | Job guard `github.ref == 'refs/heads/main'`, verify step before build; "Dependabot merges deploy" in CLAUDE.md (§10.2). |
| P33 | Same as F2 (build SHA). |
| P34 | `projectName` masked from `.vercel/project.json`; `redact-log.sh` project-name and scope patterns; AC 36 scans the logs of every run including failed ones. |
| P35 | `check-jsonschema` locally in WP3 (AC 33); §17 steps 9 and 10 verify Dependabot, issue forms and badge after merge. |
| P36 | Job name `ci-verify`; no path filters (checked by `check:hygiene`, best effort, §0.1); CLAUDE.md "never `[skip ci]`, never reuse the name"; a renamed job would leave the required check pending, which is visible before any merge. |
| P37 | Same as F37. |
| P38 | HANDOFF `gh auth refresh -s workflow` plus a scope check; §9.1 precondition. |
| P39 | Explicit key list; `fetch-depth: 0` range scans; new patterns (Supabase hosts on `.co` and `.in`, `postgres.<ref>`, `prj_`, `team_`); `git ls-files -z` (§8.6). |
| P40 | Runtime-built fixtures; the fake-leak test only on a scratch file via `--files`; CLAUDE.md "never paste key-shaped strings". |
| P41 | Leak-response runbook (§17.3, HANDOFF); non-provider secret-scanning patterns are open question 5 (not a granted permission). |
| P42 | HANDOFF clones the live branch directly, single-quoted helper, Git Bash, verification lines; the WP9 rehearsal follows it literally (AC 35). |
| P43 | HANDOFF fnm or nvm-windows commands, execution-policy note, logins as owner actions with token alternatives. |
| P44 | Session-start ritual (CLAUDE.md, opening ritual); never force-push. |

---

## 16. Open questions for the owner (non-blocking; asked in the phase report)
1. **Commit signing.** Global config signs commits with a key GitHub cannot verify, so every commit and local tag shows "Unverified". Options:
   - (a) add your personal e-mail as a UID and upload the public key to GitHub
   - (b) create a personal signing key
   - (c) approve repo-local `commit.gpgsign=false` / `tag.gpgsign=false`

   Nothing is changed without your say.
2. **Harness guard.** May we commit `.claude/settings.json` with `{"attribution": {"commit": "", "pr": ""}}`, so every device's Claude Code sessions default to no attribution? CI enforcement (`check:commits`) is in place either way.
3. **License.** The repo is public but has no LICENSE, so all rights are reserved. Do you want MIT, or to keep it unlicensed?
4. **Dependabot security updates** are disabled. Enable them? This is not in this phase's permissions.
5. **Non-provider secret-scanning patterns** (they catch generic secrets such as the DB password) are disabled. Enable them? This is not in this phase's permissions.
6. **Local Node 24** via fnm, to match CI and Vercel exactly? Otherwise keep Node 26 and accept the engines warning.
7. *(Withdrawn in r1.)* The Supabase region is fixed to **ap-south-1** by the permissions granted for this phase, and WP5 uses exactly that. It is not an open question. It cannot move to the credentials preflight either, because the preflight checks are fixed in `pipeline-args.json` (frozen by AC 3) and are read-only. The number is kept so that references to question 8 stay valid.
8. **Keep-alive before Phase 3.** The free project pauses after 7 idle days. Pull a tiny scheduled ping forward from Phase 3? It needs one more GitHub secret, and GitHub disables schedules after 60 days without repo activity.

---

## 17. Ship stage and runbooks

### 17.1 Ship checklist (release engineer; after final verification)
1. `gh secret list` shows `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` and `PROD_URL` (names only). `gh api user --jq .login` prints `karthi-ai-engineer`.
2. If `main` moved: `git fetch origin && git merge-base --is-ancestor origin/main HEAD`. If that fails, `git merge origin/main`, push, and wait for `ci-verify` (F36).
3. `HANDOFF.md` on the branch states the **post-Ship** state before the merge:
   - Phase 0 shipped as `v0.0.1`
   - next is Phase 1 on `phase-1-web-mvp` with the team workflow
   - post-merge follow-ups (CodeQL if deferred)
   - the forward notes from WP9 (Phase 1 seeding trigger, Phase 2 early checks, deferred best-effort items)

   Commit and push (F21).
4. **PR body:** summary, links to `docs/phases/phase-0/PLAN.md` and `VERIFICATION*.md`, the acceptance criteria as a ticked checklist, `Closes #<issue>`, and post-merge follow-ups.
   - The checklist uses each AC's number and its §12 title only. The titles are neutral; AC 37 is "Attribution and authorship checks pass".
   - The summary describes the delivered work only, with no AI, Claude, Anthropic or LLM wording.
   - **Before** `gh pr edit`, run `check:commits --text-file` and the §10.4 **PR-text** word check on the body file. Both must be clean.

   Then `gh pr ready` and `gh pr checks --watch` (all green).
5. `gh pr merge <n> --merge --delete-branch` (merge commit; default message).
6. Watch `Deploy` on `main` (`gh run watch`). It must be green, including the smoke check with the SHA match and the DB probe. Then scan its log: `gh run view <id> --log | node scripts/checks/leaks.mjs --stdin`.
7. Open production in a browser (URL from `.env.local`): `DB connected` after the **CI** deploy (F1).
8. If CodeQL default setup was deferred, run the §9.5 PATCH now and confirm `configured`.
9. Confirm that the issue forms are on `main` (`gh api repos/karthi-ai-engineer/Structured/contents/.github/ISSUE_TEMPLATE --jq '.[].name'`) and that the README badge renders a status.
10. Confirm Dependabot parsed its config (Insights → Dependency graph → Dependabot shows no config error), or record it as a follow-up.
11. Tag and release `v0.0.1` titled `v0.0.1: Phase 0: Foundation`. The notes list the delivered work, with no URLs and no AI mentions. First run `check:commits --text-file` and the §10.4 PR-text word check on the notes file; both must be clean. A local annotated tag is signed per the global git config (open question 1).
12. `git switch main && git pull`.

### 17.2 Production rollback (runbook)
1. If a deploy broke production, run `npx --yes vercel@61.1.0 rollback --yes --scope <team>`. Hobby rolls back to the previous production deployment.
2. A rollback **turns off auto-assignment of production domains**. Fix forward through a PR, and let `Deploy` run: its smoke SHA check fails while production stays on the rolled-back deployment, which is expected.
3. Promote the fixed deployment: `npx --yes vercel@61.1.0 ls --prod --scope <team>`, then `promote <that deployment> --yes`. Local output only; never paste it anywhere.
4. Re-run `Deploy` (`workflow_dispatch` on `main`) and confirm it is green.

### 17.3 Leak response (runbook)
If a secret, URL or the project name reaches a pushed commit, a PR, an issue or a public log:
1. **Rotate** what leaked:
   - Supabase keys: the dashboard, API Keys
   - DB password: the dashboard, Database, Reset
   - Vercel token: Account, Tokens
   - project name or URL: create a new Vercel project with a new secret name, then relink
2. Update `.env.local` (with `env-file.mjs set`).
3. `npm run env:sync-vercel -- --apply --force`. If `--force` was deferred (§0.1), first run `npx --yes vercel@61.1.0 env rm <NAME> <target> --yes` for each rotated key, then `npm run env:sync-vercel -- --apply`.
4. Redeploy (`Deploy` dispatch).
5. Update the affected GitHub secrets.
6. Record the rotation in `DEVLOG.md` without values.

History cannot be rewritten on `main` (ruleset), and GitHub keeps PR views, so **rotation is the fix**. The publishable key and URL are baked into the bundle, so rotating them needs a rebuild.

### 17.4 Paused database (runbook)
`npm run db:ping` prints `PAUSED (540)`, or the app shows the paused message:
1. Supabase dashboard → project `structured` → Restore.
2. Wait for "healthy".
3. Run `npm run db:ping` and `npm run db:migrations`.

Data is kept.

---

## Revision r1 (2026-09-30, answers `review-r1.md`)

### Blocking issue B1: fixed
1. **The PR template no longer mentions AI.** The §10.4 checklist item reads "Commit and PR text pass `npm run check:commits -- --text-file <body>`".
2. **AC 37 is retitled** "Attribution and authorship checks pass". Every §12 title was checked: none contains AI, Claude, Anthropic or LLM. §17.1 step 4 now lists ACs by number and title only.
3. **Template word check** added to WP3 verification and AC 33, with the exact command from the review. The `bug_report.yml` platform options are fixed to `Web`, `Android` and `MCP server`.
4. **Ship PR body and release notes** (§17.1 steps 4 and 11, WP9 step 5) get a **PR-text word check**. It strips the owner handle `karthi-ai-engineer` and the file name `CLAUDE.md` before the same grep. These two tokens are whole words for `grep -w` (hyphen and dot are boundaries), so the raw grep would have false-alarmed on a legitimate Ship body. Verified on sample text: the raw grep gives 2 false positives, the stripped form gives 0 and still catches real mentions. The templates keep the review's exact grep and must not contain either token.
5. The `ci.yml` step is renamed "Commit and PR text checks (attribution trailers, author e-mail)", a neutral name in public check logs.

### Should-fix items
- **S1 (adopted).** `ci.yml` passes empty `PR_TITLE`/`PR_BODY` when `github.event.pull_request.user.type == 'Bot'`. Commit-message and author checks still run for everyone.
  - Recorded in D0-17, §8.8, §10.1, AC 33 and new risk R22.
  - The Dependabot fix paths are documented in §10.3 and `CLAUDE.md` (WP9): regenerate the lockfile on Windows and push to the Dependabot branch. A commit-message hit means closing the PR and bumping by hand.
- **S2 (adopted: dropped).** Open question 7 is withdrawn; the number is kept so the reference to question 8 stays valid. Moving it to the credentials preflight is not possible, because those checks are fixed in `pipeline-args.json` (frozen by AC 3) and are read-only. F28 is updated.
- **S3 (adopted).** Forward note in the `CLAUDE.md` data conventions (WP2) and in HANDOFF "Next" (WP9, §17.1 step 3). Phase 1 must seed on another trigger than "no settings row", for example a `settings.seeded_at` marker. New risk R24.
- **S4 (adopted, with one safety change).** Verified today with read-only calls (shapes and key names only):
  - `--agent auto|yes|no` exists, and `--agent no` is passed on every CLI call.
  - `-o json` returns a bare array.
  - `--output-format json` returns an envelope (`{ projects|organizations, message }`).

  §8.4 normalises both shapes and retries a **read-only** call once with `--output-format json`. **`projects create` is never re-run with another flag:** a second create could make a second project or fail on the duplicate name, so an unparsable create output goes straight to the planned re-list. See §2.2 item 13 and R23.
- **S5 (adopted).** §9.3 step 1, AC 25, WP7, R6 and P27 now count projects by name (`project ls --filter structured- --limit 100 --format json`). Exactly one must be named `$VERCEL_PROJECT_NAME` and exactly one must start with `structured-`; other team projects are ignored.
- **S6 (adopted).** `CLAUDE.md` Architecture (WP2): new top-level TS folders need a tsconfig referenced from `tsconfig.json`. HANDOFF "Next" (WP9): Phase 2 verifies early that Vercel function bundling resolves `src/core`'s `.ts` imports. New risk R25.

### Simplicity (adopted)
New §0.1 lists three best-effort items. Each has a 30-minute time box, a DEVLOG/HANDOFF deferral record and a named substitute for its AC bullet (new risk R26):
- `sync-vercel-env --force` and the preview API fallback
- the `--expect-protected` probe
- the `check:hygiene` pins and workflow invariants

Updated to match: §8.5, §8.7, §8.11, §9.3, WP7, AC 26, §17.3, and F24, F36, P13, P26 and P36. Still mandatory: leak and attribution checks, `deploy-prod.sh` with the smoke check, and the resume rehearsal. Preview `VITE_*` values stay mandatory (deliverable 7) even if the scripted fallback is deferred.

### Minor items
- **Prettier.** New §0 rule and §10 note: run `npm run format` after writing any "exact" file; its changes are not deviations. The step is added to WP3, WP7 and WP8.
- **TS 6 `strict` default** noted in §5.5. The explicit setting is kept for AC 5.
- **shadcn `cn` package** noted in §2.1. `@fontsource-variable/geist` moves to devDependencies (§5.4).
- **`vercel api` scoping.** Verified today that `--scope` accepts the team ID for `vercel api` and `project ls`. §9.3 step 5 passes `--scope "$OID"`; the `inspect` fallback is kept.
- **Latent bug found while revising.** The §8.5 preview fallback used `…/env?upsert=true`, which the §8.2 argument check (no `?`) would reject. The endpoint now has no query string: only missing rows are added, so no upsert is needed. It uses `--scope` from `orgId`.

### Unchanged
Scope, the file tree, the migration, the `dates.ts` API and tests, the deploy script and workflows (except the `ci.yml` commit-check step), and all other decisions and ACs. The edge-case table still covers every one of F1 to F37 and P1 to P44.
