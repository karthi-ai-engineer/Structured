# Phase 0: Foundation, implementation plan (v1)

| | |
|---|---|
| Phase | 0 (Foundation), size S |
| Branch | `phase-0-foundation` (tracks `origin`); `main` changes only in the Ship stage |
| Master plan | `PLAN.md` §5 (stack), §6 (repo structure), §7 (data model), §8 (`dates.ts`), §10.3 (conventions), §13 (setup), §14 Phase 0 |
| Rules | `CLAUDE.md`: no AI attribution anywhere, public-repo hygiene, `HANDOFF.md` updated after every work package (WP) |
| Written | 2026-09-29 |
| Status | v1, input for edge-case research, replan and design review |

> **Public repo.** This file is committed. It never contains secret values, the Vercel project name, app URLs or the Supabase project ref/URL.
> Wherever one of them is needed, the plan writes `$VERCEL_PROJECT_NAME`, `$PROD_URL`, `$SUPABASE_PROJECT_REF` and so on. The real values live only in `.env.local`. The Vercel project name comes from the phase task instructions, and it is stored in `.env.local` as `VERCEL_PROJECT_NAME`.

---

## 1. Goal

When Phase 0 is done, there is a clean, strictly typed Vite + React 19 + Tailwind v4 + shadcn/ui app that:

- deploys to Vercel production through GitHub Actions only (Vercel's Git integration is off, so no bot comments and no URLs appear in the repo)
- reads and writes a real Supabase Postgres database whose full schema (`0001_init.sql`) is applied from the CLI
- shows "Structured" and a **"DB connected"** status that comes from reading, or creating if it is missing, the single `settings` row

It also ships these foundations:

- the tested timezone core (`src/core/dates.ts`)
- the folder skeleton, with architecture rules that ESLint enforces
- CI/CD (CI with a required check, deploy, CodeQL, Dependabot, templates, a ruleset on `main`)
- a polished README
- a `HANDOFF.md` whose resume steps actually work on a fresh machine

**Done when** (from the task):
- typecheck, lint, test and build pass locally and in GitHub Actions CI on the PR
- production shows "DB connected", with Supabase read and write both verified
- no secrets, app URLs or Vercel project name appear in the repo or in public CI logs
- `HANDOFF.md` is accurate

Out of scope: calendar sync, in-app AI, widgets, login/SSO/auth screens, feature UI (timeline, inbox, and so on), a CI migration workflow, Capacitor.

---

## 2. Research findings (verified 2026-09-29)

These were checked against `npm view`, CLI `--help` output, official docs, and a **trial scaffold in the session scratchpad**. The trial ran create-vite, then Tailwind, then `shadcn init`, then tsc, ESLint, `vite build` and Vitest, and all of them passed.

### 2.1 Versions

| Package / tool | Version to use | Notes |
|---|---|---|
| create-vite | 9.2.1 | The `react-ts` template now defaults to **Oxlint**. Pass `--eslint` to get the ESLint flat config. Non-interactive flags: `--no-interactive --no-immediate`. |
| vite | ^8.3 | Rolldown-based. The Linux bindings (`@rolldown/binding-linux-x64-gnu`) do end up in a lockfile generated on Windows (checked). |
| @vitejs/plugin-react | ^6.1 | Uses oxc (no Babel) and needs `vite ^8`. |
| react / react-dom | ^19.2 (19.3.0 is latest) | |
| typescript | **~6.0.3** (not 7.x) | TS 7.0.2 (the Go port) is `latest`, but `typescript-eslint@8.71` peers on `typescript >=4.8.4 <6.1.0`. The create-vite template itself pins `~6.0.2`. |
| typescript-eslint | ^8.71 | Type-aware linting with `projectService: true` works with the template's solution-style `tsconfig.json` (checked). |
| eslint / @eslint/js | ^10.11 / ^10.0 | Flat config via `defineConfig` and `globalIgnores` from `eslint/config`. |
| eslint-plugin-react-hooks | ^7.1 | `configs.flat.recommended` (includes the React Compiler rules, such as `set-state-in-effect`). |
| eslint-plugin-react-refresh | ^0.5 | Its `only-export-components` rule reports shadcn's `button.tsx` (which exports `buttonVariants`) as an **error**, so it is turned off for `src/components/ui/**`. |
| eslint-config-prettier | ^10.1 | Import `eslint-config-prettier/flat`. |
| prettier / prettier-plugin-tailwindcss | ^3.9 / ^0.8 | For Tailwind v4 the plugin needs `tailwindStylesheet`. |
| tailwindcss / @tailwindcss/vite | ^4.3 | CSS-first setup: `@import "tailwindcss";`. |
| shadcn (CLI) | 4.21.0 | **Base UI has been the default base since July 2026**, so pass `--base radix` (PLAN §5 says Radix). `init --template vite --base radix --preset nova --yes --no-monorepo` runs fully non-interactively. It writes `components.json` (style `radix-nova`), `src/components/ui/button.tsx`, `src/lib/utils.ts` (`export { cn } from "cn"`, the new `cn` package by shadcn), and CSS variables. It also adds `radix-ui`, `class-variance-authority`, `cn`, `lucide-react`, `tw-animate-css`, `@fontsource-variable/geist` and `shadcn`, the last because the CSS imports `shadcn/tailwind.css`. |
| vitest / @vitest/coverage-v8 | ^5.0 | Engines: `node ^22.12 \|\| ^24 \|\| >=26`. |
| @supabase/supabase-js | ^2.117 | Pass the new `sb_publishable_…` key straight to `createClient`. |
| supabase (CLI, devDependency) | ^2.118 | **It is now a JS bundle (`dist/supabase.js`) with no postinstall binary download**, so it is cheap as a devDependency, as Supabase recommends. |
| date-fns / @date-fns/tz | ^4.4 / ^1.5 | See §2.3 for the timezone gotchas. |
| vercel (CLI) | 61.x, used via `npx --yes vercel@61` (not a dependency) | New in 61: `env add --value/--sensitive/--no-sensitive/--force`, `project update --framework --node-version`, `project protection disable --sso`, `vercel api`, `git disconnect`, and `link --project` for non-interactive linking. |
| GitHub Actions | `actions/checkout@v7`, `actions/setup-node@v7` | setup-node v7 caches automatically only when `packageManager` is set. Upstream advises no dependency cache in privileged workflows (cache poisoning). |
| actionlint (local check only) | 1.7.12 release binary | Downloaded to the scratchpad with `gh release download`; it is not a dependency. |

### 2.2 Platform facts that shape the design

1. **Supabase grants changed.** Since 2026-05-30, new projects no longer expose new `public` tables to the Data API automatically. The migration must `GRANT select, insert, update, delete … TO anon, authenticated, service_role` explicitly. Without the grants, supabase-js gets `42501 permission denied` even though the RLS policies allow access.
2. **Supabase keys.** Publishable (`sb_publishable_…`, browser-safe) and secret (`sb_secret_…`, server-only) keys replace `anon` and `service_role`, which are deprecated by the end of 2026. A secret key sent from a browser User-Agent gets a 401. The app refuses to start with a secret key in a `VITE_` variable (§6.2).
3. **Vercel Node runtime.** 24.x is the default and the highest version for builds and functions (26.x exists only in Sandboxes), and 20.x is deprecated from 2026-10-01. So `engines.node = "24.x"` and `.nvmrc = 24`. The local machine runs Node 26.3.1, so npm prints an `EBADENGINE` **warning** (not an error). CI and Vercel use 24.
4. **Vercel env vars.** Development-target vars cannot be sensitive. Sensitive vars cannot be pulled back (`vercel env pull` returns them empty). So everything needed to restore a machine goes into the **development** target as a plain (non-sensitive) value. `SUPABASE_SECRET_KEY` is sensitive in production.
5. **`vercel link --yes` can auto-connect the Git repo and offer to pull env into `.env.local`.** So:
   - back up `.env.local` before linking
   - run `vercel git disconnect` afterwards
   - verify that the project has no Git link
   - add `"git": { "deploymentEnabled": false }` to `vercel.json` as a second guard
6. **TS 6.0:**
   - `strict` defaults to true (still set explicitly)
   - `baseUrl` is deprecated, so use `paths` **without** `baseUrl` (shadcn's Vite docs still show `baseUrl`; shadcn 4.21 validated the alias without it in the trial)
   - `types` defaults to `[]`, so every tsconfig lists its `types`
7. **CodeQL default setup** is configured through `PATCH /repos/{o}/{r}/code-scanning/default-setup` with `languages: ["javascript-typescript","actions"]`. It may reject enabling while `main` has no supported language (today `main` holds only Markdown). If so, retry right after the Ship merge (see WP8).
8. **Rulesets:** `POST /repos/{o}/{r}/rulesets`. The required status check context is the **job name** (`verify`), pinned to the GitHub Actions app (`integration_id: 15368`).
9. **Repo security today:** secret scanning and push protection are already enabled (public repo), and Dependabot security updates are disabled. There are no rulesets. Default labels only. All tracked files are LF.

### 2.3 Timezone gotchas (found by probing @date-fns/tz)

- `new TZDate(y, m, d, h, mi, tz)` resolves **nonexistent** wall times forward, which is consistent:
  - NY 2026-03-08 02:30 → 03:30 EDT
  - London 2026-03-29 01:30 → 02:30 BST
  - Chatham 2026-09-27 03:00 → 04:00 +13:45
- For **ambiguous** wall times it is **inconsistent**:
  - it picks the earlier offset for NY (2026-11-01 01:30 → 05:30Z) and London
  - it picks the **later** offset for Chatham (2026-04-05 03:00 → 14:15Z, where the earlier offset gives 13:15Z)

  So `zonedDateTimeToInstant` must not rely on the TZDate constructor. It resolves the offset itself with `tzOffset()` (§6.1).
- `tzOffset('Mars/X', d)` returns `NaN` without throwing. A TZDate with an invalid zone throws only when it is formatted. So zones are validated explicitly with `Intl.DateTimeFormat`, which throws `RangeError`.
- `Intl` accepts zone names case-insensitively and canonicalizes aliases. For example, Node/Chrome report `Asia/Calcutta` for India. Tests never assume a canonical spelling from `resolvedOptions()`.
- In Git Bash on Windows, `TZ=America/St_Johns node …` was mangled (the child process reported `Asia/Tokyo`). Setting `process.env.TZ` **inside** `vitest.config.ts` works: it was checked, and the offset was 210 in the worker.

---

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| D0-1 | Scaffold into the scratchpad with create-vite, then copy the needed files into the repo. Never run create-vite on the repo folder itself. | create-vite refuses non-empty directories, and `--overwrite` would delete `PLAN.md` and the other docs. |
| D0-2 | TypeScript `~6.0.3`. Dependabot ignores TS majors until typescript-eslint supports 7. | Peer range of typescript-eslint (§2.1). |
| D0-3 | Type-aware ESLint (`recommendedTypeChecked`), with import-boundary rules through `no-restricted-imports`. | Enforces PLAN §6 ("core is pure; src never imports server"). |
| D0-4 | Prettier ignores `**/*.md`. | Prettier would reformat PLAN.md tables, which would clobber the existing docs. Docs stay hand-formatted. |
| D0-5 | The Tailwind entry is `src/styles/index.css`, pointed to by `components.json`. `src/lib/utils.ts` stays where shadcn puts it. | Matches PLAN §6 (`styles/`) while keeping shadcn's default `@/lib/utils` alias. |
| D0-6 | Vitest runs with `process.env.TZ = 'America/St_Johns'`, which has a −3:30 offset and DST. | Any accidental use of local time fails the tests. |
| D0-7 | Unit tests live in `src/**/__tests__/*.test.ts` (run in CI). Integration tests live in `tests/integration/*.test.ts` (opt-in, use `.env.local`, never run in CI). | CI has no secrets. Dependabot PRs and forks must pass CI. |
| D0-8 | The migration file is named `0001_init.sql` (PLAN §6). | The Supabase CLI accepts `<digits>_<name>.sql`. Later timestamped files (`2026…`) still sort after it. |
| D0-9 | The migration adds explicit Data API grants. | §2.2 item 1. |
| D0-10 | On load, the home page checks the DB: it reads the settings row and inserts `{id: 1, timezone: <browser tz>}` if the row is missing. | This is the Phase 0 read/write proof. It already stores the right timezone, so the Phase 1 "first open" logic stays correct. |
| D0-11 | The DB status uses React 19 `use()` plus `<Suspense>` with a promise kept in state. There is no `useEffect`. | Clean under the react-hooks v7 rules. Retry means setting a new promise. |
| D0-12 | Production deploys use `vercel pull` / `vercel build --prod` / `vercel deploy --prebuilt --prod`, from CI and from the local CLI alike. | One path for both. Only build output is uploaded, so `.env.local` is never uploaded. |
| D0-13 | Every Vercel CLI output in CI goes to files under `$RUNNER_TEMP`. On failure, a sanitised tail is printed (URLs and `*.vercel.app` hosts redacted). The production host and its first label are masked with `::add-mask::`. | Public logs must never show URLs or the project name. |
| D0-14 | Vercel Deployment Protection (Vercel Authentication, `--sso`) is disabled for the whole project. | Production must be public (the MCP endpoint later). There are no preview deployments, because there is no Git integration. |
| D0-15 | Privacy headers in `vercel.json` (`X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer`), plus `<meta name="robots">` and `<meta name="referrer">`, plus `public/robots.txt` set to `Disallow: /`. | The URL acts as the password (no login), so it must not be indexed or leaked through the Referer header. |
| D0-16 | `scripts/check-leaks.mjs` runs locally before every push and in CI (generic patterns only, since CI has no `.env.local`). | Defence in depth next to GitHub push protection. |
| D0-17 | CI triggers on `push` to any branch plus `pull_request`. Concurrency is grouped per event and ref, and cancels in progress except on `main`. | Required by the task. The duplicate push and PR runs are free on a public repo. |
| D0-18 | Supabase CLI tasks go through `scripts/supabase.mjs` (it loads `.env.local`, resolves the CLI bin, and never prints values). | npm scripts run in `cmd.exe` on Windows, where there is no `$VAR` expansion and no dotenv. |
| D0-19 | Add `VERCEL_PROJECT_NAME` and `PROD_URL` to the Vercel **development** env as well. This goes beyond the task's list. | So `vercel env pull` really restores all of `.env.local`. |
| D0-20 | Repo merge settings stay unchanged. The ruleset restricts `allowed_merge_methods` to `["merge"]`. | CLAUDE.md says to merge with a merge commit. The rule stays within the granted ruleset permission. |

---

## 4. Resulting file tree (end of Phase 0)

```
structured/
├── .editorconfig                     NEW  utf-8, LF, 2 spaces
├── .env.example                      NEW  every variable, no values
├── .gitattributes                    NEW  * text=auto eol=lf (+ binaries)
├── .gitignore                        EXTENDED (see §5.2)
├── .nvmrc                            NEW  24
├── .prettierignore                   NEW
├── .prettierrc.json                  NEW
├── .vercelignore                     NEW  .env*, supabase/.temp, docs (belt and braces)
├── .vscode/extensions.json           NEW  eslint, prettier, tailwind recommendations
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── bug_report.yml            NEW
│   │   ├── feature_request.yml       NEW
│   │   └── config.yml                NEW
│   ├── dependabot.yml                NEW
│   ├── pull_request_template.md      NEW
│   ├── rulesets/main.json            NEW  the exact ruleset payload applied via gh api (documentation/IaC)
│   └── workflows/
│       ├── ci.yml                    NEW  job "verify" = required check
│       └── deploy.yml                NEW  production deploy + smoke check
├── CLAUDE.md                         EXTENDED (existing rules kept verbatim)
├── HANDOFF.md                        UPDATED after every WP
├── PLAN.md                           UNCHANGED
├── README.md                         REWRITTEN (features, stack, roadmap, setup, CI badge; no app URLs)
├── api/README.md                     NEW  placeholder: Vercel functions (Phase 2: mcp/[secret].ts)
├── components.json                   NEW  shadcn (style radix-nova, css src/styles/index.css)
├── docs/phases/phase-0/plan-v1.md    THIS FILE (+ later: edge cases, reviews, dev log, test reports)
├── eslint.config.js                  NEW
├── index.html                        NEW  title "Structured", noindex/no-referrer metas
├── package.json / package-lock.json  NEW
├── public/
│   ├── favicon.svg                   NEW  simple pill glyph (no Vite logo)
│   └── robots.txt                    NEW  Disallow: /
├── scripts/
│   ├── check-leaks.mjs               NEW  secret/URL leak scanner (files, commit msgs, --stdin for CI logs)
│   ├── ci/redact-log.sh              NEW  prints a sanitised tail of a CLI log on failure
│   ├── supabase.mjs                  NEW  link | push | types | migrations (loads .env.local)
│   └── sync-vercel-env.mjs           NEW  pushes .env.local values to Vercel targets (never prints values)
├── server/README.md                  NEW  placeholder: server-only code (Phase 2), never imported by src/
├── src/
│   ├── App.tsx                       NEW  app name + DB status + "Check again" (shadcn Button)
│   ├── main.tsx                      NEW
│   ├── env.d.ts                      NEW  ImportMetaEnv typing (optional VITE_ vars)
│   ├── components/
│   │   ├── DbStatusBadge.tsx         NEW  renders DbStatus (checking/connected/not-configured/error)
│   │   └── ui/button.tsx             NEW  shadcn generated
│   ├── core/
│   │   ├── dates.ts                  NEW  (§6.1)
│   │   └── __tests__/
│   │       ├── dates.calendar.test.ts NEW
│   │       ├── dates.format.test.ts  NEW
│   │       ├── dates.time.test.ts    NEW
│   │       ├── dates.zone.test.ts    NEW
│   │       └── environment.test.ts   NEW  asserts tests really run in America/St_Johns
│   ├── data/
│   │   ├── database.types.ts         GENERATED (npm run db:types)
│   │   ├── env.ts                    NEW  readSupabaseEnv()
│   │   ├── health.ts                 NEW  checkDatabase()
│   │   ├── supabase.ts               NEW  typed client (null when not configured)
│   │   ├── repo/settings.ts          NEW  createSettingsStore(db)
│   │   ├── queries/README.md         NEW  placeholder (Phase 1: TanStack Query hooks)
│   │   └── __tests__/
│   │       ├── env.test.ts           NEW
│   │       └── health.test.ts        NEW
│   ├── features/README.md            NEW  placeholder (Phase 1+ feature folders)
│   ├── lib/utils.ts                  NEW  shadcn cn()
│   ├── platform/timezone.ts          NEW  detectTimeZone() (browser adapter)
│   ├── stores/README.md              NEW  placeholder (Phase 1: zustand)
│   └── styles/index.css              NEW  tailwind + shadcn tokens
├── supabase/
│   ├── .gitignore                    GENERATED by `supabase init`
│   ├── config.toml                   GENERATED by `supabase init` (contains no project ref)
│   └── migrations/0001_init.sql      NEW  (§7)
├── tests/integration/supabase.test.ts NEW  opt-in: anon CRUD, trigger, realtime, secret key
├── tsconfig.json                     NEW  solution file (references + paths)
├── tsconfig.app.json                 NEW  src (strict)
├── tsconfig.node.json                NEW  vite/vitest configs
├── tsconfig.test.json                NEW  tests/ (node types)
├── vercel.json                       NEW  (§5.8)
├── vite.config.ts                    NEW
├── vitest.config.ts                  NEW  unit tests + coverage thresholds for src/core
└── vitest.integration.config.ts      NEW
```

Never committed: `.env.local`, `.vercel/`, `supabase/.temp/`, `node_modules/`, `dist/`, `coverage/`.

Placeholder policy: a folder that must exist but has no code yet gets a short `README.md` that states its purpose and import rules, and nothing else. The folders are `src/features`, `src/stores`, `src/data/queries`, `server`, `api`. `src/data/repo` and `src/platform` get real files, so they need no placeholder. `api/README.md` is ignored by Vercel, which only builds `.js/.ts` files as functions.

---

## 5. Configuration files (exact where short)

### 5.1 `.gitattributes`
```gitattributes
* text=auto eol=lf
*.cmd text eol=crlf
*.bat text eol=crlf
*.ps1 text eol=crlf
*.png binary
*.jpg binary
*.jpeg binary
*.gif binary
*.ico binary
*.webp binary
*.woff binary
*.woff2 binary
*.jar binary
*.keystore binary
```
After adding it, run `git add --renormalize .`. Today every tracked file is already LF, so the diff should be empty.

### 5.2 `.gitignore` additions (keep every existing line)
```gitignore
# typescript build info
*.tsbuildinfo
node_modules/.tmp/

# vercel build output (vercel build)
.vercel/output/

# local scratch
.env.local.bak
```
`.env`, `.env.*`, `!.env.example`, `*.local`, `.vercel/`, `coverage/` and `supabase/.temp/` already exist. Do not remove `!.vscode/extensions.json`.

### 5.3 `.editorconfig`, `.nvmrc`
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true

[*.md]
trim_trailing_whitespace = false
```
`.nvmrc` contains the single line `24`.

### 5.4 `package.json` (target shape)
```jsonc
{
  "name": "structured",
  "private": true,
  "version": "0.0.1",
  "type": "module",
  "description": "Personal visual day planner and work tracker with a Claude MCP connector",
  "repository": "github:karthi-ai-engineer/Structured",
  "engines": { "node": "24.x" },
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b",
    "lint": "eslint . --max-warnings=0",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check:leaks": "node scripts/check-leaks.mjs",
    "verify": "npm run typecheck && npm run lint && npm run format:check && npm run test:coverage && npm run build && npm run check:leaks",
    "db:link": "node scripts/supabase.mjs link",
    "db:push": "node scripts/supabase.mjs push",
    "db:migrations": "node scripts/supabase.mjs migrations",
    "db:types": "node scripts/supabase.mjs types",
    "env:sync-vercel": "node scripts/sync-vercel-env.mjs"
  }
}
```
Dependencies (caret ranges, pinned by the lockfile):
- **dependencies:** `react`, `react-dom`, `@supabase/supabase-js`, `date-fns`, `@date-fns/tz`, and the runtime packages shadcn adds (`radix-ui`, `class-variance-authority`, `cn`, `lucide-react`, `@fontsource-variable/geist`).
- **devDependencies:**
  - build: `typescript@~6.0.3`, `vite`, `@vitejs/plugin-react`, `@types/react`, `@types/react-dom`, `@types/node@^24`
  - lint and format: `eslint`, `@eslint/js`, `typescript-eslint`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `eslint-config-prettier`, `prettier`, `prettier-plugin-tailwindcss`
  - test: `vitest`, `@vitest/coverage-v8`
  - Supabase CLI: `supabase`
  - build-time CSS only: `tailwindcss`, `@tailwindcss/vite`, `tw-animate-css`, `shadcn`. Move these from `dependencies` if shadcn put them there. Vercel installs devDependencies.

### 5.5 TypeScript
`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" },
    { "path": "./tsconfig.test.json" }
  ],
  "compilerOptions": { "paths": { "@/*": ["./src/*"] } }
}
```
`tsconfig.app.json` is the template file plus these changes:
- add `"paths": { "@/*": ["./src/*"] }`, `"strict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`
- keep `"types": ["vite/client"]`, `"include": ["src"]`, `noUnusedLocals`, `noUnusedParameters`, `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`
- **no `baseUrl`**

