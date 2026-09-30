export const meta = {
  name: 'team-pipeline',
  description: 'Phase 1+: run one roadmap phase like a software team on GitHub (design PR and review, issue + PR + code review per work package, QA rounds with bug issues and fix PRs, gated release PR, merge, deploy, release)',
  whenToUse: 'Run once per roadmap phase from Phase 1 onward. Process spec: docs/process/TEAM_WORKFLOW.md',
  phases: [
    { title: 'Setup', detail: 'team infrastructure, milestone, epic, integration branch' },
    { title: 'Design', detail: 'tech lead plan, edge-case research, replan, design PR' },
    { title: 'Design review', detail: 'systems designer reviews the design PR; blockers become issues' },
    { title: 'Preflight', detail: 'credentials and tooling check' },
    { title: 'Build', detail: 'per work package: issue, branch, PR, code review, merge' },
    { title: 'QA round 1', detail: 'QA files bug issues; fix PRs; retest' },
    { title: 'QA round 2', detail: 'adversarial QA; fix PRs; retest' },
    { title: 'Release', detail: 'release-prep PR, release PR, final verification gate' },
    { title: 'Ship', detail: 'merge to main, production deploy, tag, GitHub release' },
  ],
}

// Usage: Workflow({ name: 'team-pipeline', args: <docs/phases/phase-<n>/pipeline-args.json> })
// Resume: args.resumeFrom = first unfinished stage:
//   'design' | 'edge' | 'replan' | 'review' | 'build' | 'qa1' | 'qa2' | 'release' | 'ship'
// Optional: args.skipWPs = ['WP1', ...]; args.reviewRoundStart = N.
// Setup always runs first and is idempotent (reuses what already exists).
const A = args || {}
const DIR = 'docs/phases/' + A.phaseId
const MAX_REVIEW = A.maxReviewRounds || 2
const MAX_CODE_REVIEW = A.maxCodeReviewLoops || 2
const MAX_FIX = A.maxFixLoops || 3
// Balanced profile (docs/process/TEAM_WORKFLOW.md section 7): edgeLenses 1 or 2, qa2 on/off,
// a faster model for purely mechanical steps, and concise documents.
const EDGE_LENSES = A.edgeLenses === 1 ? 1 : 2
const RUN_QA2 = A.qa2 !== false
const FAST = A.fastModel || 'sonnet'
const CONCISE = 'Keep documents concise and decision-focused (aim for roughly 30 KB or less per file): link to the master PLAN.md instead of restating it; prefer tables and lists over prose.'
const STAGES = ['design', 'edge', 'replan', 'review', 'build', 'qa1', 'qa2', 'release', 'ship']
const START = STAGES.indexOf(A.resumeFrom || 'design')
if (START < 0) return { status: 'failed', reason: 'unknown resumeFrom: ' + A.resumeFrom }
const runs = s => START <= STAGES.indexOf(s)
if (START > 0) log(`Resuming from stage '${STAGES[START]}'; earlier stages are read from GitHub and ${DIR}/`)

