# Phase 0: edge cases, platform / tooling / infrastructure lens

| | |
|---|---|
| Phase | 0 (Foundation) |
| Input | `docs/phases/phase-0/plan-v1.md`, `PLAN.md` §4.3, §5, §6, §7, §13, §14, `CLAUDE.md`, `HANDOFF.md` |
| Lens | Windows shells, paths, encodings and line endings; Node/npm and lockfiles; build and test config; Supabase CLI and cloud; Vercel CLI, env, routing and protection; GitHub Actions and repo settings; secret leakage; free tiers; reproducibility on a fresh machine |
| Written | 2026-09-29 |
| IDs | `P1`...`P44` (stable; the replan refers to them) |

> **Public repo.** This file is committed. It contains no secret values, app URLs, the Vercel project name, the Supabase project ref/URL, account user names or e-mail addresses. Where a value matters it is described, never quoted.

## How this was checked

Every item below is a concrete scenario. Most were verified on this machine or against the real tools, not taken from memory:

- **Registry:** `npm view` for every planned package (versions, `engines`, peer ranges, `optionalDependencies`).
- **Vercel CLI 61.0.0:** `--help` for `env add`, `env pull`, `link`, `git`, `project protection|update|inspect|add`, `pull`, `build`, `deploy`, `api`, plus reading the shipped CLI source for `link` (Git auto-connect), `env pull` (merge and placeholder logic), `project protection` (the deployment type it sets), `.vercel/project.json` contents and the `@vercel/static-build` install step.
- **Supabase CLI 2.118.0:** `--help` for `projects create`, `projects api-keys`, `link`, `db push`, `gen types`, `init`, `migration list`, `db reset`, plus the npm shim `dist/supabase.js`.
- **This machine:** git config (local/global/system), commit signatures and their GitHub verification status, `gh auth status` (accounts and scopes), repo settings and Actions permissions via `gh api`, time zone and locale, PowerShell execution policy, Git Bash argument and environment handling, outbound reachability of the Supabase pooler ports, CLI login state (counts only, no names printed).
- **Web:** Supabase changelog (Data API grants), Supabase billing docs (free project limit), Vercel docs (Deployment Protection, system env vars, OIDC), Dependabot and npm issues (platform optional deps), Claude Code settings (`attribution`). Sources are listed at the end.

## Summary

| ID | Severity | Area | Title |
|---|---|---|---|
| P1 | critical | Git / attribution | Nothing below `CLAUDE.md` stops the harness from adding AI attribution |
| P2 | major | Git / signing | Commits are GPG-signed with a key GitHub cannot verify ("Unverified" on every commit and tag) |
| P3 | major | Git / accounts | Two `gh` accounts are logged in; pushes and PRs follow whichever is active |
| P4 | major | Git / identity | Only `user.email` is repo-local; other devices can author commits with the wrong identity |
| P5 | major | Windows | PowerShell 5.1 on a ja-JP system writes BOM / UTF-16 / cp932 files |
| P6 | major | Windows | Git Bash rewrites `/…` arguments and strips `TZ` (plan §8.3 `vercel api "/v9/…"` breaks) |
| P7 | minor | Windows | Orphaned dev servers hold ports and lock `node_modules` binaries |
| P8 | minor | Windows | Case-only renames are invisible to git on this machine but break Linux CI |
| P9 | minor | Windows | Deleting the rehearsal clone can leave `.env.local` behind in `%TEMP%` |
| P10 | major | npm / lockfile | The Supabase CLI ships 150 MB native binaries; lockfile must keep win32 and linux entries for all native packages |
| P11 | minor | Node | Local Node 26.3.1 / npm 11.17 vs CI Node 24.21 / npm 11.19 |
| P12 | minor | Dependencies | `shadcn` devDependency pulls a 33-dependency CLI tree just for one CSS import |
| P13 | minor | Dependencies | `vercel@61` is a moving range in CI and in local `npx` |
| P14 | minor | Vitest | Unit tests read `.env.local` locally but not in CI (non-hermetic) |
| P15 | minor | Tailwind | Tailwind v4 scans `PLAN.md` and `docs/` for class names |
| P16 | minor | Git | AC-7 line-ending check fails on empty files (`i/none`) |
| P17 | major | Supabase | One free slot left; `projects create` is not idempotent; a retry can regenerate the DB password |
| P18 | major | Supabase | Provisioning lag after `ACTIVE_HEALTHY` (API keys, pooler tenant, PostgREST schema cache) |
| P19 | minor | Supabase CLI | Argument and output quirks (`--db-password -x…`, two output flags, never echo `--reveal` output) |
| P20 | minor | Supabase | `link`/`db push` need outbound TCP 5432 to the pooler; the direct host is IPv6-only |
| P21 | minor | Supabase | Migration naming scheme and mandatory GRANTs for every future table |
| P22 | minor | Supabase | 7-day inactivity pause is invisible to the deploy smoke check |
| P23 | minor | Supabase / Vercel | Region is irreversible; machine is in Asia/Tokyo; Vercel functions default to a US region |
| P24 | major | Vercel | `vercel build` re-runs `npm install` after `npm ci` (tree drift, token exposure) |
| P25 | major | Vercel | Production can be built without Supabase config and still pass the smoke check |
| P26 | major | Vercel | Disabling protection for the whole project exposes every immutable deployment URL forever |
| P27 | major | Vercel | Any Vercel command that takes the "new project" path creates a project and auto-connects Git |
| P28 | minor | Vercel | `vercel env pull` (CLI 61) merges, keeps local keys and writes a secret placeholder |
| P29 | minor | Vercel / Windows | `sync-vercel-env.mjs` cannot `spawnSync('npx')` on Windows without a shell |
| P30 | minor | Vercel routing | SPA rewrite turns missing `/assets/*` into cached HTML; `/api` (no slash) is rewritten |
| P31 | minor | Vercel headers | `robots.txt Disallow: /` hides the `noindex` header from crawlers |
| P32 | major | GitHub Actions | Deploy is not gated on CI and can be dispatched from any branch |
| P33 | minor | GitHub Actions | Smoke check cannot tell the new deployment from the previous one |
| P34 | major | GitHub Actions / leak | Project name leaks into public failure logs when the prod host is suffixed |
| P35 | major | GitHub | Dependabot, issue forms, PR template, CodeQL and the badge only work from `main`, so they are unvalidated until Ship |
| P36 | minor | GitHub | Required check `verify` is ambiguous and can be left pending forever |
| P37 | minor | GitHub | Ruleset, issue and PR creation are not idempotent across sessions/devices |
| P38 | minor | GitHub | `gh` token needs the `workflow` scope to push workflow files |
| P39 | major | Leak checker | False positives from Vercel-pulled variables; CI misses commit messages and bare refs |
| P40 | major | Leak checker / push protection | Test fixtures shaped like real keys get blocked by GitHub push protection |
| P41 | minor | Secrets | No rotation runbook; generic secrets (DB password) are not detected by GitHub |
| P42 | major | HANDOFF | Resume steps fail: wrong order, `!` history expansion, PowerShell drops `""` |
| P43 | minor | HANDOFF | Fresh-machine tooling: nvm-windows ignores `.nvmrc`, execution policy, logins |
| P44 | minor | HANDOFF | Cross-device drift (stale `.env.local`, concurrent pushes, paused DB) |

