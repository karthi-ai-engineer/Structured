export const meta = {
  name: 'phase-pipeline',
  description: 'One PLAN.md phase: expert plan, edge-case research, replan, systems-design review loop, implement on a phase branch, two independent test rounds, final verification, PR merge and release',
  whenToUse: 'Run once per roadmap phase of the Structured clone project',
  phases: [
    { title: 'Plan', detail: 'expert drafts a detailed phase plan' },
    { title: 'Edge cases', detail: 'two researchers hunt edge cases from different angles' },
    { title: 'Replan', detail: 'plan rewritten to cover every edge case' },
    { title: 'Design review', detail: 'systems designer approves or sends back (loop)' },
    { title: 'Preflight', detail: 'credentials and tooling check' },
    { title: 'Implement', detail: 'developer builds each work package in order' },
    { title: 'Test round 1', detail: 'QA verifies acceptance criteria, fix loop' },
    { title: 'Test round 2', detail: 'independent adversarial tester, fix loop' },
    { title: 'Final verification', detail: 'final verifier signs off, fix loop' },
    { title: 'Ship', detail: 'PR ready, CI green, merge to main, deploy, release' },
  ],
}

// Usage: Workflow({ name: 'phase-pipeline', args: <contents of docs/phases/phase-<n>/pipeline-args.json> })
// Resume on any machine: set args.resumeFrom to the first stage that has NOT finished
// ('plan' | 'edge' | 'replan' | 'review' | 'implement' | 'test1' | 'test2' | 'final' | 'ship').
// Earlier stages are skipped and their outputs are read from docs/phases/phase-<n>/.
// Optional: args.skipWPs = ['WP1', ...] to skip finished work packages; args.reviewRoundStart = N
// to continue review numbering without overwriting review-r*.md files.
const A = args || {}
const DIR = 'docs/phases/' + A.phaseId
const MAX_REVIEW = A.maxReviewRounds || 3
const MAX_FIX = A.maxFixLoops || 3
const STAGES = ['plan', 'edge', 'replan', 'review', 'implement', 'test1', 'test2', 'final', 'ship']
const START = STAGES.indexOf(A.resumeFrom || 'plan')
if (START < 0) return { status: 'failed', reason: 'unknown resumeFrom: ' + A.resumeFrom }
const runs = s => START <= STAGES.indexOf(s)
if (START > 0) log(`Resuming from stage '${STAGES[START]}'; earlier stages are read from ${DIR}/`)

const CONTEXT = `
PROJECT CONTEXT (read carefully)
- Project root: ${A.root} (all relative paths are relative to it; work there). Master plan: PLAN.md is the source of truth. Read the sections relevant to this phase fully.
- Current phase: ${A.phaseName}. Phase docs folder: ${DIR}/ (create it if missing).
- Environment: Windows 11. Shell tools: PowerShell and Git Bash (POSIX). ${A.envNotes}
- Deferred / out of scope (never build): calendar sync, in-app AI, widgets, login/SSO/auth screens.
- Secrets live only in .env.local (gitignored). Never commit secrets. Never paste full secret values into reports or docs (mask them, e.g. sb_secret_abc...xyz).
- Commands must be non-interactive (use --yes and flags; never interactive git). If you start a dev server or any long-running process, stop it before you finish.
- GIT AND GITHUB (strict; also in CLAUDE.md):
  * Repo: https://github.com/karthi-ai-engineer/Structured (PUBLIC), remote 'origin'. Work ONLY on branch '${A.branch}' (already exists, tracks origin). Never commit to main directly; main changes only in the Ship stage by merging the phase PR.
  * NO AI ATTRIBUTION ANYWHERE: no 'Co-Authored-By' trailers, no 'Generated with Claude Code' lines, no AI mentions in commit messages, PR/issue/release bodies or comments. Commits use the repo-local git identity that is already configured; never change git config identity or credential helper settings.
  * Conventional commit messages (feat:, fix:, docs:, test:, ci:, chore:, refactor:). Small logical commits.
  * Push the branch (git push origin ${A.branch}) after every work package and every fix round so GitHub is always current.
  * PUBLIC REPO HYGIENE: never commit or print into committed files or CI logs: secrets, keys, DB passwords, the production/preview app URLs, the Vercel project name, the Supabase project ref/URL. Write 'see .env.local' instead. Test reports and docs are committed, so mask these values there too.
  * HANDOFF.md (repo root) must stay current: update its status section (phase, branch, done, next, blockers, resume steps) whenever you finish a work package or fix round.
- Permissions the user granted for this phase: ${A.permissions}
- Today is ${A.today}.
- Research: use WebSearch / WebFetch (load them via ToolSearch if deferred) to confirm current versions, install commands, config formats and API shapes instead of relying on memory.

PHASE SCOPE
${A.scope}
`

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    plan_file: { type: 'string' },
    work_packages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          goal: { type: 'string' },
          verification: { type: 'string' },
        },
        required: ['id', 'title', 'goal', 'verification'],
      },
    },
    acceptance_criteria: { type: 'array', items: { type: 'string' } },
  },
  required: ['summary', 'plan_file', 'work_packages', 'acceptance_criteria'],
}

