# HANDOFF

> Read this first when resuming on any device. It is updated at the end of every work package, every fix round, every phase, and before every machine switch. Values (keys, URLs, the Vercel project name, the Supabase ref) are never written here: see `.env.local`.

## Current status
- **Phase:** 0 (Foundation), implementation stage
- **Branch:** `phase-0-foundation`
- **Last updated:** 2026-09-30 13:35 UTC+9
- **Pipeline stage reached:** stage 7 (implement), WP9 in progress. Stages 1 to 6 are done:
  - plan, edge-case research, replan and design review: `docs/phases/phase-0/PLAN.md` (approved in `review-r2.md`)
  - tracking issue **#1** ("Phase 0: Foundation", labels `phase`, `phase-0`)
- **Resume with:** `resumeFrom: "implement"`, `skipWPs: ["WP1", "WP2", "WP3", "WP4", "WP5", "WP6", "WP7", "WP8"]`
- **IDs:**
  - tracking issue **#1**
  - draft PR **#2** (`phase-0-foundation` → `main`, `Closes #1`)
  - ruleset **24225914** ("main protection"). Re-apply it only with the PLAN §9.5 GET-then-PUT/POST snippet, never with a second POST.
- **Pipeline for Phase 0:** `.claude/workflows/phase-pipeline.js`, args in `docs/phases/phase-0/pipeline-args.json`.

### Done
Details, commands and deviations for every work package are in `docs/phases/phase-0/DEVLOG.md`.
- **WP1** Scaffold: Vite 8 + React 19 + TypeScript 6.0 strict in the repo root, `@/` alias, LF `.gitattributes`, `.editorconfig`, Node 24 pin (`.nvmrc`, `engines`), privacy metas, strict dev/preview ports.
- **WP2** Styling and rules: Tailwind CSS v4, shadcn/ui (`radix-nova`, `Button`), type-aware ESLint with the architecture and clock rules, Prettier, README-only placeholder folders, `CLAUDE.md` part 1.
- **WP3** Tests and CI: hermetic Vitest, the repo checks (`check:hygiene`, `check:leaks`, `check:commits`, `check:core`), `npm run verify`, `ci.yml` with the required **`ci-verify`** job, Dependabot, PR and issue templates, labels `dependencies` and `ci`.
- **WP4** Time-zone core: `src/core/dates.ts` (full PLAN §6.1 API, exact offsets from Intl), 320 table-driven tests, coverage thresholds 95/95/100/90 (actual 99.45 / 99.13 / 100 / 99.4).
- **WP5** Supabase: project `structured` (ap-south-1, organization "Karthi labs") created by the idempotent `npm run db:setup`; `0001_init.sql` pushed; generated types with no drift; `npm run test:integration` 7/7.
- **WP6** "DB connected": typed client, settings repository, health check with typed error codes, the status page (`use()` under `Suspense`, no `useEffect`), the production env guard and the `build-sha` meta. The `settings` row was created by the owner's Chrome with `timezone=Asia/Tokyo`.
- **WP7** Vercel: the secret-named project (Git integration off, Vite, Node.js 24.x, Standard Protection), `vercel.json`, the env matrix in sync, `scripts/ci/deploy-prod.sh` (the one deploy path) with the smoke check, `deploy.yml`, GitHub secrets. Production serves commit `9c23319` and shows "DB connected".
- **WP8** GitHub: ruleset 24225914 on `main` (PR with 0 approvals, merge commits only, `ci-verify` required, no force-push or deletion), CodeQL default setup `configured` (languages follow at Ship), description and 12 topics.
- **WP9** (in progress) Docs and final sweep: `CLAUDE.md` part 2 (commands, env matrix, CI/CD flow, Dependabot fix paths, secrets rules, runbook links, work package checklist) and the README rewrite are done. Next in WP9: this HANDOFF's resume rehearsal on a fresh clone, then the final leak and attribution sweep.

### Cloud resources (values only in `.env.local`)
- **Supabase** project `structured`, ap-south-1, organization "Karthi labs". It uses the second and last free slot. URL, ref, keys and database password: `.env.local` and the Vercel development env.
- **Vercel** project in the "Karthi Labs" team. Its name is secret (`VERCEL_PROJECT_NAME` in `.env.local`). Production is deployed from this machine with `scripts/ci/deploy-prod.sh`; from Ship on, only the `Deploy` workflow deploys. The production URL is `PROD_URL` in `.env.local`.
- **GitHub:** repo secrets `VERCEL_TOKEN` (Vercel scope "Karthi Labs"), `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` and `PROD_URL`; ruleset 24225914; CodeQL default setup; description and 12 topics.

