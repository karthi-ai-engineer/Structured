# Phase 0 plan: systems design review, round 1

| | |
|---|---|
| Plan reviewed | `docs/phases/phase-0/PLAN.md` (final plan, 2840 lines), against master `PLAN.md`, `edge-cases-functional.md`, `edge-cases-platform.md` and the repository at `1195168` |
| Date | 2026-09-30 |
| Verdict | **Changes requested:** 1 blocking issue, which is a small text fix |
| Score | **8 / 10** |

**Summary.** The plan is correct and complete, and nearly every factual claim checks out. I re-verified the risky claims on this machine instead of trusting them (see the evidence table below). One requirement from the task is broken by the plan's own template text (B1). Fix it and the plan can be approved. The main non-blocking concern is size: this is a lot of machinery for a size-S phase (see section 5).

---

## 1. Evidence: what I verified independently

| Claim in the plan | How I checked | Result |
|---|---|---|
| Versions in §2.1 (create-vite 9.2.1, vite 8.3.1, plugin-react 6.1.1, React 19.3, TS 7.0.2 as `latest`, typescript-eslint 8.71.0, ESLint 10.11, Vitest 5.0.2, Tailwind 4.3.3, shadcn 4.21.0, supabase-js 2.117.2, Supabase CLI 2.118.0, date-fns 4.4 / tz 1.5, Vercel CLI 61.1.0) | `npm view <pkg> dist-tags` | All match |
| TS must stay `~6.0.x` | `npm view typescript-eslint@8.71.0 peerDependencies` gives `typescript >=4.8.4 <6.1.0` | Confirmed (D0-2 correct) |
| Actions `checkout@v7`, `setup-node@v7`, the `package-manager-cache` input, actionlint 1.7.12 | `gh api repos/.../releases/latest`, `action.yml@v7` | v7.0.1 / v7.0.0 exist (node24 runtime). The input exists. actionlint v1.7.12 is latest. |
| Supabase CLI ships as a JS shim plus platform `optionalDependencies` | `npm view supabase@2.118.0 optionalDependencies bin` | 8 `@supabase/cli-<os>-<arch>` packages. Names are `windows-x64` and `linux-x64`, which the hygiene check already allows. |
| Supabase CLI flags: `projects create --org-id --region --db-password`, `projects api-keys --reveal`, global `--yes`, `db push --dry-run --linked`, `gen types --lang --project-id --schema`, `link --password`, `init` without prompts | `supabase <cmd> --help` (2.118.0) | All present. `init` is interactive only with `-i`. |
| Vercel CLI 61.1.0: `project add/inspect/update/protection`, `update --framework --node-version 24.x`, `protection enable --sso`, `env add --no-sensitive/--sensitive/--force/--value`, `git disconnect --yes`, `link --project --team`, `build --prod --yes`, `deploy --prebuilt --prod`, `-Q` global config, `api` | `vercel <cmd> --help` | All present. Node 24.x is the highest `--node-version`. |
| supabase-js 2.117 behaviour (§2.2 item 7): `.retry(false)`, GET retried on network errors and 520/503, `AbortError` never retried, errors returned as `status 0` with `"<Name>: <message>"` | Read `@supabase/postgrest-js@2.117.2` `dist/index.mjs` / `.d.mts` | Exactly as described. `retry(enabled): this` and `maybeSingle()` exist on the builder. |
| Standard Protection leaves production domains public | Vercel docs, Deployment Protection page (updated 2026-09-15): "Standard Protection: Protects all deployments except production domains" | Confirmed (D0-14 satisfies "production publicly reachable") |
| New Supabase projects need explicit Data API grants (D0-9) | Supabase changelog #45329: default for new projects from 2026-05-30 | Confirmed |
| Rewrite source `/((?!api(?:/|$)|assets/).*)` | Compiled with `@vercel/routing-utils` 6.6.0 and tested paths | `/`, `/day/…` rewrite. `/api`, `/api/`, `/api/mcp/x` and `/assets/missing.js` do not. `/apiary` does. Valid. |
| Vercel's Vite preset adds no SPA fallback (else the `/assets/*` 404 smoke check would fail) | Read the Vite preset in `@vercel/static-build` (CLI 61.1.0) | No `defaultRoutes`. The plan's rewrite is the only fallback. |
| Scaffold chain works as written (WP1/WP2) | In the scratchpad: create-vite `--template react-ts --eslint --no-interactive --no-immediate`, then Tailwind, then `shadcn@4.21.0 init --template vite --base radix --preset nova --yes --no-monorepo < /dev/null` | Non-interactive, exit 0. `components.json` has style `radix-nova` and css `src/styles/index.css`. `button.tsx` and `utils.ts` are created. **No `baseUrl` added.** `tsc -b` and `vite build` pass. `shadcn` and `tw-animate-css` land in `dependencies` (the plan already moves them). |
| Lockfile natives (P10) | `package-lock.json` of the scratch app | win32-x64, linux-x64 and darwin-arm64 entries for rolldown, oxide and lightningcss |
| §5.8 ESLint config and the six AC 9 negative tests | Ran the exact config in the scratch app | Baseline lint clean (the project service resolves the solution tsconfig). All 6 negative cases fail with the configured messages. `src/core/dates.ts` may call `new Date()`. |
| AC 13 hermetic tests on Windows / Git Bash | Ran the §5.7 Vitest config with a `.env.local` present | Offset 210, zone `America/St_Johns`, `import.meta.env.VITE_*` empty, `fetch` rejects. TSX with `renderToStaticMarkup` works without the React plugin. |
| `vite.config.ts` importing `./src/data/env.ts`; the production guard; M3 empty-override | Scratch app, Git Bash | `tsc -b` passes (`tsconfig.node.json` is `nodenext` with `allowImportingTsExtensions`). The guard exits 1 even with `.env.local` present. `VAR=` reaches Node as `""` and overrides `.env.local`. |
| DST algorithm (§6.1) and all expected values in §13.1 | Ran the §6.1 pseudo-code against `@date-fns/tz@1.5.0` under `TZ=America/St_Johns` | **All 26 table rows match.** `TZDate`'s constructor really gives 14:15Z for Chatham 2026-04-05 03:00 (the plan's reason for not using it). |
| Repo baseline for `check:*` | `git log origin/main..HEAD`, `git ls-files --eol`, the §8.6 regexes over every tracked file plus `PLAN.md` | All authors are the allowlisted e-mail. There are no trailers, all files are LF, and nothing has a BOM. **Zero** generic leak-pattern hits, so the frozen docs (AC 3) cannot break CI. |
| Account preconditions for WP7 | Read-only CLI and API calls (counts and flags only) | One Vercel team, currently **0 projects**, and `sensitiveEnvironmentVariablePolicy = "default"` (not enforced), so `--no-sensitive` Config works. The plan is Hobby. |