`tsconfig.node.json` is the template file plus `"strict": true`, with `"include": ["vite.config.ts", "vitest.config.ts", "vitest.integration.config.ts"]`.

`tsconfig.test.json`:
```json
{
  "extends": "./tsconfig.app.json",
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.test.tsbuildinfo",
    "types": ["node", "vite/client"]
  },
  "include": ["tests"]
}
```

### 5.6 `vite.config.ts`, `vitest.config.ts`, `vitest.integration.config.ts`
```ts
// vite.config.ts
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
```
```ts
// vitest.config.ts
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Run every unit test in a half-hour-offset zone with DST, so any accidental use
// of the machine's local time zone fails (see src/core/__tests__/environment.test.ts).
process.env.TZ = 'America/St_Johns'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts'],
      exclude: ['src/core/**/__tests__/**'],
      thresholds: { lines: 95, statements: 95, functions: 100, branches: 90 }, // added in WP4
    },
  },
})
```
```ts
// vitest.integration.config.ts
import { fileURLToPath, URL } from 'node:url'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

export default defineConfig(({ mode }) => ({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: {
    include: ['tests/integration/**/*.test.ts'],
    environment: 'node',
    env: loadEnv(mode, process.cwd(), ''), // reads .env.local; never printed
    testTimeout: 30_000,
    fileParallelism: false,
  },
}))
```