### Next
1. **Finish WP9:** the resume rehearsal (follow "New machine" below on a throwaway clone), the final sweep (PLAN §12 AC 36 to 38), the PR #2 body update, and the WP9 tick on issue #1.
2. **Then:** QA round 1 (`test1`), QA round 2 (`test2`), final verification, Ship (PLAN §17.1).
3. **Ship follow-ups:**
   - **CodeQL languages** (PLAN §17.1 step 8). Right after the merge, `gh api repos/karthi-ai-engineer/Structured/code-scanning/default-setup --jq '.state, .languages'` must show `configured` with `javascript-typescript` and `actions`. If a language is missing, run: `printf '{"state":"configured","query_suite":"default","languages":["javascript-typescript","actions"]}' | gh api -X PATCH repos/karthi-ai-engineer/Structured/code-scanning/default-setup --input -`. The same follow-up is in the PR #2 body.
   - **Merge with `gh pr merge 2 --merge`.** The ruleset allows merge commits only and needs a green `ci-verify` on the PR head.
   - **Before the merge,** this file must state the post-Ship state (Phase 0 shipped as `v0.0.1`; next is Phase 1 on `phase-1-web-mvp` with the team workflow), and the README status row must still be right.
4. **Open item for QA or the owner: M2 against production** (AC 24 bullet 2). Delete the `settings` row with a one-off secret-key command, then load production in the owner's Chrome: the first load must show `Settings row created`, a reload `Settings row found`, and `node scripts/supabase.mjs settings` must show Chrome's zone. No WP session was permitted to delete the row (DEVLOG WP7, deviation 7).
5. **Forward notes for the next planners:**
   - **Phase 1 seeding trigger.** The `settings` row already exists, so the master plan's "no settings row → create it and seed Rise and Shine / Wind Down" never fires. Phase 1 must choose another trigger, for example a `settings.seeded_at` marker set by a conditional update (`… where seeded_at is null`), so that exactly one device seeds.
   - **Phase 2 early checks.**
     - Give `server/` and `api/` their own tsconfig (for example `tsconfig.server.json`) referenced from `tsconfig.json`. Otherwise type-aware ESLint fails with "was not found by the project service".
     - Verify early that Vercel's function bundling resolves `src/core`'s relative imports with `.ts` extensions (for example with `rewriteRelativeImportExtensions`, or Node 24 type stripping in the function runtime) before building tools on top of it.
   - **Best-effort items (PLAN §0.1): none deferred.** The pin and workflow checks in `check:hygiene` and the `--expect-protected` probe are done. `env:sync-vercel -- --apply --force` is implemented and unit-tested but was never run against the live project (no session was permitted to overwrite); the substitute is `npx --yes vercel@61.1.0 env rm <NAME> <target> --yes`, then `npm run env:sync-vercel -- --apply`. The preview API fallback is implemented but was not needed.
   - **Open questions for the owner** (PLAN §16, asked in the phase report): commit signing (commits show "Unverified"), a committed harness setting against attribution, a license, Dependabot security updates, non-provider secret-scanning patterns, local Node 24, and a keep-alive ping before Phase 3.
6. **After Phase 0:** Phase 1 runs the **team workflow**: `docs/process/TEAM_WORKFLOW.md`, `.claude/workflows/team-pipeline.js` and `docs/phases/phase-1/pipeline-args.json`. Optional before Phase 1: `gh auth refresh -s project`, so the pipeline can maintain a GitHub Project board.

### Blockers
None.