const BASE = `
PROJECT CONTEXT (read carefully)
- Project root: ${A.root} (work there). Master plan: PLAN.md. Process: docs/process/TEAM_WORKFLOW.md (follow it exactly). Rules: CLAUDE.md.
- Current phase: ${A.phaseName} (${A.phaseId}). Phase docs folder: ${DIR}/.
- Environment: ${A.envNotes}
- Deferred / out of scope (never build): calendar sync, in-app AI, widgets, login/SSO/auth screens.
- Secrets live only in .env.local (gitignored). PUBLIC REPO: never put secrets, keys, DB passwords, app URLs, the Vercel project name or the Supabase project ref/URL into commits, issues, PRs, reviews, comments or CI logs. Write 'see .env.local'.
- NO AI ATTRIBUTION ANYWHERE: no Co-Authored-By trailers, no 'Generated with ...' lines, no AI mentions in commits, issues, PRs, reviews, comments or releases. Never change the repo-local git identity or credential helper.
- Commands must be non-interactive. Stop any dev server or long-running process you start.
- Permissions granted by the user: ${A.permissions}
- Today is ${A.today}.
- Research with WebSearch / WebFetch (load via ToolSearch if deferred) instead of relying on memory for versions and APIs.

TEAM WORKFLOW RULES
- Repo: karthi-ai-engineer/Structured. Integration branch for this phase: '${A.branch}'. After setup, every change reaches it through a PR; main changes only through the release PR.
- Work branches: design/${A.phaseId}, feat/${A.phaseId}-wp<k>-<slug>, fix/${A.phaseId}-<issue#>-<slug>, test/${A.phaseId}-qa<k>, chore/${A.phaseId}-release-prep.
- Every issue and PR you create: milestone "${A.phaseName}", label ${A.phaseId}, a type:* label, area:* labels where relevant. Conventional Commit titles.
- One GitHub account plays every role, so reviews are 'gh pr review --comment' whose body starts with 'Verdict: APPROVED' or 'Verdict: CHANGES REQUESTED', then a role header (e.g. '### Code review · round 1'). Inline comments via the pull request reviews API where useful.
- Merges: merge commits (gh pr merge --merge --delete-branch), only when CI is green.
- Closing keywords do not auto-close issues for PRs into the integration branch: close issues explicitly with a comment linking the PR.
- Keep HANDOFF.md current in every PR you open (phase, stage, active branch/PR, done, next, blockers, exact resumeFrom value).

PHASE SCOPE
${A.scope}
`
let EPIC = A.epicIssue || null
const ctx = () => BASE + (EPIC ? `\nEpic issue for this phase: #${EPIC}.\n` : '')

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' }, plan_file: { type: 'string' }, pr_number: { type: 'number' },
    work_packages: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, title: { type: 'string' }, goal: { type: 'string' }, verification: { type: 'string' } }, required: ['id', 'title', 'goal', 'verification'] } },
    acceptance_criteria: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'plan_file', 'work_packages', 'acceptance_criteria'],
}
const EDGE_SCHEMA = {
  type: 'object',
  properties: { file: { type: 'string' }, edge_cases: { type: 'array', items: { type: 'object', properties: { id: { type: 'string' }, severity: { type: 'string', enum: ['critical', 'major', 'minor'] }, title: { type: 'string' }, recommendation: { type: 'string' } }, required: ['id', 'severity', 'title', 'recommendation'] } } },
  required: ['file', 'edge_cases'],
}
const REVIEW_SCHEMA = {
  type: 'object',
  properties: { approved: { type: 'boolean' }, merged: { type: 'boolean' }, score: { type: 'number' }, blocking_issues: { type: 'array', items: { type: 'string' } }, issue_numbers: { type: 'array', items: { type: 'number' } }, suggestions: { type: 'array', items: { type: 'string' } }, summary: { type: 'string' } },
  required: ['approved', 'merged', 'blocking_issues', 'issue_numbers', 'suggestions', 'summary'],
}
const SETUP_SCHEMA = {
  type: 'object',
  properties: { epic_issue: { type: 'number' }, milestone: { type: 'string' }, infra_pr: { type: 'number' }, notes: { type: 'array', items: { type: 'string' } } },
  required: ['epic_issue', 'milestone', 'notes'],
}
const PREFLIGHT_SCHEMA = {
  type: 'object',
  properties: { ready: { type: 'boolean' }, checks: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, ok: { type: 'boolean' }, detail: { type: 'string' } }, required: ['name', 'ok', 'detail'] } } },
  required: ['ready', 'checks'],
}
const DEV_SCHEMA = {
  type: 'object',
  properties: { status: { type: 'string', enum: ['done', 'partial', 'blocked'] }, summary: { type: 'string' }, pr_numbers: { type: 'array', items: { type: 'number' } }, issue_numbers: { type: 'array', items: { type: 'number' } }, ci_green: { type: 'boolean' }, open_issues: { type: 'array', items: { type: 'string' } } },
  required: ['status', 'summary', 'pr_numbers', 'issue_numbers', 'ci_green', 'open_issues'],
}
const TEST_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' }, summary: { type: 'string' }, report_file: { type: 'string' }, test_pr: { type: 'number' },
    criteria_failed: { type: 'array', items: { type: 'string' } },
    open_bugs: { type: 'array', items: { type: 'object', properties: { issue: { type: 'number' }, severity: { type: 'string', enum: ['critical', 'major', 'minor'] }, title: { type: 'string' } }, required: ['issue', 'severity', 'title'] } },
  },
  required: ['pass', 'summary', 'report_file', 'criteria_failed', 'open_bugs'],
}
const VERIFY_SCHEMA = {
  type: 'object',
  properties: { verdict: { type: 'string', enum: ['pass', 'fail'] }, summary: { type: 'string' }, release_pr: { type: 'number' }, report_file: { type: 'string' }, criteria: { type: 'array', items: { type: 'object', properties: { criterion: { type: 'string' }, met: { type: 'boolean' }, evidence: { type: 'string' } }, required: ['criterion', 'met', 'evidence'] } }, open_bugs: { type: 'array', items: { type: 'object', properties: { issue: { type: 'number' }, severity: { type: 'string', enum: ['critical', 'major', 'minor'] }, title: { type: 'string' } }, required: ['issue', 'severity', 'title'] } } },
  required: ['verdict', 'summary', 'report_file', 'criteria', 'open_bugs'],
}
const SHIP_SCHEMA = {
  type: 'object',
  properties: { merged: { type: 'boolean' }, pr_number: { type: 'number' }, deploy_ok: { type: 'boolean' }, release_tag: { type: 'string' }, summary: { type: 'string' }, problems: { type: 'array', items: { type: 'string' } } },
  required: ['merged', 'deploy_ok', 'release_tag', 'summary', 'problems'],
}

