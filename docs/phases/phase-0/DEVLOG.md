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
