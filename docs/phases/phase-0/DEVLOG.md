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