// ───────────────────────── 0. SETUP (always, idempotent) ─────────────────────────
phase('Setup')
const setup = await agent(`You are the project manager opening ${A.phaseName}. Everything you do must be idempotent: reuse anything that already exists.
${ctx()}
1. One-time team infrastructure (docs/process/TEAM_WORKFLOW.md section 6). If ANY item is missing on main, deliver the missing items in ONE PR titled "chore: team workflow infrastructure" from branch chore/team-workflow into main: label taxonomy (create labels via gh, section 3), .github/release.yml, .github/labeler.yml + labeler workflow, PR-title lint workflow, CODEOWNERS (* @karthi-ai-engineer), CONTRIBUTING.md, CHANGELOG.md, issue forms (bug with severity, feature, design issue), PR template with the Definition of Done checklist, environment: production in deploy.yml (no environment URL). Wait for CI, merge it (merge commit). Then configure rulesets: main requires PR + the CI check + status 'gate/final-verification' and blocks force pushes/deletion; branches matching phase-* require PR + CI. Then, only if 'gh auth status' shows the 'project' scope, create or reuse a user-level GitHub Project "Structured Roadmap" linked to the repo; otherwise add a note that the owner can run 'gh auth refresh -s project' later.
2. Milestone "${A.phaseName}" (create or reuse).
3. Epic issue "[Epic] ${A.phaseName}" (create or reuse): labels epic and ${A.phaseId}, milestone; body with goal and scope summary from PLAN.md section 14 and a "Work packages" section to be filled after design. Add it to the project board if one exists.
4. Integration branch ${A.branch}: create from the latest main if it does not exist, push it. Check it out locally.
5. Update HANDOFF.md through the normal flow later; do not push directly to ${A.branch} or main.
Return the epic issue number, the milestone title, the infra PR number (if you opened one) and notes.`, { phase: 'Setup', label: 'project manager', schema: SETUP_SCHEMA })
if (!setup) return { status: 'failed', stage: 'setup' }
EPIC = setup.epic_issue

// ───────────────────────── 1. DESIGN ─────────────────────────
if (runs('design')) {
  phase('Design')
  const v1 = await agent(`You are the tech lead and an expert in every technology this phase uses. Draft the design for ${A.phaseName}. No application code.
${ctx()}
1. Create branch design/${A.phaseId} from ${A.branch} (or reuse it) and check it out.
2. Read PLAN.md (relevant sections), docs/process/TEAM_WORKFLOW.md and the current code. Research current versions, install commands, configs and APIs for everything this phase touches.
3. Write ${DIR}/plan-v1.md: goal; resulting file tree; exact commands; key code designs (types, signatures, data flow); ordered WORK PACKAGES (each one PR-sized, independently verifiable, each with a verification step and the area:* labels it touches); numbered, objectively testable ACCEPTANCE CRITERIA; test plan; risks. ${CONCISE}
4. Commit ("docs(${A.phaseId}): draft design") and push the design branch.
Return the structured summary.`, { phase: 'Design', label: 'tech lead: draft', schema: PLAN_SCHEMA })
  if (!v1) return { status: 'failed', stage: 'design' }
}

const FOCUS_FUNCTIONAL = 'time and timezones (DST, midnight, week boundaries), empty / huge / malformed data, invalid input, concurrency between devices, realtime ordering and duplicates, slow or offline network, idempotency and retries, errors and what the user sees, mobile vs desktop, accessibility, dependencies of later phases'
const FOCUS_PLATFORM = 'Windows paths and line endings, Node version, dependency conflicts, build and config pitfalls, Supabase CLI and cloud quirks, Vercel build / env / routing / functions, GitHub Actions and rulesets, secret leakage in a public repo, free-tier limits, reproducibility on a fresh machine'
const LENSES = EDGE_LENSES === 1
  ? [{ key: 'combined', prefix: 'E', title: 'Functional, platform and integration edge cases', focus: FOCUS_FUNCTIONAL + '; and also ' + FOCUS_PLATFORM }]
  : [
      { key: 'functional', prefix: 'F', title: 'Functional, data and UX edge cases', focus: FOCUS_FUNCTIONAL },
      { key: 'platform', prefix: 'P', title: 'Platform, tooling, infrastructure and integration edge cases', focus: FOCUS_PLATFORM },
    ]