## 2. Blocking issue

### B1. The PR template, which the task says must contain "No AI mentions", contains one
- The task (deliverable 11e) says: "`.github/pull_request_template.md` and issue templates … **No AI mentions.**" §10.4 even states "Neither template contains AI mentions". Yet its own checklist item reads **"no AI attribution (`npm run check:commits -- --text-file <body>`)"**.
- A developer following §10.4 literally commits a template that breaks an explicit deliverable. Every future PR body built from that template would then carry the mention.
- **Same issue at Ship.** §17.1 step 4 (and the pipeline's Ship stage) puts "the acceptance criteria as a ticked checklist" into the PR body, and AC 37 is titled "No AI attribution".
- **Fix (text only):**
  1. Reword the template item to something like "Commit and PR text pass `npm run check:commits -- --text-file <body>`".
  2. Give AC 37 a neutral title such as "Attribution and authorship checks pass", so the Ship PR checklist does not mention AI.
  3. Add one line to §10.4 / WP3 verification: `grep -niwE 'ai|claude|anthropic|llm' .github/pull_request_template.md .github/ISSUE_TEMPLATE/*` prints nothing.
  4. Apply the same rule to the release notes in §17.1 step 11 (already stated).

## 3. Should fix (not blocking; cheap and worth doing in the revision)

1. **Dependabot PRs can be blocked by `check:commits`.**
   - `ci-verify` checks `PR_BODY` for the robot emoji and "Co-Authored-By … copilot|claude…" lines.
   - Dependabot PR bodies embed upstream release notes and commit lists, and in 2026 those often contain exactly these strings.
   - The ruleset has no bypass actors, so such a PR could never merge.
   - **Fix:** skip the `PR_TITLE`/`PR_BODY` scan when `github.event.pull_request.user.type == 'Bot'` (or when the login ends with `[bot]`). Keep the commit-message and author checks for everyone.
   - Also document the fix path when `check:hygiene` rejects a Dependabot lockfile: regenerate on Windows and push to the Dependabot branch.
2. **Open question 7 (region) cannot be answered in time.**
   - Open questions are "asked in the phase report", but Q7 says "say so before WP5".
   - The permissions already fix `ap-south-1`, so the plan is correct to use it.
   - **Fix:** either drop Q7, or move it to the credentials preflight (pipeline stage 5), which pauses for the owner anyway. Do not leave a question that implies the plan will wait.
3. **Phase 1 seeding trigger.**
   - Master plan §14 Phase 1 seeds "Rise and Shine" / "Wind Down" when there is **no settings row**, but Phase 0 creates that row (D0-10, required by the task).
   - Phase 1 will therefore never seed unless it uses another trigger, such as "no tasks and no seed marker".
   - **Fix:** add one line to the HANDOFF "Next" / CLAUDE.md data conventions so the Phase 1 planner sees it. No Phase 0 code change.
4. **Supabase CLI output stability.**
   - 2.118 is a rewrite (Bun shim plus Go sidecar). It has two output flags: `--output-format text|json|stream-json` and `-o/--output env|pretty|json|…`.
   - It also has `--agent auto`, which changes behaviour when it detects an AI agent, as this pipeline is.
   - The help example confirms `projects api-keys --reveal --output json`, but not `projects create -o json`.
   - **Fix:** in `setup-supabase.mjs` / `supabase.mjs`:
     1. Pass `--agent no` (or set it explicitly) so text output matches what the owner sees on another machine.
     2. If `-o json` does not yield JSON for `projects create`, try `--output-format json`, then fall back to the planned re-list.
5. **AC 25 "project ls counts exactly 1 project"** is true today (the team has 0 projects) but fragile. Count projects whose name equals `VERCEL_PROJECT_NAME` (must be 1) and whose name starts with `structured-` (must be 1), not the whole team.
6. **Phase 2 readiness for `server/` and `api/` TypeScript.**
   - I confirmed that type-aware ESLint fails with "was not found by the project service" for a `.ts` file outside every tsconfig.
   - Phase 0 has only README placeholders there, so nothing breaks now.
   - **Fix:** add a one-line note in CLAUDE.md ("new top-level TS folders need a tsconfig referenced from `tsconfig.json`").
   - **Fix:** add a HANDOFF note that Phase 2 must verify early that Vercel's function bundling handles `src/core`'s `.ts`-suffixed relative imports (for example with `rewriteRelativeImportExtensions`, or Node 24 type stripping in the function runtime).

## 4. Minor suggestions
- **TS 6 defaults.** `strict` is already the default in TS 6 (create-vite's `tsconfig.app.json` no longer sets it). Adding it explicitly is fine and keeps AC 5 simple.
- **Prettier and the "exact" files.** Prettier formats `.github/**/*.yml` and the JSON files. The "exact" YAML in §10 may be reformatted slightly. Tell developers to run `npm run format` after writing them, and that formatting changes are not plan deviations.
- **shadcn dependencies.** shadcn now installs the `cn` package (maintained by shadcn, repo `shadcn-ui/cn`), and `utils.ts` is `export { cn } from "cn"`. AC 6 still holds. `@fontsource-variable/geist` is CSS-only and can be a devDependency too, for consistency with §5.4.
- **`vercel api` scoping.** Team-scoped endpoints may need `?teamId=<orgId>` for `vercel api /v9/projects/<id>/domains` (`/v2/teams/<id>` worked here). Keep the `inspect` fallback.
- **Duplicated alias.** `vitest.config.ts` repeats the alias. `mergeConfig` with the Vite config is not needed and would pull in the env guard, so keep it separate. It works as written.

## 5. Assessment by dimension

**Correctness and feasibility (strong).**
- Every command and flag I could check exists in the pinned tool versions.
- The supabase-js failure model and the DST maths are verified.
- The deploy script handles the empty `auth` array (bash 5 on both runners), masking order, pulled env file paths and the prebuilt build.

**Completeness (complete).** Each task deliverable maps to plan sections:

| Deliverable | Where the plan covers it |
|---|---|
| 1. Git | §5.2 |
| 2. Stack | WP1, WP2 |
| 3. Skeleton | §4, WP2 |
| 4. CLAUDE.md | WP2, WP9 |
| 5. `dates.ts` | §6.1, §13.1 |
| 6. Migration | §7 |
| 7. Supabase and env matrix | §8.4, §9.2, §5.11 |
| 8. Client and home page | §6.2 to §6.6 |
| 9. Scripts and Node pin | §5.4, §5.3 |
| 10. Vercel | §9.3, §5.9 |
| 11a to f. CI/CD | §10 |
| 12. Presentation | §9.5, WP9 |
| 13. HANDOFF | WP9 |

The §7 migration keeps every §7.1 column, default, check and FK. It adds only the documented D0-9, D0-21 and D0-22 items.

**Architecture fit (good).**
- The import rules are executable, and I checked them: the negative lint tests plus `check:core`.
- `src/core` stays pure and Node-loadable.
- The rewrite and `regions` leave room for Phase 2 functions.
- See S3 and S6 for two forward notes.

**Edge-case coverage (complete).** All 81 IDs (F1 to F37, P1 to P44) appear in §15. Each rejection or deferral (F3 auto-rollback, F10 auto re-check, F20 `sameTimeZone`, F26 matrix, F30) is reasoned.

**Testability (good).**
- All 38 ACs name a command or observable. AC 19 and AC 24 need a real browser on the owner's machine; Claude in Chrome or headless Chromium works, since it uses the host zone.
- One criterion needs rewording (AC 37 title, B1) and one is fragile (AC 25, S5).

**Simplicity (the weakest dimension).**
- Size S now carries 12 custom scripts, a clean-clone deploy rehearsal plus a clean-clone resume rehearsal, build-SHA stamping, exact-value bundle checks, a protected-URL probe and 38 ACs.
- Most of this is justified by the owner's hard rules (public repo, URL-as-password, no attribution, multi-machine, Windows), so I do not block on it.
- Recommendation: mark these as "best effort" so they cannot stall the phase. They could be recorded as deferred in DEVLOG if they cost more than about 30 minutes each:
  - `sync-vercel-env.mjs --force` semantics and the preview API fallback
  - the `--expect-protected` probe
  - `check:hygiene` pin consistency
- Keep as mandatory:
  - the leak and attribution checks
  - the deploy script
  - the resume rehearsal (deliverable 13 demands it)

**Hidden risks (mostly covered).**
- Covered by the plan: R1 to R21.
- The new risks found in this review are S1 (Dependabot), S4 (CLI agent mode) and S3 (Phase 1 seeding).
- Vercel's sensitive-env policy is not enforced for this team, so R5's "owner must turn the policy off" scenario should not occur.

## 6. What round 2 should check
1. B1 is fixed:
   - the template item is reworded
   - the AC 37 title is neutral
   - the template grep check is added to WP3 verification
2. S1 to S6 are adopted or explicitly declined in the "Revision r1" changelog.
3. No new inconsistency is introduced, for example between §10.4, §12 and §17.1.
