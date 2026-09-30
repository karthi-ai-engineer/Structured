# Team Workflow (Phase 1 onward)

This project is built like a software company would build it. Every step is visible on GitHub as a branch, pull request, review, issue, label, check, milestone, or release.

Phase 0 used the simpler `phase-pipeline.js`. From Phase 1 on, each phase runs through `.claude/workflows/team-pipeline.js`, which follows this document exactly.

> One GitHub account (`karthi-ai-engineer`) performs every role. GitHub doesn't let an author approve their own PR, so reviews are posted as **comment reviews with an explicit verdict line**. Gates are recorded with **labels** and **commit statuses**.
> **No AI attribution anywhere** (see `CLAUDE.md`).

## 1. Roles
| Role | Responsibility | GitHub footprint |
|---|---|---|
| Project manager | Opens the phase: milestone, epic, labels, integration branch, project board | Milestone, `[Epic]` issue, branch, board items |
| Tech lead | Writes the design (plan, edge cases, ADRs) and addresses design review | `design/phase-<n>` branch, design PR, `docs/adr/*` |
| Edge-case researchers (×2) | Functional and platform edge cases for the design | Files in the design PR |
| Systems designer | Reviews and approves the design | PR review, `type:design` issues for blockers, `gate/design-review` status, merges the design PR |
| Developer | Implements one work package per branch and PR, and fixes bugs | WP issue, `feat/…` branch and PR, `fix/…` PRs |
| Code reviewer | Reviews every WP PR (checks it out, runs it, reads the diff against the plan) | PR review with inline comments, `gate/code-review` status, merges the PR |
| QA engineer (round 1) | Verifies acceptance criteria end to end | Bug issues (`found-by:qa-1`), test PR, retest comments |
| QA engineer (round 2, adversarial) | Tries to break it: edge cases, security, clean installs | Bug issues (`found-by:qa-2`), test PR, retest comments |
| Release manager | Prepares the release: changelog, handoff, release PR | `chore/…-release-prep` PR, release PR |
| Final verifier | Last gate; checks every criterion with fresh evidence | Review on the release PR, `gate/final-verification` status |
| Release engineer | Merges, deploys, tags, and publishes | Merge, `production` deployment, tag, GitHub Release, milestone closed |

## 2. Branching model
```
main ◄──────────── release PR ("Release v0.<n>.0: Phase <n> …")  ← only way into main
  └─ phase-<n>-<slug>                      integration branch for the phase (PR-only)
       ├─ design/phase-<n>                 design PR  → reviewed by systems designer
       ├─ feat/phase-<n>-wp<k>-<slug>      one PR per work package → code review
       ├─ fix/phase-<n>-<issue>-<slug>     one PR per bug → verified by QA retest
       ├─ test/phase-<n>-qa<k>             QA reports and new tests
       └─ chore/phase-<n>-release-prep     CHANGELOG, HANDOFF, PLAN checkboxes
```
- **Merges** always use merge commits (history preserved). Work branches are deleted after merge.
- **Rulesets:**
  - `main` requires a PR, the `CI` check, and `gate/final-verification`, and blocks force pushes and deletion.
  - `phase-*` requires a PR and `CI`.
- **Closing issues:** keywords (`Closes #12`) only auto-close issues on the default branch, so work PRs into the integration branch **close their issues explicitly**, with a comment linking the PR.

## 3. Labels
| Group | Labels |
|---|---|
| Type | `type:feature` `type:bug` `type:design` `type:test` `type:docs` `type:chore` `type:ci` `epic` |
| Severity (bugs) | `severity:critical` `severity:major` `severity:minor` |
| Status | `status:in-review` `status:changes-requested` `status:approved` `status:ready-for-retest` `status:blocked` |
| Found by | `found-by:design-review` `found-by:code-review` `found-by:qa-1` `found-by:qa-2` `found-by:verification` |
| Area | `area:ui` `area:core` `area:data` `area:mcp` `area:android` `area:ci` `area:docs` |
| Phase | `phase-0` … `phase-6` |
| Gates (release PR) | `gate:design-approved` `gate:qa-1-passed` `gate:qa-2-passed` `gate:verified` |

## 4. Phase lifecycle
1. **Open the phase** (project manager)
   - Create milestone `Phase <n>: <name>` and the `[Epic] Phase <n>: <name>` issue (labels `epic`, `phase-<n>`, with a goal, scope, and a WP checklist filled after design).
   - Create integration branch `phase-<n>-<slug>` from `main`.
   - Add items to the project board (if the `gh` token has the `project` scope).
2. **Design** (tech lead + edge-case researchers)
   - Branch `design/phase-<n>` holds `docs/phases/phase-<n>/plan-v1.md`, `edge-cases-*.md`, the final `PLAN.md`, and ADRs in `docs/adr/`.
   - Open the **design PR** into the integration branch (`type:design`), linked to the epic.
3. **Design review** (systems designer)
   - Check out the PR with `gh pr checkout` and verify claims (research anything doubtful).
   - Post a review: a `Verdict: APPROVED` or `Verdict: CHANGES REQUESTED` line, plus inline comments.
   - File each blocking problem as an issue (`type:design`, `found-by:design-review`, severity).
   - The tech lead fixes, pushes, and closes each issue with a comment linking the commit. Re-review follows, up to 3 rounds.
   - On approval: set status `gate/design-review` = success, label the PR `status:approved`, merge the design PR, and label the epic `gate:design-approved`.