let edge = LENSES.map(l => ({ file: DIR + '/edge-cases-' + l.key + '.md', edge_cases: [] }))
if (runs('edge')) {
  phase('Design')
  edge = (await parallel(LENSES.map(l => () => agent(`You are a senior engineer who specialises in finding edge cases before they become bugs. Lens: ${l.title}. Focus: ${l.focus}.
${ctx()}
Work on branch design/${A.phaseId} (check it out; pull first). Read ${DIR}/plan-v1.md and the relevant PLAN.md sections. Research known issues for the exact tools and versions in the plan. Find every concrete edge case, failure mode and gap through your lens (real scenario + concrete recommendation each), ids prefixed ${l.prefix}. Prioritise: critical and major items first; skip generic advice. ${CONCISE}
Write ${DIR}/edge-cases-${l.key}.md. Do NOT commit (another researcher may work in parallel on the same checkout); the tech lead commits the files. Return them.`, { phase: 'Design', label: 'edge cases: ' + l.key, schema: EDGE_SCHEMA })))).filter(Boolean)
}

let plan = null
if (runs('replan')) {
  phase('Design')
  plan = await agent(`You are the tech lead. Edge-case research on ${DIR}/plan-v1.md is in: ${edge.map(e => e.file).join(', ')}. ${CONCISE}
${ctx()}
On branch design/${A.phaseId}:
1. Write the FINAL design to ${DIR}/PLAN.md: complete and self-contained, every valid edge case integrated, an "Edge-case coverage" table (every id -> handled where / rejected / deferred, with reason), ordered work packages with verification steps and area labels, numbered testable acceptance criteria.
2. Write ADRs for the significant decisions in docs/adr/NNNN-<slug>.md (context, decision, consequences), continuing the existing numbering.
3. Commit ("docs(${A.phaseId}): design with edge-case coverage and ADRs"), push.
4. Open (or update) the DESIGN PR from design/${A.phaseId} into ${A.branch}: title "docs(${A.phaseId}): design", labels type:design, ${A.phaseId}, area:docs, status:in-review, milestone; body = summary, links to PLAN.md, edge cases and ADRs, the work-package list, the acceptance criteria, "Part of #${EPIC}".
5. Edit epic #${EPIC}: fill its "Work packages" section with a checklist of the work packages.
Return the structured summary including pr_number.`, { phase: 'Design', label: 'tech lead: final design + PR', schema: PLAN_SCHEMA })
} else {
  plan = await agent(`Read ${DIR}/PLAN.md on branch ${runs('review') ? 'design/' + A.phaseId : A.branch} in ${A.root} (fetch first). Change nothing. Return its summary, path, the open design PR number if any (gh pr list --head design/${A.phaseId}), and its work packages and numbered acceptance criteria EXACTLY as written (same ids, titles, order).`, { phase: 'Design', label: 'load design', schema: PLAN_SCHEMA, model: FAST })
}
if (!plan) return { status: 'failed', stage: 'replan' }

// ───────────────────────── 2. DESIGN REVIEW ─────────────────────────
const reviews = []
let approved = !runs('review')
const R0 = A.reviewRoundStart || 1
if (runs('review')) phase('Design review')
for (let round = R0; runs('review') && round < R0 + MAX_REVIEW; round++) {
  const review = await agent(`You are the systems designer and the approval gate for the design PR${plan.pr_number ? ' #' + plan.pr_number : ''} (design/${A.phaseId} -> ${A.branch}). Review round ${round}.
${ctx()}
1. gh pr checkout the design PR (pull the latest). Review ${DIR}/PLAN.md, the edge-case files and ADRs against the master PLAN.md, the process doc and the current code: correctness and feasibility today (research anything doubtful), completeness vs scope, architecture fit, edge-case coverage, testability of every acceptance criterion, simplicity, hidden risks.${round > R0 ? ' Also check that every design issue from earlier rounds is really resolved (read their comments) and nothing regressed.' : ''}
2. For EACH blocking problem, open an issue: title "design: <problem>", labels type:design, found-by:design-review, severity:<critical|major|minor>, ${A.phaseId}, milestone; body with the problem, where (file/section), why it blocks, and the required change; reference the PR.
3. Post a review on the PR (gh pr review --comment): first line "Verdict: APPROVED" or "Verdict: CHANGES REQUESTED", then "### Systems design review · round ${round}", a summary, the list of opened issues, and non-blocking suggestions. Add inline comments on the exact lines via the reviews API where it helps.
4. If APPROVED (no blocking problems): set commit status gate/design-review=success on the PR head (gh api repos/{owner}/{repo}/statuses/<sha>), replace label status:in-review with status:approved, merge the PR (merge commit, delete branch), and add label gate:design-approved to epic #${EPIC}. If changes are requested: label the PR status:changes-requested.
Return the verdict (approved, merged, blocking issues, issue numbers, suggestions).`, { phase: 'Design review', label: 'systems designer r' + round, schema: REVIEW_SCHEMA })
  if (!review) break
  reviews.push(review)
  if (review.approved && review.merged) { approved = true; log(`Design approved and merged in round ${round}`); break }
  if (round === R0 + MAX_REVIEW - 1) break
  log(`Design round ${round}: changes requested (${review.issue_numbers.length} issue(s))`)
  const revised = await agent(`You are the tech lead. The systems designer requested changes on the design PR${plan.pr_number ? ' #' + plan.pr_number : ''}. Design issues to resolve: ${review.issue_numbers.map(n => '#' + n).join(', ') || '(see the latest review)'}.
${ctx()}
Blocking problems:
${review.blocking_issues.map((b, i) => (i + 1) + '. ' + b).join('\n')}
Suggestions:
${review.suggestions.map((s, i) => (i + 1) + '. ' + s).join('\n')}
On branch design/${A.phaseId}: update ${DIR}/PLAN.md (and ADRs if needed) to resolve every blocking problem (research facts where needed); adopt suggestions that improve correctness or simplicity; keep the coverage table accurate; append "Revision r${round}" at the end. Commit referencing the issues ("docs(${A.phaseId}): address design review (#..)"), push. Comment on each design issue with what changed and the commit SHA, then close it. Reply on the PR summarising the revision and set label status:in-review.
Return the updated structured summary (same PR number).`, { phase: 'Design review', label: 'tech lead: revision r' + round, schema: PLAN_SCHEMA })
  if (revised) plan = revised
}
if (!approved) return { status: 'design_not_approved', epic: EPIC, plan: plan.summary, reviews }

