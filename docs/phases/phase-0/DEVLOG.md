# Phase 0 dev log

One section per work package (WP) and fix round: what was done, commands run, deviations from `PLAN.md`, and notes for testers. This file is committed to a public repo, so it never contains secret values, app URLs, the Vercel project name or the Supabase project ref/URL (see `.env.local`).

---

## WP1: Scaffold Vite + React 19 + TypeScript (strict) and repo hygiene files

**Date:** 2026-09-30 (UTC+9). **Branch:** `phase-0-foundation`. **Tracking issue:** #1. **PR:** #2 (draft).

### What was done
- **Hygiene files** (commit `chore: add line-ending and editor config`):
  - `.gitattributes` exactly as §5.1 (`* text=auto eol=lf`, CRLF for `.cmd/.bat/.ps1`, binaries). `git add --renormalize .` produced no diff.
  - `.editorconfig` exactly as §5.3 (UTF-8 without BOM, LF, 2 spaces).
  - `.nvmrc` = `24` (no BOM, LF).
  - `.gitignore`: every existing line kept; added `*.tsbuildinfo` and `.claude/settings.local.json` (§5.2).
  - `.vscode/extensions.json`: ESLint, Prettier, Tailwind CSS IntelliSense and EditorConfig.
- **Scaffold** (commit `chore: scaffold Vite React TypeScript app`):
  - `create-vite@9.2.1 --template react-ts --eslint` in the scratchpad, then `cp -n` of `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `eslint.config.js`, `index.html` and `src/main.tsx`. Not copied: `README.md`, `.gitignore`, `src/App.css`, `src/index.css`, `src/assets/*`, `public/icons.svg`, `public/favicon.svg`.
  - `package.json`: name `structured`, version `0.0.1`, description, repository, `engines.node = "24.x"`, fields ordered as in §5.4. Scripts: `dev`, `build`, `preview`, `typecheck`, `lint`.
  - Installed versions (lockfile): React 19.3.0, Vite 8.3.1, TypeScript 6.0.3, `@types/node` 24.19.0.
  - `tsconfig.app.json`: the create-vite file plus `paths` (`@/*` → `./src/*`), `strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `forceConsistentCasingInFileNames`. No `baseUrl`.
  - `tsconfig.node.json`: plus `strict`; `include` = `vite.config.ts`, `vitest.config.ts`, `vitest.integration.config.ts` (the last two arrive in WP3 and WP5; missing literal includes are harmless).
  - `tsconfig.json`: references app and node, plus the same `paths`.
  - `vite.config.ts`: §5.6 without the env guard, build-SHA plugin and Tailwind (WP2/WP6); has the `@` alias and `strictPort` for dev and preview.
  - `index.html` exactly as §5.9 (privacy metas, `color-scheme` light, title "Structured").
  - `src/App.tsx` (named export `App`, heading "Structured"); `src/main.tsx` renders `<StrictMode><App /></StrictMode>` and imports `@/App`, so both `tsc` and Vite exercise the alias.
  - `public/favicon.svg` (a coral vertical pill with a white dot) and `public/robots.txt` (allow-all).

### Commands run
```
npx --yes create-vite@9.2.1 scaffold --template react-ts --eslint --no-interactive --no-immediate   # cwd: scratchpad
cp -n <scaffold>/<file> <file>                                   # the 8 files listed above
npm pkg set name=structured version=0.0.1 engines.node=24.x description=… repository=github:karthi-ai-engineer/Structured
npm pkg set scripts.dev=vite "scripts.build=tsc -b && vite build" "scripts.preview=vite preview" "scripts.typecheck=tsc -b"
npm install
npm install -D typescript@~6.0.3 @types/node@^24
npm install react@^19.3.0 react-dom@^19.3.0
git add --renormalize .
npm run typecheck && npm run lint && npm run build
```

### Verification results
| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 (`dist/index.html` carries the robots, referrer and color-scheme metas) |
| `npm run lint` (`--max-warnings=0`) | exit 0 |
| `git ls-files --eol \| grep -v 'i/lf' \| grep -v 'i/-text' \| grep -v 'i/none'` | prints nothing |
| New files: BOM / CR bytes | none |
| `npx tsc --showConfig -p tsconfig.app.json` | `"strict": true`, `"noUncheckedIndexedAccess": true`, `paths` `@/*`; `baseUrl` count 0 |
| Lockfile `@rolldown/binding-{win32-x64-msvc,linux-x64-gnu,darwin-arm64}` | 3 / 3 / 3 matches |
| Dev server | `/` returns 200 with the metas; `/src/main.tsx` resolves `@/App` to `/src/App.tsx` |
| `strictPort` | a second `vite` start while 5173 is taken exits 1 (no silent move to 5174) |
| Ports after the check | nothing listening on 5173 / 4173 (server stopped with `taskkill /PID <pid> /T /F`) |
| Docs untouched by WP1 | `git diff 28df4fd HEAD -- PLAN.md CLAUDE.md README.md .claude docs/process docs/phases/phase-1 <phase-0 planning inputs>` is empty; see the baseline note below |
| Branch pushed, draft PR | PR #2 (draft, base `main`, labels `phase`, `phase-0`, body has `Closes #1`) |

### Deviations
1. **create-vite target path.** Passing the absolute Git Bash path (`/c/Users/…/scratchpad/scaffold`) made create-vite write into a nested `scratchpad/C/Users/…/scaffold` folder (it drops the drive colon). It was re-run with the relative name `scaffold` from inside the scratchpad, and the stray folder was deleted. Future scaffolds (for example Phase 4) should `cd` into the scratchpad and pass a relative name.
2. **ESLint ignores brought forward from WP2.** The scaffold's `eslint .` parsed `.claude/workflows/*.js` and failed (`'return' outside of function`). `eslint.config.js` now has `globalIgnores(['dist', 'coverage', '.vercel', '.claude', 'docs'])` (D0-4), and the `lint` script is already `eslint . --max-warnings=0` (§5.4). WP2 still replaces `eslint.config.js` with §5.8.
3. **React range.** `react`/`react-dom` raised from the scaffold's `^19.2.8` to `^19.3.0` to match §2.1 (the lockfile already resolved 19.3.0).
4. **`tsconfig.json` references** only `tsconfig.app.json` and `tsconfig.node.json` for now. `tsconfig.test.json` and its reference are added in WP5 (it includes `tests/`, which does not exist yet, and an empty project would fail `tsc -b` with TS18003).
5. **`src/main.tsx`** throws a clear error when `#root` is missing instead of the scaffold's non-null assertion.

### Notes for testers
- **AC 3 baseline and the owner commit `28df4fd`.** After the plan was approved, the owner pushed `28df4fd` ("chore: adopt balanced team-pipeline profile from phase 1"); it arrived with `git pull --ff-only` in the WP1 opening ritual. It changes `CLAUDE.md` (2 added lines, nothing removed), `.claude/workflows/team-pipeline.js`, `docs/process/TEAM_WORKFLOW.md` and `docs/phases/phase-1/pipeline-args.json`. So `git diff 1195168 -- CLAUDE.md .claude docs/process docs/phases/phase-1` is **not** empty; that diff is owner-authored, not phase work. Checks that isolate phase work: `git diff 28df4fd HEAD -- <the AC 3 paths>` must be empty (it is, at WP1), `git diff 1195168 -- PLAN.md README.md` is empty, and `git diff 1195168 -- CLAUDE.md | grep '^-[^-]'` prints nothing. WP2 (CLAUDE.md part 1) must keep the owner's new "balanced profile" paragraph verbatim.
- Local Node is 26.3.1, so npm prints an `EBADENGINE` warning for `engines.node = 24.x`. This is expected (§2.2 item 4, open question 6); CI uses Node 24.
- `@types/node` was already a create-vite devDependency; the explicit `@^24` install moved it to 24.19.0.
- No tests or `format` scripts exist yet (WP2 and WP3).
- Commits are GPG-signed by the machine's global key (`%G?` = `G` locally); GitHub shows them as "Unverified" (open question 1).

---

## WP2: Tailwind v4, shadcn/ui, ESLint, Prettier, folder skeleton, architecture rules, CLAUDE.md part 1

**Date:** 2026-09-30 (UTC+9). **Branch:** `phase-0-foundation`. **Tracking issue:** #1. **PR:** #2 (draft).

### What was done
- **Tailwind CSS v4** (commit `feat: add Tailwind CSS v4 and shadcn/ui`):
  - `tailwindcss` and `@tailwindcss/vite` 4.3.3 (devDependencies); `tailwindcss()` added to the `vite.config.ts` plugins.
  - `src/styles/index.css` is the entry, imported by `src/main.tsx` (`import '@/styles/index.css'`). It has the three `@source not` lines for `docs`, `PLAN.md` and `.claude` (P15).
- **shadcn/ui 4.21.0**, same commit:
  - `components.json`: style `radix-nova`, `tailwind.css` = `src/styles/index.css`, base colour neutral, CSS variables, icon library lucide, aliases under `@/`. No hand fix was needed.
  - `src/components/ui/button.tsx` (Radix `Slot`, `cva`) and `src/lib/utils.ts` (`export { cn } from 'cn'`).
  - Runtime dependencies: `radix-ui`, `class-variance-authority`, `cn`, `lucide-react`. Build-time packages were moved to devDependencies: `shadcn`, `tw-animate-css`, `@fontsource-variable/geist` (§5.4, P12).
  - `tsconfig.app.json` and `tsconfig.json` are unchanged by shadcn (no `baseUrl`).
  - `src/App.tsx` renders the shadcn `Button` (`size="lg"`, `variant="outline"`, `min-h-11`, disabled, "Check again") under the "Structured" heading, with the §6.6 layout classes. WP6 wires it to the database check.
- **ESLint and Prettier** (commit `chore: add ESLint and Prettier configuration`):
  - `eslint.config.js` is §5.8: type-aware `recommendedTypeChecked` with `projectService`, `consistent-type-imports`, `no-explicit-any`, plus the boundary and clock rules (D0-3). `react-refresh/only-export-components` is off for `src/components/ui/**`. JS files get Node globals and `disableTypeChecked`. `eslint-config-prettier/flat` comes last.
  - `.prettierrc.json` and `.prettierignore` are exactly §5.9 (Markdown, `docs/`, `.claude/`, the lockfile and generated types are ignored).
  - Scripts `format` (`prettier --write .`) and `format:check` (`prettier --check .`); `lint` was already `eslint . --max-warnings=0` (WP1).
  - `npm run format` ran once. It changed only `eslint.config.js`, `src/components/ui/button.tsx` and `src/lib/utils.ts` (quote style), and `src/styles/index.css` (indentation). `git status` showed nothing under `docs/`, `.claude/` or any `*.md`.
  - Ranges raised to the §2.1 minimums: `typescript-eslint` `^8.71.0` (was `^8.69.0`), `eslint` `^10.11.0` (was `^10.10.0`). Installed: ESLint 10.11.0, typescript-eslint 8.71.0, Prettier 3.9.9, prettier-plugin-tailwindcss 0.8.1, eslint-config-prettier 10.1.8.
- **Folder skeleton** (commit `chore: add folder skeleton`): README-only placeholders (3 to 4 lines each: purpose and import rules) in `src/features`, `src/stores`, `src/data/queries`, `server` and `api` (P16). `src/core`, `src/data/repo`, `src/platform` and `supabase/migrations` get real files in WP4 to WP6. No `src/core/README.md` stand-in was created (optional in the plan), so WP3 has nothing to remove.
- **CLAUDE.md part 1** (commit `docs: add architecture and conventions to contributor guide`): only the trailing placeholder comment was replaced. New sections:
  - Architecture (folder table, README-only placeholders, and the r1 rule that new top-level TS folders need a tsconfig referenced from `tsconfig.json`)
  - Import rules
  - Code conventions
  - Data conventions, including the r1 note that the existing `settings` row cannot trigger the Phase 1 seeding (use a marker such as `settings.seeded_at`)
  - Database migrations (D0-8 naming and the new-table checklist)
  - Windows and shell rules
  - Session-start ritual

  The owner's "balanced profile" paragraph (commit `28df4fd`) is kept verbatim.

### Commands run
```
npm install -D tailwindcss @tailwindcss/vite
npx --yes shadcn@4.21.0 init --template vite --base radix --preset nova --yes --no-monorepo < /dev/null   # exact working command; no prompt, exit 0
npm install -D shadcn@^4.21.0 tw-animate-css@^1.4.0 @fontsource-variable/geist@^5.3.0 typescript-eslint@^8.71.0 eslint@^10.11.0
npm install -D eslint-config-prettier prettier prettier-plugin-tailwindcss
npm pkg set "scripts.format=prettier --write ." "scripts.format:check=prettier --check ."
npm run format
npm run lint && npm run format:check && npm run typecheck && npm run build
npm run dev   # then HTTP checks, then taskkill /PID <pid> /T /F
```

### Verification results
| Check | Result |
|---|---|
| `npm run lint` (`--max-warnings=0`) | exit 0. Linted `eslint.config.js`, `vite.config.ts`, `src/App.tsx`, `src/main.tsx`, `src/lib/utils.ts` and `src/components/ui/button.tsx` with the type-aware rules active (`--print-config` shows `projectService: true`) |
| `npm run format:check` | exit 0 ("All matched files use Prettier code style!") |
| `npm run typecheck` | exit 0 |
| `npm run build` | exit 0 (CSS about 23 kB, Geist woff2 files emitted) |
| `npx tsc --showConfig -p tsconfig.app.json` | no `baseUrl` (the only match in the file is the WP1 comment) |
| Lockfile natives | `@tailwindcss/oxide-`, `lightningcss-` and `@rolldown/binding-` each have win32-x64, linux-x64-gnu and darwin-arm64 entries |
| New files: BOM / CR bytes | none (counted with Node) |
| Dev server | `/` returns 200 with the privacy metas. `/src/App.tsx` contains the `Button` with "Check again", `size: "lg"`, `variant: "outline"`, `min-h-11` and `disabled`. The served `index.css` contains `.min-h-11`, `disabled:opacity-50`, `bg-background`, `--radius` and `Geist Variable`. |
| Ports after the check | nothing listening on 5173 / 4173 (stopped with `taskkill /PID <pid> /T /F`) |
| `git diff 1195168 -- CLAUDE.md \| grep '^-[^-]'` | prints only the placeholder comment line |
| `git diff 28df4fd --stat -- PLAN.md README.md .claude docs/process docs/phases/phase-1 <phase-0 planning inputs>` | empty |

**Negative lint tests.** Each probe was a temporary, uncommitted file, linted with `npx eslint <file>` and then deleted; `git status` was clean afterwards.

| # | File and content | Result (exit 1) |
|---|---|---|
| 1 | `src/core/tmp.ts` importing `react` | `no-restricted-imports`: "src/core is pure TypeScript: no React" |
| 2 | `src/core/tmp.ts` importing `@/lib/utils` | `no-restricted-imports`: "src/core uses relative imports with .ts extensions only (plain Node and Vercel functions cannot resolve @/)" and "src/core may only import from src/core" |
| 3 | `src/core/tmp.ts` with `await import('./x.ts')` | `no-restricted-syntax`: "No dynamic import() in src/core" |
| 4 | `src/lib/tmp.ts` importing `../../server/x` | `no-restricted-imports`: "src/ must never import server/ (PLAN.md section 6)" |
| 5 | `src/components/Tmp.tsx` importing `@supabase/supabase-js` | `no-restricted-imports`: "Only src/data may use Supabase" |
| 6 | `src/components/Tmp.tsx` containing `new Date()` | `no-restricted-syntax`: "Read the clock only through src/core/dates.ts (todayIn/nowMinutesIn) or pass an explicit instant" |

Probes 4 and 5 also report `@typescript-eslint/no-unsafe-assignment`, because the imported module does not exist (`server/x`) or is not installed yet (`@supabase/supabase-js`, WP5). This is expected; the configured message is present in both.

### Deviations
1. **Order of `src/styles/index.css`.** shadcn inserted its three `@import`s (`tw-animate-css`, `shadcn/tailwind.css`, `@fontsource-variable/geist`) and `@custom-variant dark` between `@import "tailwindcss"` and the `@source not` lines. The file was reordered so that all `@import`s come first (CSS requires imports before other rules), followed by the three `@source not` lines with a comment, then shadcn's variant, theme and tokens. The four §5.9 lines are all present; only their position differs.
2. **shadcn dark tokens kept.** `init` also wrote a `.dark { … }` token block and `@custom-variant dark`. They are kept for Phase 1 dark mode. Nothing applies the `.dark` class yet, and `index.html` keeps `color-scheme: light` (F12).
3. **`button.tsx` imports `cn` from the `cn` package** directly (shadcn 4.21 output), not from `@/lib/utils`. `src/lib/utils.ts` still re-exports it (AC 6), as §2.1 anticipated.
4. **Dev-server check over HTTP.** The styled button was verified from the served modules and generated CSS (see the table), not from a browser screenshot. For a visual check, run `npm run dev` and open the local port. The page shows "Structured" and a disabled, outlined "Check again" button in Geist. Stop the server with `taskkill` afterwards.

### Notes for testers
- The six negative lint probes can be repeated with any file name inside the same folders. The files must be under `src/`, so that the `tsconfig.app.json` project service picks them up.
- `npx shadcn add <component>` uses the pinned devDependency (4.21.0). Run `npm run format` afterwards: shadcn writes double quotes, and Prettier normalises them.
- There are still no tests, `check:*` scripts or CI (WP3). The subset that exists (`lint`, `format:check`, `typecheck`, `build`) passes.

---

## WP3: Vitest setup, CI workflow, repo checks, Dependabot and templates

**Date:** 2026-09-30 (UTC+9). **Branch:** `phase-0-foundation`. **Tracking issue:** #1. **PR:** #2 (draft).

### What was done
- **Vitest 5.0.2** (commit `test: add Vitest setup`):
  - `vitest` and `@vitest/coverage-v8` 5.0.2 (devDependencies).
  - `vitest.config.ts` is §5.7 without `coverage.thresholds` (WP4 adds them): `process.env.TZ = 'America/St_Johns'` is set inside the config; `test.env` blanks `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` and `VITE_BUILD_SHA`; unit tests are `src/**/*.test.{ts,tsx}` and `scripts/**/*.test.mjs`; v8 coverage covers `src/core/**/*.ts`.
  - `src/test/setup.ts` stubs `fetch` to reject ("network disabled in unit tests").
  - `src/core/__tests__/environment.test.ts` (§13.1): offset 210 on 2026-01-01, `Intl` zone `America/St_Johns`, blank `import.meta.env` Supabase values, and a rejecting `fetch`.
  - Scripts `test`, `test:watch` and `test:coverage`. There was no `src/core/README.md` stand-in to remove.
- **Repo checks** (commit `chore: add repo checks for leaks, hygiene, attribution and core loading`). All are plain Node ESM with no dependencies:
  - `scripts/lib/env-file.mjs` (§8.1): a BOM-stripping, UTF-16-refusing `.env` reader built on `util.parseEnv`; an atomic `updateEnvFile` (LF, no BOM, other lines and comments kept, duplicates collapsed); the CLI `check | get | set`; and `APP_KEYS`, `SENSITIVE_KEYS`, `PLACEHOLDERS` and `isPlaceholder`.
  - `scripts/lib/repo.mjs` (new helper, see deviation 1): git file listing, commit listing, binary detection and range resolution.
  - `scripts/checks/leaks.mjs` (§8.6):
    - sources: the explicit sensitive-key list, plus the hosts and host labels derived from it and the IDs in `.vercel/project.json`
    - the nine generic patterns
    - modes: files plus commit messages (default), `--stdin` and `--files`
    - output: `LEAK <where>:<line> matches <name>`, never a value
  - `scripts/checks/hygiene.mjs` (§8.7):
    - BOM, UTF-8 and CR checks on every text file
    - lockfile natives for `@rolldown/binding-`, `lightningcss-`, `@tailwindcss/oxide-` and `@supabase/cli-` (win32-x64, linux-x64 and darwin-arm64)
    - the best-effort pin and workflow invariants are **implemented, not deferred**: `.nvmrc` is 24, `engines.node` is 24.x, the Vercel CLI pin is identical in the three deploy files once they exist, and `ci.yml` keeps `ci-verify` with no path filters
  - `scripts/checks/commits.mjs` (§8.8):
    - the four attribution rules over commit messages, `PR_TITLE`/`PR_BODY` and `--text-file`
    - the author e-mail allowlist (it prints only `AUTHOR <sha7>`, never the e-mail)
    - when both PR variables are empty it prints `PR text: not provided (push event or bot-authored PR)` and still checks every commit
  - `scripts/checks/core-node.mjs` (§8.9): imports every non-test `src/core/**/*.ts` with plain Node type stripping, and prints `ok <file>` or `FAIL <file>: <code>`.
  - Unit tests, with fixtures built at runtime by concatenation (P40): `scripts/lib/__tests__/env-file.test.mjs`, `scripts/checks/__tests__/leaks.test.mjs` and `scripts/checks/__tests__/commits.test.mjs`, plus `scripts/checks/__tests__/hygiene.test.mjs`. There are 118 unit tests in total.
  - npm scripts `check`, `check:hygiene`, `check:leaks`, `check:commits`, `check:core`, `verify` and `env:check`, in the §5.4 order.
- **CI** (commit `ci: add CI workflow with ci-verify job`): `.github/workflows/ci.yml` is exactly §10.1, including the r1 bot rule (`PR_TITLE` and `PR_BODY` are empty when `github.event.pull_request.user.type == 'Bot'`; commits and authors are always checked). `npm run format` changed nothing.
- **Dependabot** (commit `ci: add Dependabot configuration`): `.github/dependabot.yml` is exactly §10.3: npm and github-actions, weekly on Monday at 06:00 Asia/Kolkata, grouped minor/patch updates, and TypeScript and `@types/node` majors ignored. GitHub's own Dependabot config check on the PR passed.
- **Templates** (commit `chore: add pull request and issue templates`):
  - `.github/pull_request_template.md`: Summary, Linked issue (`Closes #`), Changes, Checklist (the five §10.4 items, in neutral wording) and Notes.
  - `.github/ISSUE_TEMPLATE/bug_report.yml`: what happened, expected, steps, platform (exactly `Web`, `Android` and `MCP server`), phase and environment.
  - `.github/ISSUE_TEMPLATE/feature_request.yml`: problem, proposal, PLAN.md section and priority (P1 to P4).
  - `.github/ISSUE_TEMPLATE/config.yml`: `blank_issues_enabled: true`, with no contact links.