const EDGE_SCHEMA = {
  type: 'object',
  properties: {
    file: { type: 'string' },
    edge_cases: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          title: { type: 'string' },
          recommendation: { type: 'string' },
        },
        required: ['id', 'severity', 'title', 'recommendation'],
      },
    },
  },
  required: ['file', 'edge_cases'],
}

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    approved: { type: 'boolean' },
    score: { type: 'number' },
    blocking_issues: { type: 'array', items: { type: 'string' } },
    suggestions: { type: 'array', items: { type: 'string' } },
    review_file: { type: 'string' },
  },
  required: ['approved', 'score', 'blocking_issues', 'suggestions', 'review_file'],
}

const PREFLIGHT_SCHEMA = {
  type: 'object',
  properties: {
    ready: { type: 'boolean' },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, ok: { type: 'boolean' }, detail: { type: 'string' } },
        required: ['name', 'ok', 'detail'],
      },
    },
  },
  required: ['ready', 'checks'],
}

const DEV_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['done', 'partial', 'blocked'] },
    summary: { type: 'string' },
    files_changed: { type: 'array', items: { type: 'string' } },
    open_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['status', 'summary', 'files_changed', 'open_issues'],
}

const TEST_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    summary: { type: 'string' },
    report_file: { type: 'string' },
    criteria_failed: { type: 'array', items: { type: 'string' } },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          severity: { type: 'string', enum: ['critical', 'major', 'minor'] },
          title: { type: 'string' },
          detail: { type: 'string' },
        },
        required: ['id', 'severity', 'title', 'detail'],
      },
    },
  },
  required: ['pass', 'summary', 'report_file', 'criteria_failed', 'issues'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['pass', 'fail'] },
    summary: { type: 'string' },
    report_file: { type: 'string' },
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        properties: { criterion: { type: 'string' }, met: { type: 'boolean' }, evidence: { type: 'string' } },
        required: ['criterion', 'met', 'evidence'],
      },
    },
    remaining_issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'summary', 'report_file', 'criteria', 'remaining_issues'],
}

// ───────────────────────── 1. PLAN ─────────────────────────
let planV1 = { plan_file: DIR + '/plan-v1.md' }
if (runs('plan')) {
phase('Plan')
planV1 = await agent(`You are a principal software engineer and an expert in every technology this phase uses. Produce the detailed implementation plan for this phase. Do NOT write application code yet.
${CONTEXT}
Steps:
1. Read PLAN.md (relevant sections) and inspect the current repository state (what already exists from earlier phases).
2. Research the current (as of today) versions, install commands, config formats and APIs of every library and CLI this phase touches. Note breaking changes compared to older docs.
3. Write ${DIR}/plan-v1.md containing: goal; resulting file tree for this phase; exact commands; exact config file contents where short; key code designs (types, function signatures, data flow); ordered WORK PACKAGES (each small enough for one developer session, independently verifiable, each with a verification step); numbered ACCEPTANCE CRITERIA (objectively testable, each saying how to test it); a test plan (unit / integration / e2e / manual); risks.
Return the structured summary (plan_file = the path you wrote).`, { phase: 'Plan', label: 'expert planner', schema: PLAN_SCHEMA })
if (!planV1) return { status: 'failed', stage: 'plan' }
}