### 5.7 ESLint (`eslint.config.js`), validated in the trial
```js
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import prettier from 'eslint-config-prettier/flat'
import { defineConfig, globalIgnores } from 'eslint/config'

const noServer = {
  group: ['**/server/**', 'server/*'],
  message: 'src/ must never import server/ (PLAN.md section 6).',
}
const coreOnly = [
  noServer,
  { group: ['react', 'react/*', 'react-dom', 'react-dom/*'], message: 'src/core is pure TypeScript: no React.' },
  { group: ['@supabase/*'], message: 'src/core must not depend on Supabase.' },
  { group: ['@/*', '!@/core', '!@/core/*'], message: 'src/core may only import from src/core.' },
  {
    group: ['**/data/**', '**/features/**', '**/components/**', '**/platform/**', '**/stores/**', '**/lib/**'],
    message: 'src/core may only import from src/core.',
  },
]

export default defineConfig([
  globalIgnores(['dist', 'coverage', '.vercel', 'src/data/database.types.ts', 'supabase/.temp']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommendedTypeChecked,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  { files: ['src/**/*.{ts,tsx}'], rules: { 'no-restricted-imports': ['error', { patterns: [noServer] }] } },
  { files: ['src/core/**/*.ts'], rules: { 'no-restricted-imports': ['error', { patterns: coreOnly }] } },
  { files: ['src/components/ui/**/*.tsx'], rules: { 'react-refresh/only-export-components': 'off' } },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [js.configs.recommended, tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node },
  },
  prettier,
])
```
Note: `no-restricted-imports` options do not merge across config objects. That is why the `src/core` block repeats `noServer`.

### 5.8 Prettier, `vercel.json`, `.vercelignore`, `robots.txt`
`.prettierrc.json`:
```json
{
  "$schema": "https://json.schemastore.org/prettierrc",
  "semi": false,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "endOfLine": "lf",
  "plugins": ["prettier-plugin-tailwindcss"],
  "tailwindStylesheet": "./src/styles/index.css",
  "tailwindFunctions": ["cn", "cva"]
}
```
`.prettierignore`:
```
dist
coverage
.vercel
node_modules
package-lock.json
src/data/database.types.ts
supabase/.temp
**/*.md
```
`vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "framework": "vite",
  "git": { "deploymentEnabled": false },
  "rewrites": [{ "source": "/((?!api/).*)", "destination": "/index.html" }],
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "X-Robots-Tag", "value": "noindex, nofollow" },
        { "key": "Referrer-Policy", "value": "no-referrer" },
        { "key": "X-Content-Type-Options", "value": "nosniff" }
      ]
    },
    {
      "source": "/assets/(.*)",
      "headers": [{ "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }]
    }
  ]
}
```
How the routing works:
- Static files match first (filesystem precedence).
- Every other non-`/api/` path is rewritten to the SPA.
- `/api/*` is never rewritten, so Phase 2 functions and a clean 404 for unknown API paths keep working.

`.vercelignore`: `.env*`, `!.env.example`, `supabase/.temp`, `docs`, `coverage`.

`public/robots.txt`:
```
User-agent: *
Disallow: /
```

### 5.9 `.env.example`
```dotenv
# Copy to .env.local (gitignored). On a new machine: `npx vercel env pull .env.local` restores it.
# Never commit real values. Never print them in docs, reports or CI logs.

# Browser (bundled into the client; public by design, still kept out of the repo)
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=

# Server only. Never prefix with VITE_.
SUPABASE_SECRET_KEY=

# Supabase CLI (local tooling)
SUPABASE_DB_PASSWORD=
SUPABASE_PROJECT_REF=

# Deployment bookkeeping (local only; the project name is secret)
VERCEL_PROJECT_NAME=
PROD_URL=

# Phase 2 (not used yet)
# MCP_SECRET=
```

### 5.10 Environment variable placement

| Variable | `.env.local` | Vercel production | Vercel preview | Vercel development | GitHub secret |
|---|---|---|---|---|---|
| `VITE_SUPABASE_URL` | yes | plain | plain | plain | – |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | yes | plain | plain | plain | – |
| `SUPABASE_SECRET_KEY` | yes | **sensitive** | – | plain (dev cannot be sensitive) | – |
| `SUPABASE_DB_PASSWORD` | yes | – | – | plain | – |
| `SUPABASE_PROJECT_REF` | yes | – | – | plain | – |
| `VERCEL_PROJECT_NAME` | yes | – | – | plain (D0-19) | – |
| `PROD_URL` | yes | – | – | plain (D0-19) | `PROD_URL` |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | (in `.vercel/project.json`) | – | – | – | yes |
| `VERCEL_TOKEN` | – | – | – | – | yes (added by the user) |

---

## 6. Key code designs

### 6.1 `src/core/dates.ts` (pure; imports only `date-fns` and `@date-fns/tz`)

Conventions (PLAN §10.3):
- dates are `YYYY-MM-DD`
- times are `HH:mm` (24 h) in the user's timezone
- durations are integer minutes

Calendar arithmetic on `ISODate` goes through `Date.UTC`, so it never touches the local zone and cannot be affected by DST.

Error policy:
- invalid input → `RangeError` with a clear message
- `is*` guards never throw
- every function that takes `now` defaults it to `new Date()`. This file is the **only** place allowed to read the clock for "today" or "now".

```ts
export type ISODate = string            // 'YYYY-MM-DD'; validated at boundaries
export type TimeFormat = '12h' | '24h'
export type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6   // 0 = Sunday … 6 = Saturday (settings.week_start)
export const MINUTES_PER_DAY = 1440

// Zones
export function isValidTimeZone(tz: string): boolean              // Intl-based; '' → false
export function assertTimeZone(tz: string): void                  // RangeError if invalid

// Calendar dates
export function isISODate(value: string): boolean                 // strict: /^\d{4}-\d{2}-\d{2}$/ + real calendar day (rejects 2026-02-30)
export function parseISODate(value: ISODate): { year: number; month: number; day: number } // RangeError
export function addDays(date: ISODate, days: number): ISODate     // integer days only
export function diffDays(later: ISODate, earlier: ISODate): number
export function dayOfWeek(date: ISODate): WeekStart               // 0 = Sun
export function toWeekStart(n: number): WeekStart                 // validates settings.week_start
export function startOfWeek(date: ISODate, weekStart: WeekStart): ISODate
export function weekRange(date: ISODate, weekStart: WeekStart):
  { start: ISODate; end: ISODate; days: readonly ISODate[] }      // 7 consecutive days, end inclusive

// Clock (timezone-aware)
export function todayIn(tz: string, now?: Date): ISODate          // RangeError on invalid tz or Invalid Date
export function nowMinutesIn(tz: string, now?: Date): number      // 0..1439, wall-clock minutes in tz

// Times of day
export function isTime(value: string): boolean                    // 'HH:mm' or 'HH:mm:ss', 00:00..23:59(:59), or exactly '24:00'
export function toMinutes(time: string): number                   // '09:30' → 570; '07:00:00' (Postgres time) → 420; '24:00' → 1440
export function fromMinutes(minutes: number): string              // integer 0..1440 → 'HH:mm'; 1440 → '24:00'
export function addMinutesToTime(time: string, delta: number):
  { time: string; dayOffset: number }                             // '23:30' + 60 → { '00:30', 1 }

// Wall clock → instant (for alerts later)
export function zonedDateTimeToInstant(date: ISODate, time: string, tz: string): Date
// DST rule ('compatible'): nonexistent wall time → shifted forward by the gap;
// ambiguous wall time → the EARLIER instant. Implemented with tzOffset() (NOT the TZDate
// constructor, which is inconsistent for Pacific/Chatham, see §2.3):
//   wall = Date.UTC(y, m-1, d, hh, mm)
//   offsets = unique([tzOffset(tz, wall - 36h), tzOffset(tz, wall + 36h)])
//   candidates = offsets.map(o => wall - o*60_000).filter(i => tzOffset(tz, new Date(i)) * 60_000 === wall - i)
//   if candidates.length: return min(candidates)
//   else (gap): return wall - offsetBefore*60_000   // offsetBefore = offset at wall - 36h

// Display
export function formatTime(minutes: number, format: TimeFormat): string   // 570 → '09:30' | '9:30 AM'; 0/1440 → '00:00' | '12:00 AM'; 720 → '12:00 PM'
export function formatDuration(minutes: number): string                   // 0 '0m', 45 '45m', 60 '1h', 90 '1h 30m', 1440 '24h'
export function formatDateLabel(date: ISODate, pattern?: string): string  // default 'EEE, d MMM' → 'Tue, 29 Sep' (en-US, formatted in UTC via TZDate)
```
Implementation notes:
- `todayIn` and `nowMinutesIn` use `new TZDate(now, tz)` after `assertTimeZone(tz)`.
- `formatDateLabel` uses `format(new TZDate(y, m - 1, d, 'UTC'), pattern)`.
- There are no module-level side effects.

### 6.2 `src/data/env.ts`
```ts
export type SupabaseEnv =
  | { ok: true; url: string; publishableKey: string }
  | { ok: false; problems: readonly string[] }     // e.g. 'VITE_SUPABASE_URL is missing'

export function readSupabaseEnv(env: Readonly<Record<string, string | undefined>>): SupabaseEnv
```
Validation rules:
- The URL must parse and must be `https:`. `http://127.0.0.1…` and `http://localhost…` are also allowed, for a future local stack.
- The key must be non-empty.
- A key that starts with `sb_secret_` is rejected with "secret key must never be used in the browser". A legacy JWT (`eyJ…`) is accepted with no warning text.
- Messages never echo values.

### 6.3 `src/data/supabase.ts`
```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'
import { readSupabaseEnv, type SupabaseEnv } from './env'

export type Db = SupabaseClient<Database>
export const supabaseEnv: SupabaseEnv = readSupabaseEnv(import.meta.env)
export const supabase: Db | null = supabaseEnv.ok
  ? createClient<Database>(supabaseEnv.url, supabaseEnv.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null
```
The client is `null` when the app is not configured. This happens in a CI build or in a fresh clone without `.env.local`. The app then renders "not configured" instead of a white screen.

`src/env.d.ts` declares `VITE_SUPABASE_URL?` and `VITE_SUPABASE_PUBLISHABLE_KEY?` as optional strings.

### 6.4 `src/data/repo/settings.ts` and `src/data/health.ts`
```ts
// repo/settings.ts
export interface SettingsStore {
  readSettingsId(): Promise<number | null>                  // select id from settings where id = 1
  insertDefaultSettings(timezone: string): Promise<'inserted' | 'exists'>  // 23505 → 'exists'
}
export function createSettingsStore(db: Db): SettingsStore  // each call uses .abortSignal(AbortSignal.timeout(10_000))

// health.ts
export type DbStatus =
  | { state: 'not-configured'; problems: readonly string[] }
  | { state: 'connected'; settingsRow: 'found' | 'created' }
  | { state: 'error'; code: string; message: string }       // code: PostgREST code, 'network', 'timeout', 'write-not-visible'

export async function checkDatabase(input: {
  env: SupabaseEnv
  store: SettingsStore | null
  timezone: string
}): Promise<DbStatus>   // never rejects
```
Flow:
1. If `env.ok` is false, return `not-configured`.
2. Read the row. If it exists, return `connected/found`.
3. Otherwise insert `{id: 1, timezone}`.
4. Read again. If the row exists, return `connected/created` (or `found` when the insert raced another tab and returned `exists`).
5. If the second read finds nothing, return `error/write-not-visible`.
6. Any thrown error is mapped to `error` with a sanitised message: no URLs and no keys, and the message is truncated to 200 characters.

`src/platform/timezone.ts` provides `detectTimeZone(): string`. It returns `Intl.DateTimeFormat().resolvedOptions().timeZone` when `isValidTimeZone` accepts it, and `'UTC'` otherwise.

### 6.5 `src/App.tsx` and `src/components/DbStatusBadge.tsx`
```tsx
export function App() {
  const [status, setStatus] = useState(runCheck)              // runCheck = () => checkDatabase({...})
  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col items-center justify-center gap-6 p-6">
      <h1 className="text-3xl font-semibold tracking-tight">Structured</h1>
      <Suspense fallback={<DbStatusBadge status={{ state: 'checking' }} />}>
        <DbStatusView promise={status} />                     {/* use(promise) */}
      </Suspense>
      <Button variant="outline" onClick={() => setStatus(runCheck())}>Check again</Button>
    </main>
  )
}
```
`DbStatusBadge` renders:
- `data-testid="db-status"` and `data-state=<state>`
- connected → the exact text **`DB connected`**, plus a secondary line "Settings row found" or "Settings row created"
- checking → "Checking database…"
- not-configured → "Database not configured" with the problem list
- error → "Database error" plus the code

It never renders the Supabase URL.