Severity: **critical** = breaks a hard user rule or leaks irreversibly; **major** = breaks a Done-when item, a WP, or the resume path; **minor** = friction, future phases, or defence in depth.

---

## A. Git identity, accounts, signing, attribution

### P1 (critical): nothing below `CLAUDE.md` stops the harness from adding AI attribution
**Scenario.** The user's top rule is "no AI attribution anywhere". The only guard in plan-v1 is prose (`CLAUDE.md`, the WP closing ritual). The Claude Code harness adds a `Co-Authored-By` trailer and a "Generated with Claude Code" PR line by default, and in this very session the harness injected a reminder telling subagents to append them. A subagent or a session on another device that follows the harness default instead of `CLAUDE.md` pushes an attributed commit or PR body. On a public repo that is effectively irreversible: `main` cannot be force-pushed (ruleset), and GitHub keeps PR commit/diff views.

**Evidence.** No `attribution` (or legacy `includeCoAuthoredBy`) key in `~/.claude/settings.json`; no project `.claude/settings.json`. The two existing commits are clean.

**Recommendation.**
1. Ask the user to approve a committed project file `.claude/settings.json` containing `{"attribution": {"commit": "", "pr": ""}}`. It travels with the repo to every device and is enforced by the harness, not by memory. Add `.claude/settings.local.json` to `.gitignore`.
2. Add a CI step to `verify` (fails the required check). Use `actions/checkout` with `fetch-depth: 0` and, on `pull_request`, scan `git log --format=%B <base.sha>..<head.sha>` plus the PR title/body. Pass the body through `env:` (never inline `${{ github.event.pull_request.body }}` in `run:`, which is a script-injection sink). Fail on `co-authored-by:.*(claude|anthropic)`, `noreply@anthropic.com`, `generated with .*claude`, and the robot emoji.
3. Run the same check locally before `gh pr create/edit`, `gh issue create/edit`, `gh release create` and tag creation (annotated tag messages too).

### P2 (major): commits are GPG-signed with a key GitHub cannot verify
**Scenario.** Global config has `commit.gpgsign=true` and `tag.gpgsign=true` with a signing key whose only UID is a **work-domain** address. The key is not on the `karthi-ai-engineer` account. GitHub marks both existing commits `verified: false, reason: unknown_key`, so every commit, and the `v0.0.1` annotated tag, shows **"Unverified"** on the public repo the user wants to showcase. Signing works non-interactively right now, but `gpg-agent` caches a passphrase for only 600 s by default (max 7200 s). If the key has a passphrase, a later `git commit` in a non-interactive session either hangs on pinentry or fails with `gpg failed to sign the data`. The signature itself carries only the key fingerprint (checked with `gpg --list-packets`), not the e-mail.

**Recommendation.**
- Raise this with the user before the WP1 commits. It is their git config, and the task forbids changing identity settings. Options:
  - (a) add a UID with the personal address to the key, then upload the public key to the GitHub account (the address must be verified there)
  - (b) create a personal signing key
  - (c) with explicit approval, set repo-local `commit.gpgsign=false` and `tag.gpgsign=false`
- Never silently pass `--no-gpg-sign`. If signing fails, stop and report a blocker.
- Do not add a `required_signatures` rule to the ruleset until this is resolved.
- Merge commits created by `gh pr merge` are signed by GitHub and show "Verified", so the Ship merge is unaffected.

### P3 (major): two `gh` accounts are logged in
**Scenario.** `gh auth status` shows `karthi-ai-engineer` (active, scopes `repo workflow read:org gist`) and a second, work account (inactive). The repo-local credential helper `!gh auth git-credential` and every `gh` call use whichever account is **active**. If the user runs `gh auth switch` for work (or another tool does), the next session pushes as the work account (403) or opens the phase PR and issues under it. Achievements such as Pull Shark then accrue to the wrong account, or not at all.

**Recommendation.** Add a preflight to every WP (and to the Ship stage): `gh api user --jq .login` must equal `karthi-ai-engineer`, otherwise stop. Do not run `gh auth switch` silently, because that changes the user's global state. If needed, scope a session with `GH_TOKEN="$(gh auth token --user karthi-ai-engineer)"` and never print it. Note the expected account in HANDOFF.

### P4 (major): only `user.email` is repo-local
**Scenario.** `user.name` comes from global config. On another device the global identity is likely the work one. If the HANDOFF identity step is skipped or done after the first commit, commits carry the work address. They are then not linked to the GitHub profile (no contribution graph, no achievements) and they publish a work address in a public repo.

**Recommendation.**
- HANDOFF sets both `user.name` and `user.email` repo-locally, immediately after clone and before anything else.
- Add a CI step to `verify`: every commit in the PR range must have author **and** committer e-mail equal to the one allowed address (positive check; never write the work domain into a public script). This needs `fetch-depth: 0` (see P39).

---

## B. Windows shells, encodings and paths

### P5 (major): PowerShell 5.1 on a ja-JP system writes BOM, UTF-16 or cp932 files
**Scenario.** The primary shell is Windows PowerShell 5.1, and the system locale is **ja-JP**, so the ANSI code page is 932. PowerShell 5.1 behaves like this:
- `Set-Content`/`Add-Content` default to ANSI (cp932)
- `>` and `Out-File` write UTF-8 **with BOM** in this environment (UTF-16LE in a default console host)

Concrete breakages:
- `.nvmrc` with a BOM: `setup-node` cannot parse `\uFEFF24`
- `package.json`/`vercel.json`/`components.json` with a BOM: JSON parse errors
- `0001_init.sql` with a BOM: `syntax error at or near "create"`
- `.env.local` with a BOM: the first key is read as `\uFEFFVITE_SUPABASE_URL`
- `CLAUDE.md`/`HANDOFF.md` written as cp932: `→ … · –` turn into mojibake

`PLAN.md` §13.3 even documents `npx supabase gen types typescript … > src/data/database.types.ts`, which in PowerShell produces a BOM/UTF-16 file.