// ───────────────────────── 3. PREFLIGHT ─────────────────────────
if (A.preflightChecks) {
  phase('Preflight')
  const pre = await agent(`Preflight check attempt #${A.gateNonce || 1}. Change nothing; only check and report.
${ctx()}
Run from the project root and report each:
${A.preflightChecks}
Return ready=true only if every check passes.`, { phase: 'Preflight', label: 'preflight', schema: PREFLIGHT_SCHEMA, model: FAST })
  if (!pre || !pre.ready) return { status: 'blocked_on_credentials', preflight: pre, epic: EPIC }
}

// ───────────────────────── 4. BUILD: one issue + PR + code review per WP ─────────────────────────
const built = []
const SKIP = A.skipWPs || []
if (runs('build')) phase('Build')
for (const wp of plan.work_packages) {
  if (!runs('build')) break
  if (SKIP.includes(wp.id)) { built.push({ wp: wp.id, skipped: true }); continue }
  const doneList = built.map(b => b.wp).join(', ') || 'none'
  const dev = await agent(`You are a senior software developer. Deliver work package ${wp.id} "${wp.title}" of ${DIR}/PLAN.md as its own issue and PR.
Goal: ${wp.goal}
Verification: ${wp.verification}
${ctx()}
Work packages already merged: ${doneList}.
1. Create (or reuse) the issue "${wp.id}: ${wp.title}" (type:feature, ${A.phaseId}, area labels from the plan, milestone; body = goal, acceptance for this WP, verification). Link it as a sub-issue of epic #${EPIC} (sub-issues API; if unavailable, reference the epic in the body).
2. git switch ${A.branch} && git pull; create branch feat/${A.phaseId}-${wp.id.toLowerCase()}-<slug>.
3. Read ${DIR}/PLAN.md fully (incl. edge-case coverage for this WP) and the current code. Implement exactly this WP, production quality, with tests. If the plan is wrong in a detail, do the right thing and record the deviation in ${DIR}/DEVLOG.md.
4. Run the WP verification plus typecheck, lint, tests and build until green. Append a ${wp.id} section to ${DIR}/DEVLOG.md. Update HANDOFF.md (active branch/PR, next, resumeFrom 'build' with skipWPs = merged WPs).
5. Commit (feat(${A.phaseId}): ...), push, open the PR into ${A.branch}: title "feat(${A.phaseId}): ${wp.title}", labels type:feature, ${A.phaseId}, area:*, status:in-review, milestone; body = summary, how to test, screenshots/notes if UI, Definition of Done checklist, "Resolves #<issue>" and "Part of #${EPIC}".
6. Wait for CI on the PR (gh pr checks --watch); fix until green.
Return status, the PR number and issue number (pr_numbers[0], issue_numbers[0]), ci_green.`, { phase: 'Build', label: 'developer ' + wp.id, schema: DEV_SCHEMA })
  if (!dev || dev.status === 'blocked' || !dev.pr_numbers.length) { log(`${wp.id} blocked`); return { status: 'build_blocked', wp: wp.id, epic: EPIC, built } }
  const pr = dev.pr_numbers[0]
  const issue = dev.issue_numbers[0]
  let merged = false
  for (let loop = 1; loop <= MAX_CODE_REVIEW + 1; loop++) {
    const cr = await agent(`You are a senior code reviewer. Review PR #${pr} (${wp.id} "${wp.title}") into ${A.branch}. Review round ${loop}.
${ctx()}
1. gh pr checkout ${pr} (pull latest). Read the diff (gh pr diff) against ${DIR}/PLAN.md for ${wp.id} and the architecture rules in CLAUDE.md / PLAN.md. Run typecheck, lint, tests and build yourself; exercise the change where possible.
2. Look for: correctness bugs, missing edge cases from the coverage table, missing or weak tests, architecture/import-rule violations, security and secret leaks, dead code, naming and readability.${loop > 1 ? ' Check that every point from your previous review was addressed (read the replies).' : ''}
3. Post the review (gh pr review ${pr} --comment): first line "Verdict: APPROVED" or "Verdict: CHANGES REQUESTED", then "### Code review · round ${loop}", summary, and inline comments on exact lines via the reviews API for each finding.
4. If APPROVED and CI is green: set commit status gate/code-review=success on the PR head, label status:approved, merge (gh pr merge ${pr} --merge --delete-branch), close issue #${issue} with a comment "Delivered in #${pr}", tick ${wp.id} in the epic #${EPIC} checklist. If changes requested: label status:changes-requested.
Return approved/merged, blocking findings, suggestions.`, { phase: 'Build', label: `code review ${wp.id} r${loop}`, schema: REVIEW_SCHEMA })
    if (cr && cr.approved && cr.merged) { merged = true; break }
    if (!cr || loop === MAX_CODE_REVIEW + 1) break
    await agent(`You are the developer of PR #${pr} (${wp.id}). The code reviewer requested changes.
${ctx()}
Findings:
${cr.blocking_issues.map((b, i) => (i + 1) + '. ' + b).join('\n')}
Suggestions: ${cr.suggestions.join(' | ') || 'none'}
gh pr checkout ${pr}; address every finding (root causes, tests for each fix); run the full checks; commit ("fix(${A.phaseId}): address review on ${wp.id}"), push; reply to each review comment with what changed; label status:in-review; wait for CI green.
Return status, pr_numbers [${pr}], issue_numbers [${issue}], ci_green.`, { phase: 'Build', label: `developer ${wp.id} fixes r${loop}`, schema: DEV_SCHEMA })
  }
  built.push({ wp: wp.id, pr, issue, merged })
  if (!merged) { log(`${wp.id}: PR #${pr} not approved after ${MAX_CODE_REVIEW} loops`); return { status: 'code_review_blocked', wp: wp.id, pr, epic: EPIC, built } }
  log(`${wp.id} merged via PR #${pr}`)
}