// ───────────────────────── 2. EDGE CASES ─────────────────────────
const LENSES = [
  {
    key: 'functional',
    title: 'Functional, data and UX edge cases',
    focus: 'time and timezones (DST, midnight crossing, week boundaries), empty / huge / malformed data, invalid input, concurrency between two devices, realtime ordering and duplicates, slow or offline network, idempotency and retries, error handling and what the user sees on failure, mobile vs desktop behaviour, accessibility, and anything in this phase that later phases depend on',
  },
  {
    key: 'platform',
    title: 'Platform, tooling, infrastructure and integration edge cases',
    focus: 'Windows paths, line endings and shell differences, Node version compatibility, dependency version conflicts and peer deps, build and config pitfalls (Vite, TypeScript, ESLint, Tailwind, test runner), Supabase CLI and cloud quirks (provisioning delay, legacy vs new API key names, RLS, realtime publication, migrations), Vercel build / env vars / routing / SPA rewrites / functions / deployment protection, GitHub and CI, secret leakage, free-tier limits, and reproducibility of the setup on a fresh machine',
  },
]
let edge = LENSES.map(l => ({ file: DIR + '/edge-cases-' + l.key + '.md', edge_cases: [] }))
if (runs('edge')) {
phase('Edge cases')
edge = (await parallel(LENSES.map(l => () => agent(`You are a senior engineer who specialises in finding edge cases before they become bugs. Your lens: ${l.title}. Focus on: ${l.focus}.
${CONTEXT}
Read ${DIR}/plan-v1.md and the relevant PLAN.md sections. Research (web) known issues and gotchas for the exact tools and versions in the plan. Find every edge case, failure mode and gap in the plan through your lens. Be exhaustive but concrete: each item must be a real scenario with a concrete recommendation, not generic advice. Give each a stable id prefixed ${l.key === 'functional' ? 'F' : 'P'} (F1, F2... / P1, P2...).
Write them to ${DIR}/edge-cases-${l.key}.md and return them.`, { phase: 'Edge cases', label: 'edge cases: ' + l.key, schema: EDGE_SCHEMA })))).filter(Boolean)
log(`Edge-case research found ${edge.reduce((n, e) => n + e.edge_cases.length, 0)} items across ${edge.length} lenses`)
}
const edgeCount = runs('edge') ? edge.reduce((n, e) => n + e.edge_cases.length, 0) : 'see ' + DIR + '/edge-cases-*.md'

// ───────────────────────── 3. REPLAN ─────────────────────────
let plan = null
if (!runs('replan')) {
  plan = await agent(`Read ${DIR}/PLAN.md (the final phase plan) in ${A.root}. Do not change any file. Return its summary, the path, and its work packages and numbered acceptance criteria EXACTLY as written there (same ids, titles, order).`, { phase: 'Replan', label: 'load existing plan', schema: PLAN_SCHEMA })
  if (!plan) return { status: 'failed', stage: 'load plan' }
} else {
phase('Replan')
plan = await agent(`You are the principal engineer who wrote ${DIR}/plan-v1.md. Two edge-case researchers reviewed it: ${edge.map(e => e.file).join(', ')}.
${CONTEXT}
Write the FINAL plan to ${DIR}/PLAN.md: a complete, self-contained, improved version of plan-v1 (a developer must be able to implement from it alone). Integrate every valid edge case into the relevant work package or design. Add an "Edge-case coverage" table: every edge-case id -> how it is handled (which work package / which test), or "rejected" / "deferred to phase X" with a reason. Keep work packages ordered, each with a verification step. Acceptance criteria must be numbered and objectively testable.
Return the structured summary (work packages and acceptance criteria must match the file exactly).`, { phase: 'Replan', label: 'replanner', schema: PLAN_SCHEMA })
if (!plan) return { status: 'failed', stage: 'replan' }
}