### Notes
- Local Node 26 prints an `EBADENGINE` warning for `engines.node = 24.x`. This is expected; CI and Vercel use Node 24.
- The owner's commit `28df4fd` (balanced team-pipeline profile) landed after the plan baseline `1195168`; its `CLAUDE.md` paragraph is kept verbatim (DEVLOG WP1 and WP2).
- Local gate: `npm run verify`. Before every push: `npm run check:commits` and `npm run check:leaks`. Before any `gh … create/edit` of PR, issue or release text: `node scripts/checks/commits.mjs --text-file <file>` and the PR-text word check (`CLAUDE.md`, "Secrets").
- `ci-verify` is required by the ruleset: never rename the job, add path filters or use `[skip ci]`.
- A local `npm run build` with `.env.local` present bundles the real Supabase URL and publishable key into `dist/`. `.vercel/` after a local deploy holds `project.json` (IDs and name), `.env.production.local` and `output/`. Both folders are gitignored: never commit, upload or paste them. CI builds are unconfigured by design and show "Database not configured".
- The Vercel development env is the source of truth for `.env.local`: `npm run env:sync-vercel` (read-only report) before any `vercel env pull`, and `npm run env:sync-vercel -- --apply` after adding a local key.
- **Local production deploy** (the same script as CI): `PROD_URL="$(node scripts/lib/env-file.mjs get .env.local PROD_URL)" DEPLOY_LOG_DIR=<scratch folder> bash scripts/ci/deploy-prod.sh`. It needs the link (`.vercel/project.json`) and prints no URLs. Delete the log folder afterwards, because it holds the generated deployment URL.
- **Smoke check without deploying:** `PROD_URL="$(node scripts/lib/env-file.mjs get .env.local PROD_URL)" EXPECTED_SHA=<the deployed commit, now 9c2331913bf037b2a6391823835c6c0bdfb25e2f> SUPABASE_ENV_FILE=.vercel/.env.production.local node scripts/ci/smoke.mjs`.
- The `settings` row exists (`Asia/Tokyo`, created by Chrome in WP6). Any test that deletes it must let a real browser on the owner's machine recreate it, never a headless one.

## Find the live branch
`git ls-remote --heads https://github.com/karthi-ai-engineer/Structured` lists the branches. The newest `phase-*` branch holds the live `HANDOFF.md`; if there is none, use `main`. During Phase 0 the live branch is `phase-0-foundation`.

## New machine
Run everything in **Git Bash**, one step at a time. Each step ends with a check; stop and fix it before going on.

1. **Tools.** Install Node 24 (the version in `.nvmrc`): `winget install Schniz.fnm`, then `fnm install 24 && fnm use 24`; or nvm-windows: `nvm install 24 && nvm use 24` (it ignores `.nvmrc`). Also install Git, the GitHub CLI and Claude Code. To run npm from PowerShell as well, run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.
   - Check: `node --version` prints `v24.…` (Node 26 also works, with an `EBADENGINE` warning), and `git --version` and `gh --version` work.
2. **GitHub login.** `gh auth login` as `karthi-ai-engineer`, then `gh auth refresh -s workflow`.
   - Check: `gh api user --jq .login` prints `karthi-ai-engineer`, and `gh auth status` lists the `workflow` scope.
3. **Clone the live branch** (see "Find the live branch"):
   ```bash
   git clone -b <live branch> https://github.com/karthi-ai-engineer/Structured.git && cd Structured
   ```
   - Check: `git branch --show-current` prints the live branch.
4. **Identity and credentials**, inside the repo only (single quotes, so Git Bash does not expand `!`):
   ```bash
   git config user.name "<your name>"
   git config user.email karthi.ai.engineer@gmail.com
   git config credential.https://github.com.helper ''
   git config --add credential.https://github.com.helper '!gh auth git-credential'
   ```
   - Check: `git config --get-all credential.https://github.com.helper` prints an empty line and then `!gh auth git-credential`, and `git ls-remote origin` works without a prompt.
   - Commits show "Unverified" on GitHub until commit signing is set up (open question 1 in `docs/phases/phase-0/PLAN.md` §16).
5. **Dependencies.** `npm ci`.
   - Check: it exits 0. An `EBADENGINE` warning on a Node other than 24 is fine.