// ───────────────────────── 5-6. QA ROUNDS ─────────────────────────
function fixAgent(bugs, roundTitle, k) {
  return agent(`You are a senior software developer on bug-fix duty (${roundTitle}).
${ctx()}
Open bugs to fix (most severe first): ${bugs.map(b => '#' + b.issue + ' [' + b.severity + '] ' + b.title).join('; ')}
For EACH bug, one at a time:
1. git switch ${A.branch} && git pull; branch fix/${A.phaseId}-<issue#>-<slug>.
2. Reproduce from the issue, find the root cause, fix it, add a regression test. Full checks green. Update ${DIR}/DEVLOG.md (bug -> cause -> fix) and HANDOFF.md.
3. Commit "fix(${A.phaseId}): <title> (#<issue>)", push, open a PR into ${A.branch} (labels type:bug, ${A.phaseId}, area:*, milestone; body with root cause, fix, test, "Fixes #<issue>"), wait for CI green, merge it (merge commit, delete branch).
4. Comment on the issue "Fix merged in #<pr>, ready for retest" and label it status:ready-for-retest (do NOT close it; QA closes after verifying).
Minor bugs whose fix is risky or out of scope: comment why, label status:blocked, and leave them for the owner.
Return status, all PR numbers and issue numbers handled.`, { phase: roundTitle, label: `bug fixes ${k}`, schema: DEV_SCHEMA })
}