StrictMode double-invokes the `useState` initializer in development. That produces two checks, which is harmless, because the insert race is handled.

### 6.6 Scripts
- **`scripts/supabase.mjs <link|push|migrations|types> [--dry-run]`:**
  1. Loads `.env.local` with `process.loadEnvFile` when the file exists.
  2. Resolves the CLI through `createRequire(import.meta.url).resolve('supabase/package.json')` and the `bin` field, then spawns it with `process.execPath`. There is no shell.
  3. Sets `SUPABASE_DB_PASSWORD` in the child env and never prints it. If the CLI ignores the env var, pass `--password` in the child argv. That is visible only in the local process list.

  The subcommands map to:
  - `link` → `supabase link --project-ref $SUPABASE_PROJECT_REF`
  - `push` → `supabase db push --linked --yes [--dry-run]`
  - `migrations` → `supabase migration list --linked`
  - `types` → `supabase gen types typescript --linked --schema public`. stdout is captured, the script checks it contains `export type Database`, normalises it to LF and writes it to `src/data/database.types.ts`.

  It exits with the child's status.
- **`scripts/sync-vercel-env.mjs`:**
  1. Reads `.env.local` and applies the table in §5.10.
  2. For each (variable, target) pair, runs `npx --yes vercel@61 env add NAME TARGET --force --yes (--sensitive|--no-sensitive)` with the value on **stdin** (`spawnSync(..., { input })`), never in argv.
  3. Prints only `NAME → target: ok/FAILED`. On failure it prints stderr with the value replaced by `***`.
- **`scripts/check-leaks.mjs [--stdin]`:**
  - It collects sensitive values: every `.env.local` value that is at least 8 characters and not purely boolean or numeric, the host names derived from URL values, and `orgId`/`projectId` from `.vercel/project.json` if present.
  - Generic patterns:
    - `sb_secret_[A-Za-z0-9_-]{16,}`
    - `sb_publishable_[A-Za-z0-9_-]{16,}`
    - JWT `eyJ[\w-]{20,}\.[\w-]{20,}\.`
    - `https://[a-z]{20}\.supabase\.co`
    - `[a-z0-9-]+\.vercel\.app` (the placeholder `<app>.vercel.app` does not match)
    - `postgres(ql)?://\S+:\S+@`
  - It scans:
    - `git ls-files` together with untracked, non-ignored files (text only)
    - the last 200 commit messages on the branch
    - with `--stdin`, a log piped in (for `gh run view --log`)
  - It prints `LEAK <file|commit|stdin>:<line> matches <VAR or pattern name>`, never the value, and exits 1 on any hit.
  - Without `.env.local` (in CI) only the generic patterns run.
- **`scripts/ci/redact-log.sh <file>`:** `sed -E 's#https?://[^[:space:]"]+#[redacted-url]#g; s#[A-Za-z0-9.-]+\.vercel\.app#[redacted-host]#g' "$1" | tail -n 150`.

### 6.7 Data flow at runtime
```
browser → main.tsx → App → checkDatabase({ env: supabaseEnv, store: supabase && createSettingsStore(supabase), timezone: detectTimeZone() })
        → supabase-js (publishable key) → PostgREST /rest/v1/settings (RLS open_access, grants to anon)
        ← row / insert result → DbStatus → DbStatusBadge ("DB connected")
```

---

## 7. Migration `supabase/migrations/0001_init.sql`

This is PLAN §7.1 verbatim, plus the §7.2 statements expanded to every table, plus the **Data API grants** (§2.2 item 1).

```sql
-- 0001_init.sql: initial schema (PLAN.md sections 7.1 and 7.2).
-- Single user, no login: no user_id columns. RLS is on, with open_access policies
-- for anon and authenticated. SSO later replaces the policies (PLAN.md section 14).

create extension if not exists pgcrypto;

-- settings (exactly one row)
create table public.settings (
  id               smallint primary key default 1 check (id = 1),
  timezone         text    not null default 'UTC',
  time_format      text    not null default '24h' check (time_format in ('12h','24h')),
  week_start       smallint not null default 1,
  day_start        time    not null default '07:00',
  day_end          time    not null default '22:00',
  default_duration int     not null default 30,
  default_alerts   int[]   not null default '{0}',
  energy_enabled   boolean not null default true,
  energy_limit     int     not null default 30,
  focus_minutes    int     not null default 25,
  break_minutes    int     not null default 5,
  theme            text    not null default 'system',
  updated_at       timestamptz not null default now()
);

-- goals, tasks (+ 4 indexes), focus_sessions, day_notes, templates:
-- copy PLAN.md section 7.1 exactly (columns, defaults, checks, FKs, unique (series_id, occurrence_date)).

-- Data API grants. Projects created after 2026-05-30 do not expose new public tables
-- automatically; RLS policies only take effect once the role has table privileges.
grant select, insert, update, delete on table
  public.settings, public.goals, public.tasks, public.focus_sessions, public.day_notes, public.templates
  to anon, authenticated, service_role;

-- Row level security: open access for now (single user, no login).
alter table public.settings       enable row level security;
alter table public.goals          enable row level security;
alter table public.tasks          enable row level security;
alter table public.focus_sessions enable row level security;
alter table public.day_notes      enable row level security;
alter table public.templates      enable row level security;

create policy "open_access" on public.settings       for all to anon, authenticated using (true) with check (true);
create policy "open_access" on public.goals          for all to anon, authenticated using (true) with check (true);
create policy "open_access" on public.tasks          for all to anon, authenticated using (true) with check (true);
create policy "open_access" on public.focus_sessions for all to anon, authenticated using (true) with check (true);
create policy "open_access" on public.day_notes      for all to anon, authenticated using (true) with check (true);
create policy "open_access" on public.templates      for all to anon, authenticated using (true) with check (true);

-- updated_at trigger
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

create trigger settings_touch before update on public.settings
  for each row execute function public.touch_updated_at();
create trigger goals_touch before update on public.goals
  for each row execute function public.touch_updated_at();
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();

-- Realtime
alter publication supabase_realtime add table public.tasks, public.goals, public.settings, public.day_notes;
```
The implementer writes the full `goals`, `tasks`, `focus_sessions`, `day_notes` and `templates` DDL by copying PLAN §7.1 character for character. Only the comments may be shortened.

Expected advisor warnings, which are accepted:
- "RLS policy always true", on all 6 tables. This is by design until SSO (PLAN §16).
- There is **no** "function search_path mutable" warning, because of `set search_path = ''`.

---

## 8. Infrastructure: exact commands

The shell is Git Bash unless noted. `SCRATCH` is the session scratchpad. Every command that would print a secret sends its output to a file in `SCRATCH`, and those files are never committed.

Values are read from `.env.local` into shell variables without echoing them:
```bash
envget() { node -e "process.loadEnvFile('.env.local'); process.stdout.write(process.env['$1'] ?? '')"; }
```

### 8.1 Preconditions (checked, not performed, by the implementer)
- `npx supabase projects list -o json > "$SCRATCH/sb-projects.json"` succeeds, which means the user has run `npx supabase login`. The free plan allows 2 active projects per org. If the org already has 2, **stop** and report a blocker.
- `npx --yes vercel@61 whoami` succeeds, which means the user has run `npx vercel login`.
- `gh auth status` shows the account `karthi-ai-engineer`.

### 8.2 Supabase (WP5)
1. `npx supabase orgs list -o json > "$SCRATCH/sb-orgs.json"`. Choose the personal (or first) org, and record in the dev log which one was chosen, by name only.
2. Run a one-off bootstrap script, `SCRATCH/create-supabase-project.mjs` (not committed). It:
   1. Backs up `.env.local` to `SCRATCH` if it exists.
   2. Generates `SUPABASE_DB_PASSWORD = crypto.randomBytes(24).toString('base64url')` (32 characters, URL-safe) and **writes it to `.env.local` before anything else**.
   3. Runs `supabase projects create structured --org-id <id> --region ap-south-1 --db-password <pw> -o json`, capturing stdout. It reads the ref from `ref ?? id`. If the output is not JSON, it falls back to `projects list -o json` and finds the project by name `structured`.
   4. Writes `SUPABASE_PROJECT_REF` and `VITE_SUPABASE_URL=https://<ref>.supabase.co`.
   5. Polls `projects list -o json` every 10 s until the status is `ACTIVE_HEALTHY`, with a 10-minute timeout.
   6. Runs `supabase projects api-keys --project-ref <ref> --reveal -o json`. It takes the first `type === 'publishable'` key as `VITE_SUPABASE_PUBLISHABLE_KEY` and the first `type === 'secret'` key as `SUPABASE_SECRET_KEY`. If either is missing, it stops with a blocker: "create a publishable and a secret API key in the Supabase dashboard, Settings, API Keys".
   7. Prints only variable names and masked values, such as `sb_publishable_ab…yz`.
3. `npx supabase init` creates `supabase/config.toml` and `supabase/.gitignore`. It is non-interactive without `-i`.
4. Write `supabase/migrations/0001_init.sql` (§7).
5. `npm run db:link`, then `node scripts/supabase.mjs push --dry-run`, which must list `0001_init.sql`.
6. `npm run db:push`, then `npm run db:migrations`. The output must show `0001` both locally and remotely.
7. `npm run db:types` → `src/data/database.types.ts`. Check that it contains the tables `settings`, `goals`, `tasks`, `focus_sessions`, `day_notes` and `templates`, and that `npm run check:leaks` passes on it.
8. `npm run test:integration` (§12.2).

Recovery: the project is fresh, so if the push fails halfway, fix the SQL and push again. The CLI applies each migration in a transaction. As a last resort, and only on this empty project, run `npx supabase db reset --linked` and record it in the dev log.

### 8.3 Vercel (WP7)
```bash
# 0. VERCEL_PROJECT_NAME was written to .env.local in WP5/WP7 step 0 (value from the phase task).
NAME="$(envget VERCEL_PROJECT_NAME)"
cp .env.local "$SCRATCH/env.local.bak"                                 # link may offer to pull env
npx --yes vercel@61 project add "$NAME"                  > "$SCRATCH/v-add.log" 2>&1
npx --yes vercel@61 link --yes --project "$NAME"         > "$SCRATCH/v-link.log" 2>&1
cmp -s .env.local "$SCRATCH/env.local.bak" || cp "$SCRATCH/env.local.bak" .env.local
npx --yes vercel@61 git disconnect --yes                 > "$SCRATCH/v-git.log" 2>&1 || true   # "not connected" is fine
npx --yes vercel@61 project update "$NAME" --framework vite --node-version 24.x --yes > "$SCRATCH/v-upd.log" 2>&1
npx --yes vercel@61 project protection disable "$NAME" --sso                         > "$SCRATCH/v-prot.log" 2>&1
npx --yes vercel@61 project protection "$NAME" --json    > "$SCRATCH/v-prot.json"    # expect SSO protection off
npx --yes vercel@61 project inspect "$NAME" --json       > "$SCRATCH/v-inspect.json" # expect no Git link
npm run env:sync-vercel                                                  # §6.6; prints names/targets only
npx --yes vercel@61 env ls                               > "$SCRATCH/v-envls.txt"    # names + targets
# First production deploy, the same path as CI (prebuilt):
npx --yes vercel@61 pull --yes --environment=production  > "$SCRATCH/v-pull.log" 2>&1
npx --yes vercel@61 build --prod                          > "$SCRATCH/v-build.log" 2>&1
npx --yes vercel@61 deploy --prebuilt --prod              > "$SCRATCH/v-deploy.out" 2> "$SCRATCH/v-deploy.err"
# Production domain → PROD_URL (never printed):
npx --yes vercel@61 api "/v9/projects/$NAME/domains" --raw > "$SCRATCH/v-domains.json"
node -e "<pick the *.vercel.app domain without redirect; write PROD_URL=https://<domain> into .env.local>"
npm run env:sync-vercel                                                  # adds PROD_URL (development)
# GitHub secrets via stdin (values never echoed):
node -e "process.stdout.write(require('./.vercel/project.json').orgId)"     | gh secret set VERCEL_ORG_ID
node -e "process.stdout.write(require('./.vercel/project.json').projectId)" | gh secret set VERCEL_PROJECT_ID
envget PROD_URL | gh secret set PROD_URL
gh secret list                                                          # names only
```
Fallback: if `vercel build` fails on Windows, deploy with a remote build (`vercel deploy --prod --yes`). `.vercelignore` keeps `.env*` out of the upload. Record this in the dev log. CI still uses the prebuilt path on Linux.

