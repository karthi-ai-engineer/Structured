# Phase 0: edge cases, functional / data / UX lens

| | |
|---|---|
| Phase | 0 (Foundation) |
| Input | `docs/phases/phase-0/plan-v1.md`, `PLAN.md` §5–§8, §10.3, §12–§14, `CLAUDE.md`, `HANDOFF.md` |
| Lens | Functional, data and UX: time zones and DST, empty/malformed data, invalid input, two devices, realtime ordering, slow/offline network, idempotency and retries, failure UX, mobile vs desktop, accessibility, and what later phases depend on |
| Written | 2026-09-29 |
| IDs | `F1`… are stable. Severity: **critical** (breaks "Done when" or silently ships a broken/unsafe state), **major** (real failure likely in this or the next phase), **minor** (cheap hardening or a latent trap) |

> Public repo. This file contains no secret values, no app URLs, no Vercel project name and no Supabase ref.

## How the findings were checked

Claims marked **(probed)** were run in the session scratchpad on this machine, not taken from memory:

- Node 26.3.1, ICU 78.3, tzdata 2026b; `date-fns` 4.4.0, `@date-fns/tz` 1.5.0; `@supabase/supabase-js` / `@supabase/postgrest-js` 2.117.2 (with a stubbed `global.fetch`).
- The machine's Windows zone is **JST (UTC+9)**, not IST. Git Bash and PowerShell both report it.
- The repo's commits resolve to the owner's GitHub login (the commit email is linked). The repo-local git config sets `user.email` only; `user.name` comes from the global config.
- `actions/checkout` latest is v7.0.1 and `actions/setup-node` latest is v7.0.0, so the `@v7` pins exist.

Web sources are listed at the end.

---

## Summary

| ID | Sev | Title | Where |
|---|---|---|---|
| F1 | critical | Production can ship "Database not configured" while Deploy stays green | WP7, deploy.yml |
| F5 | critical | Supabase bootstrap is not idempotent (new password or second project on re-run) | WP5, §8.2 |
| F2 | major | Smoke check does not prove the new commit is live or that the DB answers | deploy.yml |
| F3 | major | No rollback after a failed smoke check; re-running an old Deploy reverts production | deploy.yml |
| F4 | major | SPA rewrite serves HTML for missing `/assets/*`, so open tabs white-screen after a deploy | vercel.json |
| F7 | major | Integration tests mutate the only DB and can seed `settings.timezone = 'UTC'` for good | WP5, §12.2 |
| F8 | major | Health mapping assumes thrown errors; supabase-js 2.117 returns them (and retries) | §6.4 |
| F13 | major | `.env.local` encoding and value whitespace break scripts or prod silently (Windows) | scripts, env.ts |
| F16 | major | `toMinutes` rejects values Postgres returns (`24:00:00`, fractional seconds) | dates.ts |
| F21 | major | HANDOFF on `main` goes stale; the live HANDOFF is on the phase branch | HANDOFF, Ship |
| F22 | major | Resume step `vercel link --yes` can re-enable the Git integration on a new device | HANDOFF |
| F23 | major | `vercel env pull` rewrites `.env.local`; check-leaks then fails on ordinary words | check-leaks, WP9 |
| F29 | major | Every later table needs explicit grants (and the rest of the 0001 boilerplate) | migrations |
| F35 | major | `src/core` must be importable by Vercel functions without the `@/` alias | eslint, core |
| F6 | minor | Generated DB password can start with `-` and be parsed as a flag | §8.2 |
| F9 | minor | Error states give the user nothing actionable | DbStatusBadge |
| F10 | minor | Offline: "Checking database…" hangs 7–30 s; stale "connected" after bfcache | health, App |
| F11 | minor | StrictMode makes "created" vs "found" nondeterministic in dev; no error boundary | App |
| F12 | minor | "Check again" UX and accessibility | App, badge |
| F14 | minor | Unit tests are not hermetic locally (`.env.local` leaks into `import.meta.env`) | vitest |
| F15 | minor | Tests that use the default `now` can flake around midnight or DST | tests |
| F17 | minor | `isISODate` accepts years that `Date.UTC` maps to 19xx or overflows | dates.ts |
| F18 | minor | Midnight-gap zones, 30-minute DST and "start of day" are untested | dates.ts |
| F19 | minor | Time formatting must not depend on Intl; `formatDuration` contract too strict | dates.ts |
| F20 | minor | Time-zone IDs: offset zones, aliases and canonical spelling | dates.ts |
| F24 | minor | Two devices can overwrite each other's secrets in Vercel | sync-vercel-env |
| F25 | minor | Repo-local git identity is email-only | HANDOFF |
| F26 | minor | Lockfile portability to the user's other device | WP1, CI |
| F27 | minor | Supabase pauses between phases; recovery is undocumented | HANDOFF, UI |
| F28 | minor | DB region vs the user's real location; functions default to `iad1` | WP5, vercel.json |
| F30 | minor | Migration naming will collide with CLI-generated timestamps | CLAUDE.md |
| F31 | minor | Generated DB types can drift from the database | ritual |
| F32 | minor | `settings` accepts values the app cannot handle | 0001_init.sql |
| F33 | minor | `updated_at` is server-stamped and missing on some realtime tables | data conventions |
| F34 | minor | Realtime: the integration test races the subscription (and Phase 1 will too) | §12.2, Phase 1 |
| F36 | minor | Dependabot and the phase branch drift apart before Ship | Ship, ruleset |
| F37 | minor | GitHub setup commands are not idempotent | §8.4 |