6. **Vercel: link to the existing project, then pull the env.** The owner logs in with a browser; `VERCEL_TOKEN` in the environment is the headless alternative. CLI output that names the secret project goes into `.vercel/` (gitignored), never to the screen.
   ```bash
   V="npx --yes vercel@61.1.0"
   $V login                      # browser; skip it if `$V whoami` already prints your user
   $V teams ls                   # the id column of the "Karthi Labs" row is the team slug
   TEAM='<team slug>'
   mkdir -p .vercel
   $V project ls --scope "$TEAM" --filter structured- --limit 100 --format json > .vercel/ls.json 2> .vercel/ls.err
   NAME="$(node -e "const p=JSON.parse(require('fs').readFileSync('.vercel/ls.json','utf8')).projects.filter(x=>x.name.startsWith('structured-')); if(p.length===1){process.stdout.write(p[0].name)} else {console.error('expected exactly 1 structured-* project, found '+p.length); process.exit(1)}")" && export NAME && echo "project found"
   $V project inspect "$NAME" --scope "$TEAM" --format json > .vercel/inspect.json 2> .vercel/inspect.err && echo "inspect ok"
   ```
   - Check: it prints `project found` and `inspect ok`. Never link before both. The inspect proves the project exists, so `link` cannot take the CLI's "create a new project" path (which would also connect Git).
   ```bash
   $V link --yes --project "$NAME" --team "$TEAM" > .vercel/link.log 2>&1
   node -e "const p=require('./.vercel/project.json'); process.exit(p.projectId && p.orgId && p.projectName===process.env.NAME ? 0 : 1)" && echo "linked to the existing project"
   git checkout -- .gitignore    # link appends .vercel and .env* lines (with CRLF); the existing rules already cover them
   git status --short            # must print nothing
   ```
   - Check: it prints `linked to the existing project`, and `git status --short` is empty. If `link` fails or the check fails, stop: never let the CLI create a project.
   ```bash
   $V project ls --scope "$TEAM" --filter structured- --limit 100 --format json > .vercel/ls.json 2> .vercel/ls.err
   node -e "const n=JSON.parse(require('fs').readFileSync('.vercel/ls.json','utf8')).projects.filter(x=>x.name.startsWith('structured-')).length; console.log('structured-* projects: '+n); process.exit(n===1?0:1)"
   $V git disconnect --yes > .vercel/git.log 2>&1 || true   # "No Git repository connected" is fine
   $V project inspect "$NAME" --scope "$TEAM" --format json > .vercel/inspect.json 2> .vercel/inspect.err
   node -e "const j=JSON.parse(require('fs').readFileSync('.vercel/inspect.json','utf8')); const k=Object.keys(j).filter(x=>/link|git/i.test(x)); console.log(k.length ? 'GIT LINK FOUND: '+k.join(',') : 'no git link'); process.exit(k.length ? 1 : 0)"
   $V env pull .env.local --yes > .vercel/pull.log 2>&1 && echo "env pulled"
   git checkout -- .gitignore    # env pull appends ".env*" (with CRLF) again
   rm -f .vercel/ls.json .vercel/ls.err .vercel/inspect.json .vercel/inspect.err .vercel/link.log .vercel/git.log .vercel/pull.log
   git status --short            # must print nothing
   ```
   - Check: `structured-* projects: 1` (linking created nothing), `no git link`, `env pulled`, and an empty `git status --short`.
   - Why the `.gitignore` reverts: `vercel link` and `vercel env pull` append `.vercel` and `.env*` to `.gitignore` unless that exact line is present. On Windows the CLI splits the file on CRLF, so it never finds the line in our LF file and appends it every time, with CRLF. The existing rules already ignore both, and the CRLF would fail `check:hygiene`.
7. **Env check.** `npm run env:check`.
   - Check: all 7 keys print `ok`. `vercel env pull` also adds `VERCEL_OIDC_TOKEN`, which is expected.
8. **Supabase.**
   ```bash
   npx supabase login            # browser; SUPABASE_ACCESS_TOKEN in the environment is the headless alternative
   npm run db:link
   npm run db:migrations
   npm run db:ping
   ```
   - Check: `db:link` exits 0, `db:migrations` shows `0001` both locally and remotely, and `db:ping` prints `db: ok (200)`. The first three need outbound TCP 5432 (see "Recovery and runbooks").
9. **Verify and run.** `npm run verify`, then `npm run dev`.
   - Check: `verify` exits 0. `http://localhost:5173` shows "Structured" and **"DB connected"**. Stop the server afterwards (Ctrl+C, or `taskkill /PID <pid> /T /F`), and confirm that `netstat -ano | findstr ":5173 :4173"` prints nothing.
10. **Continue.** Work from "Next" above, or resume the pipeline. Open Claude Code in the repo and say, for example: *"Read HANDOFF.md and CLAUDE.md, then resume the Phase 0 pipeline."* Claude should:
    - take `docs/phases/phase-0/pipeline-args.json`
    - fill in `root` (this clone's absolute path), `today`, `envNotes` (this machine's tools), and `resumeFrom` and `skipWPs` (from "Current status" above)
    - run `Workflow({ scriptPath: ".claude/workflows/phase-pipeline.js", args: <that JSON> })`