// ───────────────────────── 4. DESIGN REVIEW LOOP ─────────────────────────
const reviews = []
let approved = !runs('review')
const R0 = A.reviewRoundStart || 1
if (runs('review')) phase('Design review')
for (let round = R0; runs('review') && round < R0 + MAX_REVIEW; round++) {
  const prevFiles = reviews.map(r => r.review_file).join(', ')
  const review = await agent(`You are an expert systems designer and software architect acting as the approval gate for this phase plan. Review round ${round}.
${CONTEXT}
Review ${DIR}/PLAN.md against the master PLAN.md, the edge-case files in ${DIR}/, and the current repository. Evaluate: correctness and feasibility (will these exact commands, versions and APIs work today? verify anything doubtful with web research); completeness versus the phase scope and master plan; architecture fit (import rules, shared core, future phases not blocked); edge-case coverage; testability of every acceptance criterion; simplicity (no over-engineering, this is rapid development of a personal app); hidden risks.
${round > 1 ? 'Previous reviews: ' + (prevFiles || DIR + '/review-r*.md') + '. Check that earlier blocking issues were actually resolved and that the revision introduced no new problems.' : ''}
Approve only if there are no blocking issues. Blocking = would cause a wrong or broken implementation, a missing required deliverable, or an untestable criterion. Style preferences are suggestions, not blockers. Score 1-10.
Write your review to ${DIR}/review-r${round}.md and return the verdict.`, { phase: 'Design review', label: 'systems designer r' + round, schema: REVIEW_SCHEMA })
  if (!review) break
  reviews.push(review)
  if (review.approved && review.blocking_issues.length === 0) { approved = true; log(`Plan approved in round ${round} (score ${review.score}/10)`); break }
  log(`Round ${round}: not approved, ${review.blocking_issues.length} blocking issue(s)`)
  if (round === R0 + MAX_REVIEW - 1) break
  const revised = await agent(`You are the principal engineer who owns ${DIR}/PLAN.md. The systems designer did NOT approve it (review: ${review.review_file}).
${CONTEXT}
Blocking issues:
${review.blocking_issues.map((b, i) => (i + 1) + '. ' + b).join('\n')}
Suggestions:
${review.suggestions.map((s, i) => (i + 1) + '. ' + s).join('\n')}
Update ${DIR}/PLAN.md to resolve every blocking issue (research to confirm facts where needed). Adopt suggestions that improve correctness or simplicity. Keep the edge-case coverage table accurate. Append a short "Revision r${round}" changelog at the end of the file. Return the structured summary of the updated plan.`, { phase: 'Design review', label: 'plan revision r' + round, schema: PLAN_SCHEMA })
  if (revised) plan = revised
}
if (!approved) return { status: 'review_not_approved', plan, reviews }

// ───────────────────────── 5. PREFLIGHT ─────────────────────────
if (A.preflightChecks) {
  phase('Preflight')
  const pre = await agent(`Preflight check attempt #${A.gateNonce}. Do NOT change anything in the repo or any cloud account; only check and report.
${CONTEXT}
Run these checks from the project root and report each one:
${A.preflightChecks}
Return ready=true only if every check passes.`, { phase: 'Preflight', label: 'preflight #' + A.gateNonce, schema: PREFLIGHT_SCHEMA })
  if (!pre || !pre.ready) return { status: 'blocked_on_credentials', preflight: pre, plan, reviews }
}

// ───────────────────────── 6. IMPLEMENT ─────────────────────────
phase(runs('implement') ? 'Implement' : 'Preflight')
const impl = []
const TRACK_SCHEMA = {
  type: 'object',
  properties: { issue_number: { type: 'number' }, summary: { type: 'string' } },
  required: ['issue_number', 'summary'],
}
const track = await agent(`You set up GitHub tracking for ${A.phaseName}.
${CONTEXT}
1. Make sure branch ${A.branch} is checked out locally and up to date with origin.
2. If any phase planning docs in ${DIR}/ (plan-v1.md, edge-case files, PLAN.md, review files) are uncommitted, commit them on ${A.branch} with message "docs(${A.phaseId}): approved phase plan" and push.
3. Ensure labels exist (create if missing, with sensible colors): "phase", "${A.phaseId}", "type:feature", "type:bug", "type:chore", "type:docs", "type:ci".
4. Create (or reuse, if an open issue with the same title exists) the tracking issue titled "${A.phaseName}" with labels phase and ${A.phaseId}. Body: a one-paragraph goal, a link to ${DIR}/PLAN.md on branch ${A.branch}, a task-list checklist with one item per work package (${plan.work_packages.map(w => w.id + ' ' + w.title).join('; ')}), and the numbered acceptance criteria. No AI attribution.
Return the issue number.`, { phase: 'Implement', label: 'github tracking', schema: TRACK_SCHEMA })
const ISSUE = track ? track.issue_number : null
const GH_RULES = `
GITHUB DUTIES FOR THIS STEP:
- After committing, push: git push origin ${A.branch}.
- If no PR exists yet from ${A.branch} to main, open one as a DRAFT: title "${A.phaseName}", body = short summary + link to ${DIR}/PLAN.md${ISSUE ? ' + the line "Closes #' + ISSUE + '"' : ''}; labels phase and ${A.phaseId}. No AI attribution. If it exists, leave it (it updates automatically with pushes).
- ${ISSUE ? 'In tracking issue #' + ISSUE + ', tick the checklist item(s) for the work you completed (gh issue edit with the updated body).' : 'No tracking issue number is known; skip issue updates.'}
- Update HANDOFF.md status (phase, branch, done, next, blockers) and include it in your commit.`

