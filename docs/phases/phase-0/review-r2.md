# Phase 0 plan: systems design review, round 2

| | |
|---|---|
| Plan reviewed | `docs/phases/phase-0/PLAN.md`, revision r1 (2986 lines), against master `PLAN.md`, `review-r1.md`, `edge-cases-functional.md`, `edge-cases-platform.md`, `.claude/workflows/phase-pipeline.js` and the repository at `1195168` |
| Date | 2026-09-30 |
| Verdict | **Approved.** No blocking issues. |
| Score | **9 / 10** |

**Summary.**
- Round 1's only blocker (B1) is fixed everywhere it appeared.
- All six should-fix items (S1 to S6) are adopted, and each change is sound. S4 includes a real safety improvement: `projects create` is never run twice.
- The minor items are handled, and the revision also fixed a latent bug of its own (the `?upsert=true` query string that §8.2's argument check would have rejected).
- I found no regression. There are four small, non-blocking findings (N1 to N4), which are cheap to fold in during implementation.

---

## 1. Round-1 items: resolution check

| Item | Status | Evidence |
|---|---|---|
| **B1** PR template mentions AI | **Resolved** | §10.4 checklist item now reads "Commit and PR text pass `npm run check:commits -- --text-file <body>`". AC 37 is retitled "Attribution and authorship checks pass". I grepped every §12 AC title and the §10.4 template spec with `grep -niwE 'ai\|claude\|anthropic\|llm'`: no hits. The template grep is in WP3 verification and AC 33. §17.1 steps 4 and 11 and WP9 step 5 add the PR-text check. |
| **S1** Dependabot PR body | **Resolved** | `ci.yml` blanks `PR_TITLE`/`PR_BODY` when `pull_request.user.type == 'Bot'`. The expression evaluates to `''` on push events (null `pull_request`), on bot PRs, and on human PRs with an empty body. Commit messages and authors are still checked. Fix paths are in §10.3 and R22. |
| **S2** Open question 7 | **Resolved** | Withdrawn, with the number kept for references. F28 is updated. |
| **S3** Phase 1 seeding trigger | **Resolved** | Forward note in the `CLAUDE.md` data conventions (WP2), HANDOFF "Next" (WP9) and §17.1 step 3. R24 added. |
| **S4** Supabase CLI output and agent mode | **Resolved** | `--agent no` on every call, and a normaliser for both the bare-array and envelope shapes. The `--output-format json` retry is limited to **read-only** calls. `projects create` runs exactly once, with a re-list fallback (§8.4, R23). |
| **S5** Project count | **Resolved** | Counts by name in §9.3 step 1, AC 25, WP7, R6 and P27. The inline `node -e … process.argv[1]` form is correct. |
| **S6** Phase 2 tsconfig and `.ts` imports | **Resolved** | `CLAUDE.md` Architecture rule (WP2) and HANDOFF "Next" (WP9). R25 added. |
| Simplicity | **Adopted** | §0.1 lists three best-effort items. Each has a 30-minute time box and a named substitute that keeps its AC testable (AC 26 bullet 3, the WP7 pin grep). Preview env values stay mandatory. |
| Minor items | **Adopted** | Prettier rule (§0 and §10), TS 6 `strict` note, the `cn` package, geist moved to devDependencies, and `--scope "$OID"` for `vercel api`. |

## 2. Evidence re-verified this round

| Claim | How I checked | Result |
|---|---|---|
| Committed docs will not trip `check:leaks` in CI | Ran the nine §8.6 generic patterns (with the allowlist) over all 15 tracked and untracked-not-ignored files, including this revision of `PLAN.md` and `review-r1.md` | 0 hits |
| Docs pass `check:hygiene` encoding | BOM and CR scan of `docs/phases/phase-0/*`, `PLAN.md`, `CLAUDE.md`, `HANDOFF.md`, `README.md` | Clean (LF, no BOM) |
| The pipeline's final-verifier history grep (`co-authored\|claude\|generated with` over `git log --format=%B`) will pass | Ran it over all history, and over every conventional commit message the plan prescribes | 0 hits. The planned messages deliberately say "contributor guide" instead of the file name, which is good. |
| `CLAUDE.md` placeholder that WP2 replaces | `grep` | Present at line 81, exactly as §11 WP2 quotes it |
| HANDOFF credential lines match the live repo config | `git config --local --list` (the e-mail value was hidden) | Identical: an empty helper, then `!gh auth git-credential` |
| `supabase@2.118.0 projects create` flags | `projects create --help --agent no` | `--org-id`, `--db-password`, `--region` (ap-south-1 is a listed choice), global `--yes`, `--agent auto\|yes\|no`, `-o`, `--output-format`. `--size` is optional. |
| `vercel@61.1.0 project ls` and `env add` | `--help` | `--filter` (substring), `--limit`, `--format json`. `env add` has `--git-branch`, `--sensitive/--no-sensitive`, `--force`, `--value`. Its own example `cat ~/.npmrc \| vercel env add NPM_RC preview` adds a preview variable from stdin **without** a branch. |
| Pipeline Ship stage vs ruleset | Read `phase-pipeline.js` stage 10 | It uses `gh pr merge --merge --delete-branch`, which is compatible with `allowed_merge_methods: ["merge"]`. The PR-body and tag/release steps match §17.1. |
| §13.1 DST expectations | Recomputed by hand from the zone rules for NY, London, Chatham (both transitions and the ambiguous 03:00), Santiago (midnight gap), Lord Howe (30-minute gap and repeat), and the `msUntilNextDayIn` 23 h and 25 h days | All match. This agrees with round 1's run against `@date-fns/tz`. |
| Migration vs master §7.1 and §7.2 | Line-by-line comparison | Every column, default, check and FK is kept. The only additions are D0-9, D0-21 and D0-22, and all are documented in §1.1. |

## 3. New findings (non-blocking)

### N1. The PR-text word check still false-alarms on two likely tokens
- §10.4 strips `karthi-ai-engineer` and `CLAUDE.md`. Two other tokens are whole words for `grep -w` and plausible in a Ship PR body, release notes or the tracking-issue JSON of AC 37:
  - the dotted owner e-mail, `karthi.ai.engineer@…` (for example when describing the author allowlist)
  - `.claude/` paths (for example "ESLint and Prettier ignore `.claude/`")
- I tested this on sample text. The current sed still reports three false positives (the e-mail line and two `.claude/` lines).
- It fails closed, so nothing leaks. But an agent in the Ship stage may not see why a clean body fails.
- **Fix (tested):** use
  ```bash
  sed -E 's/karthi[-.]ai[-.]engineer//g; s/CLAUDE\.md//g; s#\.claude/##g' <file> | grep -niwE 'ai|claude|anthropic|llm'
  ```
  On the same sample this gives 0 false positives and still reports "AI helper", "Claude", "LLM" and "Anthropic".
  - Apply it in §10.4, §17.1 steps 4 and 11, WP9 step 5 and AC 37.
  - Alternatively, add one line telling writers not to put the e-mail or `.claude/` paths in PR text.
- Also make AC 37 bullet 3 explicit: "the same check" means both `check:commits --text-file` and the PR-text word check.

### N2. Two items in §2.2 are numbered 13
- "GitHub repo today" and "Supabase CLI 2.118.0 output" are both item 13.
- Every "§2.2 item 13" reference (§8.3, §8.4, R23, P19) means the Supabase item, and "item 14" (§8.5, §9.3) means Vercel.
- **Fix:** fold "GitHub repo today" into item 12 (or number it 12a). Items 13 and 14 and all their references then stay valid.

### N3. CodeQL: try once without explicit languages before deferring, and list the deferral in §1.1
- `main` currently holds only Markdown (checked with `git ls-tree origin/main`), so a PATCH that names `javascript-typescript` **and** `actions` is likely to be refused.
- **Fix:**
  1. If the PATCH is refused, retry once with `{"state":"configured","query_suite":"default"}` and no `languages` (GitHub detects them).
  2. Defer to §17.1 step 8 only if that also fails.
  3. Add a §1.1 deviation row: "Deliverable 11c may complete in the Ship stage (§17.1 step 8), not before merge, when `main` has no analysable language".
  AC 32 already allows this, but the row keeps the final verifier from reading deliverable 11c as missed.
- `codeql.yml` remains the fallback only if the feature itself is unavailable, as planned.

### N4. The preview-env fallback is probably unnecessary, but its type check needs a mapping if used
- CLI 61.1.0 documents a preview `env add` from stdin with no `--git-branch` (see §2). So §8.5 item 3's normal path should work, and the API fallback in item 5 should stay unused. It is already best effort.
- If the fallback is used, the API type `"encrypted"` may show differently in `env ls --format json` than the CLI's "Config". Record what it shows, and let the §8.5 verify step and AC 27 treat that type as Config.
- Otherwise the "`VITE_*` Config in preview" check could fail on a label, not a real problem.

## 4. Assessment by dimension

- **Correctness and feasibility: strong.**
  - Every command, flag and API I re-checked exists in the pinned versions.
  - The committed docs pass the plan's own leak and encoding checks, so WP3's CI will not fail on its first run because of the plan files.
  - The pipeline's own final-verifier grep is satisfied by construction.
- **Completeness: complete.** All 13 task deliverables and all five master-plan Phase 0 checkboxes map to WPs and ACs (see the round 1 table). The one master-plan deviation, "connected to GitHub", is justified in §1.1 by deliverable 10.
- **Architecture fit: good.**
  - Executable import rules, and a pure, Node-loadable `src/core`.
  - The rewrite and region leave room for `api/`.
  - The Phase 1 (seeding) and Phase 2 (tsconfig, function bundling) forward notes are now carried in the places the next planners read.
- **Edge-case coverage: complete.** F1 to F37 and P1 to P44 are all in §15. The new risks R22 to R26 are covered.
- **Testability: good.** Every AC names a command or an observable, and every best-effort bullet has a named substitute. AC 19 and AC 24 still need a real browser on the owner's machine, which is acceptable and documented.
- **Simplicity: the weakest dimension, but now contained.**
  - The plan is still large for size S.
  - The §0.1 time boxes stop the optional machinery from stalling the phase. The mandatory items (leak and attribution checks, the deploy script with smoke, the resume rehearsal) each map to a hard owner rule or a deliverable.
- **Hidden risks: covered.**
  - One mostly theoretical remaining risk is Dependabot bumping TypeScript within 6.x past typescript-eslint's `<6.1.0` peer. TypeScript 6.0 is the last 6.x line, so this is unlikely. A bump would fail `npm ci` in `ci-verify` visibly, not silently.

## 5. Notes for implementation (no plan change needed)
- WP3: `check:core` runs before `src/core/dates.ts` exists (WP4). It must exit 0 when there are no non-test core files.
- WP5: `projects create` has no `--size` flag in the plan, which is correct for the free plan. If the CLI complains, the §8.4 re-list path turns it into a blocker, never a second project.
- Ship: `edited` PR events re-run `ci-verify` after `gh pr edit`. `gh pr checks --watch` in §17.1 step 4 already waits for that run.