- **Labels:** `dependencies` (#0366D6) and `ci` (#1D76DB), created with `gh label create … --force`.
- **Fix during the WP** (commit `fix: keep the env-file temp name under the .env ignore rule`): the atomic-write temp file for `.env.local` is now `.env.local.tmp-<pid>-<hex>`, which the `.env.*` ignore rule covers. The first version used `..env.local.tmp-…`, which the rule did not cover.

### Commands run
```
npm install -D vitest@^5.0.2 @vitest/coverage-v8@^5.0.2
npm pkg set scripts.test=… scripts.test:watch=… scripts.test:coverage=… scripts.check=… scripts.check:*=… scripts.verify=… scripts.env:check=…
npm run format
"$SCRATCH/al/actionlint.exe" .github/workflows/*.yml                      # actionlint 1.7.12 (release zip)
uvx check-jsonschema --builtin-schema vendor.dependabot .github/dependabot.yml
uvx check-jsonschema --builtin-schema vendor.github-issue-forms .github/ISSUE_TEMPLATE/bug_report.yml .github/ISSUE_TEMPLATE/feature_request.yml
uvx check-jsonschema --builtin-schema vendor.github-issue-config .github/ISSUE_TEMPLATE/config.yml
uvx check-jsonschema --builtin-schema vendor.github-workflows .github/workflows/ci.yml
grep -niwE 'ai|claude|anthropic|llm' .github/pull_request_template.md .github/ISSUE_TEMPLATE/*
gh label create dependencies -R karthi-ai-engineer/Structured --color 0366D6 --description "Dependency updates" --force
gh label create ci -R karthi-ai-engineer/Structured --color 1D76DB --description "CI/CD and automation" --force
npm run verify
git push origin phase-0-foundation
gh pr checks 2
gh run view <id> --log | node scripts/checks/leaks.mjs --stdin          # every run of this WP
```

### Verification results
| Check | Result |
|---|---|
| `npm run format` after writing the exact files | no changes |
| actionlint 1.7.12 on `.github/workflows/*.yml` | no findings (exit 0) |
| `check-jsonschema` 0.38.2: dependabot, both issue forms, issue config, `ci.yml` | `ok -- validation done` for all four calls |
| Template word check `grep -niwE 'ai\|claude\|anthropic\|llm' .github/pull_request_template.md .github/ISSUE_TEMPLATE/*` | prints nothing (exit 1) |
| `npm run verify` (typecheck, lint, format:check, test:coverage, build, check) | exit 0; 5 test files, 118 tests |
| `ci-verify` on push (run 36659732366) and on the PR (run 36659732463) | both `success`. The log shows `node-version-file: .nvmrc` and `node: v24.21.0`. The first run found no npm cache and saved one (`Cache saved with the key: node-cache-Linux-x64-npm-…`); see the next row |
| npm cache from the second run on | the runs for `25dbf03` (push 36659958809, PR 36659962822) are `success`, and the log shows `Cache hit for: node-cache-Linux-x64-npm-…` and `Cache restored successfully` |
| CI log leak scan (`gh run view <id> --log \| node scripts/checks/leaks.mjs --stdin`) | `leaks: ok` for all four runs |
| Commit step in the PR run | `PR text: checked (title and body)`, then 22 commits in `<base.sha>..<head.sha>` checked |
| Commit step in the push run | `PR text: not provided (push event or bot-authored PR)`, then 22 commits in `origin/main..HEAD` checked |
| **Fake leak:** `printf 'sb_%s_%s' secret "$(head -c 32 /dev/urandom \| base64 \| tr -dc A-Za-z0-9 \| head -c 24)" > "$SCRATCH/fake.txt"`, then `node scripts/checks/leaks.mjs --files "$SCRATCH/fake.txt"` | exit 1. It prints only `LEAK <scratch path>/fake.txt:1 matches supabase-secret-key` and the summary, with no value. The file was deleted |
| **Fake attribution:** a co-author trailer with the assistant name and noreply address, assembled from `printf` pieces into `$SCRATCH/body.md`, then `node scripts/checks/commits.mjs --text-file "$SCRATCH/body.md"` | exit 1, with `ATTRIBUTION file …/body.md:3 matches assistant-noreply-address` and `… co-authored-by-assistant`. The file was deleted |
| **Bot PR text skip:** `PR_TITLE= PR_BODY= node scripts/checks/commits.mjs` | prints `PR text: not provided (push event or bot-authored PR)`, then `commits: 18 in origin/main..HEAD checked (messages and author e-mails)`; exit 0. A unit test covers it too (`--range HEAD..HEAD`) |
| Clean PR text: `PR_TITLE='feat: add generated database types'` and a body with the MCP connector wording | `commits: ok` (no false positive) |
| `ci.yml` bot expression reviewed against §10.1 | identical. On push events `github.event.pull_request` is null, so both variables are `''` |
| Hermetic env probe: a dummy, non-secret `.env.local` with `VITE_SUPABASE_URL=https://hermetic-probe.invalid` | `environment.test.ts` passes. **Negative probe:** the same run with `test.env` removed (a throwaway config) fails with `expected 'https://hermetic-probe.invalid' to be ''`. The dummy file and the throwaway config were deleted |
| `check:core` probes (temporary, uncommitted `src/core/probe*.ts`) | a plain `.ts` module gives `ok`; an `@/lib/utils` import gives `FAIL … ERR_MODULE_NOT_FOUND`; an extensionless relative import gives `FAIL … ERR_MODULE_NOT_FOUND`; an `enum` gives `FAIL … ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX`; exit 1. The probes were deleted |
| `env-file.mjs` CLI in the scratchpad | `set` reads stdin, `get` prints without a newline, `check --allow-missing` works, and a UTF-16 file and empty stdin are refused |
| Labels | `dependencies` and `ci` exist |

### Deviations
1. **New helper `scripts/lib/repo.mjs`.** `leaks.mjs`, `hygiene.mjs` and `commits.mjs` share git file listing (`git ls-files -z --cached --others --exclude-standard`), commit listing, binary detection and range resolution. The helper is not in the §4 file tree; it avoids three copies of the same git code. Git is spawned without a shell.
2. **Extra unit test `scripts/checks/__tests__/hygiene.test.mjs`** (encoding, lockfile natives, pin extraction and `ci.yml` invariants). §13.1 does not require it; it was added because CI depends on these checks.
3. **Vercel pin check before WP7.** None of `deploy.yml`, `scripts/ci/deploy-prod.sh` and `scripts/lib/vercel.mjs` exists yet, so `check:hygiene` prints `note: vercel pin: no deploy files yet`. As soon as any of them exists, all three must exist and carry the same exact `vercel@x.y.z` pin.
4. **Leak-check details beyond §8.6.** Each is stricter or a false-positive guard; none weakens the check.
   - `db-url-with-password` ignores documented placeholder passwords (`[YOUR-PASSWORD]`, `<password>`, `${VAR}`, `***`), in the same spirit as the `<ref>` placeholders.
   - A host label that is a public word (`structured`, `www`, `app`, `localhost`) is never treated as sensitive, so a future custom domain cannot flag the repo name everywhere. The full host and the explicit keys still apply.
   - `VERCEL_PROJECT_NAME`, hosts, labels and `projectName` match case-insensitively.
   - `--stdin` and `--files` scan only their input; the default mode scans files and the commit range. `--range` cannot be combined with them.
5. **`env-file.mjs` details beyond §8.1:**
   - NUL bytes (UTF-16 without a BOM) and invalid UTF-8 are refused, with the same advice.
   - `set` refuses an empty value.
   - Control characters are refused as well as newlines.
   - The quoting style (none, single quotes, backticks or double quotes) is chosen by a round-trip check through `util.parseEnv`, so a stored value always reads back identically.
6. **`commits.mjs` details:**
   - The co-author rule matches the assistant names as substrings on a `Co-Authored-By:` line. It also catches forms such as `GitHubCopilot`, and quoted or list-prefixed trailers.
   - `" ai"` in the generated-with rule must end at a word boundary, so "generated by airflow" is not flagged.
7. **CLI entry detection** uses `import.meta.main` (Node 24.2 or later; CI runs 24.21.0).
8. **Issue forms apply the existing team-workflow labels** `type:bug` and `type:feature` (the plan names no labels). The bug form also has an optional Environment field, and its Platform dropdown allows several selections. The options are exactly `Web`, `Android` and `MCP server`.

### Notes for testers
- `npm run verify` is now the full local gate (it includes `npm run check`). `check:core` prints `core: no modules in src/core yet` until WP4 adds `dates.ts`.
- Coverage prints `Unknown% (0/0)` until WP4, because `src/core` has no modules yet. The thresholds arrive in WP4.
- Without `.env.local`, `check:leaks` uses the generic patterns only. Once WP5 creates `.env.local`, the same command also checks the real values, and `.vercel/project.json` after WP7.
- Never paste key-shaped strings or trailer lines into files, even as examples. Build them at runtime, as the tests do.
- The unit tests under `scripts/` spawn `node` and write only to `os.tmpdir()`.

---

## WP4: `src/core/dates.ts` and tests

**Date:** 2026-09-30 (UTC+9). **Branch:** `phase-0-foundation`. **Tracking issue:** #1. **PR:** #2 (draft).

### What was done
- **Dependencies:** `date-fns` 4.4.0 and `@date-fns/tz` 1.5.0 (runtime `dependencies`, the latest releases on 2026-09-30).
- **`src/core/dates.ts`** (commit `feat: add time-zone-aware date helpers in core`). It has the full §6.1 API:
  - zones: `isValidTimeZone`, `assertTimeZone`, `normalizeTimeZone`
  - calendar: `isISODate`, `parseISODate`, `addDays`, `diffDays`, `dayOfWeek`, `toWeekStart`, `startOfWeek`, `weekRange`
  - clock: `todayIn`, `nowMinutesIn`, `msUntilNextDayIn`
  - times: `isTime`, `toMinutes`, `fromMinutes`, `addMinutesToTime`
  - instants: `zonedDateTimeToInstant`, `startOfDayInstant`
  - display: `formatTime`, `formatDuration`, `formatDateLabel`
  - types and constants: `ISODate`, `TimeFormat`, `WeekStart`, `TimeOptions`, `MINUTES_PER_DAY`, `MIN_ISO_DATE`, `MAX_ISO_DATE`, plus the named return types `WeekRange` and `ShiftedTime` (deviation 5)

  How it works:
  - **Zone offsets are exact.** They come from Intl wall-clock parts (`formatToParts`, `hourCycle: 'h23'`, one cached formatter per zone spelling), to the second. This replaces `tzOffset()`/`TZDate`; see deviation 1.
  - **Wall time to instant** follows the plan's algorithm: take the offsets 36 h before and after, keep the candidates whose own offset matches, and choose the earlier one. A wall time in a gap moves forward by the gap.
  - **Day starts** are a separate internal helper (`dayStarts`), used by `startOfDayInstant` and `msUntilNextDayIn` (deviations 3 and 4).
  - **Calendar maths** is `Date.UTC` arithmetic on the calendar day, so it never depends on the process zone. The range 1900-01-01 to 2999-12-31 is enforced everywhere.
  - **Times** accept `HH:mm`, `HH:mm:ss` and `HH:mm:ss.f...` (seconds are floored). `24:00` (also with `:00` and zero fractions) is accepted only with `{ endOfDay: true }`.
  - **Display is Intl-free:** `formatTime` and `formatDuration` are built by hand, and `formatDateLabel` uses date-fns with the `enUS` locale on `new TZDate(y, m - 1, d, 'UTC')`.
  - **Errors:** every invalid input raises a `RangeError` that names the function, the problem and the input (truncated to 40 characters). The `is*` guards never throw, even for non-string input.
  - **Purity:** no module-level side effects (the formatter cache fills lazily). The file imports only `date-fns`, `date-fns/locale/en-US` and `@date-fns/tz`.
  - The file header states the wall-clock timeline rule (F18) and the DST resolution rule.
- **Tests** (commit `test: cover date helpers across DST and time zones`). There are 5 files and 320 tests; with `environment.test.ts`, `src/core` has 323:

  | File | Tests | Covers |
  |---|---|---|
  | `dates.api.test.ts` | 9 | `expectTypeOf` on every export's signature, the exact runtime export list, constant values and literal types |
  | `dates.zone.test.ts` | 89 | the `todayIn`/`nowMinutesIn`, `zonedDateTimeToInstant`, `startOfDayInstant` and `msUntilNextDayIn` tables; zone validation; invalid input; the one default-clock test (`vi.useFakeTimers()` + `vi.setSystemTime`) |
  | `dates.time.test.ts` | 100 | `toMinutes`, `isTime` (agrees with `toMinutes` for every input and 4 option shapes), `fromMinutes` (with the 0..1440 round trip), `addMinutesToTime` |
  | `dates.calendar.test.ts` | 82 | `isISODate`, `parseISODate`, `addDays`, `diffDays`, `dayOfWeek`, `toWeekStart`, `weekRange`/`startOfWeek` (with a sweep of 60 days × 7 week starts) |
  | `dates.format.test.ts` | 40 | `formatTime`, `formatDuration`, `formatDateLabel` (with process-zone independence) |

  Every call passes an explicit instant. The only exception is the single default-clock test.
- **`vitest.config.ts`:** added `coverage.thresholds` `{ lines: 95, statements: 95, functions: 100, branches: 90 }` (§5.7).

### §13.1 rows → tests
Every row of the §13.1 `dates.*` tables is a test case. Rows written as "A / B" are two cases. The extra rows are listed in brackets.

| §13.1 table | Rows in the plan | Where |
|---|---|---|
| `todayIn` / `nowMinutesIn` | 17 rows = 26 instants | `dates.zone` `it.each` (all 26) [plus alias spelling, seconds floored, Dublin 1910 and range bounds] |
| `zonedDateTimeToInstant` | 11 | `dates.zone` `it.each` (all 11) [plus Santiago's repeated 23:30, St_Johns' repeated midnight, seconds floored, Dublin 1910 and `2999-12-31 24:00`] |
| `startOfDayInstant('2026-09-30', 'Asia/Tokyo')` | 1 | `dates.zone` `startOfDayInstant` table [plus Santiago, Toronto 1919, St_Johns 2010 and Apia 2011] |
| `msUntilNextDayIn` | 3 | `dates.zone` `it.each` (all 3) [plus Santiago's gap and repeated hour, St_Johns 2010 ×3, Toronto 1919, Apia 2011 and UTC edges] |
| zone validation (7 `isValidTimeZone`, 2 `normalizeTimeZone`) | 9 | `dates.zone` `time-zone validation` [plus `'Asia/Kolkata '`, `'+0530'`, the U+2212 offset, `Etc/GMT-14` and `America/Nuuk`] |
| errors (3) and default clock (1) | 4 | `dates.zone` `invalid input` and `default clock` |
| `toMinutes` (10 values, 12 RangeErrors) | 22 | `dates.time` `valid` and `invalid` lists [with extras] |
| `fromMinutes` (4 values, 5 RangeErrors, property) | 10 | `dates.time` |
| `addMinutesToTime` (5 rows, non-integer) | 6 | `dates.time` [plus 5 rows and the largest safe delta] |
| `isTime` agreement | 1 | `dates.time` |
| `isISODate` (3 accepted, 10 rejected) | 13 | `dates.calendar` [with extras] |
| `addDays` (7 rows, 5 RangeErrors) | 12 | `dates.calendar` [with extras] |
| `diffDays`, `dayOfWeek` | 4 | `dates.calendar` |
| `weekRange` (3 rows, year boundary, self start, 7 consecutive days, `toWeekStart(7)`/`(1.5)`, `startOfWeek` agreement) | 8 | `dates.calendar` |
| `formatTime` (5 rows, out of range) | 6 | `dates.format` |
| `formatDuration` (9 rows, 3 RangeErrors) | 12 | `dates.format` |
| `formatDateLabel` (default, pattern, St_Johns) | 3 | `dates.format` |

### Research done for this WP (scratch scripts, not committed)
1. **`@date-fns/tz` 1.5.0 `tzOffset()`**, read in `node_modules/@date-fns/tz/tzOffset/index.js` and probed on Node 26.3.1:
   - It parses Intl's `longOffset` string, and `calcOffset` takes its sign from the hours part. `-00:25:21` has hours `-00` = 0, so the result is **positive**. `tzOffset('Europe/Dublin', 1910-06-01T12:00Z)` returns `25.35`, although Dublin Mean Time was UTC-00:25:21. `TZDate` inherits the error: it reads 12:25:21 where the true wall time is 11:34:39.
   - LMT offsets with seconds come back as fractional minutes (`Asia/Kolkata` 1900 gives `321.1666...`), so the plan's `tzOffset(...) * 60_000 === wall - i` check depends on floating-point luck.
2. **Transition scan over all 419 Intl zones plus `UTC`, 1900 to 2039** (offsets from `formatToParts`; sampled every 6 h, then every 24 h; each transition found by binary search to the second):
   - 26,733 transitions. **None are within 72 h of each other**, so the ±36 h probes always bracket the nearest transition (`PROBE_MS`).
   - **69 backward transitions cross midnight** after midnight was already shown, so midnight happens twice. Examples: America/St_Johns, America/Goose_Bay and America/Moncton fell back at 00:01 from 1987 to 2010, Antarctica/Casey in 2010, Pacific/Guam and Pacific/Saipan in 1969, and America/Phoenix and America/Creston in 1944. Here the plan's `startOfDayInstant(tomorrow) - now` returns a **negative** value when `now` lies between the two midnights (deviation 4).
   - **2 forward gaps strictly straddle midnight:** America/Toronto and America/Nassau on 1919-03-30 (23:30 jumped to 00:30). Here "00:00 moved forward by the gap" (01:00) is 30 minutes after the real start of the day (deviation 3).
3. **Intl zone spellings** (Node 26.3.1):
   - lower case, `US/Eastern`, `GMT` and `Etc/GMT+0` are accepted and canonicalised
   - `+0530` and `+05` are accepted as offsets, and so is **U+2212 MINUS SIGN + `05:30`**, which resolves to `-05:30`. That is why `isValidTimeZone` also checks the **resolved** name.
   - padded, empty, `Z`, `GMT+5`, `UTC+5` and `Factory` are rejected

### Commands run
```
gh api user --jq .login; git config user.email; git pull --ff-only          # opening ritual
netstat -ano | grep -E ":5173 |:4173 "                                       # ports free
npm view date-fns version; npm view @date-fns/tz version                    # 4.4.0 / 1.5.0
npm install date-fns@^4.4.0 @date-fns/tz@^1.5.0
node ./probe*.tmp.mjs; node ./scan*.tmp.mjs                                 # research above; files deleted
npx vitest run --coverage src/core
npm run format; npm run typecheck; npx eslint . --max-warnings=0; npm run format:check
npm run check:core
grep -rn "from '@/" src/core; grep -rnE "from '\.{1,2}/[^']*'" src/core --include=*.ts | grep -v "\.ts'"
npm run verify
npm run check:commits; npm run check:leaks
git push origin phase-0-foundation
gh run list -b phase-0-foundation; gh run view <id> --log | node scripts/checks/leaks.mjs --stdin
```

### Verification results
| Check | Result |
|---|---|
| `npm run test:coverage` (thresholds 95/95/100/90) | pass. `dates.ts`: **99.45 % statements (184/185), 99.13 % branches (114/115), 100 % functions (45/45), 99.4 % lines (168/169)**. The one uncovered line is the unreachable safety throw in `msUntilNextDayIn` (see the notes for testers) |
| All unit tests | 10 files, 438 tests pass (323 in `src/core`) |
| Every §13.1 row is a test | yes, see the table above |
| `npm run check:core` | `ok src/core/dates.ts`, then `core: ok (1 module(s) load in plain Node v26.3.1)` |
| `dates.ts` imports | only `@date-fns/tz`, `date-fns` and `date-fns/locale/en-US` |
| AC 10 greps (no `@/`, every relative import ends in `.ts`) | print nothing (`dates.ts` has no relative imports; the tests use `../dates.ts`) |
| `npm run lint` (`--max-warnings=0`), `typecheck`, `format:check`, `build` | pass |
| `npm run verify` | exit 0 |
| `npm run check:commits` / `check:leaks` | ok (26 commits checked) |
| Negative probe: `offsetMs` swapped for the plan's `tzOffset() * 60_000` (temporary, restored from a scratch copy) | exactly one test fails: "1910-06-01 12:00 in Europe/Dublin is 1910-06-01T12:25:21.000Z". After the restore all 323 pass |
| Sources are ASCII-only | `grep -nP '[^\x00-\x7F]' src/core/dates.ts src/core/__tests__/*.ts` prints nothing. The Unicode test inputs are built with `String.fromCharCode` |
| CI `ci-verify` for `9ce3709` | push run 36661667489 and PR run 36661670517 both `success`. Their logs show `node: v24.21.0`, `Test Files 10 passed`, the same coverage (`dates.ts` 99.45 / 99.13 / 100 / 99.4) and `ok src/core/dates.ts`. So the historical tzdata rows (Dublin 1910, Toronto 1919, St_Johns 2010, Apia 2011) also hold on Node 24's ICU |
| CI log leak scan (`gh run view <id> --log \| node scripts/checks/leaks.mjs --stdin`) | `leaks: ok` for both runs |

### Deviations
1. **Offsets come from Intl wall-clock parts, not `tzOffset()`/`TZDate`.** §6.1 said "Implemented with tzOffset()", and that `todayIn`/`nowMinutesIn` "read the components of `new TZDate(now, tz)`". Research item 1 shows that `tzOffset` has the wrong sign for offsets between -01:00 and 00:00 (historical Dublin, Monrovia and others) and returns fractional minutes. The algorithm (±36 h probes, candidate check, earlier instant, gap fallback) is unchanged; only its offset function differs, and it is exact to the second. `TZDate` is still used, but only by `formatDateLabel` with the fixed zone `UTC`, where the bug cannot occur.
2. **`isValidTimeZone` also rejects offsets by their resolved name.** This catches the U+2212 minus spelling (research item 3), which the input-prefix check alone misses.
3. **`startOfDayInstant` is the real first instant of the day.** §6.1 defined it as `zonedDateTimeToInstant(date, '00:00', tz)`. The two agree for every §13.1 row, including Santiago's midnight gap. They differ only when a gap **began before** midnight (Toronto and Nassau, 1919). There the day starts at the end of the gap (00:30 EDT = 04:30Z), not at 00:00 moved forward by the gap (01:00 = 05:00Z). The end of the gap is found by a binary search on whole seconds between `wall - after` and `wall - before`. `zonedDateTimeToInstant` keeps the plan's "compatible" rule, and a test pins the difference.
4. **`msUntilNextDayIn` uses the first start of tomorrow that is still ahead of `now`.** §6.1 gave `startOfDayInstant(addDays(todayIn(tz, now), 1), tz) - now`. Where midnight happens twice (69 transitions, research item 2), that formula returns a negative value between the two midnights. The result is now always > 0. A safety `RangeError` covers the theoretically impossible case with no start ahead.
5. **Two extra type exports, `WeekRange` and `ShiftedTime`,** name the return types that §6.1 writes inline. They are structurally identical, and the API test also pins the inline forms.
6. **Range rules beyond §6.1:**
   - `todayIn` throws a `RangeError` when the local date is outside 1900-01-01 to 2999-12-31.
   - The clock functions reject a `now` more than a day outside that range, and any non-`Date`.
   - `addDays` and `addMinutesToTime` require **safe** integers; `addMinutesToTime` stays exact up to `Number.MAX_SAFE_INTEGER`.
   - `startOfWeek` and `weekRange` throw when the week leaves the range (for example `weekRange('2999-12-31', 1)`).
   - `msUntilNextDayIn` throws on 2999-12-31, which has no next day.
7. **`formatDateLabel` passes `locale: enUS` explicitly** instead of relying on date-fns' default locale. `setDefaultOptions` anywhere in the app could otherwise change the output.
8. **Two small checks:** `formatTime` validates `format` at runtime (`'12h'` or `'24h'`), and `toMinutes('24:00')` without `endOfDay` gets its own message, which says that `{ endOfDay: true }` is needed.

### Notes for testers
- **Unreachable safety throw.** The only uncovered line is the `RangeError` in `msUntilNextDayIn` for "no local midnight ahead". It can only be reached if two transitions fall within 72 h, and research item 2 found none from 1900 to 2039. It is kept so that the function can never return 0 or a negative value. Coverage is still far above every threshold.
- **Canonical zone names.** Intl canonicalises names differently across runtimes: Node 26 reports `Asia/Calcutta` for `Asia/Kolkata`. Tests must never assert one exact canonical spelling (use `/^Asia\/(Kolkata|Calcutta)$/`).
- **Historical rows** (Dublin 1910, Toronto 1919, St_Johns 2010, Apia 2011) rely on long-stable tzdata, and they pass on Node 24.21.0 (CI) and 26.3.1 (local). If a future ICU update changes one of them, the row's description names the zone and the rule.
- **Wall-clock semantics** for Phase 1 callers:
  - `nowMinutesIn` jumps in a gap and repeats in a repeated hour.
  - A wall time inside a gap resolves forward.
  - An ambiguous wall time resolves to the **earlier** instant.
  - `startOfDayInstant` is the real start of the day.
  - Between two midnights of a repeated midnight, `todayIn` is the earlier date again, and `msUntilNextDayIn` points at the second midnight.
- **Vitest JSON reporter.** `npx vitest run --reporter=json` writes `.vitest/json/output.json` in the repo, and that folder is not in `.gitignore`. Delete it after use (done in this WP).
- **The ESLint clock rule also covers the tests** under `src/core/__tests__` (no `new Date()` without arguments and no `Date.now()`). Use `new Date('<ISO>')`, `vi.setSystemTime`, or `String.fromCharCode` for Unicode inputs, so that the sources stay ASCII.

---

## WP5: Supabase project, migration, types, env tooling and integration tests

**Date:** 2026-09-30 (UTC+9). **Branch:** `phase-0-foundation`. **Tracking issue:** #1. **PR:** #2 (draft).

### What was done
- **Supabase CLI and client** (commit `chore: add Supabase CLI configuration and scripts`):
  - `supabase` 2.118.0 (devDependency) and `@supabase/supabase-js` 2.117.2 (dependency). The lockfile has all eight `@supabase/cli-*` platform entries, so `check:hygiene` finds windows-x64, linux-x64 and darwin-arm64.
  - `npx supabase init` wrote `supabase/config.toml` (local `project_id = "structured"`, no project ref) and `supabase/.gitignore`.
  - `scripts/lib/supabase-cli.mjs` (new shared helper, deviation 1):
    - resolves the CLI's `bin` from the local package and spawns it with `process.execPath`, without a shell
    - adds `--agent no` to every call, ignores stdin (a prompt reads EOF) and sets `NO_COLOR=1`
    - `parseJsonOutput` and `rows()` normalise both JSON shapes (the bare array from `-o json`, the envelope from `--output-format json`); `singleObject()` does the same for a create response
    - `runReadOnlyJson` tries `-o json`, then `--output-format json` once; it is never used for `projects create`
    - `generatePassword()`: 32 characters, uniform over `[A-Za-z0-9]` with `crypto.randomInt`
    - `redact()` replaces the ref, the password, the keys, the host, connection strings and pooler hosts before any CLI output is printed
  - `scripts/setup-supabase.mjs` (`npm run db:setup`) follows §8.4:
    - preconditions: `projects list` works, and exactly one organization is named "Karthi labs" (case-insensitive)
    - resume from `SUPABASE_PROJECT_REF`, adopt an existing `structured` project (only with a saved password), or create one
    - free-limit blocker (2 active projects; paused ones are not counted)
    - the password is persisted **before** the create call
    - `projects create` runs **once**; any error, timeout or unparsable output is settled by listing the projects again
    - ref and URL are persisted immediately
    - the health poll every 10 s (10 min limit), then the API keys every 20 s (5 min limit): new-style publishable and secret keys only, and a current key is kept while it still exists
    - the summary prints `KEY: set` lines only
  - `scripts/supabase.mjs` (§8.3):
    - `link` (password from the child env, `--password=` fallback)
    - `push [--dry-run]` (retries only connection or tenant errors: 30, 60 and 90 s)
    - `migrations`, `types`, `ping` and `settings`
    - `push` and `migrations` first check that `supabase/.temp/project-ref` equals `SUPABASE_PROJECT_REF`
    - `types` writes UTF-8, LF and one trailing newline, and refuses output without `export type Database` or with a URL
  - npm scripts `db:setup`, `db:link`, `db:push`, `db:migrations`, `db:types` and `db:ping`.
  - Unit tests (run in CI, no network, fake CLI; key-shaped fixtures built at runtime):
    - `scripts/__tests__/setup-supabase.test.mjs` (20 tests): create once, password first, idempotent second run, re-list after a failed, unparsable or timed-out create, adopt, adopt without password, two projects, free limit, paused projects, unknown ref, organization match, JSON fallback, health timeout, key retry and legacy-only keys
    - `scripts/__tests__/supabase.test.mjs` (23): env checks, URL building, ping lines, network errors without the host, type normalisation, table count, push retry pattern, usage errors
    - `scripts/lib/__tests__/supabase-cli.test.mjs` (23): parsing, shapes, JSON fallback, password, redaction, output order, plus one real `supabase --version` run through the helper (proves bin resolution and `--agent no` on Linux in CI)
- **Migration** (commit `feat: add initial database schema migration`): `supabase/migrations/0001_init.sql` is exactly §7. `grep -c` gives 6 `create table`, 4 `create index`, 1 grant to `anon, authenticated, service_role`, 6 `enable row level security`, 6 `create policy "open_access"`, 4 `create trigger`, the publication line, `notify pgrst` and each D0-21 check.
- **Types** (commit `feat: add generated database types`): `src/data/database.types.ts`, 454 lines, `public.Tables` with the 6 tables, no URL and no ref.
- **Integration tests** (commit `test: add Supabase integration tests`):
  - `tsconfig.test.json` (§5.5), referenced from `tsconfig.json`, so `tsc -b` and type-aware ESLint cover `tests/`
  - `vitest.integration.config.ts` (§5.7) and the `test:integration` script
  - `tests/integration/supabase.test.ts` covers (a) to (g) of §13.2
- **Env template** (commit `docs: add environment variable template`): `.env.example` is exactly §5.10 (7 keys, no values).

### Cloud resources created (values only in `.env.local`)
- Supabase project `structured` in ap-south-1, in the organization "Karthi labs". It uses the last free slot: the organization now has 2 active projects.
- `.env.local` holds `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_DB_PASSWORD` (generated, 32 alphanumeric characters), `SUPABASE_PROJECT_REF` and `VERCEL_PROJECT_NAME`. `PROD_URL` follows in WP7.
- The Vercel project and its env vars are WP7. Until then, `.env.local` exists only on this machine (see HANDOFF).

### Commands run
```
gh api user --jq .login; git config user.email; git pull --ff-only; netstat -ano   # opening ritual
npm view supabase version; npm view @supabase/supabase-js version                 # 2.118.0 / 2.117.2
npm install -D supabase@^2.118.0; npm install @supabase/supabase-js@^2.117.2
npm run check:hygiene                                                               # @supabase/cli- natives ok
npx supabase <subcommand> --help --agent no       # projects create/api-keys/list, orgs list, link, db push, migration list, gen types, init
npx supabase projects list -o json --agent no > "$SCRATCH/p.json"                  # shapes and names only; file deleted
printf '%s' '<name from the task>' | node scripts/lib/env-file.mjs set VERCEL_PROJECT_NAME
npx supabase init --agent no < /dev/null
npm run db:setup                    # created the project; a second run reused everything and changed nothing
npm run db:link
node scripts/supabase.mjs push --dry-run    # "Would push these migrations: 0001_init.sql"
npm run db:push
npm run db:migrations               # 0001 | 0001
node scripts/supabase.mjs push --dry-run    # "Remote database is up to date."
npm run db:types && git diff --exit-code src/data/database.types.ts
npm run db:ping                     # db: ok (200)
npm run env:check -- --allow-missing PROD_URL
npm run test:integration
npm run format; npm run verify; npm run check:commits; npm run check:leaks
```

### Verification results
| Check | Result |
|---|---|
| `npm run db:migrations` | `0001` local and remote |
| `node scripts/supabase.mjs push --dry-run` | `Remote database is up to date.` |
| `npm run db:types && git diff --exit-code src/data/database.types.ts` | `types: unchanged …`, exit 0 (no drift) |
| `npm run test:integration` | 7 passed, 0 skipped, 0 failed (about 14 s). Verbose timings: (a) 2.7 s, (b) 1.1 s, (c) 1.5 s, (d) realtime 1.9 s, (e) 0.4 s, (f) 0.2 s, (g) 1.1 s |
| Integration env probe: `VITE_SUPABASE_URL=` plus a placeholder secret key | all 7 tests **fail** (not skip) with "VITE_SUPABASE_URL is missing; SUPABASE_SECRET_KEY is a Vercel Secret placeholder"; exit 1 |
| `npm run env:check -- --allow-missing PROD_URL` | 6 × `ok`, `PROD_URL: missing (allowed)` |
| `.env.local` BOM check (AC 18) | no BOM |
| `npm run db:ping` | `db: ok (200)` |
| `node scripts/supabase.mjs settings` | `settings row: missing`: nothing wrote `settings` (WP6 creates it from a real browser, D0-10) |
| `db:setup` second run | `reusing the project recorded in .env.local`, every key `set`, `.env.local` unchanged |
| `npm run check:leaks` with `.env.local` present | `leaks: ok (… 7 sensitive values from .env.local)` |
| `supabase/config.toml` and the types file | contain neither the ref nor a URL (`grep -c` = 0) |
| `git status --ignored --short` | `.env.local` and `supabase/.temp/` appear only as `!!` |
| AC 14 counts on `0001_init.sql` | as listed above |
| `npm run verify` | exit 0: 13 test files, 504 unit tests, `src/core` coverage unchanged (99.45 / 99.13 / 100 / 99.4) |
| `npm run check:commits` | ok |
| CI `ci-verify` for `187f8dd` | push run 36663377120 and PR run 36663380107 both `success`. The logs show `node: v24.21.0`, `npm ci` with the Linux Supabase CLI binary (556 packages), 13 test files passed including `supabase-cli.test.mjs` (the real `supabase --version` on Linux), and `hygiene`, `core` and `commits` ok |
| CI log leak scan (`gh run view <id> --log \| node scripts/checks/leaks.mjs --stdin`, with `.env.local` present) | `leaks: ok` for both runs |
| Tracking issue #1 | WP5 ticked (the body passed `check:commits --text-file` and `check:leaks --files` first) |

### Deviations
1. **New shared helper `scripts/lib/supabase-cli.mjs`.** §8.4 says the bootstrap "uses the same spawn helper as §8.3". The helper lives in its own module, so that `setup-supabase.mjs` and `supabase.mjs` share one code path and the pure parts can be unit-tested. It is not in the §4 file tree.
2. **`runReadOnlyJson` falls back on any failure, not only on unparsable stdout.** A non-zero exit with `-o json` also triggers one `--output-format json` attempt (for example if a future CLI rejects `-o json`). Only read-only calls use it; `projects create` never does.
3. **The free limit counts the active projects of every visible organization**, because the free-plan limit is per account. Paused, removed or failed projects are not counted.
4. **A recorded `SUPABASE_PROJECT_REF` must also belong to "Karthi labs"** (stricter than §8.4).
5. **API keys are idempotent:** a key already in `.env.local` is kept while it is still one of the project's keys of that type. Otherwise the first key of that type is taken. This covers key rotation in the dashboard.
6. **`push` and `migrations` refuse to run** unless `supabase/.temp/project-ref` equals `SUPABASE_PROJECT_REF`, so a stale link can never push to another project.
7. **CLI output order:** stderr (progress) is printed before stdout (result).
8. **Integration cleanup uses an escaped LIKE pattern and a JS prefix check.** In SQL `LIKE`, `_` matches any character, so `'__test__%'` would also match titles such as "Retest my code". The tests query `\_\_test\_\_%`, keep only rows whose title or name really starts with `__test__`, and delete by id. The final count check uses the same filter.
9. **Integration cleanup also removes stale `__test__` rows** left by an earlier failed run, not only this run's rows. The prefix is reserved for tests (CLAUDE.md), so this is safe, and the "none remain" assertion then holds after a crash.
10. **A missing integration env fails every test** (the env error is re-thrown inside each test) instead of failing `beforeAll`, which Vitest reports as "7 skipped".
11. **`@supabase/supabase-js` was installed in WP5** (the §11 WP5 step), so `package.json` has it one WP before `src/data/supabase.ts` (WP6) uses it.

### Notes for testers
- **Values.** `.env.local` exists only on this machine until WP7 stores the keys in Vercel. Never print it. Read single values with `node scripts/lib/env-file.mjs get .env.local <KEY>` into a shell variable only.
- **Settings row.** It is still missing on purpose. WP6's first real browser load creates it with the browser's zone (AC 19). Integration tests never write `settings`: the constraint probe (e) inserts `id = 2`, the database rejects it with `23514`, and the test then checks with the secret key that no row 2 exists.
- **Database port.** `db:link`, `db:push` and `db:migrations` need outbound TCP 5432 to the pooler. `db:types` uses the Management API, and `db:ping`/`settings` use HTTPS only.
- **Re-running `db:setup`** is safe and changes nothing when everything is in place. It never creates a second project, never regenerates the password, and never touches the other project in the organization.
- **Unit tests** under `scripts/` include one real `supabase --version` run (no network, under a second). In CI it proves that the Linux binary resolves.
- **Advisors (§13.4)** were not checked in the dashboard in this WP. The expected result is only "RLS policy always true" on the 6 tables.
- **`supabase/config.toml`** comes from `supabase init` unchanged. Only the CLI's local tooling reads it (the project is cloud-only; Docker is not used).

---

## WP6: Typed client, health check and the "DB connected" home page

**Date:** 2026-09-30 (UTC+9). **Branch:** `phase-0-foundation`. **Tracking issue:** #1. **PR:** #2 (draft).

### What was done
- **Data layer** (commit `feat: add typed Supabase client, settings repository and health check`):
  - `src/env.d.ts`: the three optional browser variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_BUILD_SHA`), with Vite's `strictImportMetaEnv` on, so reading an undeclared `import.meta.env` key is a type error.
  - `src/data/env.ts`: `readSupabaseEnv()` (§6.2). It has no imports, because `vite.config.ts` loads it in plain Node. It rejects:
    - missing or empty values
    - both Vercel placeholders
    - surrounding whitespace and control characters
    - URLs that do not parse, are not `https:` (`http:` only for `localhost`/`127.0.0.1`), carry credentials, a query or fragment, or have a path other than `/`
    - secret keys
    - with `requirePublishable`, anything that is not `sb_publishable_…`

    It reports at most one problem per variable, always starting with the variable's name, and never the value.
  - `src/data/errors.ts`: `toDbErrorCode()` (§6.4 mapping).
  - `src/data/supabase.ts`: `createDb()` (no session persisted, refreshed or read from the URL; optional custom `fetch`), `supabaseEnv`, and `supabase` (`null` when not configured).
  - `src/data/repo/settings.ts`: `createSettingsStore(db)`. `readSettingsId` is `select('id').eq('id', 1).abortSignal(s).retry(false).maybeSingle()`, and `insertDefaultSettings` is `insert({ id: 1, timezone }).abortSignal(s).retry(false)`, with `23505` mapped to `exists`. It never throws and returns codes only.
  - `src/data/health.ts`: `checkDatabase()` (§6.4 flow: not-configured, offline short-circuit, one shared `AbortController` with a 12 s deadline for read, insert and re-read, timer cleared in `finally`, `error/unexpected` on any throw) and `singleflight()`.
  - `src/data/dbCheck.ts`: `startDbCheck`, the singleflight bound to the real client. It is the only data module `App` uses.
  - `src/platform/timezone.ts` (`detectTimeZone()`: `normalizeTimeZone` of Intl's zone, `'UTC'` on any failure) and `src/platform/network.ts` (`isOnline()`).
- **UI** (commit `feat: show database connection status on home page`):
  - `src/components/DbStatusBadge.tsx`:
    - `data-testid="db-status"`, `data-state`, `role="status"`, `aria-live="polite"` and `aria-atomic="true"`
    - a title (`db-status-title`) and a detail (`db-status-detail`)
    - the error code in monospace (`db-status-code`, text `code: <code>`)
    - a lucide icon per state (spinner `motion-safe:animate-spin`, check, alert, triangle, wifi-off), so the state is never conveyed by colour alone
    - the fixed §6.6 copy for every state and code
  - `src/components/RootErrorBoundary.tsx`: a class boundary that shows "Something went wrong" and a `min-h-11` "Reload" button.
  - `src/App.tsx` (§6.6):
    - the status promise lives in `App` state, created by `useState(runDbCheck)`
    - `DbStatusView` calls `use(promise)` under `<Suspense>` with the checking badge as the fallback
    - "Check again" runs in `startTransition` and is `disabled` and `aria-busy` while pending, with a spinner icon
    - there is no `useEffect`
  - `src/main.tsx`: `<StrictMode><RootErrorBoundary><App /></RootErrorBoundary></StrictMode>`.
- **Build** (commit `feat: refuse production builds without valid Supabase env`): `vite.config.ts` is now exactly §5.6: the production guard (`REQUIRE_SUPABASE_ENV=1` or `VERCEL_ENV=production`, with `requirePublishable`) and the `buildShaMeta` plugin (7 to 40 lowercase hex characters, otherwise `dev`). `tsconfig.node.json` needed no change: `tsc -b` reported no TS6307.
- **Lint fix** (commit `fix: allow react-dom/server in the server import rule`): see deviation 7.
- **Tests** (commit `test: cover env parsing, error mapping and the health check`), all in the node environment with no network:
  - `src/data/__tests__/env.test.ts` (§13.1 rows plus a service_role JWT, credentials, other protocols and malformed JWTs; every rejection checks "one problem, naming the variable" and "the value is not echoed")
  - `src/data/__tests__/errors.test.ts` (every §6.4 row, unsafe codes ignored, non-string values, `NaN` status)
  - `src/data/__tests__/settings-store.test.ts`: a real `createDb(url, key, { fetch: stub })` for every §13.1 row, plus 503/520 (retryable statuses), two rows (`pg-PGRST116`), a check violation and a throwing client. Every failure asserts **one** fetch call. The success cases assert the request shape (`GET /rest/v1/settings?select=id&id=eq.1`, the `apikey` header, the caller's signal, and the `POST` body `{id: 1, timezone}`). A 500 with a URL in `message`, `details` and `hint` returns only `http-500`.
  - `src/data/__tests__/health.test.ts`: every §13.1 row. Also:
    - one shared signal across all three calls, and no timer left after success
    - timeout at exactly 12 000 ms (still pending at 11 999) with the signal aborted
    - a 5 s read plus a 5 s insert plus a hung re-read also time out at 12 s total
    - a custom `timeoutMs`
    - `singleflight`: sharing, a new call after resolve and after reject, and a synchronous throw
  - `src/data/__tests__/dbCheck.test.ts`: the unit-level half of M3. The real `startDbCheck` in the unconfigured unit environment has `supabase === null`, resolves `not-configured` with both names, and two calls share one promise.
  - `src/platform/__tests__/platform.test.ts`: the zone, canonical spelling, the `UTC` fallback for invalid, empty, offset and throwing cases, and `isOnline` for false, true, unknown and no `navigator`.
  - `src/components/__tests__/DbStatusBadge.test.tsx` (`renderToStaticMarkup`): for every state and every error code, the test ids, `role`, `aria-live`, a hidden icon, the exact copy, the monospace code, and no URL.
  - `src/components/__tests__/RootErrorBoundary.test.tsx` and `src/__tests__/App.test.tsx`: the first paint shows the name, the checking badge and an enabled `min-h-11` "Check again" button with `aria-busy="false"`.

### Commands run
```
gh api user --jq .login; git config user.email; git pull --ff-only; netstat -ano   # opening ritual
npm run db:ping                                   # db: ok (200)
node scripts/supabase.mjs settings                # settings row: missing (as WP5 left it)
npm run typecheck; npm run lint; npx vitest run src/data src/components src/platform src/__tests__
npm run format; npm run verify
# production guard and build SHA (SCRATCH = the session scratchpad)
REQUIRE_SUPABASE_ENV=1 VITE_SUPABASE_URL= npx vite build --outDir "$SCRATCH/x"
VERCEL_ENV=production VITE_SUPABASE_PUBLISHABLE_KEY='[SENSITIVE]' npx vite build --outDir "$SCRATCH/x2"
REQUIRE_SUPABASE_ENV=1 VITE_SUPABASE_PUBLISHABLE_KEY="<runtime-built secret-key string>" npx vite build --outDir "$SCRATCH/x3"
REQUIRE_SUPABASE_ENV=1 VITE_BUILD_SHA="$(git rev-parse HEAD)" npx vite build --outDir "$SCRATCH/x4"
VITE_BUILD_SHA=not-a-sha npx vite build --outDir "$SCRATCH/x5"
node scripts/checks/leaks.mjs --files "$SCRATCH"/guard*.log
# M1 / M2 (the owner's Chrome on this machine, through the Claude in Chrome extension)
npm run dev                                       # then http://localhost:5173/ in Chrome, reload, "Check again"
node scripts/supabase.mjs settings
taskkill /PID <pid> /T /F
# M3
VITE_SUPABASE_URL= VITE_SUPABASE_PUBLISHABLE_KEY= npx vite build --outDir "$SCRATCH/dist-unconf"
npx vite preview --outDir "$SCRATCH/dist-unconf" --strictPort   # then http://localhost:4173/ in Chrome
taskkill /PID <pid> /T /F
npm run check:commits; npm run check:leaks; git push origin phase-0-foundation
gh run view <id> --log | node scripts/checks/leaks.mjs --stdin
```

### Verification results
| Check | Result |
|---|---|
| `npm run verify` | exit 0: 22 test files, 705 unit tests (WP5: 13 and 504), `src/core` coverage unchanged (99.45 / 99.13 / 100 / 99.4), build ok, `check` ok |
| `npm run lint` | 0 problems (react-hooks included). `grep -rn useEffect src` finds nothing |
| Production guard (AC 21) | `REQUIRE_SUPABASE_ENV=1 VITE_SUPABASE_URL= npx vite build` exits **1** with `Production build refused; invalid Supabase env: VITE_SUPABASE_URL is missing` and writes no output folder. `VERCEL_ENV=production` with the `[SENSITIVE]` key and `REQUIRE_SUPABASE_ENV=1` with a secret key also exit 1, naming only `VITE_SUPABASE_PUBLISHABLE_KEY`. All five build logs pass `check:leaks --files` |
| Build SHA | a normal `npm run build` writes `<meta name="build-sha" content="dev" />` into `dist/index.html`. `VITE_BUILD_SHA=<HEAD>` stamps that SHA; `not-a-sha` falls back to `dev` |
| Configured production build (guard on, `.env.local`) | exit 0. The bundle contains the configured host and publishable key (1 file each; counts only) and **not** the secret key (0 files). `VITE_BUILD_SHA` is not in the JS |
| **M1** (dev server, Chrome) | the page shows "Structured", `[data-testid=db-status-title]` = `DB connected` with `data-state="connected"`, and "Check again". Clicking it set `disabled` and `aria-busy="true"` while pending, then false; a MutationObserver saw only `connected` during the re-check (no flash back to "checking"). No console warnings or errors (only Vite and React DevTools info lines) |
| **M2** (write proof) | the row was still missing (WP5 left it so on purpose), so step 1 (delete) was not needed. First Chrome load: `DB connected` / `Settings row created`. Reload: `Settings row found`. `node scripts/supabase.mjs settings`: `present, timezone=Asia/Tokyo`, which equals Chrome's `Intl.DateTimeFormat().resolvedOptions().timeZone` (`Asia/Tokyo`), not `UTC` (AC 19) |
| StrictMode singleflight | exactly **1** `/rest/v1/settings` request per dev page load (Performance resource entries, counted without URLs) |
| **M3** (unconfigured build) | in Git Bash, `VITE_…=` (empty) reaches Node as `""` (confirmed) and overrides `.env.local`: the bundle contains neither configured value. The preview shows `Database not configured`, `data-state="not-configured"`, detail `Missing or invalid: VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY`, no console messages at all, and no `/rest/v1` request. `.env.local` was never renamed |
| Ports after M1 to M3 | both servers stopped with `taskkill /T /F`; no listener on 5173 or 4173 |
| `npm run check:commits` / `check:leaks` | ok (39 commits in `origin/main..HEAD`) |
| CI `ci-verify` for `ba4fbcc` | push run 36664867646 and PR run 36664871018 both `success`. The logs show `node: v24.21.0`, `Test Files 22 passed`, `Tests 705 passed`, the build, and `hygiene`, `leaks`, `commits` and `core` ok. This is the unconfigured CI build, so the `not-configured` path compiles and the guard stays off |
| CI log leak scan (`gh run view <id> --log \| node scripts/checks/leaks.mjs --stdin`, with `.env.local` present) | `leaks: ok` for both runs |

### Deviations
1. **Stricter key rules than §6.2.** A legacy JWT whose `role` is `service_role` is rejected like `sb_secret_…` (it is a secret key too). Outside production builds, a key must be `sb_publishable_…` or a legacy JWT with a `role` claim; any other format is rejected ("neither a publishable key nor a legacy anon key"). A publishable key needs characters after the prefix, from `[A-Za-z0-9_.-]` only. `atob` (global in browsers and Node) decodes the JWT payload, so `env.ts` stays dependency-free.
2. **`toDbErrorCode` input is typed loosely** (`error` may be `null`; `message` and `code` are `unknown`). PostgREST returns `{ message: <raw body> }` without a code for non-JSON bodies (such as a 540 page), and any JSON value as `error`. A code is shown only if it matches `^[A-Z0-9]{1,12}$` (case-insensitive); otherwise it is ignored (`http-<status>` or `invalid-key`). A non-integer status gives `unexpected`.
3. **The deadline also bounds a store that ignores its signal.** Each store call is raced against a promise that settles when the controller aborts, so the check always ends at 12 s. With the real client the abort also cancels the request (`AbortError`, which maps to `timeout`).
4. **`singleflight` forwards arguments.** Its signature is `(start: (...args: A) => Promise<T>) => (...args: A) => Promise<T>`, a superset of §6.4 (`A = []`); callers that join a pending call have their arguments ignored. `startDbCheck` is this singleflight around an **async** starter (try/catch inside), rather than an `async` function itself: an `async` wrapper would return a new promise object on every call, so the two StrictMode initializer calls would no longer share one promise. The F11 intent (a synchronous throw becomes an error state) still holds.
5. **`createDb()` is exported** from `src/data/supabase.ts`, so the settings-store tests build the client with exactly the app's options plus a stubbed `fetch`. `supabaseEnv` reads the two variables by full name instead of passing all of `import.meta.env`, so Vite inlines exactly those two values.
6. **`not-configured` with a null store but a valid env** (not reachable in the app) returns `problems: []`. The badge then names both variables.
7. **ESLint `noServer` fix (WP2 config).** Its `'server'` pattern matches any path segment named `server`, so it also blocked React's own `react-dom/server`, which the badge and boundary tests need. The group now ends with `'!react-dom/server'`. Re-verified: WP2 probe 4 (`src/lib/tmp.ts` importing `../../server/x`) still fails with the configured message, a bare `server/x` import still fails, and `react-dom/server` passes. The temporary files are deleted.
8. **No URL in the badge markup.** lucide renders `xmlns="http://www.w3.org/2000/svg"` by default; the badge passes `xmlns={undefined}` (inline SVG in HTML needs no namespace). The "never renders http" test (AC 21) permits exactly one `http`: the `http-<status>` error code itself (its format comes from §6.4, and every error state shows its code). The markup never contains `://`.
9. **Small UI additions:** `aria-atomic="true"` on the status region, a spinner icon inside "Check again" while pending, the code rendered as `code: <code>`, and the not-configured variable names derived from the problems (each problem starts with its variable's name).
10. **Four extra test files beyond the §4 tree:** `dbCheck.test.ts`, `platform.test.ts`, `RootErrorBoundary.test.tsx` and `App.test.tsx`.
11. **`RootErrorBoundary` has no `componentDidCatch`.** React 19 already reports caught errors to the console (`onCaughtError`), and the boundary renders nothing about the error.

### Notes for testers
- **The settings row now exists**: `timezone=Asia/Tokyo`, created by the owner's Chrome on this machine during M2 (about 12:29 UTC+9). If you repeat M2, delete it with a one-off secret-key Node command, and let a **real browser** on the owner's machine recreate it. Never let a headless browser (or one with another `timezoneId`) make the first load after a delete (F7).
- **A local `npm run build` with `.env.local` present** bundles the real publishable key and host into `dist/` (Vite loads `.env.local` in production mode). `dist/` is gitignored; never commit, upload or paste it. CI builds are unconfigured.
- **Offline** is detected only from `navigator.onLine === false` at the moment of the check. Automatic re-checks on `online`/focus are Phase 1 (F10).
- **"Check again" is fast** against a healthy database, so the pending state is brief. Observe it with a MutationObserver, or with network throttling in DevTools.
- **The StrictMode request count** (1 per dev load) is a quick way to catch a singleflight regression: 2 requests, or `created` followed by `found` on the first load, means the two initializer calls did not share one promise.
- **The production guard runs only** with `REQUIRE_SUPABASE_ENV=1` or `VERCEL_ENV=production`. Plain `npm run build` (CI's verify build) stays unconfigured by design.

---

## WP7: Vercel project, env vars, vercel.json, deploy script and workflow, first production deploy

**Date:** 2026-09-30 (UTC+9). **Branch:** `phase-0-foundation`. **Tracking issue:** #1. **PR:** #2 (draft).

### What was done
- **Vercel configuration** (commit `feat: add Vercel configuration with SPA rewrite, privacy headers and region`): `vercel.json` and `.vercelignore` exactly as §5.9 (Prettier left both unchanged). The built `.vercel/output/config.json` has the three privacy headers on `/(.*)`, the immutable cache header on `/assets/(.*)`, then `handle: filesystem`, then the rewrite `^(?:/((?!api(?:/|$)|assets/).*))$` → `/index.html`. `vercel build` accepted `regions: ["bom1"]` on Hobby.
- **Deploy path** (commit `ci: add production deploy script, smoke check and deploy workflow`):
  - `scripts/ci/deploy-prod.sh` and `scripts/ci/redact-log.sh` exactly as §8.10 and §8.12 (both committed as mode 100755).
  - `scripts/ci/smoke.mjs` (§8.11): the 8 checks, `ok|FAIL <METHOD> <path> (<status>[, detail])` lines only, `::add-mask::` for the production host, its first label, the Supabase host and the key when `GITHUB_ACTIONS=true`, `redirect: 'manual'` and a 20 s timeout per request, and fetch errors reduced to `network error (<code>)`.
  - `scripts/lib/vercel.mjs` (§8.2): `VERCEL_CLI = 'vercel@61.1.0'`, `runVercel` (a shell command built from validated arguments; values on stdin only), `redact`, `parseJson`, `describeFailure`.
  - `.github/workflows/deploy.yml` exactly as §10.2 (actionlint 1.7.12: no findings; `check-jsonschema` `vendor.github-workflows`: ok for both workflows).
- **Env sync** (commit `chore: add Vercel env sync script`): `scripts/sync-vercel-env.mjs` (§8.5) and the npm script `env:sync-vercel`.
- **Tests** (commit `test: cover the Vercel CLI helper, env sync and smoke check`), with no network and no CLI, and fixtures built at runtime:
  - `scripts/lib/__tests__/vercel.test.mjs`: the pin shape, safe and unsafe arguments (never echoed), JSON parsing, redaction of URLs, hosts, IDs, keys and the project-name shape, failure tails
  - `scripts/__tests__/sync-vercel-env.test.mjs`: the exact §5.11 matrix, local value checks, `env ls` parsing that drops values, row classification, type problems, `--apply` (values on stdin only, planned type flags), `--apply` never overwriting, `--force`, the preview API fallback, redacted CLI failures, the temp-folder fallback and the unlinked refusal
  - `scripts/ci/__tests__/smoke.test.mjs`: every check passing and failing, the SHA retry loop, the 540 and 401 copy, the protection probe, CI masks, input validation, and no URL, host or key in any printed line
- **Cloud work (§9.3):**
  1. `project inspect` reported `project_not_found` and the team had 0 projects, so the project was created once with `project add` in the "Karthi Labs" team, then linked with `link --yes --project <name> --team <team>`. `.vercel/project.json` has `projectId`, `orgId` and `projectName`. Count: `named VERCEL_PROJECT_NAME: 1, starting with structured-: 1`.
  2. `git disconnect --yes` answered "No Git repository connected" (expected). `project update --framework vite --node-version 24.x --yes` succeeded. `project protection enable <name> --sso` set Standard Protection (see deviation 5).
  3. `npm run env:sync-vercel -- --apply` added the 11 rows that exist locally. The verify pass showed every row `same`, the production secret key `unknown (Secret)`, and the types ok.
  4. First production deploy through `bash scripts/ci/deploy-prod.sh` (no `PROD_URL` yet, so the smoke check was skipped): bundle check passed, deploy ok, `package-lock.json` unchanged.
  5. `PROD_URL`: the team-scoped `vercel api /v9/projects/<id>/domains --scope <orgId>` returned exactly one domain: verified, no redirect, no Git branch, `*.vercel.app`. It was piped into `env-file.mjs set` (never printed), and `--apply` added it to the development env.
  6. Full deploy with the smoke check, then `smoke.mjs --expect-protected` (results below).
  7. `gh secret set` for `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` and `PROD_URL`, values from stdin (never echoed).
- **Env-var link rehearsal (§9.4):**
  - a fresh clone of `phase-0-foundation` at `9c23319` (no `.vercel/`), then `npm ci`
  - `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` exported from the real checkout
  - `deploy-prod.sh` with `VERCEL_BUILD_BIN="npx --yes vercel@61.1.0 -Q <empty folder>"`. `whoami`, `pull` and `deploy` used the logged-in CLI, while `vercel build` ran with an **empty global config** (no `auth.json`). So the CI build step needs no token.
  - The run redeployed the same commit, and the smoke check passed.
  - Cleanup: the clone's `.env*` and `.vercel` first, then the clone, the empty config folder and the logs. `test ! -e` confirmed all three are gone.

### Commands run
```
gh api user --jq .login; git config user.email; git pull --ff-only; netstat -ano; npm run db:ping   # opening ritual
npx --yes vercel@61.1.0 whoami; npx --yes vercel@61.1.0 teams ls           # logged in; team "Karthi Labs"
npx --yes vercel@61.1.0 <project|link|env|api|pull|build|deploy|git> --help
# read the shipped 61.1.0 source: env add (preview without a branch), env ls JSON, protection enable
# §9.3 steps 1 to 7 as listed above (V="npx --yes vercel@61.1.0"; every output into scratch files)
npm run env:sync-vercel; npm run env:sync-vercel -- --apply     # twice: before and after PROD_URL
export DEPLOY_LOG_DIR="$SCRATCH/deploy-logs"; bash scripts/ci/deploy-prod.sh
PROD_URL="$(envget PROD_URL)" bash scripts/ci/deploy-prod.sh
PROD_URL=<from .env.local> EXPECTED_SHA=<HEAD> SUPABASE_ENV_FILE=.vercel/.env.production.local \
  node scripts/ci/smoke.mjs --expect-protected "$DEPLOY_LOG_DIR/vercel-deploy.out"
<node reads .vercel/project.json> | gh secret set VERCEL_ORG_ID      # and VERCEL_PROJECT_ID
envget PROD_URL | gh secret set PROD_URL
# §9.4 rehearsal in "$SCRATCH/ci-rehearsal" (see above), then cleanup and test ! -e
npm run format; "$SCRATCH/al/actionlint.exe" .github/workflows/*.yml
uvx check-jsonschema --builtin-schema vendor.github-workflows .github/workflows/deploy.yml .github/workflows/ci.yml
npm run check:hygiene; grep -c 'vercel@61.1.0' .github/workflows/deploy.yml scripts/ci/deploy-prod.sh scripts/lib/vercel.mjs
npm run verify; npm run check:commits; npm run check:leaks
node scripts/checks/leaks.mjs --files <each scratch log, before it was deleted>
gh run view <id> --log | node scripts/checks/leaks.mjs --stdin
```
Every scratch file that held a URL, an ID or a value (`v-*.json`, the deploy logs, the `.env.local` backup, the sync logs) was deleted at the end.

### Verification results
| Check | Result |
|---|---|
| `deploy-prod.sh` end-to-end with the smoke check (**mandatory**) | exit 0. It printed `Bundle check passed.` and `Deployed to production (URL intentionally not printed).`, then `ok GET / (200, build-sha 9c23319)`, `ok HEADER / x-robots-tag (noindex)`, `ok HEADER / referrer-policy (no-referrer)`, `ok GET /day/2026-01-01 (200)`, `ok GET /assets/does-not-exist.js (404)`, `ok GET /api (404)`, `ok GET /api/not-a-function (404)`, `ok GET /robots.txt (200)`, `ok GET db /rest/v1/settings (200)` and `smoke: ok`. The SHA was HEAD (`9c23319`) at the time of the deploy |
| `--expect-protected` (best effort, §0.1) | **passed**: `ok GET <deployment>/ (302, protected)` (a redirect to the Vercel login). The production domain answered 200 without authentication (AC 26 bullet 2) |
| Rehearsal (§9.4) | passed with a tokenless build; the clone, the empty config folder and the logs are gone (`test ! -e`) |
| Project count (§9.3 step 1) | `named VERCEL_PROJECT_NAME: 1, starting with structured-: 1` |
| Git link | `project inspect --format json` has no `link` or `git` field, and `GET /v9/projects/<id>` has `link: null` |
| Project settings (AC 28) | framework `vite`, Node.js `24.x` |
| Protection JSON (AC 26) | `ssoProtection.deploymentType = prod_deployment_urls_and_all_previews` |
| Env sync report (AC 27) | 11 rows `same`, `SUPABASE_SECRET_KEY production: unknown (Secret)`, `types: ok` (from `env ls --format json`: `VITE_*` are Config in production and preview, and the secret key is Secret in production), `env sync: in sync`, exit 0 |
| `env pull` of a Secret | writes the placeholder `[SENSITIVE]` (checked by type only, never printed) |
| `gh secret list` | `PROD_URL`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `VERCEL_TOKEN` |
| Vercel bot comments on PR #2 | none (`gh pr view 2 --json comments`: 0 comments) |
| E5 (production in the owner's Chrome) | `[data-testid=db-status-title]` = `DB connected`, `data-state="connected"`, detail `Settings row found`, heading "Structured", a 40-character `build-sha` starting with `9c23319`, exactly 1 `/rest/v1/settings` request, no console errors. `/day/2026-01-01` also renders the app, and "Check again" re-ran the check and stayed `DB connected` |
| Vercel CLI pin | `npm run check:hygiene` prints `vercel pin: 61.1.0 in 3 files` and passes (the pin check is implemented, not deferred). The §0.1 grep gives 1 / 1 / 1 |
| AC 29 echo grep | prints nothing |
| `git diff --exit-code package-lock.json` | clean after both local builds and in the rehearsal clone |
| `npm run verify` | exit 0: 25 test files, 796 unit tests (WP6: 22 and 705), `src/core` coverage unchanged (99.45 / 99.13 / 100 / 99.4), build ok, `check` ok |
| `npm run check:leaks` with `.env.local` and `.vercel/project.json` present | `leaks: ok (… 11 sensitive values from .env.local and .vercel/project.json)` |
| CI `ci-verify` for `9c23319` | push run 36666577026 and PR run 36666579960 both `success` (`node: v24.21.0`, 25 test files passed, `vercel pin: 61.1.0 in 3 files`, hygiene ok). Both logs pass `check:leaks --stdin` with `.env.local` present |

### Deviations
1. **`runVercel` adds `--non-interactive` to every call.** Agent detection makes the CLI non-interactive in this session, but not in a person's terminal. The flag makes both behave the same, and a missing input fails instead of waiting for a prompt. `runVercel` also sets `NO_COLOR=1`, has a 5-minute timeout and accepts `cwd` and `env`. The argument check (`SAFE_ARG_RE`) is the §8.2 regex.
2. **`sync-vercel-env.mjs` reads existence and type from `vercel env ls --format json`**, and values from `vercel env pull`. Only names, targets and type labels are kept from `env ls`; its values are dropped at parse time. So a Secret row is `unknown (Secret)` because of its type, not because of the placeholder text. Additions:
   - the status `unknown (not in the pulled file)` for a Config record that `env pull` did not return
   - the type check covers every matrix row (not only `VITE_*` and the secret key), and it flags an app key stored in a target outside the matrix (for example the DB password in production)
   - exit code 1 whenever a row is not in sync or a type is wrong, in report mode too
   - `--force` requires `--apply`
   - if the OS temp path is not a safe CLI argument (for example a user name with a space), the pull folder moves into the gitignored `.vercel/`
3. **Preview env vars needed no fallback.** CLI 61.1.0 adds a preview variable for all branches when it runs non-interactively with exactly two positional arguments, or with `--yes` (read in the shipped source, confirmed live). The API fallback (§8.5 item 5) is implemented and unit-tested, but was not used. If it is ever used, its type `encrypted` shows as Config under the same label rule the CLI uses (review r2, N4).
4. **`vercel link` changes local files.** It pulled the development env into `.env.local` (adding `VERCEL_OIDC_TOKEN`), and it appended `.vercel` and `.env*` to `.gitignore` with CRLF line endings. The §9.3 backup and `cmp` restored `.env.local`, and `git checkout -- .gitignore` reverted `.gitignore` (the existing rules already cover both). WP9 must add the `.gitignore` revert to the HANDOFF link steps.
5. **New projects start with `ssoProtection.deploymentType = all_except_custom_domains`.** Without a custom domain, that also protects the production `*.vercel.app` domain. `protection enable --sso` changed it to `prod_deployment_urls_and_all_previews` (Standard Protection), as planned.
6. **`smoke.mjs` output details:**
   - the header checks print as `HEADER / x-robots-tag` and `HEADER / referrer-policy`
   - the DB probe prints as `GET db /rest/v1/settings`
   - the protection probe prints as `GET <deployment>/`
   - while the SHA does not match yet, it prints `wait GET / (...; retry n/6 ...)`

   The probe's deployment URL is the first `*.vercel.app` URL in the deploy output. In the CLI's JSON output that is `deployment.url`, which comes before the production URL.
7. **M2 against production (AC 24 bullet 2) was not repeated.** This session's permission guard refused the one-off secret-key deletion of the `settings` row, so the row was not touched (`settings row: present, timezone=Asia/Tokyo`, unchanged since WP6). The production read is proven (E5), and production uses the same database and the same code that created the row in WP6 M2. **Open for QA or the owner:**
   1. Delete the row with a one-off secret-key command.
   2. Load production in the owner's Chrome: the first load must show `Settings row created`, and a reload `Settings row found`.
   3. `node scripts/supabase.mjs settings` must show Chrome's zone.
8. **`--apply --force` was not run against the live project.** This session's permission guard refused an overwrite run. It is implemented and unit-tested: it overwrites `differs` and `unknown` rows with `env add --force`. The §0.1 substitute still works: `vercel env rm <NAME> <target> --yes`, then `--apply`.
9. **`vercel.json` was not validated with `check-jsonschema`.** Fetching the remote schema hung, and the run was stopped. `vercel build` accepted the file, and the generated routes were inspected (see above).
10. **Local builds run on Windows** (`vercel build` under Git Bash), so the §9.3 remote-build fallback was not needed.
11. **Two Windows adjustments.** `gh secret set` got `-R karthi-ai-engineer/Structured` explicitly. The rehearsal passed the empty config folder to `-Q` as a Windows path (`cygpath -m`), because the CLI is a native Windows program.
12. **Three test files beyond the §4 tree:** `scripts/lib/__tests__/vercel.test.mjs`, `scripts/__tests__/sync-vercel-env.test.mjs` and `scripts/ci/__tests__/smoke.test.mjs`.

### Notes for testers
- **Production serves commit `9c2331913bf037b2a6391823835c6c0bdfb25e2f`**, the WP7 code. Later commits on the branch are docs only.
  - To rerun the smoke check without deploying, pass that SHA: `PROD_URL="$(node scripts/lib/env-file.mjs get .env.local PROD_URL)" EXPECTED_SHA=9c2331913bf037b2a6391823835c6c0bdfb25e2f SUPABASE_ENV_FILE=.vercel/.env.production.local node scripts/ci/smoke.mjs`.
  - A new deploy (`PROD_URL="$(…)" bash scripts/ci/deploy-prod.sh`) stamps and checks HEAD instead.
- **`.vercel/` now holds three things.** All of it is gitignored; never commit, upload or paste it.
  - `project.json`: the IDs and the project name
  - `.env.production.local`: the production env, with the secret key as `[SENSITIVE]`
  - `output/`: a production bundle with the real publishable key and host
- **Never run `vercel link` without the backup step.** It rewrites `.env.local` and `.gitignore` (deviation 4).
- **`npm run env:sync-vercel`** is read-only and prints names only. It needs the link (`.vercel/project.json`) and refuses to run without it.
- **`deploy.yml` runs first in the Ship stage**, because it has to be on `main`. Its script path was run twice locally, and once on a clean clone with a tokenless build.
- **Open item:** M2 against production (deviation 7).

## WP8: GitHub repo settings: ruleset, CodeQL default setup, description and topics

**Date:** 2026-09-30 (UTC+9). **Branch:** `phase-0-foundation`. **Tracking issue:** #1. **PR:** #2 (draft).

### What was done
1. **Ruleset definition** (commit `34730a7`, `ci: add main branch ruleset definition`): `.github/rulesets/main.json`, exactly as §10.5. `npm run format` left it unchanged. `check:hygiene` and `check:leaks` pass with it.
2. **Required check confirmed before applying.** After the push, the push run 36668022072 and the PR run 36668025049 both passed, and `gh pr checks 2` listed `ci-verify` twice. The check runs of HEAD report `app.id = 15368` (`github-actions`), which matches the ruleset's `integration_id`.
3. **Ruleset applied idempotently** (§9.5, P37):
   - The GET by name found nothing, so the script used POST. That created ruleset **24225914** ("main protection", `enforcement: active`, target `branch`, include `~DEFAULT_BRANCH`, no bypass actors, `current_user_can_bypass: never`).
   - The same script was run a second time. It found ID 24225914 and used PUT. The ruleset kept the same ID and `updated_at`, and there is still exactly one "main protection" ruleset. So re-running WP8 on another machine is safe.
   - The API accepted `allowed_merge_methods: ["merge"]` (no 422), so the plan's fallback (dropping the key) was not needed.
4. **CodeQL default setup** (§9.5, review r2 N3): enabled with language auto-detection. The state is `configured`, but it has no languages yet, because `main` holds only Markdown. See deviation 2.
5. **Description and topics** (§9.5): set with `gh repo edit`. `gh repo view --json description,repositoryTopics` shows the planned description and all 12 topics.
6. **PR #2 body**: added a "Post-merge follow-ups" section for CodeQL. Before `gh pr edit`, the body passed `check:commits --text-file`, the §10.4 PR-text word check (no output) and `check:leaks --stdin`.

### Commands run
```
gh api user --jq .login; git config user.email; git pull --ff-only; netstat -ano; npm run db:ping   # opening ritual
gh api repos/$R/rulesets; gh api repos/$R/code-scanning/default-setup; gh repo view $R --json description,repositoryTopics
gh api repos/$R/commits/<HEAD>/check-runs --jq '.check_runs[] | {name, app_id: .app.id}'   # 15368
# docs.github.com: rulesets REST (pull_request and required_status_checks parameters), code-scanning default-setup PATCH,
# "Available rules for rulesets", "Configuring default setup", changelog "default setup automatically updates when the languages change"
npx prettier --write .github/rulesets/main.json; npm run format; npm run check:hygiene; npm run check:leaks
git commit -m "ci: add main branch ruleset definition"; npm run check:commits; git push origin phase-0-foundation
gh run watch <push run> --exit-status; gh run watch <PR run> --exit-status; gh pr checks 2
ID="$(gh api repos/$R/rulesets --jq '.[] | select(.name=="main protection") | .id')"   # then PUT or POST (§9.5), run twice
gh api repos/$R/rules/branches/main; gh api repos/$R/rules/branches/phase-0-foundation
printf '{"state":"configured","query_suite":"default","languages":["javascript-typescript","actions"]}' | gh api -X PATCH repos/$R/code-scanning/default-setup --input -
printf '{"state":"configured","query_suite":"default"}' | gh api -X PATCH repos/$R/code-scanning/default-setup --input -
gh repo edit $R --description "<§9.5 text>" --add-topic planner,time-blocking,<…>,model-context-protocol
gh pr view 2 --json isDraft,mergeStateStatus,mergeable; gh api graphql (pullRequest mergeStateStatus)
node scripts/checks/commits.mjs --text-file <PR body>; <§10.4 PR-text word check>; gh pr edit 2 --body-file <PR body>
npm run verify; npm run check:commits; npm run check:leaks
gh run view <id> --log | node scripts/checks/leaks.mjs --stdin   # every CI run of this WP
```
`R` is `karthi-ai-engineer/Structured`. The scratch output files held no secrets and were deleted at the end.

### Verification results
| Check | Result |
|---|---|
| Rulesets (AC 31) | `gh api repos/$R/rulesets` lists exactly one ruleset: `{"id":24225914,"name":"main protection","enforcement":"active","target":"branch","source_type":"Repository"}` |
| Effective rules on `main` (AC 31) | `gh api repos/$R/rules/branches/main` has 4 rules, all from ruleset 24225914: `deletion`; `non_fast_forward`; `pull_request` (`required_approving_review_count: 0`, `allowed_merge_methods: ["merge"]`, `dismiss_stale_reviews_on_push`, `require_code_owner_review`, `require_last_push_approval` and `required_review_thread_resolution` all `false`, `required_reviewers: []`); `required_status_checks` (`[{"context":"ci-verify","integration_id":15368}]`, `strict_required_status_checks_policy: false`, `do_not_enforce_on_create: false`) |
| Phase branch unaffected | `gh api repos/$R/rules/branches/phase-0-foundation` is `[]` |
| Idempotency (P37) | The second run took the PUT path: same ID, one ruleset |
| Code scanning (AC 32) | `state: configured`, `languages: []`, `query_suite: default` (deviation 2; the follow-up is recorded in HANDOFF and in the PR body) |
| Presentation (AC 34, first bullet) | The description is the §9.5 text, and there are 12 topics: capacitor, mcp, model-context-protocol, planner, productivity, react, supabase, tailwindcss, time-blocking, todo, typescript, vite |
| PR mergeability | `gh pr view 2`: `isDraft: true`, `mergeStateStatus: CLEAN`, `mergeable: MERGEABLE`. Not `BLOCKED` |
| `ci-verify` for `34730a7` | push run 36668022072 and PR run 36668025049 both `success` |
| `npm run verify` | exit 0: 25 test files, 796 tests, `src/core` coverage 99.45 / 99.13 / 100 / 99.4, build ok, `check` ok |

### Deviations
1. **The server adds a pull-request parameter the plan did not know about:** `require_extra_approval_for_unattributed_changes: true`. It is GitHub's default, and the committed JSON does not set it. The docs ("Available rules for rulesets") call it "Require an additional approval for unattributed Copilot pull requests". It applies only when Copilot opens a PR under its own app identity, and it "has no effect if the ruleset requires zero approvals". So it cannot block the Ship merge. `main.json` stays exactly as §10.5, and a re-apply keeps the default.
2. **CodeQL: configured with auto-detection, and the language check moves to Ship.**
   - The §9.5 PATCH with `languages: ["javascript-typescript","actions"]` was refused with **HTTP 422: "One or more languages you selected are not present in the repository."** `main` holds only `.md` files and `.gitignore` (`git ls-tree -r origin/main`).
   - Following review r2 N3, it was retried once without `languages`. That was accepted (`{"run_id":0,"run_url":""}`, no analysis run), and the state is now `configured` with `languages: []`.
   - GitHub's changelog ("Code scanning default setup automatically updates when the languages in the repository change", and "…automatically includes all CodeQL supported languages") says the configuration picks up new languages by itself. So the first push of code to `main` (the Ship merge) should start JavaScript/TypeScript and Actions analysis.
   - **Follow-up at Ship (§17.1 step 8):** confirm that `gh api repos/$R/code-scanning/default-setup --jq '.state, .languages'` shows `configured` with `javascript-typescript` and `actions`. If a language is missing, run the §9.5 PATCH with explicit languages again; it will then find them. The follow-up is recorded in HANDOFF "Next" and in the PR body under "Post-merge follow-ups".
   - `codeql.yml` was **not** added. The feature is available; only the languages are missing from `main`.
   - Review r2 N3 also suggested a §1.1 deviation row for deliverable 11c. No WP has edited the approved `docs/phases/phase-0/PLAN.md`, so this entry, HANDOFF and the PR body record it instead. AC 32 accepts these as the record.
3. **`gh api repos/$R/code-scanning/analyses` answers 404 "no analysis found".** This is expected until the first analysis, which runs after Ship. gh also printed an unrelated `admin:repo_hook` scope hint on that call. No scope change was needed or made.

### Notes for testers
- **Ruleset ID 24225914.** To re-apply it, run the §9.5 GET-then-PUT/POST snippet from the repo root. It is idempotent (proven above). Never create a second "main protection" ruleset. Phase 1's team workflow adds `gate/final-verification` to this same ruleset by name.
- **The ruleset protects only the default branch (`~DEFAULT_BRANCH`).** Pushes to `phase-0-foundation` are unaffected. Merging into `main` now needs:
  - a PR
  - a green `ci-verify` from GitHub Actions (integration 15368)
  - a merge commit (`gh pr merge --merge`)

  Squash and rebase are refused for `main`, even though the repo settings still allow them (D0-20). Nobody can bypass the ruleset, the owner included (`current_user_can_bypass: never`).
- **Do not test the protection by pushing to `main`.** The API evidence above is the check.
- **CodeQL has no analysis yet.** No CodeQL check appears on PR #2 until `main` has code; this is expected (deviation 2).
- **The required check is only `ci-verify`.** CodeQL results are not a merge gate.