async function qaRound(k, title, lens) {
  const reports = []
  let prev = null
  for (let attempt = 0; attempt <= MAX_FIX; attempt++) {
    const file = `${DIR}/test-report-${k}${attempt ? '-retest' + attempt : ''}.md`
    const retest = prev ? `
THIS IS A RETEST. For each bug labelled status:ready-for-retest from the previous pass (${prev.open_bugs.map(b => '#' + b.issue).join(', ')}): re-run its repro on the latest ${A.branch}. Fixed -> comment "Verified fixed in <PR>" and close it. Not fixed -> comment with evidence, remove status:ready-for-retest, keep it open. Then run your full scope again for regressions.` : ''
    const rep = await agent(`${lens}
${ctx()}
Work on the latest ${A.branch} (git switch, pull). Verify against ${DIR}/PLAN.md (every numbered acceptance criterion and the edge-case coverage table) with real evidence: typecheck, lint, tests, build, run the app and drive it with Playwright or HTTP, cloud deliverables where relevant, CI status on ${A.branch}.
For EVERY defect found: open a bug issue using the bug form fields (title "bug: <symptom>", steps to reproduce, expected, actual, environment, evidence; labels type:bug, severity:<critical|major|minor>, found-by:qa-${k}, ${A.phaseId}, area:*; milestone; "Part of #${EPIC}"). Tests that expose an open bug go into the issue as a repro, not into a PR.
Write the report ${file} (criteria -> evidence, bugs opened, bugs verified). Put the report and any NEW PASSING tests on branch test/${A.phaseId}-qa${k}${attempt ? '-r' + attempt : ''}, open a PR into ${A.branch} (title "test(${A.phaseId}): QA round ${k}${attempt ? ' retest ' + attempt : ''}", labels type:test, ${A.phaseId}, milestone), wait for CI green, merge it.${retest}
If the round is clean (no open bugs from this round, all criteria met): add label gate:qa-${k}-passed to epic #${EPIC}.
pass=true only if all acceptance criteria hold and no open critical/major bugs remain from this round. open_bugs = every still-open bug from this round (any severity).`, { phase: title, label: attempt ? `QA ${k} retest ${attempt}` : `QA engineer ${k}`, schema: TEST_SCHEMA })
    if (!rep) break
    reports.push(rep)
    if (rep.pass && rep.open_bugs.length === 0) { log(`${title}: clean`); break }
    if (attempt === MAX_FIX) { log(`${title}: ${rep.open_bugs.length} bug(s) still open after ${MAX_FIX} fix loops`); break }
    log(`${title}: ${rep.open_bugs.length} open bug(s) -> fix PRs`)
    await fixAgent(rep.open_bugs, title, `${k}.${attempt + 1}`)
    prev = rep
  }
  return reports
}

const ADVERSARIAL_EXTRA = RUN_QA2 ? '' : ` There is NO second QA round in this phase, so also cover the adversarial checks: exercise the edge cases the coverage table claims are handled, review the phase diff (git log main..${A.branch}) for bugs, secret leaks and architecture violations, reinstall from clean (npm ci) and rebuild, and check the public repo and CI logs for leaked URLs or secrets.`
if (runs('qa1')) phase('QA round 1')
const q1 = !runs('qa1') ? [] : await qaRound(1, 'QA round 1', `You are a meticulous QA engineer (round 1) verifying ${A.phaseName} end to end.${ADVERSARIAL_EXTRA}`)
if (runs('qa2') && RUN_QA2) phase('QA round 2')
if (!RUN_QA2 && runs('qa2')) log('QA round 2 skipped for this phase (balanced profile: qa2=false); round 1 covered the adversarial checks')
const q2 = !runs('qa2') || !RUN_QA2 ? [] : await qaRound(2, 'QA round 2', `You are an independent senior QA engineer (round 2, adversarial) for ${A.phaseName}. Assume round 1 missed things; your goal is to BREAK it: exercise every edge case the coverage table claims is handled, review the phase diff (git log main..${A.branch}) for bugs, secret leaks and architecture violations, reinstall from clean (npm ci) and rebuild, check Windows path/line-ending issues, check the public repo and CI logs for leaked URLs or secrets, and check that issues/PRs/HANDOFF.md are consistent. Read ${DIR}/test-report-1*.md first.`)