**Re-linking an existing clone** (for example after deleting `.vercel/`): first back up `.env.local` (`cp .env.local .vercel/env.local.bak` after `mkdir -p .vercel`), because `link` rewrites it. Then follow step 6, and restore any local-only keys from the backup. Delete the backup afterwards.

## Returning to an existing clone
1. `git fetch --prune && git switch <live branch> && git pull --ff-only` (never force-push).
2. `npm ci` if `package-lock.json` changed since your last session.
3. `npm run env:sync-vercel` (a read-only report). If a key differs or is missing locally, run `npx --yes vercel@61.1.0 env pull .env.local --yes`, then `git checkout -- .gitignore` (the pull appends a line to it) and `npm run env:check`.
4. `npm run db:ping` prints `db: ok (200)`.
5. `npm run db:migrations` shows the same versions locally and remotely.

## Recovery and runbooks

### Paused database (HTTP 540)
The free Supabase project pauses after 7 days without activity. `npm run db:ping` then prints `PAUSED (540)`, and the app shows "The Supabase project is paused".
1. Supabase dashboard → project `structured` → **Restore**.
2. Wait until it is healthy.
3. `npm run db:ping` and `npm run db:migrations`.

The data is kept.

### Database commands cannot connect
`npm run db:link`, `db:push` and `db:migrations` need **outbound TCP 5432** to the Supabase pooler. A REST `200` from `db:ping` does not prove that the port is open. Try another network. `db:types`, `db:ping` and `node scripts/supabase.mjs settings` use HTTPS only. Never use `--skip-pooler`, and never use the Docker-only commands (`db diff`, `db pull`, `start`).

### Production rollback
Run these in a linked clone (`.vercel/project.json` present). The deployment lists contain URLs: keep them in your terminal, never paste them anywhere.
1. If a deploy broke production: `npx --yes vercel@61.1.0 ls --environment production --scope <team>` lists the production deployments, newest first. Roll back to the previous one: `npx --yes vercel@61.1.0 rollback <previous deployment URL or ID> --yes --scope <team>`. Hobby can roll back only to the previous production deployment.
2. A rollback **turns off automatic assignment of the production domain**. Fix forward through a PR and let `Deploy` run. Its smoke SHA check fails while production stays on the rolled-back deployment; this is expected.
3. Promote the fixed deployment (the newest one in that list): `npx --yes vercel@61.1.0 promote <that deployment URL or ID> --yes --scope <team>`. This turns automatic assignment back on.
4. Re-run `Deploy` (`gh workflow run deploy.yml --ref main`) and confirm that it is green.

### Leak response
If a secret, a URL or the project name reaches a pushed commit, a PR, an issue or a public log:
1. **Rotate** what leaked:
   - Supabase keys: dashboard → API Keys
   - database password: dashboard → Database → Reset
   - Vercel token: Account → Tokens (then update the `VERCEL_TOKEN` secret)
   - project name or URL: create a new Vercel project with a new secret name, then re-link
2. Update `.env.local` with `node scripts/lib/env-file.mjs set <KEY>` (value on stdin).
3. `npm run env:sync-vercel -- --apply --force`, or for each rotated key `npx --yes vercel@61.1.0 env rm <NAME> <target> --yes` followed by `npm run env:sync-vercel -- --apply`.
4. Redeploy (`gh workflow run deploy.yml --ref main`).
5. Update the affected GitHub secrets (`… | gh secret set <NAME>`, value from stdin).
6. Record the rotation in the phase `DEVLOG.md`, without values.

History on `main` cannot be rewritten (ruleset), and GitHub keeps PR views, so **rotation is the fix**. The publishable key and the URL are baked into the bundle, so rotating them needs a rebuild.

### Commit signing fails
If `git commit` fails with a GPG or pinentry error: stop and ask the owner. Never pass `--no-gpg-sign`, and never change the git config.

### `vercel link` or `vercel env pull` changed local files
`git checkout -- .gitignore` (both append a line to it, with CRLF on Windows, which fails `check:hygiene`). After a re-link, restore local-only keys in `.env.local` from the backup (see "Re-linking an existing clone").

## How we work
See `CLAUDE.md` (rules, commands, CI/CD flow, "Running a phase") and `PLAN.md` §14. Every phase: branch → tracking issue → pipeline → PR → CI → merge → deploy → release. No AI attribution anywhere.
