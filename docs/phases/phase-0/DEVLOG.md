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