// ───────────────────────── 7. RELEASE ─────────────────────────
const finals = []
let releasePr = A.releasePr || null
if (runs('release')) {
  phase('Release')
  await agent(`You are the release manager for ${A.phaseName} (${A.releaseTag}).
${ctx()}
1. Branch chore/${A.phaseId}-release-prep from the latest ${A.branch}. Update CHANGELOG.md (Keep a Changelog; section ${A.releaseTag} with Added/Changed/Fixed from the merged PRs and closed issues of milestone "${A.phaseName}"), tick this phase's checkboxes in PLAN.md section 14, and update HANDOFF.md (stage: release; next: ${A.nextPhase} on branch ${A.nextBranch}). Open a PR (chore(${A.phaseId}): release prep, type:chore), wait for CI, merge it.
2. Open (or update) the RELEASE PR from ${A.branch} into main: title "Release ${A.releaseTag}: ${A.phaseName}", labels ${A.phaseId}, status:in-review, gate labels already earned (gate:design-approved, gate:qa-1-passed, gate:qa-2-passed as applicable), milestone. Body: highlights, list of merged PRs, closed issues, links to ${DIR}/PLAN.md, test reports and ADRs, "Closes #${EPIC}".
3. Make sure CI is green on the release PR.
Return summary with pr_numbers = [release PR number].`, { phase: 'Release', label: 'release manager', schema: DEV_SCHEMA }).then(r => { if (r && r.pr_numbers.length) releasePr = r.pr_numbers[0] })

  for (let attempt = 0; attempt <= 2; attempt++) {
    const file = `${DIR}/VERIFICATION${attempt ? '-r' + attempt : ''}.md`
    const v = await agent(`You are the final verifier: the last gate before ${A.phaseName} reaches main. Be skeptical; trust nothing you have not re-checked.
${ctx()}
Release PR: ${releasePr ? '#' + releasePr : 'find it: gh pr list --base main --head ' + A.branch}.
1. gh pr checkout the release PR. Check EVERY numbered acceptance criterion in ${DIR}/PLAN.md with fresh evidence (commands, running app, database, deployed preview if any).
2. Full checks green; CI green on the PR head; every issue in milestone "${A.phaseName}" is closed or explicitly deferred with a reason; every WP PR merged; epic checklist complete.
3. Scan the whole git history and all issue/PR text for secrets, app URLs, the Vercel project name and AI attribution (git log --format=%B | grep -iE "co-authored|claude|generated with").
4. Write ${file} (criterion -> met -> evidence) and deliver it via a PR into ${A.branch} (docs(${A.phaseId}): final verification), merged after CI.
5. Post a review on the release PR: "Verdict: APPROVED" or "Verdict: CHANGES REQUESTED", "### Final verification", summary, link to the report.
6. If pass: set commit status gate/final-verification=success on the release PR head (AFTER your report PR is merged, since that moves the head), add label gate:verified. If fail: open bug issues (found-by:verification, severity, milestone) for each problem.
${attempt ? 'This is re-verification #' + attempt + '.' : ''}
Return verdict, release_pr, criteria and open_bugs.`, { phase: 'Release', label: attempt ? `final re-verify ${attempt}` : 'final verifier', schema: VERIFY_SCHEMA })
    if (!v) break
    finals.push(v)
    if (v.release_pr) releasePr = v.release_pr
    if (v.verdict === 'pass') break
    if (attempt === 2) break
    await fixAgent(v.open_bugs, 'Release', `final ${attempt + 1}`)
  }
}
const last = runs('release') ? finals[finals.length - 1] : { verdict: 'pass', summary: 'verified earlier' }
const verified = !!(last && last.verdict === 'pass')

// ───────────────────────── 8. SHIP ─────────────────────────
let ship = null
if (verified) {
  phase('Ship')
  ship = await agent(`You are the release engineer. The release PR ${releasePr ? '#' + releasePr : '(find it: gh pr list --base main --head ' + A.branch + ')'} for ${A.phaseName} passed final verification. Ship ${A.releaseTag}.
${ctx()}
1. Confirm every required check on the release PR is green (CI and gate/final-verification). If the head moved after verification, stop and report (do not self-certify).
2. Merge it with a merge commit (gh pr merge --merge --delete-branch).
3. Watch the runs on main (gh run list --branch main; gh run watch). The deploy workflow (environment production) must succeed. Verify production works using the URL from .env.local, without printing it anywhere public.
4. Tag and publish: gh release create ${A.releaseTag} --target main --title "${A.releaseTag}: ${A.phaseName}" --generate-notes, then edit the notes to prepend a short highlights section. No AI attribution.
5. Close milestone "${A.phaseName}"; close epic #${EPIC} with a summary comment linking the release; move board items to Done if a project board exists; post a release announcement in Discussions if Discussions are enabled.
6. git switch main && git pull. Confirm HANDOFF.md on main names ${A.nextPhase} (branch ${A.nextBranch}) as next; if not, fix it through a small PR into main.
Return merged, pr_number, deploy_ok, release_tag, summary, problems.`, { phase: 'Ship', label: 'release engineer', schema: SHIP_SCHEMA })
}

return {
  status: verified ? (ship && ship.merged ? 'shipped' : 'verified_not_shipped') : 'needs_attention',
  phase: A.phaseName,
  epic: EPIC,
  release_pr: releasePr,
  ship,
  plan: { summary: plan.summary, design_pr: plan.pr_number, work_packages: plan.work_packages.map(w => w.id + ' ' + w.title) },
  design_reviews: reviews.map(r => ({ approved: r.approved, issues: r.issue_numbers })),
  build: built,
  qa1: q1.map(r => ({ pass: r.pass, open_bugs: r.open_bugs.length, report: r.report_file })),
  qa2: q2.map(r => ({ pass: r.pass, open_bugs: r.open_bugs.length, report: r.report_file })),
  final: last ? { verdict: last.verdict, summary: last.summary } : null,
}