**CI rehearsal of the env-var link.** In a throwaway clone in `SCRATCH` with no `.vercel/`, run `vercel pull`/`build` with `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` exported from `.vercel/project.json` of the real checkout. This proves the variables-instead-of-link mode that `deploy.yml` uses. Delete the clone afterwards.

### 8.4 GitHub (WP1, WP3, WP8)
```bash
R=karthi-ai-engineer/Structured
# Labels (WP1)
gh label create phase-0     -R $R --color 5319E7 --description "Phase 0: Foundation" --force
gh label create tracking    -R $R --color 0E8A16 --description "Phase tracking issue" --force
gh label create ci          -R $R --color 1D76DB --description "CI/CD and automation" --force
gh label create dependencies -R $R --color 0366D6 --description "Dependency updates" --force
# Tracking issue + draft PR (WP1). Bodies from files in SCRATCH, no AI mentions, no attribution lines.
gh issue create -R $R --title "Phase 0: Foundation" --label phase-0,tracking --body-file "$SCRATCH/issue-phase-0.md"
gh pr create -R $R --draft --base main --head phase-0-foundation --title "Phase 0: Foundation" --body-file "$SCRATCH/pr-phase-0.md"   # body contains "Closes #<issue>"
# Ruleset (WP8), payload committed as .github/rulesets/main.json
gh api -X POST repos/$R/rulesets --input .github/rulesets/main.json
gh api repos/$R/rules/branches/main                    # verify the 4 rules
# Code scanning default setup (WP8)
printf '{"state":"configured","query_suite":"default","languages":["javascript-typescript","actions"]}' \
  | gh api -X PATCH repos/$R/code-scanning/default-setup --input -
gh api repos/$R/code-scanning/default-setup            # expect state "configured"
# Presentation (WP8)
gh repo edit $R --description "Personal visual day planner and work tracker (Structured-style) with goals, focus tracking and a Claude MCP connector. React, TypeScript, Vite, Tailwind, Supabase." \
  --add-topic planner,time-blocking,todo,productivity,react,typescript,vite,tailwindcss,supabase,capacitor,mcp,model-context-protocol
gh repo view $R --json description,repositoryTopics
```
`.github/rulesets/main.json`:
```json
{
  "name": "main protection",
  "target": "branch",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["~DEFAULT_BRANCH"], "exclude": [] } },
  "bypass_actors": [],
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "required_approving_review_count": 0,
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_last_push_approval": false,
        "required_review_thread_resolution": false,
        "allowed_merge_methods": ["merge"]
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "strict_required_status_checks_policy": false,
        "do_not_enforce_on_create": false,
        "required_status_checks": [{ "context": "verify", "integration_id": 15368 }]
      }
    }
  ]
}
```
If the API rejects `allowed_merge_methods` (422), drop that key and record it. Before applying, confirm that the PR's check list shows a check named exactly `verify` (`gh pr checks`).

---

## 9. CI/CD workflows

### 9.1 `.github/workflows/ci.yml`
```yaml
name: CI

on:
  push:
    branches: ['**']        # branches only; tag pushes are ignored
  pull_request:

permissions:
  contents: read

concurrency:
  group: ci-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}
  cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}

jobs:
  verify:
    name: verify            # required status check (ruleset) - do not rename
    runs-on: ubuntu-latest
    timeout-minutes: 15
    steps:
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          cache: npm
      - run: npm ci
      - name: Typecheck
        run: npm run typecheck
      - name: Lint
        run: npm run lint
      - name: Format check
        run: npm run format:check
      - name: Test (with coverage thresholds for src/core)
        run: npm run test:coverage
      - name: Build
        run: npm run build
      - name: Leak check (generic patterns)
        run: npm run check:leaks
```

### 9.2 `.github/workflows/deploy.yml`
```yaml
name: Deploy

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: deploy-production
  cancel-in-progress: false

env:
  VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
  VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
  VERCEL_TELEMETRY_DISABLED: '1'
  VERCEL_CLI: vercel@61

jobs:
  deploy:
    name: deploy-production
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - name: Check required secrets
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
          PROD_URL: ${{ secrets.PROD_URL }}
        run: |
          missing=0
          for name in VERCEL_TOKEN VERCEL_ORG_ID VERCEL_PROJECT_ID PROD_URL; do
            if [ -z "${!name}" ]; then echo "::error::Repository secret $name is not set"; missing=1; fi
          done
          exit "$missing"
      - name: Mask production host
        env:
          PROD_URL: ${{ secrets.PROD_URL }}
        run: |
          host="${PROD_URL#*://}"; host="${host%%/*}"
          echo "::add-mask::$host"
          echo "::add-mask::${host%%.*}"
      - uses: actions/checkout@v7
        with:
          persist-credentials: false
      - uses: actions/setup-node@v7
        with:
          node-version-file: .nvmrc
          package-manager-cache: false   # no dependency cache in the privileged deploy workflow
      - run: npm ci
      - name: Install Vercel CLI
        run: npm install --global "$VERCEL_CLI" > /dev/null 2>&1
      - name: Pull production settings
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
        run: |
          log="$RUNNER_TEMP/vercel-pull.log"
          vercel pull --yes --environment=production --token="$VERCEL_TOKEN" > "$log" 2>&1 \
            || { bash scripts/ci/redact-log.sh "$log"; exit 1; }
          echo "Pulled production settings."
      - name: Build
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
        run: |
          log="$RUNNER_TEMP/vercel-build.log"
          vercel build --prod --token="$VERCEL_TOKEN" > "$log" 2>&1 \
            || { bash scripts/ci/redact-log.sh "$log"; exit 1; }
          echo "Build finished."
      - name: Deploy to production
        env:
          VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
        run: |
          log="$RUNNER_TEMP/vercel-deploy.log"
          vercel deploy --prebuilt --prod --token="$VERCEL_TOKEN" > "$log" 2>&1 \
            || { bash scripts/ci/redact-log.sh "$log"; exit 1; }
          echo "Deployed. (URL intentionally not printed.)"
      - name: Smoke check
        env:
          PROD_URL: ${{ secrets.PROD_URL }}
        run: |
          base="${PROD_URL%/}"
          for path in / /day/2026-01-01; do
            code=000
            for attempt in 1 2 3 4 5 6; do
              code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$base$path" || true)"
              [ "$code" = "200" ] && break
              sleep 10
            done
            if [ "$code" != "200" ]; then echo "::error::Smoke check failed for $path (HTTP $code)"; exit 1; fi
            echo "Smoke check passed for $path"
          done
```
`deploy.yml` first runs in the Ship stage, because `workflow_dispatch` and `push: main` only work once the file is on `main`. Before then it is validated by:
- actionlint
- the local prebuilt deploy through the same commands (§8.3)
- the env-var link rehearsal

### 9.3 `.github/dependabot.yml`
```yaml
version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule: { interval: weekly, day: monday, time: '06:00', timezone: Asia/Kolkata }
    open-pull-requests-limit: 5
    labels: [dependencies]
    commit-message: { prefix: chore, include: scope }
    groups:
      npm-minor-and-patch:
        update-types: [minor, patch]
    ignore:
      # typescript-eslint supports TypeScript < 6.1 only; revisit when it supports 7.x.
      - dependency-name: typescript
        update-types: ['version-update:semver-major']
      # Keep Node types on the runtime major (engines 24.x).
      - dependency-name: '@types/node'
        update-types: ['version-update:semver-major']
  - package-ecosystem: github-actions
    directory: /
    schedule: { interval: weekly, day: monday, time: '06:00', timezone: Asia/Kolkata }
    labels: [dependencies, ci]
    commit-message: { prefix: ci }
    groups:
      actions-minor-and-patch:
        update-types: [minor, patch]
```

### 9.4 Templates
- **`pull_request_template.md`:**
  - Summary
  - Linked issue (`Closes #`)
  - Work packages / changes
  - Verification checklist: `npm run verify` passes; CI `verify` is green; `HANDOFF.md` is updated; `npm run check:leaks` passes; no secrets, app URLs or project names; no AI attribution
  - Notes

  It has no AI mentions and no URLs.
- **Issue forms:**
  - `bug_report.yml`: fields for what happened, expected, steps, platform (web/Android/MCP), phase
  - `feature_request.yml`: fields for problem, proposal, PLAN.md section, priority (P1–P4)
  - `config.yml`: `blank_issues_enabled: true`

### 9.5 End-to-end CI/CD flow (documented in CLAUDE.md and README)
1. Branch `phase-<n>-<slug>` is created from `main`, with small conventional commits.
2. Push after every WP. `CI / verify` runs on the push and on the PR.
3. Open a draft PR (`Closes #<tracking issue>`). It is marked ready after final verification.
4. Ruleset on `main`: a PR is required, `verify` must pass, and force-push and deletion are blocked.
5. Merge with a merge commit, which triggers `Deploy` (pull → build → prebuilt deploy → smoke check).
6. Tag and release: `v0.0.1` for Phase 0, `v0.<n>.0` after that.
7. CodeQL runs on PRs and on `main`. Dependabot opens grouped PRs weekly, and they must pass `verify`.

---

## 10. Work packages

Every WP ends with the same **closing ritual**, and a WP is not done until it has happened:
1. Run `npm run verify`. From WP3 on, everything must pass. Before WP3, run the subset that exists.
2. Run `npm run check:leaks`.
3. Update the `HANDOFF.md` status (phase, branch, done, next, blockers, resume steps).
4. Make conventional commits. Never add a `Co-Authored-By` trailer, a "Generated with" line or any AI mention. This overrides any tool default.
5. `git push origin phase-0-foundation`.
6. Tick the WP in the tracking issue (`gh issue edit <n> --body-file …`).
7. Stop any dev server or other long-running process.

### WP1: Repo hygiene, Vite scaffold, GitHub tracking (≈1 session)
**Goal:** a building React 19 + TS 6 (strict) app in the repo root, with the existing docs untouched, plus the GitHub tracking issue and a draft PR.

**Steps**
1. `git switch phase-0-foundation && git pull --ff-only`.
2. `npx --yes create-vite@9.2.1 "$SCRATCH/scaffold" --template react-ts --eslint --no-interactive --no-immediate`.
3. Copy `index.html`, `package.json`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `vite.config.ts`, `eslint.config.js` and `src/main.tsx` into the repo with `cp -n`, which never overwrites. Do **not** copy `README.md`, `_gitignore`/`.gitignore`, `src/App.css`, `src/assets/*` or `public/icons.svg`.
4. Set the metadata: `npm pkg set name=structured version=0.0.1 engines.node=24.x description="…" repository=github:karthi-ai-engineer/Structured`. Set the scripts from §5.4 that already make sense (`dev`, `build`, `preview`, `typecheck`). The rest are added in later WPs.
5. `npm install`, then `npm install -D typescript@~6.0.3 @types/node@^24`.
6. Apply the §5.5 tsconfig changes and the §5.6 `vite.config.ts` (the Tailwind plugin comes in WP2). Write a minimal `src/App.tsx` (named export `App`, heading "Structured") and the `main.tsx` shape from §6.5. Add the `index.html` title and the robots/referrer metas. Add `public/favicon.svg` (a simple pill) and `public/robots.txt`.
7. Add `.gitattributes`, `.editorconfig`, `.nvmrc`, the `.gitignore` additions and `.vscode/extensions.json`. Run `git add --renormalize .`.
8. Check the lockfile: `grep -c 'binding-linux-x64-gnu' package-lock.json` must be ≥ 1. If not, delete `node_modules` and `package-lock.json` and run `npm install` again.
9. Commits:
   - `chore: add line-ending and editor config`
   - `chore: scaffold Vite React TypeScript app`
   - `docs: add phase 0 plan` (the `docs/phases/phase-0/*.md` present at this point)
10. Push. Create the labels, the tracking issue and the draft PR (§8.4).

**Verification**
- `npm run typecheck` and `npm run build` exit 0.
- `git diff main -- PLAN.md CLAUDE.md HANDOFF.md README.md` is empty.
- `git ls-files --eol` shows `i/lf` for every text file.
- `npx tsc --showConfig -p tsconfig.app.json` shows `"strict": true` and the `paths` entry, with no `baseUrl`.
- The PR and the issue exist (`gh pr view --json isDraft,body` shows `Closes #<n>`).

### WP2: Tailwind v4, shadcn/ui, ESLint, Prettier, folder skeleton, architecture rules (≈1 session)
**Goal:** the styling and component stack works, lint and format are strict, and the architecture is enforced and documented.