4. **Build**, per work package, in plan order:
   - **Developer:**
     1. Create the WP issue (`type:feature`, area, milestone; add it as a sub-issue of the epic, falling back to the epic checklist).
     2. Branch `feat/…` and implement with tests.
     3. Update `HANDOFF.md` and push.
     4. Open the PR (`feat(phase-<n>): …`, with a body covering summary, how to test, and a checklist; it references the WP issue).
     5. Wait for CI to pass.
   - **Code reviewer:**
     1. `gh pr checkout`, then run the checks and read the diff against the plan.
     2. Post a review with a verdict and inline comments.
     3. On changes requested: the developer pushes fixes and replies to each comment, and the reviewer re-reviews (up to 2 loops).
     4. On approval: set status `gate/code-review` = success, merge, close the WP issue with a link, and tick the epic checklist.
5. **QA round 1**, then **QA round 2** (adversarial). Each round:
   - The tester verifies the integration branch end to end.
   - Every defect becomes a **bug issue**: steps, expected, actual, severity, `found-by:qa-<k>`, milestone, area.
   - The report and any passing new tests go in a `test/…` PR, merged after CI passes. Tests that expose an open bug go into the bug issue as a repro, never as red CI.
   - The developer opens **one `fix/…` PR per bug**, with a regression test, and labels the issue `status:ready-for-retest`.
   - The tester retests: fixed means the issue is closed with a "Verified fixed in #PR" comment; not fixed means a comment and it stays open. Then the tester runs a full regression pass.
   - When a round is clean, label the epic `gate:qa-<k>-passed`.
6. **Release** (release manager + final verifier)
   - The release manager opens a `chore/phase-<n>-release-prep` PR (CHANGELOG.md in Keep a Changelog format, HANDOFF.md, PLAN.md §14 checkboxes) and merges it.
   - The release manager then opens the **release PR** (integration branch → `main`), titled `Release v0.<n>.0: Phase <n> <name>`. Its body covers the summary, merged PRs, closed issues, test and verification reports, and gate labels.
   - The **final verifier** checks every acceptance criterion with fresh evidence and posts a review with a verdict.
     - On pass: set status `gate/final-verification` = success on the PR head, and label `gate:verified`.
     - On fail: file issues (`found-by:verification`), fix them through fix PRs, and re-verify.
7. **Ship** (release engineer)
   1. Wait for all required checks, then merge the release PR (merge commit).
   2. The `deploy.yml` workflow deploys to the GitHub **`production` environment** (the deployment record has no URL, because the app URL is private).
   3. Verify production works.
   4. Tag `v0.<n>.0`, then `gh release create --generate-notes` (categorised by `.github/release.yml`) plus a highlights section.
   5. Close the milestone, and close the epic with a summary comment. Post a release announcement in Discussions if they're enabled.
   6. Update `HANDOFF.md` to point at the next phase.

## 5. Conventions
- **Commits and PR titles:** Conventional Commits (`feat(phase-1): …`, `fix(phase-1): …`, `docs(phase-1): …`, `test(…)`, `chore(…)`, `ci(…)`). PR titles are linted in CI.
- **Review verdict line** (first line of every review body): `Verdict: APPROVED` or `Verdict: CHANGES REQUESTED`, followed by a signed role header such as `### Code review · round 1`.
- **Issue bodies** use the issue forms in `.github/ISSUE_TEMPLATE/` (bug: steps, expected, actual, severity, environment).
- **Definition of Done (per PR):** CI passes, tests added or updated, `HANDOFF.md` updated, no secrets or app URLs, docs updated when behaviour changes, review verdict APPROVED (or QA-verified, for fix PRs).
- **Public repo hygiene:** see `CLAUDE.md`. Never put secrets, app URLs, the Vercel project name, or the Supabase ref into issues, PRs, reviews, or logs.

## 6. One-time team infrastructure (created at the start of Phase 1)
Delivered as the PR `chore: team workflow infrastructure` into `main`:
- the label taxonomy (§3)
- `.github/release.yml` (release-note categories by label)
- `.github/labeler.yml` plus a labeler workflow (area labels by path)
- a PR-title lint workflow (Conventional Commits)
- `CODEOWNERS`, `CONTRIBUTING.md` (this workflow in brief), and `CHANGELOG.md`
- issue forms: bug (with severity), feature, and design issue
- a PR template with the Definition of Done checklist
- `environment: production` in `deploy.yml`
- the rulesets from §2
- a "Structured Roadmap" GitHub Project board (needs `gh auth refresh -s project`; skipped with a note if the scope is missing)

## 7. Process profile: balanced (chosen 2026-09-30)
Everything visible on GitHub stays the same: design PR and review, an issue, PR and code review per work package, bug issues with one fix PR each, the gated release PR, and the release. The balanced profile only removes internal overhead:

| Setting (`pipeline-args.json`) | Value | Why |
|---|---|---|
| `maxReviewRounds` | 2 | Most design issues surface in round 1 |
| `maxCodeReviewLoops` | 2 | Same reasoning, per work-package PR |
| `edgeLenses` | 2 for large phases, 1 (combined) for medium and small phases | Halves research time where the surface is small |
| `qa2` | `true` for large phases, `false` otherwise (QA round 1 then also runs the adversarial checks) | The second round pays off only on big surfaces |
| `fastModel` | `sonnet` for purely mechanical steps (preflight, reloading the design) | Design, code, review and testing keep the strongest model |
| Document size | ~30 KB per doc, linking to `PLAN.md` instead of restating it | Phase 0's 100 KB draft plan cost a lot of time |

| Phase | Size | `edgeLenses` | `qa2` |
|---|---|---|---|
| 1 Web MVP | L | 2 | true |
| 2 MCP server | M | 1 | false |
| 3 Structured parity | L | 2 | true |
| 4 Android APK | M | 1 | false |
| 5 Work tracking | M | 1 | false |
| 6 Extras | S | 1 | false |