const SKIP = A.skipWPs || []
for (const wp of plan.work_packages) {
  if (!runs('implement')) break
  if (SKIP.includes(wp.id)) { impl.push({ wp: wp.id, result: { status: 'done', summary: 'skipped (finished earlier)', files_changed: [], open_issues: [] } }); continue }
  const done = impl.map(r => r.wp).join(', ') || 'none'
  const res = await agent(`You are an expert senior software developer. Implement work package ${wp.id}: "${wp.title}" of the approved plan ${DIR}/PLAN.md.
Goal of this work package: ${wp.goal}
Its verification step: ${wp.verification}
${CONTEXT}
Rules:
- Read ${DIR}/PLAN.md fully first (including the edge-case coverage relevant to this work package), then look at the current code. Work packages already completed: ${done}.
- Implement exactly this work package, production quality, matching the plan. If the plan is wrong in a detail (for example an API changed), do the correct thing and record the deviation in ${DIR}/DEVLOG.md.
- Run this work package's verification step plus the typecheck / lint / test / build commands that exist so far; fix failures before finishing.
- Commit your work in logical commits.
- Append a section for ${wp.id} to ${DIR}/DEVLOG.md: what you did, commands run, deviations, and anything the testers must know.
${GH_RULES}
Return the structured result.`, { phase: 'Implement', label: 'developer ' + wp.id, schema: DEV_SCHEMA })
  impl.push({ wp: wp.id, result: res })
  if (!res || res.status === 'blocked') {
    log(`Work package ${wp.id} is blocked; stopping implementation`)
    return { status: 'implementation_blocked', plan, reviews, implementation: impl }
  }
}

// ───────────────────────── 7-8. TEST ROUNDS ─────────────────────────
function fixPrompt(rep, roundTitle) {
  return `You are an expert senior software developer. Testers found issues in ${A.phaseName} (${roundTitle}). Fix them.
${CONTEXT}
Test report: ${rep.report_file}
Failed acceptance criteria: ${rep.criteria_failed.join('; ') || 'none'}
Issues:
${rep.issues.map(i => '- [' + i.severity + '] ' + i.id + ': ' + i.title + ' -- ' + i.detail).join('\n')}
Fix every critical and major issue, and every minor issue unless the fix is risky or out of scope (then explain why in DEVLOG). Find root causes; do not paper over symptoms. Add or adjust automated tests so each fixed issue stays fixed where feasible. Run the full check suite (typecheck, lint, tests, build) until green. Also check the CI run for the latest push on the PR (gh run list --branch ${A.branch}); if CI failed, fix that too. Commit (fix: ... messages). Append a "Fix round (${roundTitle})" section to ${DIR}/DEVLOG.md mapping each issue id to its fix.
${GH_RULES}
Return the structured result.`
}

async function testRound(num, title, basePrompt) {
  const reports = []
  let prev = null
  for (let attempt = 0; attempt <= MAX_FIX; attempt++) {
    const file = `${DIR}/test-report-${num}${attempt === 0 ? '' : '-retest' + attempt}.md`
    const retest = prev ? `
THIS IS A RE-TEST after a fix round (fresh session). Previous report: ${prev.report_file}. First confirm each previously reported issue is truly fixed by re-running its repro:
${prev.issues.map(i => '- ' + i.id + ': ' + i.title).join('\n')}
Then redo your full verification scope to catch regressions.` : ''
    const rep = await agent(basePrompt(file) + retest, { phase: title, label: attempt === 0 ? `tester ${num}` : `tester ${num} retest ${attempt}`, schema: TEST_SCHEMA })
    if (!rep) { log(`${title}: tester returned nothing`); break }
    reports.push(rep)
    if (rep.pass && rep.issues.length === 0) { log(`${title}: PASS`); break }
    if (attempt === MAX_FIX) { log(`${title}: still has ${rep.issues.length} issue(s) after ${MAX_FIX} fix loops`); break }
    log(`${title}: ${rep.issues.length} issue(s) found, sending to developer`)
    await agent(fixPrompt(rep, title), { phase: title, label: `fix ${num}.${attempt + 1}`, schema: DEV_SCHEMA })
    prev = rep
  }
  return reports
}

