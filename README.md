# Structured

![CI](https://github.com/karthi-ai-engineer/Structured/actions/workflows/ci.yml/badge.svg)

A personal visual day planner and work tracker, inspired by the Structured app. The whole day is one colored timeline. Goals turn into scheduled blocks, and focus time is tracked against them. A Claude connector (a remote MCP server) lets Claude read and plan the day.

One codebase serves three surfaces:

- **Web app** (desktop and phone browser, installable as a PWA)
- **Android app** (the same web build, wrapped with Capacitor)
- **MCP server** for Claude (web, desktop, mobile and Claude Code)

It is a single-user app that runs entirely on free tiers, built phase by phase from [`PLAN.md`](PLAN.md).

## Status

**Phase 1 (Web MVP)** makes it a usable planner, on desktop and in a phone browser:
- a Structured-style day timeline with a week strip
- a task editor (a bottom sheet on phones)
- an inbox for undated tasks
- settings with themes
- live sync between devices

**Phase 2** connects Claude: ask it to plan your day, and the tasks appear live in the planner (see [Connect Claude](#connect-claude)). Next is Structured parity (Phase 3). [`HANDOFF.md`](HANDOFF.md) has the live status, and [`CHANGELOG.md`](CHANGELOG.md) lists every release.

| Phase | Scope | Status |
|---|---|---|
| 0. Foundation | Scaffold, database schema, time-zone core, CI/CD, "DB connected" page | Done (`v0.0.1`) |
| 1. Web MVP | Day timeline, task editor, inbox, week strip, realtime sync, themes, settings | Done (`v0.1.0`) |
| 2. MCP server | "Claude plans my day": read and write tools, dry runs, undo by batch | Done; ships as `v0.2.0` |
| 3. Structured parity | Recurring tasks, drag and drop, week and month views, replan, energy monitor, focus mode, alerts, quick add | Next |
| 4. Android APK | Capacitor app, native notifications, APK built by GitHub Actions | Planned |
| 5. Work tracking | Goals with progress and pace, focus logs, stats, daily and weekly reviews | Planned |
| 6. Extras | Web Push, offline write queue, calendar-grid view | Planned |

## Planned features
Grouped as in [`PLAN.md`](PLAN.md) §3. Nothing below exists yet except the foundation; the phase says when it lands.

**Tasks and timeline**
- Day timeline of colored task pills with icons, time ranges, a current-time line and a round check button (Phase 1)
- Task editor: title, date, time, duration, color, icon, subtasks and notes; all-day tasks; an inbox for undated tasks (Phase 1)
- Free-time gaps, overlap warnings, drag to move and resize, inbox-to-timeline drag (Phase 3)
- Recurring tasks with "this / this and future / all" edits, week and month views, replan for missed tasks (Phase 3)
- Natural-language quick add (`Gym tomorrow 7am 1h #health`), icon and color suggestions, search, undo, priorities and due dates (Phase 3)

**Focus, energy and notifications**
- Focus mode with focus/break intervals, and an energy monitor with a daily limit (Phase 3)
- Per-task alerts: desktop notifications (Phase 3) and Android notifications that fire with the app closed (Phase 4)

**Work tracking** (beyond Structured)
- Goals with measurable targets, linked tasks, progress and a pace indicator (Phase 5)
- Logged focus sessions for planned-versus-actual stats, a stats dashboard, daily shutdown and weekly reviews (Phase 5)

**Platform**
- No login: the app opens straight to the timeline (see "No login yet" below)
- Realtime sync between devices, light and dark themes, responsive mobile and desktop layouts (Phase 1)
- Keyboard shortcuts and a command palette, PWA install with an offline read cache, nightly database backup (Phase 3)

**Claude (MCP)**
- A stateless remote MCP server with read tools (schedule, inbox, free slots, goals, stats) and write tools (create, move, complete, delete) (Phase 2)
- Dry-run validation, and every Claude write tagged with a batch ID that can be undone (Phase 2)
- Prompts such as `plan_day`, `replan_overdue`, `weekly_review` and `break_down_goal` (Phases 2 and 5)

Deferred for now: calendar sync, in-app AI, home-screen widgets, login/SSO.

## Connect Claude

The planner includes a remote MCP server, so Claude can read your schedule and plan your day.

1. Build the connector URL from `.env.local`: `PROD_URL` + `/api/mcp/` + `MCP_SECRET`. Keep it private: anyone with the URL can read and change your planner.
2. Add it:
   - **Claude** (web, desktop, mobile): Settings → Connectors → Add custom connector, paste the URL, no authentication.
   - **Claude Code:** `claude mcp add --transport http structured <URL>`
3. Ask, for example, "Plan my tomorrow" (or use the `plan_day` prompt).

Claude shows the plan and asks before writing anything. Every change it makes returns a batch id, and `undo_batch` reverts it. Changes you made in the app since are kept unless you force the undo.

| Tools | |
|---|---|
| Read | `get_context`, `get_schedule`, `list_inbox`, `find_free_slots`, `list_overdue`, `search_tasks` |
| Write | `create_tasks` (with a dry run), `update_task`, `move_tasks`, `set_completion`, `delete_tasks`, `add_subtasks`, `undo_batch` |
| Prompts | `plan_day`, `replan_overdue` |

## Tech stack

| Layer | Choice |
|---|---|
| Language | TypeScript (strict), everywhere |
| Web app | React 19, Vite 8, Tailwind CSS v4, shadcn/ui (Radix), lucide icons |
| Dates | `date-fns` and `@date-fns/tz`, behind one tested module (`src/core/dates.ts`) |
| Database | Supabase: Postgres and Realtime, schema managed with the Supabase CLI |
| Hosting | Vercel (Hobby): the static app now, serverless functions for the MCP server from Phase 2 |
| Android | Capacitor (Phase 4) |
| Tests | Vitest (unit, in CI), opt-in integration tests against the real database |
| CI/CD | GitHub Actions: the `ci-verify` check on every push and PR, production deploys from `main`, CodeQL, Dependabot |

### Architecture

```
  Browser / PWA              Android APK (Capacitor, Phase 4)       Claude clients (Phase 2)
  React SPA                  same React SPA, bundled                "Plan my Thursday"
       │                            │                                      │
       │ supabase-js (REST + Realtime, publishable key)                    │ MCP over HTTP
       ▼                            ▼                                      ▼
  ┌──────────────────────────────────────────┐          ┌──────────────────────────────────┐
  │ Supabase: Postgres + Realtime            │◄─────────│ Vercel: static app + api/ (MCP)  │
  │ open-access policies (single user)       │  secret  │ server-only code in server/      │
  └──────────────────────────────────────────┘   key    └──────────────────────────────────┘
```

The app talks to Supabase directly; there is no custom REST API. Pure domain logic lives in `src/core` and is shared by the app and the MCP server, so both compute schedules the same way. Folder responsibilities and import rules are in [`CLAUDE.md`](CLAUDE.md).

## Local setup

You need Node 24 (see `.nvmrc`), Git and the GitHub CLI. Run the commands in Git Bash on Windows.

```bash
git clone https://github.com/karthi-ai-engineer/Structured.git
cd Structured
npm ci
```

Then provide the environment:

- **Owner:** restore `.env.local` from the Vercel project. The exact, safe sequence (link to the existing project, then `npx --yes vercel@61.1.0 env pull .env.local --yes`) is in [`HANDOFF.md`](HANDOFF.md), "New machine".
- **Anyone else:** copy `.env.example` to `.env.local` and fill it in from your own Supabase project. Apply the schema with the Supabase CLI (`npm run db:link`, then `npm run db:push`).

```bash
npm run env:check   # the 8 keys, status only
npm run dev         # the page shows "Structured" and "DB connected"
```

Without `.env.local` the app still builds and runs, and shows "Database not configured".

### Find the live branch

`main` holds the last release. Work in progress lives on the newest `phase-*` branch:

```bash
git ls-remote --heads https://github.com/karthi-ai-engineer/Structured
```

Clone that branch with `git clone -b <branch> …`. Its `HANDOFF.md` is the live status.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Dev server on port 5173 |
| `npm run build` / `npm run preview` | Production build into `dist/` / serve it on port 4173 |
| `npm run typecheck` | TypeScript project build (`tsc -b`) |
| `npm run lint` | Type-aware ESLint with the architecture rules (0 warnings) |
| `npm run format` / `npm run format:check` | Prettier |
| `npm test` / `npm run test:watch` | Unit tests |
| `npm run test:coverage` | Unit tests with the `src/core` coverage thresholds |
| `npm run test:integration` | Opt-in tests against the real database (needs `.env.local`) |
| `npm run test:e2e` | Opt-in end-to-end tests in Microsoft Edge against the dev server and the real database (needs `.env.local`) |
| `npm run check` | Repo checks: encoding and lockfile hygiene, leaks, commit attribution, plain-Node core |
| `npm run verify` | The local gate before a push: typecheck, lint, format check, tests with coverage, build and the repo checks (what CI runs) |
| `npm run db:push` / `npm run db:migrations` | Apply / list database migrations |
| `npm run db:types` | Regenerate `src/data/database.types.ts` |
| `npm run db:ping` | Is the database reachable (and not paused)? |
| `npm run env:check` / `npm run env:sync-vercel` | Check `.env.local` / compare it with the Vercel env |

The full list, with the CI/CD flow, is in [`CLAUDE.md`](CLAUDE.md).

## How the repo works

- Each phase has a branch, a tracking issue and a PR into `main`. `main` changes only by merging that PR after final verification and a green `ci-verify`, and every merge deploys production. Phase 0 is `v0.0.1`, and phase n is `v0.<n>.0`.
- Conventional commits (`feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`, `refactor:`).
- The repo is public, so secrets, the app's URLs, the Vercel project name and the Supabase project details are never committed; they live in `.env.local`, Vercel and GitHub secrets. Automated checks guard this in CI.
- All rules, commands and conventions: [`CLAUDE.md`](CLAUDE.md). Per-phase plans, dev logs and test reports: [`docs/phases/`](docs/phases). The team process from Phase 1: [`docs/process/TEAM_WORKFLOW.md`](docs/process/TEAM_WORKFLOW.md).

## No login yet

Structured is a personal, single-user app with no login, by design. The database allows open access with the publishable key, so anyone who has the app's URL can use it. That URL is therefore kept private, like a password, and the site asks search engines not to index it. Sign-in (SSO) is planned for later, and the schema is ready for it ([`PLAN.md`](PLAN.md) §14, "Later: SSO / login").

## License

No license has been chosen yet, so all rights are reserved.