---

## A. Deploy and production correctness

### F1 (critical) Production can ship "Database not configured" while Deploy stays green
**Scenario.** `VITE_*` values are inlined at build time. In `deploy.yml`, `vercel pull` writes `.vercel/.env.production.local`.
- Any variable stored as **Sensitive** is written there as the literal string `[SENSITIVE]`, and `vercel build` injects it into the build (vercel/vercel#17514, open).
- The Vercel CLI docs say production and preview now **default to sensitive**, and a team "Enforce Sensitive Environment Variables" policy makes `--no-sensitive` silently ignored.
- A deleted or renamed variable also builds fine.

The bundle then carries `[SENSITIVE]` or `undefined` as the Supabase URL. `readSupabaseEnv` reports "not configured", yet `curl /` still returns 200, so Deploy is green. The browser check (E5) is done only after the *local* deploy in WP7, never after the Ship-stage CI deploy.

**Recommendation.**
1. After `vercel pull`, add a step `node scripts/ci/assert-build-env.mjs .vercel/.env.production.local`. It checks that `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are present, non-empty, not `[SENSITIVE]`, that the URL is `https:`, and that the key starts with `sb_publishable_`. It prints names only.
2. In `vite.config.ts`, fail the build when `process.env.VERCEL_ENV === 'production'` (set by `vercel build`) and `readSupabaseEnv` is not ok. CI `verify` has no `VERCEL_ENV`, so it still builds unconfigured by design.
3. After the build, count `sb_publishable_` occurrences in `.vercel/output/static/assets/*.js` (expect ≥ 1, print the count only).
4. WP7: check that `vercel env ls production` shows the `VITE_*` rows as Encrypted, not Sensitive.
5. Ship checklist: repeat E5 (browser shows "DB connected") after the **CI** deploy.
6. Never read `SUPABASE_SECRET_KEY` at build time. In the prebuilt flow it is `[SENSITIVE]` there, while functions still get the real value at runtime.

### F2 (major) The smoke check does not prove the new commit is live or that the DB answers
**Scenario.** The production alias keeps serving the previous deployment if alias assignment fails or lags, or if the job is re-run, so the smoke check still gets 200. A paused Supabase project (HTTP 540) or a rotated key also still gives 200 on `/`.

**Recommendation.**
- Build with `VITE_BUILD_SHA=$GITHUB_SHA` (public), render `<meta name="x-build" content="%VITE_BUILD_SHA%">` in `index.html`, and make the smoke check assert that `curl -s "$base/"` contains `$GITHUB_SHA`, with the existing retries.
- Add a DB probe from `.vercel/.env.production.local`. First `::add-mask::` the Supabase host, then run `curl -s -o /dev/null -w '%{http_code}' -H "apikey: $KEY" "$URL/rest/v1/settings?select=id&limit=1"` and expect 200. Map 540 to `::error::Supabase project is paused`.
- Normalise `PROD_URL` with `tr -d '[:space:]'` before use, so a secret edited in the web UI with a trailing space or newline still works.

### F3 (major) No rollback after a failed smoke check; re-running an old Deploy reverts production
**Scenario A.** The smoke check fails after `vercel deploy --prod`. Production already serves the bad build, and the workflow is red but nothing rolls back.

**Scenario B.** Someone presses "Re-run jobs" on a Deploy run from two merges ago (for example one that failed on an expired token, fixed later). "Re-run" uses the old SHA, so production silently goes back to old code and the smoke check passes.

**Recommendation.**
- **Stale guard.** As the first step, run `test "$GITHUB_SHA" = "$(git ls-remote https://github.com/$GITHUB_REPOSITORY refs/heads/main | cut -f1)"`. If it fails, print `::notice::Not the head of main; skipping deploy` and exit 0.
- **Rollback.** On smoke failure, run `vercel rollback --yes --token "$VERCEL_TOKEN" > "$RUNNER_TEMP/rollback.log" 2>&1` (Hobby can roll back to the previous production deployment), then fail. Alternatively, deploy without `--prod`, smoke-test the deployment URL read from the log file (masked, never echoed), then `vercel promote`.
- **Token check.** Add `vercel whoami --token "$VERCEL_TOKEN"` with a friendly `::error::VERCEL_TOKEN is invalid or expired; create a new token and update the repo secret`.
- **CLI install.** Do not swallow a failed CLI install: `npm install --global "$VERCEL_CLI" > "$RUNNER_TEMP/cli.log" 2>&1 || { echo "::error::Vercel CLI install failed"; exit 1; }`.

### F4 (major) The SPA rewrite serves HTML for missing `/assets/*`, so open tabs white-screen after a deploy
**Scenario.** A tab opened on deploy N survives deploy N+1, which removes `/assets/index-<oldhash>.js`. A lazy route chunk (Phase 1) or a reload of a cached `index.html` requests it. The rewrite `/((?!api/).*)` answers with `index.html`, status 200, `text/html`. With `X-Content-Type-Options: nosniff` the module load fails ("Expected a JavaScript module script…") and the page is blank.

Worse, the `/assets/(.*)` header rule attaches `Cache-Control: public, max-age=31536000, immutable` to that HTML response. Separately, `/api` (no trailing slash) is rewritten to the SPA and returns 200 instead of 404.

**Recommendation.**
- Rewrite source: `"/((?!api/|api$|assets/).*)"`.
- Add to E1–E4 and to the smoke check: `/assets/does-not-exist.js` returns 404, and `/api` returns 404.
- Confirm `index.html` is served with `max-age=0, must-revalidate`.
- Phase 1, once routes are lazy: `window.addEventListener('vite:preloadError', …)` reloads once, guarded by a `sessionStorage` flag so it cannot loop.

---

## B. Supabase bootstrap, schema and data

### F5 (critical) Supabase bootstrap is not idempotent (new password or second project on re-run)
**Scenario.** The plan's own blocker paths end the script **after** the project exists: step 6 ("no publishable/secret key") and the 10-minute poll timeout. On a re-run:
- step 2 generates a **new** `SUPABASE_DB_PASSWORD` and writes it to `.env.local` first
- step 3 runs `projects create structured` again. Names are not unique, so it creates a second project and takes the org's second free slot. If creation is skipped instead, `supabase link` and `db push` fail with "password authentication failed", because the stored password no longer matches.

**Recommendation.** Make every step check-then-act:
- (a) Run `projects list -o json` first. If a `structured` project exists in the chosen org, reuse its ref and skip creation.
- (b) Generate a password only when `.env.local` has none **and** no project exists. Never overwrite an existing `SUPABASE_DB_PASSWORD`.
- (c) Persist the ref immediately after creation.
- (d) If the password is lost, reset it in the dashboard (Database settings → Reset database password) and record that in the dev log.
- (e) Write `.env.local` atomically (temp file + rename) and preserve unrelated keys.

### F6 (minor) The generated DB password can start with `-` and be parsed as a flag
`base64url` includes `-` and `_`, so about 1 run in 64 produces a password starting with `-`. `--db-password -Xy…` is then read as a flag ("flag needs an argument"), and the fallback path misreads the output.

**Recommendation.** Always pass `--db-password=<pw>` (with `=`), or draw from `[A-Za-z0-9]` only. 32 alphanumerics is about 190 bits.

### F7 (major) Integration tests mutate the only DB and can seed `settings.timezone = 'UTC'` for good
**Scenario.** WP5 runs the integration suite before WP6's app ever loads. Test 1, "upsert id 1 if missing", inserts `{id: 1}`, so `timezone` takes its default `'UTC'`. From then on the app shows "Settings row found", and Phase 1's rule "first open: no settings row → create it with the browser zone" never runs. "Today" is then wrong for 9 hours of every day on this machine (UTC+9).

The same first-writer-wins problem applies to any JS-executing crawler or headless browser in UTC that loads production while the row is missing. There is also only **one** Supabase project (dev = prod), so from Phase 1 on the suite writes to real data, and its `settings` UPDATE sends realtime events to the user's open devices.

**Recommendation.**
- Integration tests never create or update `settings`. They skip that assertion when the row is missing and only read it.
- Move the trigger test (AC-14c) and the realtime test (AC-14d) to a `goals` row titled `__test__<uuid>`, which has the trigger and is in the publication. Run the trigger test with the **anon** client, so it proves anon updates fire the trigger. Delete the row in `afterAll`.
- Final verification (AC-20): a secret-key read asserts `settings.timezone` equals the zone the user's browser reports, not a hard-coded `Asia/Kolkata`. Fix the row if it says `UTC`.
- CLAUDE.md: "one database for dev and prod; tests only touch `__test__` rows and clean up".

### F29 (major) Every later table needs explicit grants (and the rest of the 0001 boilerplate)
**Scenario.** On projects created after 2026-05-30, a Phase 1+ migration that adds a table (or a view or RPC function) without `grant … to anon, authenticated, service_role` makes supabase-js return `42501` even though RLS policies allow access. PostgREST also returns `PGRST205` until its schema cache reloads.

**Recommendation.**
- Add a "New table checklist" to CLAUDE.md: grant, enable RLS, `open_access` policy, `updated_at` trigger, realtime publication, regenerate types.
- End each migration with `notify pgrst, 'reload schema';`.
- Add an integration test that loops over a const list of all public tables and does an anon `select … limit 1` on each. Any `42501` or `PGRST205` fails.

### F30 (minor) Migration naming will collide with CLI-generated timestamps
`0001_init.sql` is valid, but `supabase migration new` creates 14-digit timestamps, while PLAN §6 shows `0002_goals.sql`. A later `0002_*.sql` sorts before an already-applied `2026…` migration, and `db push` refuses ("Found local migration files to be inserted before the last migration on remote database") unless `--include-all` is used.

**Recommendation.** Write in CLAUDE.md: `0001_init.sql` is the only hand-numbered file. Every later migration comes from `npx supabase migration new <name>`. Never rename an applied migration.

### F31 (minor) Generated DB types can drift from the database
CI cannot regenerate types (no DB, no Docker). A migration pushed without `npm run db:types` leaves `database.types.ts` stale, and typecheck passes against the wrong types.

**Recommendation.** Closing-ritual step after any migration: `npm run db:types && git diff --exit-code src/data/database.types.ts`, and `npm run db:migrations` shows local equal to remote.

### F32 (minor) `settings` accepts values the app cannot handle
PLAN §7.1, copied verbatim, allows:
- `week_start` = 7, so `toWeekStart` throws on every render
- `energy_limit` = 0, so the energy percentage divides by zero
- `focus_minutes` = 0, so the timer loops
- `default_duration` = 0
- any `theme` text
- `day_end ≤ day_start` with undefined meaning
- any `timezone` text

**Recommendation.** Treat these as a deliberate superset of §7.1, recorded as a decision (cheap now, while the DB is empty):
- `check (week_start between 0 and 6)`
- `check (energy_limit > 0)`
- `check (default_duration between 1 and 1440)`
- `check (focus_minutes > 0 and break_minutes >= 0)`
- `check (theme in ('system','light','dark'))`
- `check (day_start <> day_end)`

Also decide now that `day_end ≤ day_start` means the day crosses midnight, and provide `dayWindowMinutes(start, end)` in `dates.ts` (end + 1440 in that case). If the team keeps 0001 verbatim, add these checks in the first Phase 1 migration and parse settings through zod with safe fallbacks.

### F33 (minor) `updated_at` is server-stamped and missing on some realtime tables
The trigger overwrites `updated_at` with `now()`, so clients cannot do "last write wins by edit time". In practice the last write to *arrive* wins. `day_notes` is in the realtime publication and edited from two devices, yet has no `updated_at`; neither do `templates` or `focus_sessions`. Phase 6's offline queue would replay an old edit over a newer one.

**Recommendation.** Record in the CLAUDE.md data conventions:
- Use optimistic concurrency: `.update(patch).eq('id', id).eq('updated_at', seen)`. Zero rows returned means a conflict, so refetch.
- Realtime handlers ignore events older than the cached row.

Add `updated_at` and the trigger to `day_notes` now, or in Phase 5's migration at the latest.

### F34 (minor) Realtime: the integration test races the subscription (and Phase 1 will too)
Supabase documents that `SUBSCRIBED` fires before the `postgres_changes` listener is ready, so writes in the next 1–3 s can be missed. The plan waits for `SUBSCRIBED`, writes once, and allows one retry.

**Recommendation.**
- **Integration test.** Wait for the channel `system` message for `postgres_changes` with status `ok`, or re-send the update every 2 s until an event arrives (at most 15 s). Accept one or more events, since duplicates are possible.
- **Phase 1 rules (CLAUDE.md):**
  - On every (re)subscribe (after sleep, offline or a token refresh), invalidate all queries, because missed events are never replayed.
  - DELETE payloads carry only the primary key and are not filtered by RLS.
  - Your own writes echo back as events: dedupe by `id` + `updated_at`.

---

## C. Home page: status, failure UX, accessibility

### F8 (major) The health mapping assumes thrown errors; supabase-js 2.117 returns them (and retries)
**(probed)** In postgrest-js 2.117.2, errors come back as values:

| Case | What supabase-js returns | Probed detail |
|---|---|---|
| Network failure | `{ error: { message: 'TypeError: Failed to fetch', details: <full stack trace with script URLs>, code: '' }, status: 0 }` | Not thrown. GETs are retried 3 times (1 s, 2 s, 4 s). |
| `AbortSignal.timeout()` | `message: 'TimeoutError: The operation was aborted due to timeout'`, `code: ''`, `status: 0` | The `DOMException` is named `TimeoutError`, which postgrest-js does not treat as an abort, so it retries 3 more times instantly |
| Invalid key | `status: 401`, no `code` | |
| Paused project | HTTP 540 | The HTML/text body becomes `error.message` |
| Missing table | `PGRST205` (404) | |
| Missing grants | `42501` | |
| `.single()` with 0 rows | `PGRST116` | `.maybeSingle()` returns `data: null`, no error |

Browsers also word network errors differently: Chrome "Failed to fetch", Firefox "NetworkError when attempting to fetch resource.", Safari "Load failed". A fake `SettingsStore` that *throws* `TypeError` tests a path that never happens.

**Recommendation.** The `SettingsStore` translates `{ error, status }` into a typed code:

| Condition | Code |
|---|---|
| `status 0` and message starts with `TimeoutError` or `AbortError` | `timeout` |
| other `status 0` | `network` |
| 401/403 with no `code` | `invalid-key` |
| 540 | `paused` |
| `PGRST205` | `schema-missing` |
| `42501` | `permission` |
| anything else | `code`, or `http-<status>` |

Also:
- Use `.maybeSingle()` for the read.
- Never surface `details` or `hint`, which carry stack traces and bundle URLs.
- Build `health.test.ts` on a real `createClient` with a stubbed `global.fetch` that returns these shapes.

### F9 (minor) Error states give the user nothing actionable
**Recommendation.** Use fixed copy per code, and show the code in small monospace for bug reports:

| Code | Copy |
|---|---|
| `network` | "Can't reach the database. Check your connection." (auto-recheck on `online`) |
| `timeout` | "The database is slow to respond." |
| `paused` | "The Supabase project is paused. Restore it in the Supabase dashboard (see HANDOFF)." |
| `invalid-key` | "API key rejected. Re-pull the env and redeploy." |
| `schema-missing` | "Schema not applied. Run `npm run db:push`." |
| `permission` | "Table grants missing (42501)." |
| not configured | the list of missing variable names |

### F10 (minor) Offline: "Checking database…" hangs 7–30 s; stale "connected" after bfcache
**(probed)** An offline GET makes 4 attempts and takes 7.0 s before the error returns. Read → insert → read with a 10 s timeout per call can take about 30 s. A page restored from bfcache still shows an hours-old "DB connected".

**Recommendation.**
- If `navigator.onLine === false`, return `network` immediately.
- Use one shared `AbortController` with an overall deadline of about 12 s across the three calls.
- Re-check on `online`, on `pageshow` when `event.persisted` is true, and on `visibilitychange` when the last check is more than 5 minutes old.

### F11 (minor) StrictMode makes "created" vs "found" nondeterministic in dev; there is no error boundary
**Scenario.** React 19 StrictMode calls the `useState` initializer twice in development, so both calls run `checkDatabase`. Both reads see no row and both insert. The loser gets `23505`, which maps to "found". React shows whichever promise it keeps, so M2 under `npm run dev` can show "Settings row found" even though this load created the row, and AC-17 becomes flaky.

Also, any synchronous throw in `runCheck` (for example in `detectTimeZone` or `createSettingsStore`) happens inside the initializer, and with no error boundary that means a white screen.

**Recommendation.**
- Singleflight: a module-level in-flight promise is reused while pending. Or run M2/AC-17 against `npm run preview` and confirm creation with a secret-key read.
- Make `runCheck` `async`, so synchronous throws become error states.
- Wrap the app in a root error boundary that shows "Something went wrong" and a reload button.

### F12 (minor) "Check again" UX and accessibility
**Scenario.** The button stays enabled while a check is pending, so rapid clicks start parallel checks. A plain `setState` swaps the badge back to the fallback, which flashes. There is no live region, so screen readers never hear the result.

**Recommendation.**
- **Transition.** Use `startTransition(() => setStatus(runCheck()))`. While `isPending`, the button is disabled with `aria-busy`, and the last result stays visible.
- **Live region.** Give the badge `role="status"` and `aria-live="polite"`. Convey state by text plus an icon, not colour alone.
- **Touch target.** The button needs at least 44×44 px; shadcn's default is 32–36 px, so use `size="lg"` or `min-h-11`.
- **Document settings.** Add `<html lang="en">` and `<meta name="color-scheme" content="light">` until dark mode lands, so Android auto-dark and the Phase 4 WebView do not invert the page.
- **Motion.** Honour `prefers-reduced-motion` for any spinner.

### F13 (major) `.env.local` encoding and value whitespace break scripts or prod silently (Windows)
**(a) Encoding.** PowerShell 5.1 is this machine's primary shell. Its `>` and `Out-File` write UTF-16LE, and `Set-Content -Encoding utf8` writes a BOM. **(probed)** With Node 26's `process.loadEnvFile`:
- a UTF-16 file yields no usable keys
- a BOM turns the first key into `"﻿VITE_SUPABASE_URL"`, which reads as undefined

Vite's dotenv tolerates the BOM, so the app works while the scripts misbehave silently:
- `scripts/supabase.mjs` cannot find its variables
- `sync-vercel-env.mjs` may skip the first key or push it empty
- `check-leaks.mjs` falls back to generic patterns without a warning

**(b) Whitespace.** A value pasted into the Vercel dashboard with a trailing newline or space ends up in a request header. `fetch` rejects it ("Invalid value"), and the page reports a *network* error.

**Recommendation.**
- **Shared parser.** Add `scripts/lib/env-file.mjs` for all scripts. It reads bytes, rejects UTF-16 (`FF FE` / `FE FF`) with a clear message, strips a UTF-8 BOM, and fails loudly when `.env.local` exists but a required key is missing or empty.
- **`readSupabaseEnv` checks.** Reject leading or trailing whitespace and control characters, naming the variable. Require the URL path to be `/`, which catches a pasted `/rest/v1`, and allow no query or hash.
- **CLAUDE.md rule.** Never write `.env*` files with PowerShell redirection.

### F14 (minor) Unit tests are not hermetic locally
Vitest resolves env the way Vite does. Locally, `.env.local` `VITE_*` values reach `import.meta.env` in mode `test`; in CI they do not. A unit test that imports `src/data/supabase.ts`, even transitively, builds a real client and may call the network, so results differ between this machine and CI.

**Recommendation.**
- In `vitest.config.ts`, set `test.env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }`.
- Add a setup file that stubs `globalThis.fetch` to throw "network disabled in unit tests".
- The `DbStatusBadge` test runs in the `node` environment: use `react-dom/server` `renderToStaticMarkup`, or add `// @vitest-environment jsdom` with the dependency. Otherwise it fails with "document is not defined".

---

## D. `src/core/dates.ts`

### F15 (minor) Tests that use the default `now` can flake around midnight or DST
A test that calls `todayIn(tz)` without `now` and compares it with a second computation can straddle a boundary. CI runs at arbitrary UTC times, and Kolkata midnight is 18:30 UTC.

**Recommendation.** Every test passes an explicit `now`. The one "defaults to the clock" test uses `vi.useFakeTimers()` and `vi.setSystemTime(…)`. Add an ESLint `no-restricted-syntax` rule for zero-argument `new Date()` in `__tests__`.

### F16 (major) `toMinutes` rejects values Postgres returns (`24:00:00`, fractional seconds)
**Scenario.** Postgres `time` accepts and returns `24:00:00`, for example `settings.day_end` set to midnight. It also returns fractional seconds (`09:30:00.5`) if any writer stores them (Studio, SQL, a future import). The spec says "exactly `24:00`" and a RangeError otherwise, so the Phase 1 timeline would throw on read. `24:00` is also a legal Postgres `start_time`: it sorts at the end of day D but means 00:00 of D+1.

**Recommendation.**
- Accept `HH:mm`, `HH:mm:ss` and `HH:mm:ss.f+` (floored to the minute), plus `24:00` and `24:00:00` as 1440.
- Add `toMinutes(t, { allowEndOfDay })`, defaulting to false for start times (so a `24:00` start throws) and true for `day_end` and ends.
- `addMinutesToTime('24:00', 0)` returns `{ '00:00', 1 }`.
- `formatTime(1440, '24h')` returns `'24:00'`. The spec's `'00:00'` would read "day ends 00:00", which is ambiguous.
- Test each of these.

### F17 (minor) `isISODate` accepts years that `Date.UTC` maps to 19xx or overflows
**(probed)**
- `Date.UTC(26, 0, 1)` is 1926-01-01, so `addDays('0026-01-01', 1)` would return `1926-01-02`.
- `9999-12-31` + 1 day becomes `+010000-01-01T…`, which breaks the `YYYY-MM-DD` invariant.
- A delta of `1e9` days gives an Invalid Date.

**Recommendation.** Restrict the supported range (for example 1900-01-01 to 2999-12-31) in `isISODate` and `parseISODate`, and validate `addDays` results. Alternatively, build dates with `setUTCFullYear(y, m - 1, d)`. Add tests for all three cases.

### F18 (minor) Midnight-gap zones, 30-minute DST and "start of day" are untested
**(probed)**
- **America/Santiago, 2026-09-06.** 00:00 does not exist (23:59 −04 jumps to 01:00 −03). `nowMinutesIn` never returns 0–59 that day, and the day starts at 01:00.
- **Australia/Lord_Howe.** DST shifts by only 30 minutes: 2026-10-04 goes from 02:00 to 02:30.
- **Lord Howe ambiguity.** On 2026-04-05, `TZDate` resolves the ambiguous 01:45 to the **later** instant, 15:15Z instead of 14:45Z. This is the same bug class as Chatham.
- **DST in general.** `nowMinutesIn` jumps (119 → 180) and repeats (60–119 twice).

**Recommendation.**
- **New test rows:**
  - `zonedDateTimeToInstant('2026-09-06', '00:00', 'America/Santiago')` = `2026-09-06T04:00Z`, and at that instant `todayIn` = `2026-09-06`, `nowMinutesIn` = 60
  - Lord Howe gap: `2026-10-04 02:15` = `2026-10-03T15:45Z`
  - Lord Howe ambiguity: `2026-04-05 01:45` = `2026-04-04T14:45Z`
- **New helpers.** Add `startOfDayInstant(date, tz)` and `msUntilNextDayIn(tz, now)`. Phase 1 needs the latter to roll "Today" over when a tab stays open past midnight: re-arm it on `visibilitychange`, because background timers are throttled.
- **Documentation.** State in `dates.ts` that timeline maths is wall-clock time. For example, a 01:00–03:00 task on a spring-forward day is 2 h on the timeline but 1 h of elapsed time.

### F19 (minor) Time formatting must not depend on Intl; the `formatDuration` contract is too strict
**Intl.** 12-hour output varies with the ICU version. The Node 20 era produced U+202F (a narrow no-break space) before AM/PM; Node 26 / ICU 78 **(probed)** produces a plain space; browsers differ. Tests could pass on local Node 26 and fail on CI Node 24.

**Recommendation.**
- Build `formatTime` strings by hand, or with date-fns `format`, which does not use Intl (**probed** `'9:30 AM'` with a plain space). Pin `formatDateLabel` to the date-fns en-US locale.
- `formatDuration` accepts any finite number ≥ 0, rounds to the nearest minute, and has no upper bound. Phase 5 stats and focus totals are fractional and exceed 1440, and a RangeError on 2.5 would crash the stats page. Keep the RangeError for negative values and NaN.

### F20 (minor) Time-zone IDs: offset zones, aliases and canonical spelling
**(probed)** Intl in Node 26 accepts:
- offset zones `+05:30` and `-03:30`
- abbreviations and legacy names: `EST` (resolves to America/Panama), `EST5EDT`, `US/Eastern`
- lowercase names such as `asia/kolkata`

It also rewrites names: Asia/Kolkata resolves to `Asia/Calcutta`, and Europe/Kyiv to `Europe/Kiev`. `Intl.supportedValuesOf('timeZone')` lists `Asia/Calcutta` but not `Asia/Kolkata`.

Two consequences:
- **Postgres.** It reads `+05:30` POSIX-style, as UTC−05:30. If Phase 5 SQL ever uses `at time zone settings.timezone`, days would shift by 11 h.
- **Spelling.** Engines on two devices can spell the same zone differently, so a Phase 1 "device zone differs" banner would misfire.

**Recommendation.**
- `isValidTimeZone` rejects `/^[+-]\d/` and `Etc/GMT±N`, whose sign is inverted.
- Add `normalizeTimeZone(tz)`, which returns `resolvedOptions().timeZone`, and use it before storing a zone.
- Add `sameTimeZone(a, b)`, which compares normalised names, falling back to equal offsets at four instants across a year.
- Tests: `+05:30` is false, `asia/kolkata` is normalised, and Kolkata and Calcutta count as the same zone.

---

## E. Two devices and HANDOFF

### F21 (major) HANDOFF on `main` goes stale; the live HANDOFF is on the phase branch
**Scenario.** A new device clones the repo and lands on `main`. Its HANDOFF.md reflects the last merge: it says "next: Ship" even after Ship, and says nothing about Phase 1 work in progress. The resume step "git checkout <branch above>" names the branch from that stale file. Ship step 7 updates HANDOFF only on the next phase branch, so `main` never records that Phase 0 shipped.

**Recommendation.**
1. Before the merge, write HANDOFF's **post-Ship** state on the phase branch: the tag, the release, and the next branch name. Make the first commit of each new phase branch a HANDOFF update, and push it right away.
2. Add a "find the live handoff" step to HANDOFF and the README: `git fetch --all --prune && git branch -r --sort=-committerdate | head -3`, then `git switch <newest phase-*> && git pull --ff-only`, then re-read HANDOFF. The open phase PR and tracking issue link it too.
3. Write "Last updated" with the time and zone (for example "2026-09-29 23:40 UTC+9"). Around midnight, local dates and UTC commit dates differ.

### F22 (major) Resume step `vercel link --yes` can re-enable the Git integration on a new device
**Scenario.** The plan found (R6) that `vercel link --yes` can auto-connect the Git remote. WP7 disconnects it once, but HANDOFF step 5 runs `vercel link --yes --project <name>` on every new machine. That re-enables the integration: preview deployments on every push, and bot comments with deployment URLs on public PRs. `git.deploymentEnabled: false` stops the builds, but the link should still be verified.

**Recommendation.**
- Extend HANDOFF step 5 with `npx vercel git disconnect --yes` and a `project inspect --json` check that shows no Git link.
- Explain how to find the project name without writing it down anywhere: `npx vercel project ls`.

### F23 (major) `vercel env pull` rewrites `.env.local`; check-leaks then fails on ordinary words
**Scenario.** `vercel env pull` replaces the whole file, and keys that exist only locally are removed (vercel/vercel#13365). It also adds Vercel-managed keys: at least `VERCEL_OIDC_TOKEN` (a 12-hour JWT), and depending on project settings `VERCEL`, `VERCEL_ENV="development"`, `VERCEL_TARGET_ENV`, `VERCEL_URL` and `TURBO_*`/`NX_*`.

check-leaks treats every value of 8+ characters as sensitive. The word "development" appears throughout the docs, so the scan reports a LEAK, and `npm run verify` fails in the WP9 rehearsal and on every new device. The rehearsal's key comparison also reports the extra keys.

**Recommendation.**
- check-leaks uses an explicit list of sensitive keys (the 7 app keys plus `VERCEL_OIDC_TOKEN`) and the hosts derived from them. It ignores `VERCEL_*`, `TURBO_*` and `NX_*` system keys.
- The rehearsal compares only the app key set.
- Any key that exists only locally (for example `MCP_SECRET` in Phase 2) must be synced to Vercel before anyone pulls, or the pull deletes it on that device.

### F24 (minor) Two devices can overwrite each other's secrets in Vercel
**Scenario.** Device A rotates `SUPABASE_SECRET_KEY` and syncs it. Later, device B, with its old `.env.local`, runs `npm run env:sync-vercel`. Vercel now holds the revoked key again.

**Recommendation.**
- The sync script first pulls the development env into a temp file and prints `same`, `differs` or `missing remotely` per key (names only). It needs `--force` to overwrite differing values.
- CLAUDE.md: the Vercel development env is the source of truth.
- Add "returning to an existing clone" steps to HANDOFF:
  1. `git fetch && git switch <branch> && git pull --ff-only`
  2. `npm ci` if the lockfile changed
  3. `npx vercel env pull` (after the diff)
  4. `npm run db:migrations`, to see migrations pushed from the other device

### F25 (minor) The repo-local git identity is email-only
`user.name` comes from the global config. On a device with no global name, or a different one, commits get a different author name, or fail with "Please tell me who you are".

**Recommendation.** Set `git config user.name "<owner name>"` locally, and add it to HANDOFF step 3 as a placeholder. The email is already linked to the GitHub account (checked), so contributions count.

### F26 (minor) Lockfile portability to the user's other device
Rolldown (Vite 8), lightningcss and `@tailwindcss/oxide` ship native binaries per platform. WP1 checks only `linux-x64-gnu`. On a Mac (arm64) or ARM Windows device, a missing binding breaks `npm ci` or `vite build`.

**Recommendation.**
- Grep the lockfile for `darwin-arm64` and `win32-x64-msvc` entries of those three packages.
- Add a non-required `portability` job (matrix `macos-latest` and `windows-latest`: `npm ci && npm run build && npm test`). It is free on a public repo and also catches CRLF and path bugs.

### F27 (minor) Supabase pauses between phases; recovery is undocumented
Free-tier projects pause after about 7 days without activity and then answer **HTTP 540** to every request. The keep-alive arrives only in Phase 3. A gap before Phase 1 turns "DB connected" into an error and breaks `db:*` and the integration tests on whichever device resumes.

**Recommendation.**
- Map 540 to `paused` (F8, F9).
- Add a Recovery section to HANDOFF: Dashboard → Restore project, then `npm run db:migrations`.
- Ask the user whether to pull a tiny keep-alive forward (it needs a new secret). Note that GitHub disables scheduled workflows on public repos after 60 days without repo activity.

### F28 (minor) DB region vs the user's real location; functions default to `iad1`
**Supabase region.** It cannot change after creation; moving means a new project and a data migration. This machine's zone is UTC+9, not IST. If the user lives in Japan, `ap-northeast-1` is about 100 ms closer per round trip (every read, write and realtime event). The grant says `ap-south-1`, so confirm with the user **before** WP5 step 2 rather than assume.

**Function region.** Vercel runs functions in `iad1` (Washington, D.C.) by default. Phase 2's MCP function would make several sequential queries per tool call to a far-away database. Hobby allows one region.

**Recommendation.**
- Put `"regions": ["bom1"]` (or the region nearest the DB) in `vercel.json` now, so Phase 2 inherits it.
- Set Dependabot's schedule time zone to the user's real zone.

---

## F. CI and GitHub

### F35 (major) `src/core` must be importable by Vercel functions without the `@/` alias
**Scenario.** Phase 2's `api/mcp/[secret].ts` imports `src/core`. Vercel's Node builder does not resolve tsconfig `paths` (vercel/vercel discussions #10717 and #10139). With `"type": "module"`, Node ESM also needs explicit extensions on relative imports. Either way the result is `ERR_MODULE_NOT_FOUND` at runtime, found only after a deploy. The plan's lint rules allow `@/core/*` inside `src/core`.

**Recommendation.**
- Forbid `@/` imports inside `src/core`, and later `server/`: relative imports only.
- Decide the extension policy now. Either use `.ts` extensions with `allowImportingTsExtensions`, or use `.js` extensions.
- Add a CI step that imports core in plain Node 24 (native type stripping): `node --input-type=module -e "await import('./src/core/dates.ts')"`.
- `no-restricted-imports` misses dynamic `import()`: add `no-restricted-syntax` for `ImportExpression` in core.
- Add a negative lint test for `../data/supabase` from core.

### F36 (minor) Dependabot and the phase branch drift apart before Ship
**Scenario.** Once `dependabot.yml` is on `main`, Dependabot PRs merge there during every later phase. With strict status checks off, a phase PR can merge without being re-tested against the new `main`. A dependency bump plus phase code can break `main`, and Deploy then fails or ships a broken build.

**Recommendation.**
- Ship checklist: `git merge origin/main` into the phase branch, push, wait for a green `verify`, then merge. Alternatively enable `strict_required_status_checks_policy`.
- Never add `paths-ignore` to `ci.yml`: a docs-only PR (such as a HANDOFF fix) would never get the required `verify` check and would be blocked.

### F37 (minor) GitHub setup commands are not idempotent
**Scenario.** Re-running WP1 or WP8 after a partial failure:
- `gh issue create` makes a duplicate tracking issue
- `gh pr create` errors out
- `POST /rulesets` either fails on the duplicate name or creates a second ruleset

**Recommendation.** Look up before creating:
- `gh issue list --label tracking --search "Phase 0"`
- `gh pr view phase-0-foundation`
- `gh api repos/$R/rulesets -q '.[] | select(.name=="main protection") | .id'`, then `PUT /rulesets/{id}` if it exists, otherwise POST

Record the issue, PR and ruleset IDs in HANDOFF.

---

## Sources
- vercel/vercel#17514, `[SENSITIVE]` placeholders from `vercel pull` injected by `vercel build`: https://github.com/vercel/vercel/issues/17514
- vercel/vercel#17642 / #15763 / #16111, `env add NAME preview` requires a branch (workaround: pass `""`): https://github.com/vercel/vercel/issues/17642
- vercel/vercel#13365, `vercel env pull` overwrites all keys: https://github.com/vercel/vercel/issues/13365
- Vercel CLI `env` docs (sensitive defaults, team policy, `--force`, `--yes`): https://vercel.com/docs/cli/env
- Vercel function regions (default `iad1`, Hobby single region): https://vercel.com/docs/functions/configuring-functions/region
- Vercel path aliases in functions: https://github.com/vercel/vercel/discussions/10717 , https://github.com/vercel/vercel/discussions/10139
- Supabase HTTP status codes (540 = project paused): https://supabase.com/docs/guides/troubleshooting/http-status-codes
- Supabase free project pausing: https://supabase.com/docs/guides/platform/free-project-pausing
- Supabase Realtime postgres_changes troubleshooting (SUBSCRIBED race): https://supabase.com/docs/guides/troubleshooting/realtime-postgres-changes-troubleshooting
- Supabase migrations and out-of-order pushes: https://supabase.com/docs/guides/deployment/database-migrations