if (runs('test1')) phase('Test round 1')
const t1 = !runs('test1') ? [] : await testRound(1, 'Test round 1', file => `You are a meticulous QA engineer. Verify the implementation of ${A.phaseName} against the approved plan ${DIR}/PLAN.md, especially every numbered ACCEPTANCE CRITERION.
${CONTEXT}
Do real verification, not just code reading: install if needed; run typecheck, lint, unit tests and build; run the app (start a dev or preview server in the background, test it, then stop it) and exercise it with Playwright (headless Chromium; add @playwright/test as a devDependency if it is not there) or HTTP requests; verify cloud deliverables (deployed URL responds and works, database reads and writes) where this phase has them; check that the GitHub Actions CI run for the latest commit on ${A.branch} is green (gh run list / gh pr checks). Add missing automated tests the plan requires (tests only; do not change app code). Record exact commands and outputs.
Write your report to ${file}, commit it (and any tests you added) and push the branch. pass=true only if every acceptance criterion is met and there are no critical or major issues. List every issue found (including minor ones) with repro steps. report_file = ${file}.`)

if (runs('test2')) phase('Test round 2')
const t2 = !runs('test2') ? [] : await testRound(2, 'Test round 2', file => `You are an independent senior test engineer doing a second, adversarial verification of ${A.phaseName}. Assume the first QA round missed things. Your goal is to BREAK it.
${CONTEXT}
Read ${DIR}/PLAN.md (acceptance criteria and the edge-case coverage table), ${DIR}/DEVLOG.md and the ${DIR}/test-report-1*.md files. Then:
- Actually exercise each edge case the coverage table claims is handled (write targeted tests or scripts).
- Review this phase's code changes (git log / git diff) for bugs, wrong behaviour, secret leaks (keys committed or exposed to the client that should not be), dead code, and violations of the architecture rules in PLAN.md.
- Re-run the full check suite from a clean state (remove build caches, reinstall dependencies with npm ci, build).
- Check cross-platform issues (Windows paths, line endings) and the deployed environment if there is one.
- Check GitHub: CI green on the latest commit, no secrets or app URLs visible in the public repo files or in public CI logs, PR and tracking issue consistent, HANDOFF.md accurate.
- Add automated tests for anything important that is untested (tests only; do not change app code).
Write your report to ${file}, commit it (and any tests you added) and push the branch. pass=true only if there are no critical or major issues and all acceptance criteria hold. report_file = ${file}.`)

// ───────────────────────── 9. FINAL VERIFICATION ─────────────────────────
if (runs('final')) phase('Final verification')
const finals = []
for (let attempt = 0; runs('final') && attempt <= 2; attempt++) {
  const file = `${DIR}/VERIFICATION${attempt === 0 ? '' : '-r' + attempt}.md`
  const v = await agent(`You are the final verifier: the last gate before ${A.phaseName} is declared complete. Be skeptical and evidence-driven; do not trust earlier reports.
${CONTEXT}
1. Independently check EVERY numbered acceptance criterion in ${DIR}/PLAN.md with fresh evidence (run the commands, open the URLs, query the database).
2. Confirm the full check suite is green in the current state (typecheck, lint, tests, build), the git working tree is clean, everything is pushed to origin/${A.branch}, and the GitHub Actions CI run for the latest commit is green.
3. Confirm no secrets or app URLs are committed (scan the whole git history for keys, passwords, vercel.app and supabase.co hostnames), no AI attribution exists in any commit message (git log --format=%B | grep -i -E "co-authored|claude|generated with"), .env.example is accurate, and CLAUDE.md, HANDOFF.md and docs are up to date.
4. Confirm every item of this phase's checklist in the master PLAN.md (section 14) is delivered.
5. ONLY if everything holds: tick this phase's checkboxes in PLAN.md section 14, update HANDOFF.md to "phase verified, ready to ship", commit, and push the branch.
${attempt > 0 ? 'This is re-verification #' + attempt + ' after fixes for: ' + finals[finals.length - 1].remaining_issues.join('; ') : ''}
Write ${file} (criterion -> met? -> evidence). verdict=pass only if everything holds. report_file = ${file}.`, { phase: 'Final verification', label: attempt === 0 ? 'final verifier' : 'final re-verify ' + attempt, schema: VERIFY_SCHEMA })
  if (!v) break
  finals.push(v)
  if (v.verdict === 'pass') break
  if (attempt === 2) break
  await agent(fixPrompt({ report_file: file, criteria_failed: v.criteria.filter(c => !c.met).map(c => c.criterion), issues: v.remaining_issues.map((s, i) => ({ id: 'V' + (i + 1), severity: 'major', title: s, detail: s })) }, 'Final verification'), { phase: 'Final verification', label: 'fix final ' + (attempt + 1), schema: DEV_SCHEMA })
}