**Steps**
1. `npm install -D tailwindcss @tailwindcss/vite`. Add the plugin to `vite.config.ts`. Create `src/styles/index.css` containing `@import "tailwindcss";` and import it from `main.tsx`.
2. `npx --yes shadcn@4.21.0 init --template vite --base radix --preset nova --yes --no-monorepo < /dev/null`. Expect `components.json`, `src/components/ui/button.tsx` and `src/lib/utils.ts`, plus the tokens written into `src/styles/index.css`. Check that `components.json` has `tailwind.css = "src/styles/index.css"`, and fix it by hand if shadcn picked another file. If the CLI prompts or hangs, stop it (do not use `--defaults`, which forces the Next.js template and Base UI). Check `npx shadcn@4.21.0 init --help` for new flags, and record the working command in the dev log.
3. Move the build-time-only packages to devDependencies (§5.4).
4. `npm install -D eslint-config-prettier prettier prettier-plugin-tailwindcss`. Write `eslint.config.js` (§5.7), `.prettierrc.json` and `.prettierignore` (§5.8). Add the scripts `lint`, `format` and `format:check`. Run `npm run format` once.
5. Use the shadcn `Button` in `App.tsx`, as a disabled placeholder until WP6. Theme stays light-only; dark mode is Phase 1 (S3).
6. Skeleton: create `src/features/README.md`, `src/stores/README.md`, `src/data/queries/README.md`, `server/README.md` and `api/README.md`, each 3 to 6 lines stating purpose and import rules. `src/core`, `src/data/repo` and `src/platform` get real files in WP4 to WP6. Until then, `src/core/README.md` may stand in and is removed when `dates.ts` lands.
7. CLAUDE.md, first part. **Append**; keep every existing line verbatim. Only the trailing HTML comment placeholder is replaced. Add these sections:
   - "Architecture": the folder responsibilities from PLAN §6, plus `src/lib`, which holds UI helpers such as shadcn's `cn`
   - "Import rules": core is pure; `src` never imports `server`; only `src/data` talks to Supabase; `src/platform` wraps browser and Capacitor APIs. Say that ESLint enforces these rules.
   - "Code conventions":
     - TS strict, no `any`, named exports
     - React component files use PascalCase; `components/ui/*` stays shadcn kebab-case; other modules use lowercase or camelCase
     - `@/` imports
     - all dates and times go through `src/core/dates.ts`
     - tests in `__tests__` next to the code
   - "Data conventions": PLAN §10.3 verbatim in spirit (dates, times, durations, IDs, summary + JSON responses, `source='mcp'`, `batch_id`, zod validation, warnings rather than failures).
8. Commits: `feat: add Tailwind CSS v4 and shadcn/ui`, `chore: add ESLint and Prettier configuration`, `chore: add folder skeleton`, `docs: add architecture and code conventions to contributor guide`.

**Verification**
- `npm run lint` (0 warnings), `npm run format:check`, `npm run typecheck` and `npm run build` all pass. `npm run dev` shows a styled button. Stop the server afterwards.
- **Negative boundary tests.** These are temporary files and are never committed:
  - `src/core/tmp.ts` importing `react` fails lint
  - `src/core/tmp.ts` importing `@/lib/utils` fails lint
  - `src/lib/tmp.ts` importing `../../server/x` fails lint

  Delete the files afterwards.
- `git diff main -- CLAUDE.md` shows additions only. The one removed line is the placeholder comment.

### WP3: CI workflow, repo automation files, leak checker (≈1 session)
**Goal:** every later push is verified by the `verify` job, and leaks are checked automatically.

**Steps**
1. Write `scripts/check-leaks.mjs` (§6.6) and add the `check:leaks` script.
2. Write `.github/workflows/ci.yml` (§9.1), `.github/dependabot.yml` (§9.3), `.github/pull_request_template.md` and `.github/ISSUE_TEMPLATE/*` (§9.4).
3. Run actionlint locally:
   ```bash
   gh release download v1.7.12 -R rhysd/actionlint -p '*windows_amd64.zip' -D "$SCRATCH/al"
   unzip -o "$SCRATCH/al/"*.zip -d "$SCRATCH/al"
   "$SCRATCH/al/actionlint.exe" .github/workflows/*.yml
   ```
4. Bring the test setup forward into this WP so CI runs real tests from its first run:
   - `npm install -D vitest @vitest/coverage-v8`
   - `vitest.config.ts` from §5.6, **without** the `coverage.thresholds` block (WP4 adds it once `dates.ts` exists)
   - `src/core/__tests__/environment.test.ts` (the TZ sanity test)
   - the `test`, `test:watch`, `test:coverage` and `verify` scripts

   This replaces the temporary `src/core/README.md` stand-in, if WP2 created one.
5. Commits: `ci: add CI workflow with verify job`, `ci: add Dependabot configuration`, `chore: add pull request and issue templates`, `chore: add secret leak checker`, `test: add Vitest setup`.

**Verification**
- actionlint reports nothing.
- `gh pr checks` shows `verify` passing on the PR, for both the push and the pull_request events.
- The job log shows each step, and `npm ci` used the npm cache from the second run on.
- `npm run check:leaks` exits 0.
- A deliberate fake leak in a temp file (for example `sb_secret_` followed by 24 random characters) makes it exit 1 and print the file name only. Delete the temp file.

### WP4: `src/core/dates.ts` and tests (≈1 session)
**Goal:** the full §6.1 API, with thorough tests (§12.1) and coverage of at least 95 % lines and at least 90 % branches.

**Steps**
1. `npm install date-fns @date-fns/tz`.
2. Implement `src/core/dates.ts` (§6.1), including the custom ambiguity and gap resolution.
3. Write the four test files (§12.1), using table-driven `it.each` for the zones. Add the `coverage.thresholds` block to `vitest.config.ts` (§5.6).
4. Commits: `feat: add timezone-aware date helpers in core`, `test: cover date helpers across DST and time zones`.

**Verification**
- `npm run test:coverage` passes the thresholds.
- `environment.test.ts` proves the St_Johns TZ is in effect.
- Lint shows that `dates.ts` imports only `date-fns` and `@date-fns/tz`.
- CI `verify` is green.

### WP5: Supabase project, migration, types, env files, integration tests (≈1 to 2 sessions)
**Goal:** the cloud project exists with the schema applied, typed, and verified by opt-in integration tests.

**Preconditions:** §8.1, with the Supabase login done by the user.

**Steps**
1. `npm install -D supabase`. Write `scripts/supabase.mjs` and add the `db:*` scripts.
2. Write `VERCEL_PROJECT_NAME` into `.env.local`, which creates the file. Write `.env.example` (§5.9).
3. Follow §8.2, steps 1 to 7.
4. `npm install @supabase/supabase-js`, which the tests and WP6 need. Add `tsconfig.test.json`, `vitest.integration.config.ts` and `tests/integration/supabase.test.ts` (§12.2). Add the `test:integration` script. Run it.
5. Commits:
   - `chore: add Supabase CLI configuration and scripts`
   - `feat: add initial database schema migration`
   - `feat: add generated database types`
   - `test: add Supabase integration tests`
   - `docs: add environment variable template`

**Verification**
- `npm run db:migrations` shows `0001` locally and remotely.
- `database.types.ts` contains the 6 tables and passes typecheck.
- `npm run test:integration` passes.
- `npm run check:leaks` passes. `supabase/config.toml` holds no ref, and the types file holds no URL.
- `git status` never shows `.env.local` or `supabase/.temp`.
- A key-names-only check of `.env.local` lists all 7 keys: `node -e "process.loadEnvFile('.env.local'); console.log(['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','SUPABASE_DB_PASSWORD','SUPABASE_PROJECT_REF','VERCEL_PROJECT_NAME'].map(k => k + ':' + (process.env[k] ? 'set' : 'MISSING')).join(' '))"`. `PROD_URL` follows in WP7.

### WP6: Typed client and the "DB connected" home page (≈1 session)
**Goal:** the running app proves read and write against Supabase and degrades gracefully when it is not configured.

**Steps**
1. Implement `src/env.d.ts`, `src/data/env.ts`, `src/data/supabase.ts`, `src/data/repo/settings.ts`, `src/data/health.ts`, `src/platform/timezone.ts`, `src/components/DbStatusBadge.tsx` and `src/App.tsx` (§6.2 to §6.5).
2. Unit tests: `src/data/__tests__/env.test.ts` and `health.test.ts`, using a fake `SettingsStore` (§12.1).
3. Manual check. Delete the settings row with the secret key (§12.3, M2), then run `npm run dev`. The page must show "DB connected · Settings row created". Reload: it must show "Settings row found". Then run `npm run build` and `npm run preview` without `.env.local`, simulated with a temporary rename: the page must show "Database not configured" and no white screen. Restore `.env.local` immediately.
4. Commits: `feat: add typed Supabase client and settings repository`, `feat: show database connection status on home page`, `test: cover env parsing and database health check`.

**Verification**
- Unit tests pass. CI is green, which proves the build succeeds without env.
- The M1 and M2 manual checks pass.
- No `useEffect` is used for fetching; react-hooks lint is clean.

### WP7: Vercel project, env vars, `vercel.json`, deploy workflow, production deploy (≈1 to 2 sessions)
**Goal:** a publicly reachable production deployment that shows "DB connected", and a `deploy.yml` ready for the Ship stage.

**Preconditions:** the Vercel CLI login is done by the user (§8.1).

**Steps**
1. Write `vercel.json`, `.vercelignore`, `scripts/sync-vercel-env.mjs`, `scripts/ci/redact-log.sh` and `.github/workflows/deploy.yml` (§5.8, §6.6, §9.2). Run actionlint.
2. Follow all of §8.3: create, link, disconnect Git, update settings, disable protection, sync env, run the first prebuilt production deploy, set `PROD_URL`, set the GitHub secrets.
3. Run the CI rehearsal (§8.3), then delete the throwaway clone.
4. Production verification (§12.3): E1 to E5.
5. Commits: `feat: add Vercel configuration with SPA rewrite and privacy headers`, `ci: add production deploy workflow`, `chore: add Vercel env sync script`.

**Verification**
- E1 to E5 pass.
- `v-inspect.json` shows no Git link.
- `v-prot.json` shows SSO protection off.
- `gh secret list` shows `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` and `PROD_URL`.
- `vercel env ls` shows the §5.10 matrix.
- There are no Vercel bot comments on the PR (`gh pr view --comments`).
- `npm run check:leaks` passes.

### WP8: GitHub repo settings (ruleset, CodeQL, presentation) (≈0.5 session)
**Steps**
1. Commit `.github/rulesets/main.json` as `ci: add main branch ruleset definition`.
2. Apply the ruleset, the CodeQL default setup and the description and topics (§8.4).

**CodeQL fallback.** If the default setup PATCH returns 403 or 422 because `main` has no supported language yet, do not add `codeql.yml`. Record the step "enable CodeQL default setup right after merge" in `HANDOFF.md` and in the Ship checklist (§15). Add `.github/workflows/codeql.yml` (advanced setup, `github/codeql-action@v4`, languages `javascript-typescript` and `actions`) **only** if default setup is unavailable altogether, for example because the API says the feature is not available.

**Verification**
- `gh api repos/$R/rulesets` lists "main protection" with `enforcement: active`.
- `gh api repos/$R/rules/branches/main` shows `deletion`, `non_fast_forward`, `pull_request` and `required_status_checks` with the context `verify`.
- The code scanning default setup state is `configured`, or deferred with the reason recorded.
- `gh repo view` shows the description and all 12 topics.

### WP9: Documentation, resume rehearsal, final sweep (≈1 session)
**Steps**
1. CLAUDE.md, second part. **Append** these sections:
   - "Commands": every npm script with a one-line description
   - "Environment variables": the §5.10 table, names only
   - "CI/CD flow": §9.5
   - "Per-WP checklist": the closing ritual
   - "Never print secrets": commands must write secret-bearing output to files; use `envget`-style reads; mask values in docs
2. Rewrite README.md:
   - title and one-line pitch
   - CI badge `![CI](https://github.com/karthi-ai-engineer/Structured/actions/workflows/ci.yml/badge.svg)`
   - features: the planned list, grouped as in PLAN §3, with status
   - tech stack
   - architecture sketch (text)
   - roadmap and status table for Phases 0 to 6
   - local setup: Node 24, `npm ci`, env through `vercel env pull` or `.env.example`, `npm run dev`
   - scripts table
   - project rules (link to CLAUDE.md)
   - a "no login yet" note

   It contains **no app URLs**.