**Recommendation.**
- Add a `CLAUDE.md` rule: write repo files only with the editor tools or Node (`utf8`, no BOM), never with PowerShell redirection, `Set-Content` or `Out-File`. Generate types only with `npm run db:types`.
- Add `scripts/check-text.mjs` (or extend `check-leaks.mjs`), run in `verify` and CI. It fails on a UTF-8 BOM, invalid UTF-8, or CR characters in files that `.gitattributes` marks `eol=lf`.
- Keep `.editorconfig` at `charset = utf-8` (not `utf-8-bom`).

### P6 (major): Git Bash rewrites `/…` arguments and strips `TZ`
**Scenario.** Verified in Git Bash: `node -e … "/v9/projects/abc/domains"` receives `C:/Program Files/Git/v9/projects/abc/domains`. This is MSYS path conversion for native executables. Plan §8.3 runs `npx --yes vercel@61 api "/v9/projects/$NAME/domains"`, so the PROD_URL discovery step fails (or calls a garbage endpoint). The same happens to any `gh api /repos/...` written with a leading slash.

Also verified: `TZ=America/St_Johns node …` arrives with `TZ` **undefined**, and the process reports Asia/Tokyo. The plan already sets TZ inside `vitest.config.ts` for this reason. Any other `TZ=… cmd` usage (for example a manual test run) silently uses the machine zone.

**Recommendation.** Prefix such calls with `MSYS_NO_PATHCONV=1` (verified to pass `/v9/…` through), or make the call inside a Node script. Never start `gh api` paths with `/`. Add both gotchas to the `CLAUDE.md` "Commands" section.

### P7 (minor): orphaned dev servers hold ports and lock binaries
**Scenario.** `npm run dev` started from the Bash or PowerShell tool runs `cmd.exe → node → vite`. Killing the parent can orphan the Vite child. Port 5173 stays bound, so the next `npm run dev` silently picks 5174 and M1 checks the wrong server. The loaded `.node` bindings (rolldown, lightningcss, tailwind oxide) stay locked, so the next `npm ci` fails with `EPERM`/`EBUSY`.

**Recommendation.** Use `vite --strictPort` (and the same for `vite preview`, port 4173). Record the PID and stop with `taskkill /PID <pid> /T /F`. Verify with `netstat -ano | findstr :5173` (empty) before finishing a WP.

### P8 (minor): case-only renames are invisible to git here
**Scenario.** `core.ignorecase=true`, and the file system is case-insensitive. Renaming `dbStatusBadge.tsx` to `DbStatusBadge.tsx` (or fixing shadcn kebab-case against the PascalCase convention) is not recorded by git. Vite and TS on Windows resolve either spelling. Ubuntu CI then fails with "Could not resolve".

**Recommendation.** Always use `git mv -f old New` for case-only renames. Keep `forceConsistentCasingInFileNames` (the TS default). Add the rule to `CLAUDE.md`.

### P9 (minor): the rehearsal clone can leave `.env.local` in `%TEMP%`
**Scenario.** The WP9 resume rehearsal and the §8.3 CI rehearsal create clones in the scratchpad that contain `.env.local` and `.vercel/.env.production.local`. On Windows, `rm -rf` fails part-way if a process still holds `node_modules` files, and the secret files can survive in `%TEMP%`.

**Recommendation.** Stop all processes first. Delete `.env.local` and `.vercel/` explicitly, then the tree, then assert that neither path exists.

---

## C. Node, npm, lockfile, dependencies

### P10 (major): native binaries in the lockfile, including a 150 MB Supabase CLI
**Scenario.** Plan §2.1 says the Supabase CLI "is now a JS bundle with no postinstall binary download". That is only half true:
- `supabase@2.118.0` has `optionalDependencies` on 8 platform packages (`@supabase/cli-windows-x64`, `@supabase/cli-linux-x64`, …), each about **152 MB unpacked**.
- The shim `dist/supabase.js` throws `No matching Supabase CLI binary package found` when the platform package is missing.
- Other native packages follow the same pattern: rolldown (`@rolldown/binding-*`), `lightningcss-*` and `@tailwindcss/oxide-*` (and `@vercel/vc-native-*` inside the Vercel CLI).