const last = runs('final') ? finals[finals.length - 1] : { verdict: 'pass', summary: 'verified earlier', remaining_issues: [], report_file: DIR + '/VERIFICATION*.md' }
const verified = !!(last && last.verdict === 'pass')

// ───────────────────────── 10. SHIP ─────────────────────────
const SHIP_SCHEMA = {
  type: 'object',
  properties: {
    merged: { type: 'boolean' },
    pr_number: { type: 'number' },
    ci_green: { type: 'boolean' },
    deploy_ok: { type: 'boolean' },
    release_tag: { type: 'string' },
    summary: { type: 'string' },
    problems: { type: 'array', items: { type: 'string' } },
  },
  required: ['merged', 'pr_number', 'ci_green', 'deploy_ok', 'release_tag', 'summary', 'problems'],
}
let ship = null
if (verified) {
  phase('Ship')
  ship = await agent(`You are the release engineer. ${A.phaseName} passed final verification (${last.report_file}). Ship it.
${CONTEXT}
1. Make sure ${A.branch} is fully pushed and HANDOFF.md says this phase is complete and names the next phase (${A.nextPhase}) as next, with the branch name it should use (${A.nextBranch}). Commit and push if you had to change it.
2. Make sure the PR from ${A.branch} to main exists. Its body must summarise the delivered work, link ${DIR}/PLAN.md and ${DIR}/VERIFICATION*.md, list the acceptance criteria as a ticked checklist${ISSUE ? ', and contain "Closes #' + ISSUE + '"' : ''}. No AI attribution. Mark it ready for review (gh pr ready).
3. Wait for every required check on the PR to pass (gh pr checks --watch). If a check fails, fix it on ${A.branch} (fix: commit), push, and wait again (at most 3 attempts). Do not merge with failing checks.
4. Merge with a merge commit: gh pr merge --merge --delete-branch. Keep the default merge message; no AI attribution.
5. Watch the workflow runs triggered on main (gh run list --branch main, gh run watch). The production deploy workflow must succeed. Then verify the production app works (get the URL from .env.local; never write it into committed files or print it in public logs).
6. Create an annotated tag and GitHub release ${A.releaseTag} on main (gh release create) titled "${A.releaseTag}: ${A.phaseName}" with notes listing what this phase delivered. No AI attribution.
7. Locally: git switch main and git pull.
Return the result. merged=true only if the PR is merged into main.`, { phase: 'Ship', label: 'release engineer', schema: SHIP_SCHEMA })
}

return {
  status: verified ? (ship && ship.merged ? 'shipped' : 'verified_not_shipped') : 'needs_attention',
  phase: A.phaseName,
  tracking_issue: ISSUE,
  ship,
  plan: { summary: plan.summary, work_packages: plan.work_packages.map(w => w.id + ' ' + w.title), acceptance_criteria: plan.acceptance_criteria },
  edge_cases: edgeCount,
  reviews: reviews.map(r => ({ approved: r.approved, score: r.score, blocking: r.blocking_issues.length, file: r.review_file })),
  implementation: impl.map(r => ({ wp: r.wp, status: r.result && r.result.status, open_issues: r.result && r.result.open_issues })),
  test_round_1: t1.map(r => ({ pass: r.pass, issues: r.issues.length, file: r.report_file })),
  test_round_2: t2.map(r => ({ pass: r.pass, issues: r.issues.length, file: r.report_file })),
  final: last ? { verdict: last.verdict, summary: last.summary, remaining: last.remaining_issues, file: last.report_file } : null,
}