3. `HANDOFF.md`: final status and the updated resume steps (§11, AC-27).
4. **Resume rehearsal:**
   ```bash
   git clone https://github.com/karthi-ai-engineer/Structured.git "$SCRATCH/resume"
   cd "$SCRATCH/resume"
   git switch phase-0-foundation
   npm ci
   npx --yes vercel@61 link --yes --project "$NAME" > /dev/null 2>&1
   npx --yes vercel@61 env pull .env.local --yes > /dev/null 2>&1
   npm run db:link
   npm run verify
   npm run test:integration
   ```
   Compare the `.env.local` key sets and values with the original. Print `KEY: match|differs|missing` only. Then **delete the clone**, because it contains `.env.local`.
5. Final sweep:
   - AC-28 (leaks in files, history and CI logs)
   - AC-29 (no AI attribution)
   - mark the PR ready: `gh pr ready`
   - update the PR body, with a verification summary and no URLs
6. Commits: `docs: add commands and CI/CD flow to contributor guide`, `docs: rewrite README`, `docs: update handoff for phase 0 completion`.

**Verification:** AC-1 to AC-30 below. The Ship stage (merge, deploy run, tag, release) follows separately (§15).

---

## 11. Acceptance criteria

Each criterion says how to test it. "Local" means the Windows machine (Node 26, with the engines warning allowed). "CI" means the `verify` job on the PR (Node 24).

**Scaffold and tooling**
1. **Commands pass everywhere.** `npm ci`, `npm run typecheck`, `npm run lint` (`--max-warnings=0`), `npm run format:check`, `npm run test:coverage` and `npm run build` exit 0 locally, and CI `verify` is green on the PR head commit (`gh pr checks` shows `verify` pass).
2. **Existing docs preserved.**
   - `git diff main -- PLAN.md` is empty.
   - `git diff main -- CLAUDE.md` removes only the placeholder comment line: `git diff main -- CLAUDE.md | grep '^-[^-]'` prints at most that one line.
   - HANDOFF.md and README.md are intentionally updated.
3. **Stack versions.** `npm ls react vite typescript tailwindcss vitest eslint` shows React 19.x, Vite 8.x, TypeScript 6.0.x, Tailwind 4.x, Vitest 5.x and ESLint 10.x.
4. **TypeScript strict.** `npx tsc --showConfig -p tsconfig.app.json` shows `strict: true` and `noUncheckedIndexedAccess: true`, and the output has no `baseUrl`.
5. **Path alias.** `@/*` is present in `tsconfig.json` and `tsconfig.app.json`, and `vite.config.ts` has the `@` alias. The app imports `@/components/ui/button` and the build succeeds.
6. **shadcn/ui initialised.** `components.json` exists with `style: radix-nova` and `tailwind.css: src/styles/index.css`. `src/lib/utils.ts` exports `cn`. `src/components/ui/button.tsx` is rendered by `App.tsx`.
7. **Line endings.** `.gitattributes` exists, and `git ls-files --eol | grep -v 'i/lf' | grep -v 'i/-text'` prints nothing.
8. **Skeleton.** `git ls-files` includes files under `src/core`, `src/data`, `src/features`, `src/components`, `src/platform`, `src/stores`, `server`, `api` and `supabase/migrations`. Every placeholder is a README only, and there are no fake features.
9. **Architecture rules enforced.** The three temporary-file tests from WP2 fail lint with the configured messages.

**Core**
10. **`dates.ts` API.** It exports every function in §6.1 with those signatures, and it imports nothing outside `date-fns` and `@date-fns/tz` (lint plus a visual check).
11. **Date tests.** The tests cover every case listed in §12.1: DST in New York, London and Chatham, midnight in Kolkata, invalid input, and week ranges for week starts 0, 1 and 6. `npm run test:coverage` reports at least 95 % lines, 100 % functions and at least 90 % branches for `src/core`.
12. **TZ guard.** `environment.test.ts` passes, which proves the tests run with `America/St_Johns` as the process zone.

**Database**
13. **Migration applied.** `supabase/migrations/0001_init.sql` exists and contains all 6 tables, 4 indexes, the grants, RLS on 6 tables, 6 `open_access` policies, 3 triggers and the realtime publication line. `npm run db:migrations` shows version `0001` both locally and remotely.
14. **Anon access works.** `npm run test:integration` passes. It proves:
    - (a) anon can select, insert, update and delete, on `templates` with cleanup
    - (b) the `settings` row can be read, or created and then read
    - (c) the `updated_at` trigger bumps the timestamp on update
    - (d) a realtime `UPDATE` event on `settings` arrives within 10 s
    - (e) the secret key works from Node
15. **Types generated.** `src/data/database.types.ts` is generated, contains `Database['public']['Tables']` entries for the 6 tables, and passes typecheck.
16. **Env files.** `.env.local` has all 7 keys (a names-only check; `PROD_URL` after WP7). `git check-ignore -q .env.local` succeeds. `.env.example` lists every key with an empty value.

**App**
17. **Status page states.**
    - Locally with env, the page shows "Structured" and the exact text "DB connected".
    - After the settings row is deleted, it shows "Settings row created" once, then "Settings row found".
    - A build without env shows "Database not configured" and no console exception.
    - `data-state` on `[data-testid=db-status]` matches the state in each case.
18. **Safety checks.** A publishable key starting with `sb_secret_` is rejected by `readSupabaseEnv` (unit test). The UI never renders the Supabase URL (code review plus a test on `DbStatusBadge` props).

**Vercel and production**
19. **Production reachable.** Unauthenticated `curl` to `$PROD_URL/` returns 200 and `$PROD_URL/day/2026-10-01` returns 200 (SPA rewrite). `$PROD_URL/api/not-a-function` returns 404, which proves `/api` is not swallowed. The response headers include `x-robots-tag: noindex, nofollow` and `referrer-policy: no-referrer`.
20. **Production DB check.** In a browser, production shows "DB connected". After the settings row is deleted (M2), the first production load shows "Settings row created", and a secret-key read confirms the row with the browser's timezone. Screenshots must not show the address bar if they are ever committed.
21. **No Git integration.** Vercel has no Git link (`project inspect --json`, or `vercel api /v9/projects/<id>` has no `link`), and `vercel.json` has `git.deploymentEnabled: false`. The PR has no comments from the Vercel bot.
22. **Vercel env matrix.** `vercel env ls` matches §5.10 (names and targets), and `SUPABASE_SECRET_KEY` in production is of type sensitive. A `vercel env pull` in a clean clone reproduces all `.env.local` keys (AC-27).
23. **Protection and Node.** Deployment Protection (Vercel Authentication) is disabled: `project protection --json`. The project's Node version is 24.x and its framework is Vite.

**CI/CD and GitHub**
24. **Workflows.**
    - `ci.yml` and `deploy.yml` pass actionlint.
    - Both declare `permissions: contents: read`.
    - Every action is pinned to a major tag (`@v7`).
    - `ci.yml` has `concurrency` with `cancel-in-progress` and the job name `verify`.
    - `deploy.yml` never echoes a URL. There is no `echo "$PROD_URL"` and all vercel output goes to files; reviewed with `grep -n 'echo' .github/workflows/deploy.yml`.
    - `deploy.yml` starts with the secrets pre-check and ends with the smoke check.
25. **Secrets.** `gh secret list` shows `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` and `PROD_URL`. `VERCEL_TOKEN` is added by the user before Ship.
26. **Ruleset and repo presentation.**
    - The ruleset is active on `~DEFAULT_BRANCH` with deletion, non_fast_forward, pull_request (0 approvals) and required_status_checks (`verify`, integration 15368).
    - The CodeQL default setup is `configured`, or deferred to Ship with the reason in HANDOFF.
    - `.github/dependabot.yml` covers npm and github-actions weekly, with grouped minor and patch updates.
    - The PR template and both issue forms exist.
    - The repo description is set and all 12 topics are present.
    - README has the CI badge, features, stack, roadmap/status table and setup section, and no app URL.

**Handoff and hygiene**
27. **HANDOFF resume steps work.** They are exactly the steps run in the WP9 rehearsal, in order:
    1. Install Node 24 (per `.nvmrc`, for example with `fnm`/`nvm`), Git and gh.
    2. `gh auth login`, then clone.
    3. Repo-local git config (the existing lines).
    4. `npm ci`.
    5. `npx vercel login`, `npx vercel link --yes --project <name from the Vercel dashboard / password manager>`, then `npx vercel env pull .env.local --yes`.
    6. `npx supabase login`, then `npm run db:link`.
    7. `npm run verify` and `npm run dev`, which show "DB connected".
    8. `git switch <branch>` and continue from **Next**.

    The rehearsal passed and reported every key as `match`.
28. **No leaks.** `npm run check:leaks` passes with `.env.local` present, over:
    - tracked files
    - all commit messages on the branch (`git log main..HEAD`)
    - the logs of every CI run on the branch: `for id in $(gh run list -b phase-0-foundation -L 50 --json databaseId -q '.[].databaseId'); do gh run view $id --log | node scripts/check-leaks.mjs --stdin || echo "LEAK in run $id"; done` prints no LEAK line
29. **No AI attribution.**
    - `git log main..HEAD --format='%B' | grep -niE 'co-authored-by|generated with|anthropic|🤖'` prints nothing.
    - The same grep over `gh pr view --json body -q .body`, `gh issue view <n> --json body -q .body` and all PR/issue comments prints nothing.
    - Commit messages do not mention AI tools. Product mentions of "Claude (MCP connector)" in README/PLAN are features, not attribution.
30. **Process.** Every WP produced conventional commits, was pushed, has a ticked checkbox in the tracking issue, and updated `HANDOFF.md`. The PR is marked ready. No dev server or background process is left running.

---

## 12. Test plan

### 12.1 Unit tests (Vitest, run in CI)
`src/core/__tests__/environment.test.ts`:
- `new Date(2026, 0, 1).getTimezoneOffset() === 210`
- `Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/St_Johns'`

`dates.zone.test.ts`, covering `todayIn`, `nowMinutesIn`, `isValidTimeZone` and `zonedDateTimeToInstant`. All expected values were computed with @date-fns/tz and Intl during research.

| Instant (UTC) | Zone | `todayIn` | `nowMinutesIn` |
|---|---|---|---|
| 2026-09-28T18:40Z | Asia/Kolkata | 2026-09-29 | 10 |
| 2026-09-28T18:40Z | America/New_York | 2026-09-28 | 880 |
| 2026-09-28T18:40Z | Pacific/Chatham | 2026-09-29 | 505 |
| 2026-09-28T18:40Z | Europe/London | 2026-09-28 | 1180 |
| 2026-09-28T18:40Z | UTC | 2026-09-28 | 1120 |
| 2026-09-28T18:29:59.999Z | Asia/Kolkata | 2026-09-28 | 1439 (midnight minus 1 ms) |
| 2026-09-28T18:30Z | Asia/Kolkata | 2026-09-29 | 0 (midnight) |
| 2026-03-08T06:59Z / 07:00Z | America/New_York | 2026-03-08 | 119 / 180 (spring forward) |
| 2026-11-01T05:30Z / 06:30Z | America/New_York | 2026-11-01 | 90 / 90 (repeated hour) |
| 2026-03-29T00:59Z / 01:00Z | Europe/London | 2026-03-29 | 59 / 120 |
| 2026-10-25T00:30Z / 01:30Z | Europe/London | 2026-10-25 | 90 / 90 |
| 2026-09-26T13:59Z / 14:00Z | Pacific/Chatham | 2026-09-27 | 164 / 225 (+12:45 → +13:45) |
| 2026-04-04T13:59Z / 14:00Z | Pacific/Chatham | 2026-04-05 | 224 / 165 (+13:45 → +12:45) |
| 2026-12-31T11:00Z | Pacific/Chatham | 2027-01-01 | 45 (year boundary) |

`zonedDateTimeToInstant`:

| Wall time | Zone | Expected instant | Why |
|---|---|---|---|
| 2026-03-08 02:30 | New York | 2026-03-08T07:30:00Z | gap, shifted forward |
| 2026-11-01 01:30 | New York | 2026-11-01T05:30:00Z | ambiguous, earlier |
| 2026-03-29 01:30 | London | 2026-03-29T01:30:00Z | gap |
| 2026-10-25 01:30 | London | 2026-10-25T00:30:00Z | ambiguous, earlier |
| 2026-09-27 03:00 | Chatham | 2026-09-26T14:15:00Z | gap |
| 2026-04-05 03:00 | Chatham | **2026-04-04T13:15:00Z** | ambiguous, earlier. This is the case where TZDate is wrong. |
| 2026-09-29 09:00 | Kolkata | 2026-09-29T03:30:00Z | |