Failure modes:
- (a) WP1 step 8 only checks the rolldown Linux binding.
- (b) When Dependabot regenerates `package-lock.json` on Linux, it can drop other-platform optional entries (dependabot-core #4795, npm/cli #4828). The next `npm ci` on Windows then fails, or `npm run db:*` throws.
- (c) Every CI `npm ci` downloads and extracts about 150 MB that CI never uses.

**Recommendation.**
- Add `scripts/check-lockfile.mjs` to `verify` (and CI). It asserts that the lockfile has `win32-x64` **and** `linux-x64(-gnu)` entries for `@rolldown/binding-*`, `lightningcss-*`, `@tailwindcss/oxide-*` and `@supabase/cli-*`.
- After merging any Dependabot npm PR, run `npm ci` on Windows before continuing.
- Never use `--omit=optional` or `--no-optional`.
- Correct plan §2.1. Accepting the download cost is fine, but state it.

### P11 (minor): local Node/npm differs from CI
**Scenario.** Locally: Node 26.3.1 and npm 11.17.0. CI and Vercel use `.nvmrc` = 24, which resolves to 24.21.0 with bundled npm **11.19.0** (nodejs.org index). The lockfile is then written by an older npm than the one that runs `npm ci`. Peer and optional resolution differences between npm versions are a known source of `npm ci` "lock file out of sync" errors. V8 coverage counts and ICU tzdata also differ between majors.

**Recommendation.** Install Node 24 locally (fnm) and run lockfile-changing commands (`npm install`, `npm uninstall`) under 24, for example `fnm exec --using 24 npm install …`. If Node 26 stays the default, at least run `fnm exec --using 24 npm ci` before pushing a lockfile change. Keep date tests on dates far from announced tzdata changes.

### P12 (minor): `shadcn` as a devDependency for one CSS import
**Scenario.** The shadcn CSS does `@import "shadcn/tailwind.css"`, so plan §5.4 keeps `shadcn` (the CLI) as a devDependency. `shadcn@4.21.0` has **33 direct dependencies**, including `ts-morph`, `@babel/core`, `@modelcontextprotocol/sdk`, `@dotenvx/dotenvx` and `zod`. That makes every CI, deploy and Vercel install heavier, adds Dependabot noise, and could produce duplicate `zod`/MCP SDK copies next to the Phase 2 MCP stack.

**Recommendation.** Either vendor the few rules of `shadcn/tailwind.css` into `src/styles/` (with a comment naming the source version) and drop the package, or keep it and accept the cost explicitly. If kept, `npx shadcn add` uses the pinned local CLI, which is a plus.

### P13 (minor): `vercel@61` is a moving range
**Scenario.** `deploy.yml` installs `vercel@61` and local commands use `npx --yes vercel@61`. A new 61.x minor mid-phase can change agent-mode defaults, prompts or flags, and the first deploy run happens only in the Ship stage.

**Recommendation.** Pin the exact version (`vercel@61.0.0`) in `deploy.yml` and in every local command. Bump it deliberately in its own commit.

---

## D. Build and test tooling

### P14 (minor): unit tests are not hermetic on the dev machine
**Scenario.** Vitest loads `.env`, `.env.local`, `.env.test` and `.env.test.local` like Vite does (mode `test`), and exposes the `VITE_*` values on `import.meta.env`. Locally they hold the real Supabase URL and key; in CI they are undefined. Any unit test that imports `src/data/supabase.ts` (module-level `createClient`) or the `App` behaves differently locally than in CI, and can reach the network.

**Recommendation.** In `vitest.config.ts`, set `test.env: { VITE_SUPABASE_URL: '', VITE_SUPABASE_PUBLISHABLE_KEY: '' }` (or point `envDir` to an empty folder), so unit tests always see the CI state. For M3 (unconfigured build), use `VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= npm run build` in Git Bash instead of renaming `.env.local`. Git Bash passes the empty values to Node (verified), and nothing secret gets moved around. Confirm that Vite lets the empty process values win over `.env.local`.

### P15 (minor): Tailwind v4 scans the docs
**Scenario.** Tailwind v4 automatic source detection scans every non-ignored file under the project root, including `PLAN.md` and `docs/**/*.md`. Class-like tokens in documentation code blocks generate CSS, which bloats the bundle slightly and changes as docs change.

**Recommendation.** Add `@source not "../../docs";` and `@source not "../../PLAN.md";` (paths relative to `src/styles/index.css`) and confirm with a build-size diff. Or accept it and note it.

### P16 (minor): AC-7 fails on empty files
**Scenario.** `git ls-files --eol` reports `i/none` for empty files. The AC-7 filter (`grep -v 'i/lf' | grep -v 'i/-text'`) would flag an empty `supabase/seed.sql`, a `.gitkeep`, or an empty placeholder.

**Recommendation.** Keep the README-only placeholder policy and never commit empty files, or add `grep -v 'i/none'` to AC-7.

---

## E. Supabase

### P17 (major): one free slot left, and project creation is not idempotent
**Scenario.**
- The Supabase account already has **one active project** (count checked). The free limit is two active projects across all orgs where the user is owner/admin, so `structured` fills the last slot.
- `projects create` is not idempotent, and project names are not unique. If the CLI errors or times out after the API created the project, a blind retry either creates a second `structured` (and fails at the limit) or finds an ambiguous name match in the §8.2 fallback.
- The bootstrap generates `SUPABASE_DB_PASSWORD` at the start of every run. A retry overwrites the password of the project that was actually created.
- Only one org exists today, so "personal/first" is unambiguous now. Do not hard-code that assumption.

**Recommendation.** The bootstrap script should:
1. List projects first. Abort if any project named `structured` exists, unless its ref equals `SUPABASE_PROJECT_REF` already in `.env.local`, in which case resume.
2. Generate the DB password only if `.env.local` lacks one.
3. After any create error, list again before deciding. Never retry blindly.
4. Treat "limit reached" as a blocker. Pausing or deleting the user's other project is not permitted.

### P18 (major): provisioning lag after `ACTIVE_HEALTHY`
**Scenario.** Three things commonly lag behind the project status:
- The new `sb_publishable_…` and `sb_secret_…` keys may not be listed yet. The plan then stops with a false blocker.
- The pooler (Supavisor) tenant can lag, so `link`/`db push` fails with `Tenant or user not found` or connection refused.
- PostgREST's schema cache can lag the DDL by seconds. The first integration request gets `PGRST205` ("Could not find the table … in the schema cache").

**Recommendation.**
- Retry `api-keys` with backoff for up to about 5 minutes before declaring the blocker.
- Retry `link` and `push` up to 3 times over about 3 minutes, on connection and tenant errors only.
- End `0001_init.sql` with `notify pgrst, 'reload schema';`.
- Integration tests retry their first request on `PGRST205` for about 30 s.

### P19 (minor): Supabase CLI argument and output quirks
**Scenario.**
- A `base64url` password can start with `-`, and `--db-password -Abc…` (or `--password -…`) is then parsed as a flag.
- The 2.118 CLI has **two** output flags: `-o/--output` (env, pretty, json, …) and `--output-format` (text, json, stream-json). Which one makes `projects create` emit JSON is not documented in `--help`.
- On a JSON parse failure, the §8.2 fallback might log raw output. For `projects api-keys --reveal` that output contains the secret key.
- The CLI detects Claude Code (`--agent auto`) and runs without prompts, so anything that would prompt fails unless `--yes` is passed.

**Recommendation.**
- Always use the `--db-password=<pw>` and `--password=<pw>` forms, or generate an alphanumeric password.
- Write CLI stdout to a scratch file, parse it with Node, delete it, and print only masked values.
- Pass `--yes` and an explicit output flag, and test the parse once on `projects list`.

### P20 (minor): `db push` needs outbound TCP 5432 to the pooler
**Scenario.** The direct DB host is IPv6-only on the free plan. `supabase link` uses the pooler unless `--skip-pooler` is passed (per `--help`). Today TCP 5432 and 6543 to the ap-south-1 pooler hosts are reachable from this machine (verified). On an office or hotel network that blocks non-HTTP ports, `db push`, `migration list` and `db reset --linked` fail, while REST, realtime and CLI management calls (443) still work, which is confusing.

**Recommendation.** Never use `--skip-pooler`. Add a HANDOFF troubleshooting line: "db commands need outbound 5432; REST working does not prove DB access". Keep `gen types --linked` and management calls separate from DB-port calls in error messages. Avoid Docker-only commands (`db diff`, `db pull`, `start`, `db lint --local`), because Docker is not running.

### P21 (minor): migration naming scheme and grants for future tables
**Scenario.**
- Naming: `0001_init.sql` is fine, but PLAN §6 shows `0002_goals.sql`, while `supabase migration new` emits timestamp names. Once any timestamp migration is on the remote, a later `0002_…` sorts before it, and `db push` refuses ("insert before the last migration") unless `--include-all` is passed.
- Grants: since the 2026-05-30 Data API change, every future table in `public` needs explicit GRANTs, or supabase-js gets `42501`. The change reaches existing projects on 2026-10-30.

**Recommendation.** Add two `CLAUDE.md` rules:
- "migrations are `NNNN_name.sql`, sequential, never created with `supabase migration new`"
- "every new public table ships with `grant select, insert, update, delete … to anon, authenticated, service_role` plus RLS and a policy"

Make an integration test select from every table with the anon client, so a missing grant fails loudly.

### P22 (minor): the 7-day pause is invisible to the smoke check
**Scenario.** Free projects pause after 7 days without DB activity. Phase work spans days and devices. The deploy smoke check only fetches static HTML, so a deploy is green while the DB is paused, and the next WP5-style command fails with connection errors.

**Recommendation.**
- Add a session-start step to HANDOFF: run a DB ping (a tiny `npm run db:ping` script using the publishable key, or the settings integration test). If the project is paused, restore it from the dashboard.
- A keep-alive workflow needs permission for extra GitHub secrets, so defer it and note it.
- GitHub disables scheduled workflows in public repos after 60 days of repo inactivity.

### P23 (minor): region is irreversible
**Scenario.** The machine's zone is **Asia/Tokyo** (the locale is ja-JP). The task and PLAN say ap-south-1 ("nearest, e.g. Mumbai"). A Supabase region cannot be changed after creation (it takes a new project plus data migration). Separately, Vercel functions default to a US region, so Phase 2 MCP calls would cross continents on every DB query.

**Recommendation.** Keep ap-south-1 as instructed, but surface a one-line confirmation to the user before `projects create` (non-blocking if they already decided). Add `"regions": ["bom1"]` to `vercel.json` now (Hobby allows one function region), so Phase 2 functions sit next to the DB. The Dependabot `timezone: Asia/Kolkata` is cosmetic.

---

## F. Vercel

### P24 (major): `vercel build` re-runs `npm install`
**Scenario.** In CLI 61, `@vercel/static-build` runs the project's install command (`npm install` by default). It skips only when `VERCEL_INSTALL_COMPLETED=1` (verified in the shipped `@vercel/build-utils`). `deploy.yml` runs `npm ci` and then `vercel build`, so:
- (a) dependencies are installed twice
- (b) `npm install` may rewrite the lockfile or resolve a different tree than the one CI verified
- (c) all dependency lifecycle scripts, and then `vite build` plugins, run in a step whose env holds `VERCEL_TOKEN`

Locally (WP7), the same install can modify `package-lock.json` on Windows and slip into a commit.

**Recommendation.**
- Set `VERCEL_INSTALL_COMPLETED: '1'` on the build step, in CI and locally, and confirm "Skipping" in the rehearsal build log. Alternatively set `"installCommand": "npm ci"` in `vercel.json` and drop the separate step.
- Remove `VERCEL_TOKEN` from the build step if `vercel build` works without it (test during the rehearsal).
- Keep secrets step-scoped instead of workflow-level `env`.
- After a local `vercel build`, run `git diff --exit-code package-lock.json`.

### P25 (major): production can be built without Supabase config and still pass
**Scenario.** The prebuilt path only bakes in what `vercel pull` can read. Sensitive values are never returned: CLI 61 `env pull` writes `SENSITIVE_ENV_VALUE_PLACEHOLDER`, and `vercel pull` gives the build an empty or placeholder value. A `VITE_*` variable can become sensitive in several ways:
- a team "enforce sensitive" policy
- a re-add without `--no-sensitive`
- a CLI default change

CI then builds a bundle without the URL or key. Production shows "Database not configured", and the smoke check (HTTP 200 on `/`) still passes.

**Recommendation.**
- In `deploy.yml`, after `vercel build`, run `grep -rqs '\.supabase\.co' .vercel/output/static/assets` and `grep -rqs 'sb_publishable_' …`. Fail (without printing matches) if either is missing.
- Add a build guard (a tiny Vite plugin or a check in `build`): when `VERCEL_ENV=production`, fail if either `VITE_*` variable is empty or equals the placeholder.
- Make `readSupabaseEnv` reject the placeholder string.
- In WP7, verify the types with `vercel env ls --format json` (names, targets and types only).

### P26 (major): disabling protection for the whole project exposes every immutable URL
**Scenario.** D0-14 runs `project protection disable --sso`, which sets `ssoProtection: null`, so every URL is public. The CLI's `enable --sso` sets `deploymentType: "prod_deployment_urls_and_all_previews"` (verified in CLI 61 source). That is Standard Protection: the **production domain stays public** (which satisfies the task and the future MCP endpoint), while every generated deployment URL (`<project>-<hash>-<scope>.vercel.app`) needs Vercel login.

With protection off:
- every immutable deployment URL stays publicly reachable forever
- each one embeds the secret project name
- each old deployment keeps its own env snapshot, so after Phase 2, rotating `MCP_SECRET` (PLAN §16 mitigation) does **not** revoke the old secret path on old deployment URLs

Since 2026-09-09, Vercel also lets a team default new projects to "All deployments" protected, so the starting state may differ from the plan's assumption.

**Recommendation.**
- Use `vercel project protection enable <name> --sso` (Standard) instead of `disable`.
- Verify with an unauthenticated request: the production domain returns 200, and one unique deployment URL (read from the deploy output file, never printed) returns 401/403/302.
- Update D0-14, R9, AC-23 and the §8.3 commands. Keep the smoke check on the production domain only.

### P27 (major): the "new project" path creates a project and auto-connects Git
**Scenario.** Reading the CLI 61 source:
- Linking to an **existing** project (`vercel link --yes --project <existing>`) does **not** auto-connect Git. The plan's R6 premise is partly wrong.
- The **new project** path does. It runs whenever the `--project` value does not resolve (a typo, or an empty `$NAME` because `envget` failed), or when `vercel pull/build/env pull --yes` runs in a folder without `.vercel/` and without `VERCEL_ORG_ID`/`VERCEL_PROJECT_ID`. That path creates a project named after the flag or folder and calls `resolveGitConnectIntent`, which auto-connects `origin` when `--yes` is passed **or** when the CLI is non-interactive. Non-interactive is the default when an agent is detected (per `--help`), which is always the case in Claude sessions.

The result is a stray public project connected to the GitHub repo. It could create deployments or bot comments on branches whose `vercel.json` lacks `git.deploymentEnabled: false`, for example `main` before the Ship merge.

**Recommendation.**
- Guard with `[ -n "$NAME" ]`. Require `vercel project inspect "$NAME" --format json` to succeed before `link`.
- Pass `--team <scope>` as the CLI help advises for non-interactive links.
- After any link, assert that `.vercel/project.json` has a `projectId` and that `vercel project ls` did not grow.
- Keep the `git disconnect` and inspect verification in WP7, and repeat the check after the WP9 rehearsal and in the Ship checklist.
- In CI, the pre-check already refuses empty IDs. Keep it.

### P28 (minor): `vercel env pull` merges and writes a placeholder
**Scenario.** CLI 61 `env pull` (verified in source):
- **Merges** into an existing file and keeps local-only keys.
- Writes `SENSITIVE_ENV_VALUE_PLACEHOLDER` for secret values it cannot return.
- In non-interactive mode, refuses to overwrite a `.env.local` not created by the CLI unless `--yes` is passed.
- Also writes `VERCEL_OIDC_TOKEN` (valid about 12 h) and, when system env exposure is on, Vercel system variables.

The WP9 "every key matches" comparison and the scripts that read `.env.local` do not expect this.

**Recommendation.** The resume check should be subset-based: the expected 7 keys must be present and equal, and extra keys are allowed. It must fail if any value equals the placeholder. `scripts/supabase.mjs`, the integration config and `readSupabaseEnv` should reject the placeholder with a clear message ("value is a Vercel secret; store it as non-sensitive in development").

### P29 (minor): `sync-vercel-env.mjs` cannot spawn `npx` on Windows without a shell
**Scenario.**
- `spawnSync('npx', …)` fails with `ENOENT` on Windows (`npx` is `npx.cmd`).
- Since the 2024 fix for CVE-2024-27980, Node refuses to spawn `.cmd`/`.bat` files without `shell: true` (`EINVAL`).
- With `shell: true`, arguments go through cmd.exe quoting.
- Also: a value piped with a trailing newline is stored with the newline.
- Adding to the `preview` target non-interactively may demand `--git-branch`.
- The `env ls` and `project inspect` outputs may include values or domains that should not land in the session transcript.

**Recommendation.**
- Install `vercel@61.0.0` once into a scratch folder and spawn its `dist/vc.js` with `process.execPath`, the same pattern as `supabase.mjs`. Or spawn npm's `npx-cli.js` next to `node.exe`.
- Pass values only via stdin, with no trailing newline.
- Read back with `--format json`, and print only names, targets and types.

### P30 (minor): the SPA rewrite swallows missing assets and `/api`
**Scenario.**
- After a redeploy, a stale tab requests `/assets/index-OLDHASH.js`. The rewrite serves `index.html` with status 200 and `text/html`, and the `/assets/(.*)` header rule adds `Cache-Control: public, max-age=31536000, immutable` to that HTML response. The browser then gets a MIME error instead of a clean 404.
- `/api` (no trailing slash) is also rewritten, because `(?!api/)` only excludes `api/`.

**Recommendation.** Use the source `"/((?!api(?:/|$)|assets/).*)"`. Add to AC-19: `curl -sI $PROD_URL/assets/nope.js` returns 404, and `$PROD_URL/api` returns 404.

### P31 (minor): `robots.txt Disallow: /` hides the `noindex` header
**Scenario.** Crawlers that obey `Disallow: /` never fetch the pages, so they never see `X-Robots-Tag: noindex` or the robots meta. A URL that leaks somewhere can still be indexed as a bare URL.

**Recommendation.** Drop `Disallow: /` (serve an allow-all `robots.txt`, or none) and rely on the `noindex` header and meta tag. Keep `Referrer-Policy: no-referrer`.

---

## G. GitHub Actions, CI and repo settings

### P32 (major): Deploy is not gated on CI and can be dispatched from any branch
**Scenario.**
- `push: main` starts Deploy in parallel with CI on the merge commit. The ruleset has `strict_required_status_checks_policy: false`, so the merged tree itself was never verified. A red post-merge CI still ships.
- Once `deploy.yml` is on `main`, `workflow_dispatch` lets anyone with write access pick **any branch** that contains the file. That deploys unmerged code to production.
- Every merged Dependabot PR also deploys to production.

**Recommendation.**
- Add a job-level `if: github.ref == 'refs/heads/main'`.
- Gate on verification. Either run `typecheck`, `lint` and `test` in the deploy job before `vercel build` (simplest), or trigger on `workflow_run` of CI with `conclusion == 'success' && head_branch == 'main'` and check out `workflow_run.head_sha`.
- Document that Dependabot merges deploy.

### P33 (minor): the smoke check cannot identify the new deployment
**Scenario.** The smoke check asserts HTTP 200 on the production domain. If aliasing lags, or the new deploy silently was not promoted, the check passes against the previous deployment.

**Recommendation.** Emit `dist/version.json` (or a `<meta name="build">` tag) with `$GITHUB_SHA` at build time. The SHA is public anyway. Have the smoke check fetch it and require it to equal `$GITHUB_SHA`, keeping the existing retries.

### P34 (major): the project name leaks into public failure logs
**Scenario.** Vercel CLI output names the project as `<scope>/<project>`, for example in "Downloading `production` Environment Variables for <scope>/<project>". That is not a URL, so `redact-log.sh` (URL and `*.vercel.app` patterns) does not touch it. `::add-mask::${host%%.*}` covers it only when the production host's first label **equals** the project name. R8 (a suffixed domain after a name collision) breaks that assumption, and any failure then prints the secret project name into a public log.

**Recommendation.** After `vercel pull`, read `projectName` from `.vercel/project.json` (verified: CLI 61 writes it) with `jq -r .projectName` and `echo "::add-mask::$name"`. The runner does not display `add-mask` lines. Also make `redact-log.sh` replace that literal. Scan every CI log with `check-leaks --stdin` (AC-28) after the first failing run as well, not only green ones.

### P35 (major): config files that only work from the default branch are unvalidated until Ship
**Scenario.** Several things only take effect once they are on `main`:
- `.github/dependabot.yml`
- issue forms and `ISSUE_TEMPLATE/config.yml`
- the PR template (for newly created PRs; the WP1 PR predates it)
- CodeQL default setup
- the README CI badge

During the phase none of these is active or validated. A schema error in `dependabot.yml` or an issue form surfaces only after the Ship merge. WP3/WP8 verification ("templates exist") cannot catch it.

**Recommendation.**
- Validate locally with `uvx check-jsonschema --builtin-schema vendor.dependabot .github/dependabot.yml`, `vendor.github-issue-forms` (each form), `vendor.github-issue-config` and `vendor.github-workflows`. `uv` is installed. Run this in WP3, and optionally as a CI step.
- Add to the Ship checklist: Dependabot shows a successful check (Insights, Dependency graph, Dependabot), the issue forms render at `/issues/new/choose`, and the badge shows a status.

### P36 (minor): the required check `verify` is ambiguous and can stay pending
**Scenario.** A required status-check context is just the job name. Any future job named `verify` in another workflow (for example `android-apk.yml`) satisfies or blocks it ambiguously. A `paths-ignore` on `ci.yml`, or a commit containing `[skip ci]`, leaves the required check pending forever, which blocks the merge.

**Recommendation.** Use a unique job name such as `ci-verify` and keep it stable. Add `CLAUDE.md` rules: no path filters on `ci.yml`, never `[skip ci]`, and no other job may reuse the name.

### P37 (minor): ruleset, issue and PR creation are not idempotent
**Scenario.**
- Re-running WP8 after an interrupted session POSTs a **second** "main protection" ruleset.
- Re-running WP1 on another device creates a duplicate tracking issue or PR.
- `gh issue edit --body-file` also overwrites any ticks the user made in the browser.

**Recommendation.**
- Rulesets: GET by name, then PUT `/rulesets/{id}` if one exists, else POST.
- Before creating, check `gh pr list --head phase-0-foundation --state all` and `gh issue list --label tracking --state all`.
- Record the issue and PR numbers in HANDOFF.
- Edit the issue body by re-reading it first and toggling only the target checkbox.

### P38 (minor): the `gh` token needs the `workflow` scope
**Scenario.** Pushing `.github/workflows/*` over HTTPS with an OAuth token that lacks `workflow` is rejected ("refusing to allow an OAuth App to create or update workflow"). The current token has it (verified); a fresh `gh auth login` on another device may not.

**Recommendation.** HANDOFF: `gh auth login --scopes workflow` (or `gh auth refresh -s workflow`), then check that `gh auth status` lists `workflow`.

---

## H. Secret leakage

### P39 (major): leak-checker false positives and CI blind spots
**Scenario.**
- (a) Plan §6.6 treats **every** `.env.local` value of at least 8 characters as sensitive. After any `vercel env pull`, `.env.local` also holds Vercel-managed entries: `VERCEL_OIDC_TOKEN`, and, when system variables are exposed, entries such as `VERCEL_ENV="development"`. The ordinary word "development" then counts as a secret, and `npm run verify` fails on README, PLAN and the docs right after the resume rehearsal.
- (b) In CI, `actions/checkout` defaults to `fetch-depth: 1`, and on `pull_request` it checks out a synthetic merge commit. The "last 200 commit messages" scan therefore sees one irrelevant message.
- (c) The generic patterns only match `https://<ref>.supabase.co`. They miss bare `db.<ref>.supabase.co`, pooler users `postgres.<ref>`, and Vercel `prj_…` / `team_…` IDs, which CI cannot learn from `.env.local`.

**Recommendation.**
- Replace the heuristic with an explicit key allowlist: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`, `VERCEL_PROJECT_NAME`, `PROD_URL`, `VERCEL_OIDC_TOKEN`, later `MCP_SECRET`, plus derived hosts and the `.vercel/project.json` IDs.
- Use `fetch-depth: 0` in CI and scan `base.sha..head.sha`.
- Add the patterns `\b[a-z]{20}\.supabase\.(co|in)\b`, `postgres\.[a-z]{20}\b`, `\bprj_[A-Za-z0-9]{20,}`, `\bteam_[A-Za-z0-9]{20,}`.
- Read the file list with `git ls-files -z`.

### P40 (major): test fixtures shaped like real keys
**Scenario.** `env.test.ts` must prove that an `sb_secret_…` key is rejected. A realistic fixture (prefix plus 24 characters, or the "fake leak" from the WP3 verification written to a tracked file) trips two things:
- `check-leaks` (pattern `sb_secret_[A-Za-z0-9_-]{16,}`), which fails CI
- GitHub **push protection**, which has Supabase secret-key detectors and is enabled on this repo (verified)

A blocked push needs a browser bypass by the user, which a session cannot do. Supabase is a secret-scanning partner, so real-looking tokens in public commits are also reported to them.

**Recommendation.** Build fixtures at runtime and keep them under the 16-character threshold, for example `'sb_' + 'secret_' + 'x'.repeat(8)`. Never paste key-shaped strings into docs or reports. Run the WP3 fake-leak test only on an untracked, gitignored file in the scratchpad or repo, then delete it.

### P41 (minor): no rotation runbook; GitHub cannot see generic secrets
**Scenario.**
- If a real key reaches a pushed commit, rewriting history is blocked on `main` and GitHub keeps PR views. The only fix is rotation.
- The publishable key and URL are baked into the bundle at build time, so rotating them requires a rebuild and deploy.
- `secret_scanning_non_provider_patterns` is **disabled** (verified), so GitHub will not flag a generic string like the DB password.

**Recommendation.** Add a "Leak response" section to `CLAUDE.md`/HANDOFF:
1. Rotate in the dashboard (Supabase keys or DB password, Vercel token).
2. Update `.env.local`.
3. Run `npm run env:sync-vercel`.
4. Redeploy.
5. Update the GitHub secrets.
6. Record the rotation (without values) in the dev log.

Add "enable non-provider secret scanning patterns" to the open questions (it is not in the granted permissions).

---

## I. HANDOFF and reproducibility

### P42 (major): the resume steps fail in three shell-specific ways
**Scenario.**
- (a) **Order.** HANDOFF and AC-27 run `npm ci` (step 4) before switching to the phase branch (last step). During a phase, `main` has no `package.json` until Ship, so `npm ci` fails. The WP9 rehearsal switches first, so the rehearsal passes while the documented steps fail.
- (b) **Quoting.** `git config --add credential.https://github.com.helper "!gh auth git-credential"` in an interactive bash or zsh triggers history expansion (`event not found`).
- (c) **PowerShell 5.1** drops empty-string arguments to native programs. `git config credential.https://github.com.helper ""` becomes a *read*, so the helper-list reset never happens. Git then consults the global Git Credential Manager first, which may hold the work account's github.com credential, and pushes go out as the wrong account or get 403.

**Recommendation.**
- Clone directly onto the branch (`git clone -b <branch> …`) or switch before `npm ci`. Make AC-27, HANDOFF and the WP9 rehearsal identical.
- Use single quotes: `'!gh auth git-credential'`.
- State "run these in Git Bash".
- Add verification lines: `git config --get-all credential.https://github.com.helper` prints an empty line and then the gh helper, and `git ls-remote origin` works without a prompt.

### P43 (minor): fresh-machine tooling
**Scenario.**
- nvm-windows does not read `.nvmrc`, so "install Node per `.nvmrc`" is ambiguous.
- A fresh Windows machine defaults to execution policy `Restricted`, so `npm`/`npx` (their `.ps1` shims) fail in PowerShell. This machine has `CurrentUser RemoteSigned` (verified).
- `supabase login` and `vercel login` need a browser, so a Claude session cannot do them.

**Recommendation.** In HANDOFF:
- `winget install Schniz.fnm`, then `fnm install 24 && fnm use 24` (or `nvm install 24 && nvm use 24` for nvm-windows).
- Recommend Git Bash, or `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.
- List the two logins as user actions, with `SUPABASE_ACCESS_TOKEN` and `VERCEL_TOKEN` env vars as headless alternatives (never written to disk in the repo).

### P44 (minor): cross-device drift
**Scenario.**
- Device A rotates a key and updates Vercel; device B keeps a stale `.env.local`.
- Both devices push to `phase-0-foundation`, and one push is rejected as non-fast-forward.
- The DB is paused after a week away (P22).

**Recommendation.** Add a session-start ritual to HANDOFF and CLAUDE.md:
1. Preflight for the gh account and git identity (P3, P4).
2. `git switch <branch> && git pull --ff-only`.
3. `npx vercel@61.0.0 env pull .env.local --yes` if keys changed.
4. DB ping.
5. `npm ci` if the lockfile changed.

Never force-push the phase branch; merge instead.

---

## Corrections to plan-v1 facts

| Plan location | Plan says | Verified reality | Item |
|---|---|---|---|
| §2.1 supabase row | JS bundle, no binary download | No postinstall, but 8 platform `optionalDependencies` of about 152 MB each; the shim throws if the platform package is missing | P10 |
| §2.2 item 5, R6 | `vercel link --yes` auto-connects Git | Only the new-project path auto-connects (with `--yes` or non-interactive/agent mode); linking an existing project does not | P27 |
| §2.2 item 4 | Sensitive vars pull back empty | CLI 61 `env pull` writes `SENSITIVE_ENV_VALUE_PLACEHOLDER` and merges with the existing file | P28 |
| D0-14, AC-23 | Disable SSO protection | `enable --sso` gives Standard (`prod_deployment_urls_and_all_previews`): production domain public, deployment URLs gated | P26 |
| §8.3 | `vercel api "/v9/…"` in Git Bash | MSYS rewrites it to `C:/Program Files/Git/v9/…` | P6 |
| §9.2 | `npm ci` then `vercel build` | `vercel build` runs `npm install` again unless `VERCEL_INSTALL_COMPLETED=1` | P24 |
| §9.2 | Mask the host's first label | Only covers the project name when the host is unsuffixed; `projectName` is in `.vercel/project.json` | P34 |
| §6.6 | Every `.env.local` value of 8+ characters is sensitive | The pulled file contains Vercel-managed entries; use a key allowlist | P39 |
| AC-27 and HANDOFF | `npm ci` before switching branch | Fails mid-phase (no `package.json` on `main` before Ship) | P42 |
| R14 | CI runs Node 24 | 24.21.0 with npm 11.19.0, newer than local npm 11.17.0 | P11 |

## Verified-OK (no action needed)

- `actions/checkout@v7` (v7.0.1) and `actions/setup-node@v7` (v7.0.0, `node24` runtime, has `package-manager-cache`) exist. Latest actionlint is v1.7.12.
- Vercel CLI 61 `project update` supports `--node-version 24.x` (the highest option listed) and `--framework vite`. `env add` supports `--value`, `--sensitive`, `--no-sensitive`, `--force` and `--yes`. `git disconnect` accepts `--yes`. `project inspect` supports `--format json`.
- Supabase CLI 2.118 supports `projects create --region ap-south-1`, `projects api-keys --reveal`, `link` (pooler by default), `db push --dry-run/--linked` and `gen types --linked --schema`. `db push` also syncs vault secrets from `config.toml` unless `--skip-vault` is passed (none are defined).
- TypeScript: 6.0.3 is the last 6.x and 7.0.2 is `latest`. `typescript-eslint@8.71.0` peers on `typescript >=4.8.4 <6.1.0`. No 6.1 exists, so the Dependabot major-ignore is sufficient.
- Repo: Actions default workflow permissions are `read`. Secret scanning and push protection are enabled. No rulesets yet. CodeQL default setup is `not-configured`. The `gh` token has the `workflow` scope.
- Network from this machine: no proxy. The Supabase pooler (5432/6543), `api.supabase.com` and `api.vercel.com` are reachable. TLS verifies.
- Supabase Data API grants change: confirmed (new projects from 2026-05-30; all projects from 2026-10-30). The plan's explicit GRANTs are required and sufficient for the six tables.
- Realtime "Allow public access" defaults to enabled, so `postgres_changes` with the publishable key works under the open RLS policies. The integration test (d) would detect a change.

## Sources
- [Supabase: Breaking change, tables not exposed to Data and GraphQL API automatically](https://supabase.com/changelog/45329-breaking-change-tables-not-exposed-to-data-and-graphql-api-automatically)
- [Supabase: About billing (free project limit across organizations)](https://supabase.com/docs/guides/platform/billing-on-supabase)
- [Supabase: IPv4 and IPv6 compatibility](https://supabase.com/docs/guides/troubleshooting/supabase--your-network-ipv4-and-ipv6-compatibility-cHe3BP)
- [Supabase: Realtime settings (Allow public access)](https://supabase.com/docs/guides/realtime/settings)
- [Vercel: Deployment Protection](https://vercel.com/docs/deployment-protection)
- [Vercel changelog 2026-09-09: Protect production deployments for free on every plan](https://vercel.com/changelog/protect-production-deployments-for-free-on-every-plan)
- [Vercel: System environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)
- [Vercel: OIDC federation (`VERCEL_OIDC_TOKEN` via `vercel env pull`)](https://vercel.com/docs/oidc)
- [Vercel KB: GitHub Actions with Vercel (prebuilt)](https://vercel.com/kb/guide/how-can-i-use-github-actions-with-vercel)
- [dependabot-core #4795: Dependabot removes optional dependency from package-lock](https://github.com/dependabot/dependabot-core/issues/4795)
- [npm/cli #4828: platform-specific optional dependencies missing from lockfile](https://github.com/npm/cli/issues/4828)
- [GitHub changelog: Supabase secret scanning partner](https://github.blog/changelog/2022-03-28-supabase-is-now-a-github-secret-scanning-partner/)
- [GitHub changelog: secret scanning pattern updates, March 2026](https://github.blog/changelog/2026-03-10-secret-scanning-pattern-updates-march-2026/)
- [Claude Code settings (`attribution`)](https://docs.anthropic.com/claude/docs/claude-code/settings)
- [anthropics/claude-code #17849: `includeCoAuthoredBy` deprecated by `attribution`](https://github.com/anthropics/claude-code/issues/17849)