Errors:
- `todayIn('Mars/Olympus')` → RangeError
- `todayIn('UTC', new Date(NaN))` → RangeError
- `isValidTimeZone('')` → false
- `isValidTimeZone('asia/kolkata')` → true
- `zonedDateTimeToInstant('2026-02-30', '09:00', 'UTC')` → RangeError

`dates.time.test.ts`:
- `toMinutes`: '00:00'→0, '09:30'→570, '23:59'→1439, '24:00'→1440, '07:00:00'→420, '23:59:59'→1439. RangeError for:
  - '', '9:30', '24:01', '12:60', 'ab:cd'
  - ' 09:30', '09:30 ', '09:30:60', '-01:00', '0930'
- `fromMinutes`: 0→'00:00', 570→'09:30', 1439→'23:59', 1440→'24:00'. RangeError for −1, 1441, 1.5, NaN and Infinity. Round-trip property for all 0..1440: `toMinutes(fromMinutes(n)) === n`.
- `addMinutesToTime`:
  - '23:30'+60 → {'00:30', 1}
  - '00:15'−30 → {'23:45', −1}
  - '09:00'+0 → {'09:00', 0}
  - '10:00'+2880 → {'10:00', 2}
  - non-integer delta → RangeError
- `isTime` agrees with `toMinutes` validity for all the cases above.

`dates.calendar.test.ts`:
- `isISODate`: accepts '2028-02-29'. Rejects '2026-02-29', '2026-02-30', '2026-13-01', '2026-1-1', '26-01-01', '2026-01-01T00:00' and ''.
- `addDays`:
  - 2026-01-31+1 → 2026-02-01
  - 2028-02-28+1 → 2028-02-29
  - 2026-12-31+1 → 2027-01-01
  - 2026-03-08+1 → 2026-03-09 (DST day; the process zone is St_Johns)
  - 2026-11-01−1 → 2026-10-31
  - +0 → the same date
  - +365
  - errors: invalid date, and 1.5 days
- `diffDays`: (2027-01-01, 2026-12-31) → 1, and it is the inverse of `addDays`.
- `dayOfWeek`: 2026-09-29 → 2 (Tuesday), 2027-01-01 → 5.
- `weekRange` for 2026-09-29:
  - weekStart 1 → 2026-09-28 to 2026-10-04
  - weekStart 0 → 2026-09-27 to 2026-10-03
  - weekStart 6 → 2026-09-26 to 2026-10-02
  - 2027-01-01 with weekStart 1 → 2026-12-28 to 2027-01-03, across the year boundary
  - a date that is itself the week start returns itself as `start`
  - `days` has length 7 and contains consecutive dates
  - `toWeekStart(7)` → RangeError
- `startOfWeek` agrees with `weekRange`.

`dates.format.test.ts`:
- `formatTime`:
  - 570 → '09:30' (24h) and '9:30 AM' (12h)
  - 0 → '00:00' and '12:00 AM'
  - 720 → '12:00 PM'
  - 1439 → '23:59' and '11:59 PM'
  - 1440 → '00:00' and '12:00 AM'
  - RangeError when out of range
- `formatDuration`: 0 '0m', 1 '1m', 45 '45m', 60 '1h', 90 '1h 30m', 1440 '24h'. RangeError for −5 and 2.5.
- `formatDateLabel`: '2026-09-29' → 'Tue, 29 Sep'. With pattern 'd MMMM yyyy' → '29 September 2026'. The result is independent of the process zone.

`src/data/__tests__/env.test.ts`:
- a valid env → ok
- a missing URL or key → problems listing both names
- a non-https URL → a problem (localhost is allowed)
- an `sb_secret_…` key → rejected with the browser-safety message
- a legacy JWT → ok
- messages never contain the value (assert `!message.includes(value)`)

`src/data/__tests__/health.test.ts`, with a fake `SettingsStore`:
- not configured → `not-configured`
- row found → `connected/found`, and insert is not called
- row missing → insert, re-read → `connected/created`
- insert returns `exists` → `connected/found`
- the re-read still finds nothing → `error/write-not-visible`
- read throws 42501 → `error` with code `42501`
- a network `TypeError` → `error/network`
- timeout (`AbortError`/`TimeoutError`) → `error/timeout`
- the error message is sanitised: a URL in the thrown message becomes `[redacted-url]`, and it is truncated to 200 characters

### 12.2 Integration tests (opt-in, `npm run test:integration`, never in CI)
`tests/integration/supabase.test.ts` uses the values from `.env.local`. The suite is skipped with a clear message if the variables are missing.
1. The anon (publishable) client can select `settings` (and upsert id 1 with `ignoreDuplicates` if it is missing).
2. Anon can insert, select, update and delete a `templates` row named `__phase0_smoke__<uuid>`. The row is always removed in `afterAll`.
3. Trigger: read `settings.updated_at`, wait 1.1 s, update `theme` to the same value, then read again. `updated_at` must be later.
4. Realtime: subscribe to `postgres_changes` UPDATE on `public.settings` with the anon client. Wait for `SUBSCRIBED`, update `settings`, and expect the event within 10 s. Then unsubscribe and call `removeAllChannels()`.
5. The secret-key client (Node, not a browser User-Agent) can count rows in `tasks`, and the count is at least 0.
6. Anon cannot violate the checks: inserting a `settings` row with `id = 2` fails with `23514`. This proves the check constraint.

### 12.3 End-to-end and manual
- **M1 (local UI).** `npm run dev` shows "Structured", "DB connected" and "Check again", and the button re-runs the check. Stop the server.
- **M2 (write proof).** Delete the settings row using the secret key, from Node with `process.loadEnvFile` and supabase-js. Load the page: it shows "Settings row created". A secret-key read then shows `timezone` equal to the browser's zone.
- **M3 (unconfigured build).** Build and preview without `.env.local` (renamed temporarily): the page shows "Database not configured" and no white screen.
- **E1 to E4 (production).** Unauthenticated curl checks from AC-19, using `envget PROD_URL` and never printing the URL.
- **E5 (production browser).** Open `$PROD_URL` in Chrome (Claude in Chrome tools, or manually) and read the text of `[data-testid=db-status]`, which must be "DB connected". Repeat M2 against production.
- **E6 (Ship stage).** The `Deploy` run on `main` is green, and its log contains no URL or project name (AC-28 scanner over the run log).

### 12.4 Static checks
- actionlint on both workflows
- `tsc -b`
- ESLint type-aware
- Prettier check
- the leak scanner
- the Supabase advisors in the dashboard (expected: only "RLS policy always true" warnings)

---

## 13. Risks and mitigations

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R1 | TypeScript 7 is `latest` and typescript-eslint rejects it (peer `<6.1`). | High / High | Pin `~6.0.3`. Dependabot ignores TS majors (§9.3). |
| R2 | shadcn CLI behaviour changes (Base UI default, presets, prompts). | Medium / Medium | Pin `shadcn@4.21.0` with explicit `--base radix --preset nova --yes --no-monorepo`, and stdin from `/dev/null`. The trial run succeeded. Record the exact command in the dev log. |
| R3 | Supabase Data API grants are missing, so every call returns 42501. | High without the fix / High | Explicit GRANTs in `0001_init.sql`. Integration test 2 catches a regression. |
| R4 | The new project has no publishable or secret keys (only legacy ones). | Low / Medium | The bootstrap stops with a blocker and dashboard steps. The legacy anon key works technically but is deprecated, so do not use it. |
| R5 | Supabase free-plan limit (2 active projects) or the org choice. | Medium / High | Precondition check. Stop and report; never pause or delete the user's other projects. |
| R6 | `vercel link --yes` auto-connects Git (bot comments, URLs in the public repo) or overwrites `.env.local`. | Medium / High | Back up `.env.local`, `git disconnect`, verify with `project inspect`, and `git.deploymentEnabled: false`. Check the PR for bot comments. |
| R7 | CI logs leak the production URL or project name through Vercel CLI output or curl errors. | Medium / High | All vercel output goes to files; failures print a redacted tail; `::add-mask::` for the host and its first label; `curl -s` without `-S`; secrets are auto-masked; AC-28 scans the logs. |
| R8 | The production domain is not `<name>.vercel.app` (name collision gives a suffixed domain). | Low / Low | Read the domain from `vercel api …/domains`, not from assumptions. The masking derives from `PROD_URL`. |
| R9 | Deployment Protection defaults block the public URL or MCP later. | Medium / Medium | `project protection disable --sso`, verified by unauthenticated curl (AC-19, AC-23). |
| R10 | `deploy.yml` cannot run before it reaches `main`. | Certain / Medium | actionlint, the same commands run locally, the env-var link rehearsal, and the secrets pre-check step. It first runs in Ship, with a quick fix-forward PR if needed. |
| R11 | CodeQL default setup is refused while `main` has only Markdown. | Medium / Low | Retry right after the Ship merge. `codeql.yml` only if the feature is unavailable. |
| R12 | The required check name does not match (`verify`), so the ruleset blocks the Ship merge. | Low / High | Create the ruleset only after `gh pr checks` shows `verify`, with `integration_id` 15368 and strict mode off. The ruleset JSON is in the repo and can be fixed via the API. |
| R13 | Windows specifics: `cmd.exe` npm scripts, CRLF, `TZ` mangling in Git Bash, `vercel build` on Windows. | Medium / Medium | Node wrapper scripts (no shell env expansion), `.gitattributes` plus Prettier `endOfLine: lf`, TZ set inside the vitest config, and a remote-build fallback. |
| R14 | Local Node 26 against engines `24.x`: npm `EBADENGINE` warnings, and subtle runtime differences. | Certain / Low | Warnings are accepted. CI and Vercel run 24. HANDOFF recommends Node 24 (fnm/nvm-windows). |
| R15 | The lockfile misses Linux native optional deps and `npm ci` fails in CI. | Low / Medium | WP1 step 8 grep check, and regenerate if needed. |
| R16 | `TZDate` ambiguity bug (Chatham) leaks into alert times later. | Medium / Medium | Custom resolution with `tzOffset` and explicit Chatham tests. |
| R17 | Secrets reach committed docs or test reports (dev logs, screenshots). | Medium / High | `check:leaks` before every push and in CI. The masking rule is in CLAUDE.md. No address-bar screenshots. Secret scanning and push protection are already on. |
| R18 | Integration tests leave junk or change the real DB. | Low / Low | Only a `templates` row with a unique name, deleted in `afterAll`. Settings updates only touch `theme` with the same value. |
| R19 | Dependabot noise and grouped PRs fail CI. | Medium / Low | Grouped minor and patch updates, a limit of 5, and CI gates them. The owner merges them outside the phase flow. |
| R20 | The realtime test is flaky (connection time). | Medium / Low | Wait for `SUBSCRIBED` before updating, a 10 s timeout, and one retry. Never in CI. |
| R21 | The Supabase CLI does not read `SUPABASE_DB_PASSWORD` from env (new JS rewrite). | Low / Low | `scripts/supabase.mjs` falls back to `--password` in the child argv, which is only in the local process list. |

---

## 14. Open questions for the user (non-blocking)
1. **License.** The repo is public but has no LICENSE, so all rights are reserved by default. Do you want MIT, or to keep it unlicensed? This is not changed in Phase 0 without your say.
2. **Dependabot security updates** are currently disabled. Enable them (`gh api -X PUT repos/…/automated-security-fixes`)? This was not in the granted permissions, so it is left as is.
3. **Local Node.** Install Node 24 through fnm or nvm-windows to match CI and Vercel exactly, or keep Node 26 locally and accept the engines warning?

---

## 15. Ship-stage checklist (after final verification; for reference)
1. The user has added the `VERCEL_TOKEN` repo secret: `gh secret list` shows it (name only).
2. `gh pr ready` (if not already done). `gh pr checks` shows `verify` green, and `gh pr view --json mergeStateStatus` is `CLEAN`.
3. `gh pr merge <n> --merge` (merge commit; keep the branch). The tracking issue closes through `Closes #n`.
4. Watch `Deploy` on `main` (`gh run watch`). It must be green, including the smoke check. Scan its log with `check-leaks --stdin`.
5. If CodeQL default setup was deferred, enable it now (§8.4) and verify it shows `configured`.
6. `git switch main && git pull`, then `git tag -a v0.0.1 -m "Phase 0: Foundation"` and `git push origin v0.0.1`. Then `gh release create v0.0.1 --verify-tag --title "v0.0.1 - Phase 0: Foundation" --notes-file <scratch notes>`. The notes contain no URLs and no AI mentions.
7. Update `HANDOFF.md` on the next phase branch: Phase 1, branch `phase-1-web-mvp` created from `main`, with next steps.
