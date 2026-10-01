# Structured (Personal Clone): Master Plan

> A private, single-user visual day planner and work tracker modeled on the **Structured** app.
> It runs as a **website** (desktop), an **Android APK** (phone), and an **MCP server** so **Claude** can plan your day for you.
> Everything runs on free tiers. This file is the source of truth. Build it phase by phase, top to bottom.

---

## 0. TL;DR

| Question | Answer |
|---|---|
| What are we building? | A clone of Structured (visual timeline, inbox, recurring tasks, energy monitor, focus timer, replan) plus work tracking (goals/targets, time logged, stats) plus an MCP connector for Claude |
| Frontend | React + TypeScript + Vite + Tailwind. One codebase for the website and the APK |
| Backend / DB | **Supabase** (free): Postgres + Realtime sync. **No login**: single user, open access for now. SSO comes later. |
| Hosting | **Vercel** (free Hobby): static site plus a serverless function (`/api/mcp`) |
| Not in scope now | Calendar sync, in-app AI (Structured AI), widgets, login/SSO (see §1 "Deferred") |
| Android | **Capacitor** wraps the same web build into an APK; built for free by **GitHub Actions** |
| Claude integration | Remote MCP server (Streamable HTTP) at `https://<app>.vercel.app/api/mcp/<secret>`, added as a **custom connector** in Claude (web, desktop, mobile) and in Claude Code |
| Cost | ₹0 / $0 |
| Build order | Phase 0 setup → Phase 1 web MVP → Phase 2 MCP → Phase 3 Structured parity → Phase 4 APK → Phase 5 work tracking → Phase 6 extras |

---

## 1. Vision, Goals, Non-Goals

### Vision
One place where the whole day is visible as a timeline, and where a target (e.g. "ship feature X by Friday") turns into scheduled blocks that get tracked to completion. Claude acts as the planner: "Plan my tomorrow around my goals". The app is the source of truth.

### Goals
1. **Structured-level UX**: fast task creation, a beautiful colored timeline, drag and drop, and satisfying completion.
2. **Always in sync** between phone and desktop, with changes appearing live on the other device.
3. **Claude can read and write everything** through MCP: plan days, break goals into tasks, replan missed work, and run weekly reviews.
4. **Work tracking**: goals/targets with progress, focus time logged against tasks and goals, and planned vs. actual stats.
5. **Rapid development**: small phases, and each phase ships something usable.

### Non-goals (for now)
- Multi-user, teams, or sharing. The app is for one person.
- Security hardening. There is no login; see §16 for what that means in practice.
- iOS. Capacitor could add it later with no code changes.
- Play Store publishing. We sideload the APK.

### Deferred (decided 2026-09-29: leave out now, revisit later)
| Deferred item | Why it's easy to add later |
|---|---|
| **Login / SSO** | The schema has no `user_id` yet. Adding it later is one migration plus a policy swap (see §14 "Later: SSO"). |
| **Calendar sync** (Google/Outlook events on the timeline) | Would be a read-only `/api/ics` proxy plus an "events" layer in `schedule.ts`. No schema change to tasks. |
| **In-app AI** (Structured AI style: text/voice → tasks) | **Claude via MCP is the planner.** An in-app assistant could later reuse the same tool layer through the Anthropic API. |
| **Home-screen widgets** | Would need native Android code (Kotlin/Glance) that reads the same Supabase data |

---

## 2. Research: What Structured Is

Structured (by unorderly GmbH) is a visual time-blocking day planner for iOS, Android, Mac, and the web. Pro costs about $6.49/mo, $19.99/yr, or $64.99 lifetime.

### 2.1 Structured feature breakdown

| Area | Structured behavior | Tier |
|---|---|---|
| **Timeline** | Vertical day timeline. Every task is a colored pill with an icon, a time range, and a round check button. The pill length reflects duration. Gaps show free time. | Free |
| **Inbox** | Holds tasks with no date or time ("capture fast, sort later"). Tasks can be dragged into the timeline. | Free |
| **Task fields** | Title, date, start time, duration, color, icon (hundreds), subtasks, notes, alerts | Free |
| **All-day tasks** | A row at the top of the day | Free |
| **Views** | Day timeline; **Week** (days side by side, compressed to icons); **Month** (a calendar grid with task icons) | Free |
| **Drag & drop** | Move tasks on the timeline and between the inbox and the timeline | Free |
| **Focus timer** | Pomodoro timer on the current task. **Intervals** split long tasks into focus and break blocks that fit the time left. | Free / Pro |
| **Recurring tasks** | Custom intervals ("every 2nd Sunday", "every 6 months"). Edit this occurrence or all future ones. | Pro |
| **Calendar & Reminders sync** | Imports external calendar events onto the timeline | Pro (*deferred for us*) |
| **Replan** | Reviews unfinished past tasks. Swipe to complete, delete, reschedule, or push to the inbox. | Pro (not on Android/Web) |
| **Energy Monitor** | Each task gets an energy level: 🪷 relaxing (recharges), ⭕ neutral, 🔥/🔥🔥/🔥🔥🔥 draining. Points accrue per ~30 min. There is a daily limit (default 20; 36–42 recommended). The indicator is green, then orange, then red. | Free (iOS; not Android) |
| **Structured AI** | Text, voice, or scan input becomes tasks. It can create, edit, reschedule, and bulk-delete, drafts a whole day, suggests subtasks, and predicts colors. | Pro (not on Web) (*deferred for us; Claude via MCP replaces it*) |
| **Free-time suggestions** | Detects free gaps and suggests tasks based on history | Free |
| **Notifications** | Custom alerts per task | Free / Pro |
| **Widgets** | Interactive home-screen widgets, including the energy monitor | Free (*deferred for us*) |
| **Defaults** | New users start with "Rise and Shine" (morning) and "Wind Down" (evening) anchor tasks | Free |

### 2.2 Structured's gaps, which our version fixes
| Gap in Structured | Our answer |
|---|---|
| No goals, projects, or targets. It is a planner, not a tracker. | **Goals** with measurable targets, linked tasks, progress, and deadlines |
| Nothing logs actual time spent | Focus sessions are logged, giving **planned vs. actual** stats |
| AI is closed and in-app only, and missing on Web and Android features | **MCP**: *your* Claude (any client) plans with full read/write access |
| Replan and Energy Monitor are missing on Android and Web | Both are built into our shared codebase for every platform |
| No Windows app | The PWA installs as a desktop app; the Android APK covers the phone |
| No insights or reviews | Stats dashboard, daily shutdown review, weekly review (Claude prompt) |

---

## 3. Complete Feature List

Priority tags: **P1** = MVP (Phase 1–2) · **P2** = Structured parity (Phase 3–4) · **P3** = work tracking (Phase 5) · **P4** = extras (Phase 6)

### 3.1 Tasks and timeline
| # | Feature | Pri |
|---|---|---|
| T1 | Create, edit, and delete tasks: title, date, start time, duration, color, icon, notes | P1 |
| T2 | Subtasks (checklist inside a task), shown inline under the task on the timeline | P1 |
| T3 | Complete a task with a round check button, strike-through, and a haptic on the phone | P1 |
| T4 | Day timeline, sorted by time, with color pills, icons, time ranges, and a current-time indicator | P1 |
| T5 | All-day tasks row at the top of the day | P1 |
| T6 | Week strip at the top to switch days; swipe left/right to change day; "Today" button | P1 |
| T7 | **Inbox**: tasks with no date; add, reorder, schedule | P1 |
| T8 | Free-time gaps shown between tasks ("1h 30m free"); tap a gap to add a task there | P2 |
| T9 | Overlap detection with a visual warning | P2 |
| T10 | Drag and drop on the timeline to change time (5-min snap); resize to change duration | P2 |
| T11 | Drag from the inbox onto the timeline (desktop: side panel; mobile: "Schedule" sheet) | P2 |
| T12 | **Recurring tasks**: daily, weekly (chosen weekdays), monthly, yearly, every N days/weeks, optional end date. Edit/delete scope: *this / this and future / all* | P2 |
| T13 | **Week view** (7 columns, icon-compressed) and **Month view** (grid with icons/dots) | P2 |
| T14 | **Replan**: list incomplete past tasks; per task: complete, delete, move to today, move to inbox, pick a date; plus "Move all to today" | P2 |
| T15 | **Quick add with natural language**: `Gym tomorrow 7am 1h #health !high` fills date, time, duration, goal, and priority | P2 |
| T16 | Icon and color **auto-suggest** from the title ("gym"→🏋️, "call"→📞, "meeting"→👥) and from history. This uses a simple keyword map, not AI. | P2 |
| T17 | Search across all tasks (title and notes) | P2 |
| T18 | Default anchors: "Rise and Shine" and "Wind Down" recurring daily at the day's start and end (editable) | P2 |
| T19 | Undo snackbar for delete, complete, and move | P2 |
| T20 | Priority (high/med/low) and **due date** (deadline, separate from the scheduled date) | P2 |
| T21 | Day templates ("Workday", "Weekend") that insert a set of tasks into a day | P3 |
| T22 | Duplicate a task; copy to another day | P2 |

### 3.2 Focus, energy, notifications
| # | Feature | Pri |
|---|---|---|
| F1 | **Focus mode**: full-screen timer for a task, with countdown to the task's end and a progress ring | P2 |
| F2 | **Pomodoro / Intervals**: focus and break cycles (default 25/5) adapted to the task's remaining time | P2 |
| F3 | Focus sessions **logged** (start, end, task, goal): the basis for "actual time" | P3 |
| E1 | **Energy monitor**: per-task energy level and a daily points total vs. limit, shown green/orange/red in the day header | P2 |
| N1 | Alerts per task: at start, N min before, and at end. Defaults come from settings. | P2 |
| N2 | Desktop notifications (browser Notification API while the PWA or tab is open) | P2 |
| N3 | Android native local notifications, scheduled 7 days ahead; they fire even when the app is closed | P2 |
| N4 | Web Push when the browser is closed (Supabase cron + Edge Function + VAPID) | P4 |

### 3.3 Work tracking (beyond Structured)
| # | Feature | Pri |
|---|---|---|
| W1 | **Goals / targets**: title, color, icon, deadline, target type (N tasks, N hours of focus, or manual %), status | P3 |
| W2 | Link tasks to a goal (picker in the editor and `#goal` in quick add); goal detail shows linked tasks and progress | P3 |
| W3 | Progress is computed automatically: completed linked tasks / target, or focused minutes / target | P3 |
| W4 | **Stats dashboard**: completion rate, planned vs. actual hours, time by color/goal, streak, energy trend (per day, week, month) | P3 |
| W5 | **Daily shutdown review**: done vs. not done, replan leftovers, a one-line journal note, and a mood/energy score | P3 |
| W6 | Weekly review: MCP prompt plus in-app summary card | P3 |
| W7 | Goal pace indicator: "On track / Behind: need 3.5h/day to hit the deadline" | P3 |

### 3.4 Platform and system
| # | Feature | Pri |
|---|---|---|
| S1 | **No login**: the app opens straight to the timeline. SSO is deferred. | P1 |
| S2 | **Realtime sync**: a change on any device (or from Claude) appears live everywhere | P1 |
| S3 | Light and dark themes (system default) | P1 |
| S4 | Settings: timezone, 12/24h, week start, day start/end, default duration, default alerts, energy limit, focus lengths | P1/P2 |
| S5 | Responsive layout: mobile (bottom tabs + FAB) and desktop (sidebar + timeline + inbox panel) | P1 |
| S6 | Keyboard shortcuts and command palette (Ctrl+K) on desktop | P2 |
| S7 | PWA: installable on desktop, offline app shell | P2 |
| S8 | Android APK (Capacitor): back button, status bar color, haptics, notifications, app icon, splash | P2 |
| S9 | Offline read cache (last loaded data available offline) | P2 |
| S10 | Offline write queue (edits made offline sync later) | P4 |
| S11 | Nightly DB backup via GitHub Actions (this also keeps Supabase from pausing) | P2 |
| S12 | JSON export/import from Settings | P3 |

*Calendar sync, widgets, in-app AI, and login/SSO are deferred (§1).*

### 3.5 Claude / MCP
| # | Feature | Pri |
|---|---|---|
| M1 | Remote MCP server at `/api/mcp/<secret>`, Streamable HTTP, stateless | P1 (Phase 2) |
| M2 | Read tools: context, schedule, inbox, free slots, search, overdue, goals, stats | P1 |
| M3 | Write tools: bulk create, update, move, complete, delete, subtasks, goals, day notes | P1 |
| M4 | `dry_run` validation (overlaps, energy over limit, outside working hours) before writing | P1 |
| M5 | Every Claude write is tagged with a `batch_id`, and `undo_batch` reverts it | P1 |
| M6 | MCP **prompts**: `plan_day`, `replan_overdue`, `weekly_review`, `break_down_goal` | P1 |
| M7 | Works in Claude.ai web, Claude desktop, the Claude mobile app (once added on web), and Claude Code | P1 |

---

## 4. Architecture

```
            ┌──────────────────────────┐          ┌──────────────────────────────┐
            │ Desktop browser / PWA    │          │ Android APK (Capacitor)       │
            │ React SPA                │          │ same React SPA, bundled       │
            └────────────┬─────────────┘          │ + native plugins (notif,      │
                         │ supabase-js            │   haptics, status bar)        │
                         │ (REST + Realtime WS)   └──────────────┬───────────────┘
                         ▼                                       │ supabase-js
            ┌───────────────────────────────────────────────────▼───────────────┐
            │                    SUPABASE (free tier)                            │
            │  Postgres (tasks, goals, focus_sessions, settings, day_notes)      │
            │  Realtime (live sync) · open-access policies (no login yet)        │
            └───────────────────────────────────▲───────────────────────────────┘
                                                │ secret key (server only)
            ┌───────────────────────────────────┴───────────────────────────────┐
            │                    VERCEL (free Hobby)                             │
            │  Static hosting of the SPA  ·  /api/mcp/[secret]  (MCP server)     │
            └───────────────────────────────────▲───────────────────────────────┘
                                                │ Streamable HTTP (MCP)
            ┌───────────────────────────────────┴───────────────────────────────┐
            │  Claude.ai / Claude Desktop / Claude mobile / Claude Code          │
            │  "Plan my Thursday around the Q4 report goal"                      │
            └────────────────────────────────────────────────────────────────────┘

  GitHub: repo + Actions (build APK artifact, nightly DB backup / keep-alive ping)
```

### 4.1 Key design decisions (and why)
| Decision | Why |
|---|---|
| **The SPA talks to Supabase directly** (no custom REST API) | This removes an entire backend layer, and Realtime gives live sync for free. It is the fastest route to a working app. |
| **No login; single user** | The app opens straight to the timeline. Tables have no `user_id`, and RLS policies allow the public key full access. When SSO is added, one migration adds `user_id` and swaps the policies to `user_id = auth.uid()` (§14 "Later: SSO"). |
| **One codebase for web and APK** (Capacitor bundles the built SPA) | Write the UI once. Bundling (rather than loading the remote URL) makes the app start instantly and allows native notifications and an offline shell. |
| **Shared pure-TS domain core** (`src/core`) used by the UI *and* the MCP server | Recurrence expansion, free slots, energy points, and overlap checks must match exactly between what you see and what Claude sees. Implementing them once prevents drift. |
| **Recurring tasks are virtual** (expanded on read), with **override rows** for edited or completed occurrences | No cron job is needed to materialize future tasks, and "edit this / future / all" semantics stay clean. |
| **Local wall-clock storage** (`date` + `start_time`) plus the user's IANA timezone in settings | A planner thinks in "Tuesday 09:00", not UTC instants. The server (UTC on Vercel) uses the timezone setting to compute "today" and alert times. |
| **Client-generated UUIDs** | Enables optimistic UI (the task appears instantly) and a future offline write queue. |
| **Subtasks stored as `jsonb`** on the task row | For a single user this is simpler than a separate table: one row update, one realtime event, and a trivial copy when a recurring occurrence is materialized. |
| **Stateless MCP on a Vercel function** | The 2026 MCP spec (2026-07-28) is stateless, and `mcp-handler` 2.x serves it natively with a fallback for 2025-era clients. No Redis or session store is needed. |
| **Claude does the "AI"** (via MCP); there is no in-app LLM | This is free with your Claude plan and uses a smarter model with your whole conversation context. |

### 4.2 Alternatives considered
| Option | Verdict |
|---|---|
| Cloudflare Workers + D1 + Pages | Never pauses, and there are great free limits. But realtime sync and a table editor would have to be built by hand. **Kept as a fallback** if Supabase's pause policy becomes annoying. |
| Firebase | A good free tier and realtime, but NoSQL makes stats and range queries clunkier, and no SQL. |
| Next.js | Not needed. The app is a client-side SPA, and Next's server features are not useful inside the APK. Vite is faster and simpler. |
| Flutter / React Native / Kotlin for Android | This would mean two UIs to build. Capacitor reuses 100% of the web UI. |
| TWA (Trusted Web Activity) | Only wraps the live website, which is weaker for notifications and offline use. Capacitor is better. |

### 4.3 Free-tier budget
| Service | Free allowance | Our usage |
|---|---|---|
| Supabase | 500 MB DB, 2 projects, 50k MAU, 2M realtime msgs/mo, 500k edge invocations. **Pauses after 7 days without DB activity.** | Under 10 MB/year. Daily use plus the nightly backup job keep it active. |
| Vercel Hobby | Free for personal, non-commercial use, with generous function invocations | A few hundred MCP calls a day at most |
| GitHub | Free private repos, 2,000 Actions min/mo | APK build is ~5–8 min per build; backup is ~1 min per night |
| Claude | Custom connectors on your Claude plan (the Free plan has a connector limit, so check yours) | 1 connector |

---

## 5. Tech Stack

Use the **latest stable** versions when scaffolding, and verify the majors listed below.

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | Everywhere: UI, core, MCP |
| Build | Vite | `npm create vite@latest` → react-ts |
| UI | React 19 | |
| Styling | Tailwind CSS v4 | CSS variables for the task color palette and themes |
| Components | shadcn/ui (Radix primitives) | Dialog, Sheet (bottom sheets), Popover, DropdownMenu, Command palette, Tabs, Switch, Toast (sonner) |
| Animation | `motion` (Framer Motion) | Check animation, sheet transitions, list reordering |
| Icons | `lucide-react` + emoji | Task icon = lucide icon name *or* an emoji string |
| Routing | React Router (or TanStack Router) | `/`, `/day/:date`, `/week/:date`, `/month/:date`, `/inbox`, `/goals`, `/goals/:id`, `/stats`, `/settings`, `/focus/:taskId` |
| Server state | TanStack Query + `supabase-js` | Optimistic mutations, and the cache is persisted to IndexedDB for offline reads |
| UI state | Zustand | Selected date, open sheets, drag state, focus timer |
| Drag & drop | `@dnd-kit/core` (+ sortable) | Pointer and touch sensors (long-press 250 ms on mobile) |
| Dates | `date-fns` + `@date-fns/tz` | All date math goes through `src/core/dates.ts` |
| Recurrence | `rrule` | RFC 5545 RRULE strings |
| NL parsing | `chrono-node` | Quick-add date and time parsing |
| Validation | `zod` v4 | Shared by forms and MCP tool schemas (mcp-handler 2.x needs zod ≥ 4.2) |
| Backend | Supabase (Postgres 15+, Realtime); Auth is unused until SSO | Supabase CLI for migrations and type generation |
| MCP | `@modelcontextprotocol/server` v2 + `mcp-handler` 2.x | Stateless Streamable HTTP; handles 2026-07-28 and 2025-era clients |
| Hosting | Vercel | Static `dist/` plus `api/` functions (Node 20+) |
| Mobile | Capacitor (latest) + `@capacitor/android` | Plugins: local-notifications, haptics, status-bar, app, splash-screen |
| PWA | `vite-plugin-pwa` | Manifest, icons, service worker (app shell) |
| Charts | Recharts | Stats page |
| Tests | Vitest (core logic) · MCP Inspector (tools) · Playwright (optional smoke) | |
| CI | GitHub Actions | APK build, nightly backup |

---

## 6. Repository Structure

This is a single package (not a monorepo) for speed. Vercel builds the Vite app and auto-detects `api/`.

```
structured/
├── PLAN.md                     ← this file
├── CLAUDE.md                   ← conventions for Claude Code sessions (Phase 0)
├── package.json
├── vite.config.ts
├── tsconfig.json
├── vercel.json                 ← SPA rewrites, function config
├── capacitor.config.ts         ← appId: com.karthi.structured
├── .env.example
├── index.html
├── public/                     ← favicon, PWA icons, manifest assets
│
├── src/
│   ├── main.tsx / App.tsx / routes.tsx
│   ├── core/                   ← PURE TypeScript. No React, no Supabase. Shared with server.
│   │   ├── types.ts            ← Task, Goal, Settings, Occurrence, FocusSession...
│   │   ├── schemas.ts          ← zod schemas (task input, patch, goal...)
│   │   ├── dates.ts            ← tz-aware today/now, parse/format HH:mm, add minutes
│   │   ├── recurrence.ts       ← expandTasks(rows, from, to) → Occurrence[]
│   │   ├── schedule.ts         ← buildDay(): sort, gaps, overlaps, all-day split
│   │   ├── slots.ts            ← findFreeSlots(day, settings, minMinutes)
│   │   ├── energy.ts           ← taskPoints(), dayEnergy(), status(green/orange/red)
│   │   ├── goals.ts            ← progress + pace computation
│   │   ├── stats.ts            ← completion rate, planned vs actual, by color/goal
│   │   ├── quickadd.ts         ← parse "Gym tomorrow 7am 1h #health !high"
│   │   ├── suggest.ts          ← keyword → icon/color map + history-based suggestion
│   │   └── __tests__/          ← Vitest specs for everything above
│   ├── data/
│   │   ├── supabase.ts         ← client
│   │   ├── database.types.ts   ← generated by `supabase gen types`
│   │   ├── repo/               ← tasks.ts, goals.ts, settings.ts, focus.ts (CRUD functions)
│   │   ├── queries/            ← TanStack Query hooks (useDay, useRange, useInbox...)
│   │   └── realtime.ts         ← subscribe to changes → invalidate queries
│   ├── features/
│   │   ├── timeline/  inbox/  task-editor/  week/  month/
│   │   ├── replan/  focus/  energy/  goals/  stats/  review/  settings/  search/
│   ├── components/             ← shared UI (TaskPill, IconPicker, ColorPicker, DurationChips...)
│   ├── components/ui/          ← shadcn generated
│   ├── platform/               ← adapters: notifications.ts, haptics.ts (web vs Capacitor)
│   ├── stores/                 ← zustand stores
│   └── styles/                 ← tailwind entry, tokens
│
├── server/                     ← server-only code (never imported by src/)
│   ├── db.ts                   ← supabase admin client (secret key)
│   └── mcp/
│       ├── server.ts           ← builds the MCP server, registers tools + prompts
│       ├── tools/              ← context.ts, schedule.ts, tasks.ts, goals.ts, stats.ts, notes.ts
│       └── prompts.ts          ← plan_day, replan_overdue, weekly_review, break_down_goal
│
├── api/
│   └── mcp/[secret].ts         ← Vercel function: checks secret → mcp-handler
│
├── supabase/
│   ├── config.toml
│   ├── migrations/             ← 0001_init.sql, 0002_goals.sql, ...
│   └── seed.sql
│
├── android/                    ← generated by `npx cap add android` (committed)
└── .github/workflows/
    ├── android-apk.yml         ← build debug/release APK → downloadable artifact
    └── backup.yml              ← nightly pg_dump → artifact (also keeps DB awake)
```

**Rule:** `src/core` must never import from `src/data`, React, or Supabase. `server/` may import `src/core`. `src/` must never import `server/`.

---

## 7. Data Model (Supabase / Postgres)

### 7.1 Tables

Single user, no login, so no table has a `user_id` column. §14 "Later: SSO" adds it.

```sql
-- 0001_init.sql

create extension if not exists pgcrypto;

-- ───────── settings (exactly one row) ─────────
create table public.settings (
  id               smallint primary key default 1 check (id = 1),
  timezone         text    not null default 'UTC',        -- set from browser on first app open
  time_format      text    not null default '24h' check (time_format in ('12h','24h')),
  week_start       smallint not null default 1,           -- 0=Sun, 1=Mon
  day_start        time    not null default '07:00',
  day_end          time    not null default '22:00',
  default_duration int     not null default 30,
  default_alerts   int[]   not null default '{0}',        -- minutes before start
  energy_enabled   boolean not null default true,
  energy_limit     int     not null default 30,
  focus_minutes    int     not null default 25,
  break_minutes    int     not null default 5,
  theme            text    not null default 'system',
  updated_at       timestamptz not null default now()
);

-- ───────── goals (targets / projects) ─────────
create table public.goals (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  color         text not null default 'blue',
  icon          text,
  target_type   text not null default 'tasks' check (target_type in ('tasks','minutes','percent')),
  target_value  int,                 -- e.g. 20 tasks, 1200 minutes, 100 %
  manual_value  int not null default 0,   -- used when target_type = 'percent'
  start_date    date,
  deadline      date,
  status        text not null default 'active' check (status in ('active','done','archived')),
  sort_order    double precision not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ───────── tasks ─────────
-- One table holds: one-off tasks, inbox tasks, recurring series, and
-- per-occurrence overrides of a series.
--   inbox task       : date IS NULL, repeat_rule IS NULL, series_id IS NULL
--   one-off task     : date NOT NULL, repeat_rule IS NULL, series_id IS NULL
--   recurring series : repeat_rule NOT NULL (date = first occurrence)
--   override         : series_id NOT NULL, occurrence_date NOT NULL
--                      (edited/completed/cancelled single occurrence)
create table public.tasks (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  notes           text,
  icon            text,                     -- lucide name ("dumbbell") or emoji ("🏋️")
  color           text not null default 'coral',
  subtasks        jsonb not null default '[]',   -- [{id, title, done}]
  date            date,                     -- NULL => inbox
  start_time      time,                     -- NULL with date => all-day
  duration_min    int not null default 30 check (duration_min between 0 and 1440),
  is_all_day      boolean not null default false,
  energy          smallint check (energy between -1 and 3), -- -1 relax, 0 neutral, 1-3 drain
  priority        smallint check (priority between 1 and 3), -- 1 high … 3 low
  due_date        date,
  goal_id         uuid references public.goals on delete set null,
  alerts          int[],                    -- NULL => use settings.default_alerts
  -- recurrence
  repeat_rule     text,                     -- RRULE w/o DTSTART, e.g. 'FREQ=WEEKLY;BYDAY=MO,WE,FR'
  repeat_until    date,
  series_id       uuid references public.tasks on delete cascade,
  occurrence_date date,
  is_cancelled    boolean not null default false,
  -- state
  completed_at    timestamptz,
  inbox_order     double precision not null default 0,
  source          text not null default 'app' check (source in ('app','mcp','template','import')),
  batch_id        uuid,                     -- groups a Claude bulk operation (undo)
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,              -- soft delete (undo / restore)
  unique (series_id, occurrence_date)
);
create index tasks_date_idx        on public.tasks (date)          where deleted_at is null;
create index tasks_series_idx      on public.tasks (series_id)     where series_id is not null;
create index tasks_recurring_idx   on public.tasks (date)          where repeat_rule is not null and deleted_at is null;
create index tasks_goal_idx        on public.tasks (goal_id);

-- ───────── focus sessions (actual time log) ─────────
create table public.focus_sessions (
  id          uuid primary key default gen_random_uuid(),
  task_id     uuid references public.tasks on delete set null,
  goal_id     uuid references public.goals on delete set null,
  kind        text not null default 'focus' check (kind in ('focus','break')),
  started_at  timestamptz not null,
  ended_at    timestamptz,
  planned_min int,
  created_at  timestamptz not null default now()
);

-- ───────── day notes (shutdown review / journal) ─────────
create table public.day_notes (
  date       date primary key,
  note       text,
  mood       smallint check (mood between 1 and 5),
  energy     smallint check (energy between 1 and 5),
  reviewed_at timestamptz
);

-- Phase 5
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  items jsonb not null default '[]'   -- [{title, start_time, duration_min, color, icon, energy}]
);
```

### 7.2 Access policies, triggers, realtime
```sql
-- No login for now: RLS is ON (Supabase expects it), but the policy lets the
-- public key read/write everything. SSO later = replace these policies (§14).
alter table public.tasks enable row level security;
create policy "open_access" on public.tasks for all
  to anon, authenticated using (true) with check (true);
-- (repeat for settings, goals, focus_sessions, day_notes, templates)

-- updated_at trigger
create or replace function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger tasks_touch before update on public.tasks
  for each row execute function public.touch_updated_at();
-- (same for goals, settings)

-- Realtime
alter publication supabase_realtime add table public.tasks, public.goals, public.settings, public.day_notes;
```

The web app uses the **publishable key**. The MCP server uses the **secret key**, which stays on Vercel and never ships to the browser.

### 7.3 Fetching a date range (used by both the UI and MCP)
1. **Concrete rows**: `date between :from and :to and series_id is null and repeat_rule is null and deleted_at is null`
2. **Series**: `repeat_rule is not null and date <= :to and (repeat_until is null or repeat_until >= :from) and deleted_at is null`
3. **Overrides**: `series_id in (…series ids) and occurrence_date between :from and :to`
4. **Inbox** (separate query): `date is null and repeat_rule is null and deleted_at is null and completed_at is null`
5. `core/recurrence.expandTasks(series, overrides, from, to)` then returns `Occurrence[]`, merged with concrete rows.

### 7.4 Occurrence identity
- A concrete task's ID is its UUID.
- A virtual recurring occurrence's ID is **`<seriesId>:<YYYY-MM-DD>`** (e.g. `3f2a…:2026-10-02`).
- Completing or editing a virtual occurrence upserts an **override row** (`series_id`, `occurrence_date`, copied fields and subtasks). The UI and MCP accept both ID forms.
- Edit scopes:
  - **this**: upsert the override.
  - **this and future**: set `repeat_until = date - 1` on the old series, then insert a new series starting at `date` with the changes.
  - **all**: update the series row, keeping overrides except for fields the user explicitly changed.
- Deleting "this" sets `is_cancelled = true` on the override.

---

## 8. Core Domain Logic (`src/core`)

Everything here is pure, deterministic, and unit-tested with Vitest. The server and the UI call the same functions.

| Module | Responsibility | Key rules |
|---|---|---|
| `dates.ts` | `todayIn(tz)`, `nowMinutesIn(tz)`, `toMinutes("09:30")`, `fromMinutes(570)`, `addDays`, week ranges honoring `week_start` | Never use `new Date()` for "today" directly; always go through the timezone |
| `recurrence.ts` | `expandTasks(series[], overrides[], from, to)` | Uses `rrule` with DTSTART = series `date` + `start_time`; respects `repeat_until`; applies overrides and drops cancelled ones |
| `schedule.ts` | `buildDay(occurrences, settings, date)` returns `{allDay[], timed[], gaps[], overlaps[], energy}` | Sorts by start; a gap is ≥ 15 min between the end of one task and the start of the next (bounded by day_start/day_end); overlaps are pairs whose intervals intersect |
| `slots.ts` | `findFreeSlots(day, {minMinutes, from?, to?})` | Excludes timed tasks; all-day tasks do not block time |
| `energy.ts` | `taskPoints(task) = level × ceil(duration/30)` (relaxing = −1 × units; neutral = 0); `dayEnergy = max(0, Σ)`; status: `< 80%` green, `80–100%` orange, `> 100%` red | This simplifies Structured's table. Tune later. |
| `goals.ts` | Progress: tasks → completed linked / target; minutes → Σ focus minutes / target; percent → `manual_value`. Pace: remaining ÷ days to deadline | |
| `stats.ts` | For a date range: planned minutes, completed minutes, focus minutes, completion %, by color and goal, streak (consecutive days with ≥ 1 completion or ≥ 80%) | |
| `quickadd.ts` | Parses `Title [date] [time] [duration] [#goal] [!priority] [~energy]` | `chrono-node` for date and time; durations like `1h`, `45m`, `1h30`; `!1`/`!high`; `~3` energy; the leftover text is the title |
| `suggest.ts` | `suggestIcon(title)` and `suggestColor(title, history)` | A ~150-keyword map (gym, run, call, email, meeting, code, read, study, lunch, sleep…) plus "the last task with a similar title used color X" |

### Task color palette (Structured-like)
`coral #FF6B6B · orange #FF9F43 · yellow #FECA57 · green #1DD1A1 · teal #10AC84 · blue #54A0FF · indigo #5F27CD · purple #A55EEA · pink #FF6B9D · gray #8395A7`
Store the **name** in the DB, not the hex, so themes can adjust brightness in dark mode.

---

## 9. UI / UX Specification

### 9.1 Layouts
**Mobile (APK and narrow web)**
```
┌─────────────────────────────┐
│ October 2026        [Today] │  ← month label (tap → month view)
│ M  T  W [T] F  S  S         │  ← week strip, dots = has tasks; swipe = prev/next week
│ ⚡ 22/30  ●●○   [All-day ▾] │  ← energy chip + all-day row
├─────────────────────────────┤
│ 07:00  ( ☀️ )  Rise and Shine      ○ │
│          ┆                         │
│          ┆  1h 30m free  (+)       │  ← gap row (tap to add here)
│ 09:00  ┃💻┃  Deep work: API     ◐ │  ← tall pill = long task, in-progress fill
│ 11:00  ┃  ┃  09:00–11:00 · 2h     │
│          ├ ☐ write endpoints       │  ← subtasks inline
│          ├ ☑ tests                 │
│ ─── 10:12 now ─────────────────    │  ← current time line
│ 13:00  ( 🍽 )  Lunch               ○ │
│ 22:00  ( 🌙 )  Wind Down           ○ │
├─────────────────────────────┤
│  📥 Inbox  🗓 Timeline  🎯 Goals  📊 Stats  ⚙️ │  ← bottom tabs
└─────────────────────────────┘                  (+) FAB bottom-right
```

**Desktop (≥ 1024 px)**
```
┌──────────────┬────────────────────────────────┬──────────────────┐
│ Sidebar      │  Day timeline (same component)  │  Inbox panel     │
│ • Timeline   │  week strip + energy on top     │  quick-add box   │
│ • Week       │                                 │  tasks (drag →   │
│ • Month      │                                 │   onto timeline) │
│ • Goals      │                                 │  ── Overdue (3)  │
│ • Stats      │                                 │  [Replan]        │
│ • Settings   │                                 │                  │
│ mini-month   │                                 │                  │
│ active goals │                                 │                  │
└──────────────┴────────────────────────────────┴──────────────────┘
```

### 9.2 Timeline component rules
- **Compact timeline** (Structured style), not a to-scale calendar grid. Each row has a left time label, a pill, the title and time range, and a check circle on the right.
- **Pill**: 44 px wide. A short task is a circle; the height grows with duration: `h = clamp(44, 44 + (dur − 15) × 0.9, 220)` px. It is filled with the task color and shows the icon centered at the top.
- **Connector line** between pills: dashed when there is a gap. A gap of ≥ 15 min shows "Xh Ym free" and a (+) button.
- **In-progress task**: the pill fills from top to bottom proportional to elapsed time. The check circle shows partial progress.
- **Completed**: the title is struck through at 50% opacity, the circle is filled with the task color, and there is a small bounce with haptics.
- **Overlap**: the time range turns red, with a "⚠ overlaps with X" chip.
- **Drag** (dnd-kit): long-press (mobile) or grab (desktop). The vertical delta maps to minutes at a constant 1 px ≈ 1 min, snapped to 5 min, independent of pill heights. A live time label shows during the drag; dropping saves. A resize handle at the bottom of the pill changes duration (desktop and mobile).
- **Tap** opens the task sheet. **Swipe right** completes; **swipe left** gives delete or move-to-inbox.

### 9.3 Task editor (bottom sheet on mobile, dialog on desktop)
1. Title input (autofocus). Icon and color are auto-suggested live, and the quick-add syntax is parsed as you type.
2. Row: **Icon** button (grid of lucide icons + emoji tab + search) · **Color** swatches (10)
3. **When**: Date (Inbox / Today / Tomorrow / pick) · Start time (wheel on mobile, input on desktop) · All-day toggle
4. **Duration chips**: 1m · 15m · 30m · 45m · 1h · 1.5h · 2h · custom
5. **Repeat**: Never / Daily / Weekdays / Weekly (choose days) / Monthly / Yearly / Custom (every N days/weeks) + Until
6. **Alerts**: At start · 5/10/15/30/60 min before · At end (multi-select)
7. **Energy**: 🪷 ⭕ 🔥 🔥🔥 🔥🔥🔥
8. **Goal** picker · **Priority** · **Due date**
9. **Subtasks** (add, reorder, check) · **Notes** (multiline)
10. Footer: Delete · Duplicate · Start Focus · Save. For a recurring task, choosing Save or Delete opens "This / This and future / All".

### 9.4 Other screens
| Screen | Contents |
|---|---|
| **Inbox** | Quick-add input; list sorted by priority → due date → manual order; swipe to schedule (date/time sheet); "Overdue" section with a Replan button |
| **Week** | 7 columns. Mobile shows compressed icon stacks per day; desktop shows pills with titles. Tap a day to open it. Energy per day in the header. |
| **Month** | Calendar grid; each day shows up to 4 task icons + "+N"; tap to open the day |
| **Replan** | A card stack or list of incomplete past tasks: ✓ Complete · → Today · 📅 Pick date · 📥 Inbox · 🗑 Delete; "Move all to today" |
| **Focus** | Full screen: big ring countdown, task title and icon, subtasks checklist, interval indicator (focus 25 · break 5), pause/stop, +5 min. Logs a `focus_session`. |
| **Goals** | Cards with color, icon, progress bar, deadline, and pace ("Behind: need 2h/day"); detail page lists linked tasks (upcoming and done) and focus time |
| **Stats** | Range switch (Week/Month); planned vs. done hours (bar); completion % (line); time by goal (donut); streak; energy trend |
| **Review** (evening) | Today's done vs. not done → replan leftovers → note + mood → "Close day" |
| **Settings** | Everything in the `settings` table, plus export/import, MCP connection info (URL shown with a copy button), about |
| **Command palette** (desktop, Ctrl+K) | Jump to date, create task (quick-add), search tasks, open goal, toggle theme |

### 9.5 Keyboard shortcuts (desktop)
`N` new task · `Q` quick add · `T` today · `←/→` previous/next day · `W`/`M`/`D` week/month/day view · `I` inbox · `/` search · `Ctrl+K` palette · `F` focus the current task · `Space` complete the selected task · `Del` delete the selected task

---

## 10. MCP Server Specification (Claude integration)

### 10.1 Transport and hosting
- File: `api/mcp/[secret].ts`, a Vercel function wrapping `createMcpHandler` from **mcp-handler 2.x** (built on **@modelcontextprotocol/server v2**).
- **Stateless Streamable HTTP**: natively serves the 2026-07-28 spec (`server/discover`) and falls back to the 2025-era `initialize` flow.
- Uses `server/db.ts` (Supabase admin client) and `src/core/*` for all logic.
- **Every tool is timezone-aware**: it reads `settings.timezone` for "today" and "now".

### 10.2 Access (no login)
- There is no login flow. Claude connects as an **authless connector**. The only protection is a random **secret path segment** in the URL: the function returns 404 unless `params.secret === process.env.MCP_SECRET` (32+ random characters). You paste the URL once and that's it.
  - Why keep it: the MCP server holds the secret database key, so an unguessable URL stops random bots from writing to your planner. It costs nothing.
- **Later, with SSO**: OAuth 2.1 (`withMcpAuth` from mcp-handler with Supabase Auth as the authorization server). Claude supports OAuth with Dynamic Client Registration.

### 10.3 Conventions for all tools
- Dates are `YYYY-MM-DD` and times are `HH:mm` (24h), both in the user's local timezone. Durations are integer minutes.
- Task IDs: a UUID, or `<seriesId>:<date>` for recurring occurrences.
- Every response has two parts: a short **human summary** line followed by **compact JSON**, so Claude can reason over it and quote it.
- Write tools set `source='mcp'` and return a `batch_id`.
- Write tools validate with zod schemas from `src/core/schemas.ts` and return **warnings** (overlap, over the energy limit, outside day hours, in the past) instead of failing.
- Tool descriptions must be written carefully (when to use, example inputs). They are Claude's manual.

### 10.4 Tools

| Tool | Input | Returns | Purpose |
|---|---|---|---|
| `get_context` | none | today, now, weekday, timezone, settings (day start/end, energy limit, defaults), active goals (id, title, progress, deadline), inbox count, overdue count | **Call first.** Grounds Claude in time and preferences. |
| `get_schedule` | `start_date`, `end_date?` (≤ 31 days), `include_completed?` | Per day: all-day, timed tasks (expanded recurring), gaps, overlaps, energy used/limit | See the plan for a day or week |
| `list_inbox` | `goal_id?`, `limit?` | Inbox tasks (priority, due, duration, goal) | Candidates to schedule |
| `find_free_slots` | `date`, `min_minutes?`, `from?`, `to?` | `[{start, end, minutes}]` | Where things fit |
| `list_overdue` | `days_back?` (default 14) | Incomplete past tasks | Replan input |
| `search_tasks` | `query`, `from?`, `to?`, `include_completed?`, `goal_id?` | Matching tasks | Find anything |
| `create_tasks` | `tasks[]` (title, date?, start_time?, duration_min?, all_day?, color?, icon?, notes?, subtasks?[], energy?, priority?, due_date?, goal_id?, repeat?{freq, interval, by_weekday[], until}, alerts?[]), `dry_run?` | Created IDs, `batch_id`, and warnings. When `dry_run` is set, only validation is returned. | Bulk create a plan. Icon and color are auto-suggested if omitted. |
| `update_task` | `id`, `patch{…same fields…}`, `scope?` (`this`\|`future`\|`all`, default `this`) | Updated task + warnings | Edit anything |
| `move_tasks` | `moves[]: {id, date \| null, start_time?}` (null date = to inbox) | Results + warnings + `batch_id` | Reschedule or replan in bulk |
| `set_completion` | `ids[]`, `done` (bool), `subtask?` ({task_id, subtask_id}) | Updated | Check tasks off |
| `delete_tasks` | `ids[]`, `scope?` | Deleted count + `batch_id` (soft delete) | Remove |
| `add_subtasks` | `task_id`, `titles[]` | Task with subtasks | Break down a task |
| `list_goals` | `status?` | Goals with progress, pace, linked task counts | Target tracking |
| `upsert_goal` | `id?`, title, description?, target_type, target_value, deadline, color?, icon?, status? | Goal | Create or edit goals |
| `get_stats` | `start_date`, `end_date` | Planned/completed/focus minutes, completion %, by goal/color, streak | Reviews |
| `write_day_note` | `date`, `note`, `mood?`, `energy?` | Saved | Journal and review |
| `undo_batch` | `batch_id` | What was reverted | Safety net for Claude's changes |

### 10.5 Prompts (show up as slash-commands or templates in Claude clients)
| Prompt | Args | Instruction summary |
|---|---|---|
| `plan_day` | `date` (default tomorrow), `focus?` | Call get_context, get_schedule, list_inbox, list_overdue, and list_goals. Build a time-blocked plan within day hours that respects existing tasks and the energy limit, with deep work early and breaks between blocks. Show it as a table, **ask for confirmation**, then `create_tasks` (dry_run first). |
| `replan_overdue` | none | Group overdue tasks, propose new slots via find_free_slots, confirm, then call `move_tasks` |
| `weekly_review` | `week_of?` | get_stats + get_schedule for the week + goals. Cover wins, misses, and goal pace, then propose next week's top 3 priorities and offer to block time. |
| `break_down_goal` | `goal_id` | Split the goal into concrete tasks with durations and a schedule until the deadline; confirm; create |

### 10.6 Example Claude session
> **You:** Plan tomorrow. I must finish the API integration and go to the gym in the evening.
>
> **Claude:** calls `get_context` → `get_schedule(2026-10-01)` → `list_inbox` → `list_goals`, then shows:
> | Time | Task | ⚡ |
> |---|---|---|
> | 07:00 | Rise and Shine | – |
> | 09:00–11:30 | 💻 API integration: auth + endpoints | 🔥🔥🔥 |
> | 11:30–11:45 | ☕ Break | 🪷 |
> | … | … | … |
> | 18:30–19:30 | 🏋️ Gym | 🔥🔥 |
> "Energy: 27/30. Create these?" → **You:** yes → `create_tasks` → the tasks appear **live** on your phone.

### 10.7 Connecting
- **Claude.ai / Desktop / Mobile**: Settings → Connectors → *Add custom connector* → URL `https://<app>.vercel.app/api/mcp/<MCP_SECRET>`. Once added on the web, it is available in the mobile app too.
- **Claude Code**: `claude mcp add --transport http structured https://<app>.vercel.app/api/mcp/<MCP_SECRET>`
- **Local testing**: `npx @modelcontextprotocol/inspector` pointed at `http://localhost:3000/api/mcp/<secret>` (run with `vercel dev`)
- **Vercel gotcha**: turn **off** Deployment Protection for production (or at least the `/api/mcp` path), or Claude will receive an auth wall.

---

## 11. Android App (Capacitor)

| Step | Detail |
|---|---|
| Init | `npm i @capacitor/core @capacitor/cli @capacitor/android` → `npx cap init "Structured" com.karthi.structured --web-dir=dist` → `npx cap add android` |
| Build loop | `npm run build && npx cap sync android` |
| Plugins | `@capacitor/local-notifications`, `@capacitor/haptics`, `@capacitor/status-bar`, `@capacitor/app` (back button, resume → refetch + reschedule notifications), `@capacitor/splash-screen` |
| Platform adapter | `src/platform/*` checks `Capacitor.isNativePlatform()`, uses native plugins on Android, and falls back to web APIs in the browser |
| Notifications | On data change and on resume: cancel all, then schedule alerts for the next 7 days (Android allows ~500 pending). Needs `POST_NOTIFICATIONS` (Android 13+) and exact alarms (`SCHEDULE_EXACT_ALARM`, Android 12+) for on-time alerts. |
| Icons/splash | `@capacitor/assets` generates them from one 1024×1024 logo |
| Building the APK | **No local Java/Android Studio needed.** The GitHub Action `android-apk.yml` (JDK 21 + Gradle) runs `assembleDebug` (later `assembleRelease` with a keystore stored in repo secrets) and uploads the APK as an artifact. Download it on your phone and install it (allow "Install unknown apps"). |
| Local option | Install Android Studio (bundles a JDK) → `npx cap open android` → Run on a USB-connected phone |
| Updates | For now, reinstall the new APK. Later option: Capacitor live updates (e.g., self-hosted bundle download) so web changes reach the phone without a reinstall. |

---

## 12. Sync, Offline, Notifications

| Concern | Approach |
|---|---|
| Live sync | Supabase Realtime `postgres_changes` on `tasks`, `goals`, `settings`, `day_notes`. Each event invalidates the matching TanStack Query keys. Claude's writes via MCP arrive the same way. |
| Optimistic UI | Mutations update the cache immediately and roll back on error (toast) |
| Offline read | Persist the TanStack Query cache to IndexedDB (`@tanstack/query-async-storage-persister`) |
| Offline write | Phase 6: persisted mutation queue (TanStack `resumePausedMutations`). Client UUIDs make replay safe. |
| Conflicts | Last write wins on `updated_at`. That is fine for a single user. |
| Desktop alerts | In-app scheduler (`setTimeout` to the next alert) + `Notification` API, while the tab or PWA is open |
| Phone alerts | Native local notifications (§11), fired even when the app is closed |
| Closed-browser alerts | Phase 6: Web Push (VAPID) sent by a Supabase `pg_cron` job → Edge Function every minute |

---

## 13. Environment and Setup

### 13.1 Accounts (all free)
1. **GitHub** holds the repo (private) and runs Actions.
2. **Supabase** (sign in with GitHub) hosts the project `structured`. Pick the nearest region (e.g. Mumbai `ap-south-1`).
3. **Vercel** (sign in with GitHub) imports the repo, preset "Vite". Choose a **non-obvious project name**, since the URL is the only thing between the internet and your data (no login).
4. **Claude** is used for the custom connector.

### 13.2 Environment variables
| Var | Where | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | client + server | Project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | client | Public anon/publishable key |
| `SUPABASE_SECRET_KEY` | **server only** (Vercel) | Service-role/secret key for the MCP server |
| `MCP_SECRET` | server | Random 32+ character string in the MCP URL |
| `SUPABASE_DB_URL` | GitHub secret | For the nightly `pg_dump` backup |

### 13.3 Commands
```bash
npm run dev              # Vite dev server (UI)
vercel dev               # UI + /api functions locally (for MCP testing)
npm run test             # Vitest (core logic)
npm run typecheck
npx supabase db push     # apply migrations to the cloud project
npx supabase gen types typescript --project-id <id> > src/data/database.types.ts
npm run build && npx cap sync android   # prepare Android
```

---

## 14. Roadmap: Phases, Tasks, Acceptance Criteria

Each phase ends with something **deployed and usable**. Work in small commits.

### Phase 0: Foundation (size: S)
- [x] `git init`, scaffold Vite React-TS, Tailwind v4, shadcn/ui, ESLint/Prettier, path alias `@/`
- [x] Add `CLAUDE.md` (architecture rules from §6, conventions from §10.3)
- [x] Create the Supabase project, write `0001_init.sql` (§7), `supabase db push`, generate types
- [x] Vercel project, env vars set, SPA rewrite in `vercel.json`. Deploys go through GitHub Actions instead of Vercel's Git integration, so the app URL never appears in the public repo.
- [x] `src/core/dates.ts` + tests
- **Done when:** a blank app deploys to `https://<app>.vercel.app` and can read and write a test row in Supabase.

### Phase 1: Web MVP (size: L)
- [x] First app open: if there is no `settings` row, create it with the browser timezone. The app opens straight to the timeline; there is no login screen. (The "Rise and Shine" and "Wind Down" anchors repeat daily, so they move to Phase 3 with recurring tasks, T18.)
- [x] Data layer: repo functions + query hooks (`useDay`, `useInbox`) + realtime invalidation
- [x] Day timeline (T4, T5) with the TaskPill component, current-time line, completion (T3)
- [x] Week strip navigation and swipe (T6)
- [x] Task editor sheet: title, date, time, duration chips, color, icon picker, subtasks, notes (T1, T2)
- [x] Inbox list with quick add and "schedule" action (T7)
- [x] Responsive shell: mobile bottom tabs + FAB; desktop sidebar + inbox panel (S5)
- [x] Dark/light theme (S3); basic settings page (timezone, 12/24h, day start/end)
- **Done when:** on desktop and phone browser, you can plan today, check tasks off, use the inbox, and an edit on one device appears on the other within about 1 s.

### Phase 2: MCP server, "Claude plans my day" (size: M)
- [x] `server/store.ts` (admin client and task store), `server/mcp/server.ts`, `api/mcp/[secret].ts` with secret check
- [x] Core modules the tools need: `schedule.ts` (free slots, overlaps, warnings), `rows.ts`, `icons.ts` + tests. Recurrence and energy come with their features in Phase 3; the zod schemas live with the tools.
- [x] Tools: get_context, get_schedule, list_inbox, find_free_slots, list_overdue, search_tasks, create_tasks (with dry_run and warnings), update_task, move_tasks, set_completion, delete_tasks, add_subtasks, undo_batch
- [x] Prompts: plan_day, replan_overdue
- [x] Tested with the official MCP client (unit, live database, and the production endpoint). Adding the connector in Claude is the owner's step, with the URL from `.env.local`.
- [x] ~~Settings page shows the connector URL~~ Dropped: it would put the connector secret in the browser bundle. The URL is built from `.env.local` instead (README, "Connect Claude").
- **Done when:** in the Claude app, "plan my tomorrow" creates tasks that appear live on the timeline, and `undo_batch` removes them.

### Phase 3: Structured parity (size: L)
- [x] Recurring tasks, fully: editor UI, virtual occurrences, overrides, this/future/all scopes (T12)
- [x] Gaps + free-time rows + tap-to-add (T8); overlap warnings (T9)
- [x] Drag to move and resize on the timeline; inbox → timeline drag on desktop (T10, T11)
- [x] Week and month views (T13)
- [x] Replan screen (T14)
- [x] Energy monitor: field in the editor + day header chip (E1)
- [x] Focus mode with intervals (F1, F2)
- [x] Alerts in the editor + desktop notifications (N1, N2)
- [x] Quick-add NL parsing, icon and color suggestions (T15, T16)
- [x] Search, undo snackbar, duplicate, priority and due date (T17, T19, T20, T22)
- [x] Command palette + shortcuts (S6); PWA install + offline read cache (S7, S9)
- [x] Nightly backup workflow (S11)
- **Done when:** it can replace Structured for a full week of daily use. (Every feature is shipped and tested; the week of daily use is the owner's check.)

### Phase 4: Android APK (size: M)
- [ ] Capacitor init, Android platform, app icon and splash
- [ ] Platform adapters: haptics, status bar, back button, resume refresh
- [ ] Native local notifications + permission flow (N3)
- [ ] GitHub Action builds the APK artifact; install on the phone
- [ ] Mobile polish: safe areas, 60 fps scrolling, long-press drag, bottom sheets and keyboard handling
- **Done when:** the APK is installed on the phone, sends task alerts with the app closed, and stays in sync with desktop and Claude.

### Phase 5: Work tracking (size: M)
- [ ] `goals` UI: list, detail, create/edit; link tasks (W1, W2); progress and pace (W3, W7)
- [ ] Focus sessions logged (F3); planned vs. actual
- [ ] Stats dashboard (W4)
- [ ] Evening review flow + day notes (W5)
- [ ] Day templates (T21); JSON export/import (S12)
- [ ] MCP: list_goals, upsert_goal, get_stats, write_day_note; prompts weekly_review, break_down_goal (W6)
- **Done when:** you can set a target, have Claude break it down and schedule it, work through it with focus sessions, and see real progress and pace.

### Phase 6: Extras (pick as needed)
- [ ] Web Push for a closed browser (N4)
- [ ] Offline write queue (S10)
- [ ] To-scale calendar grid view on desktop; live-update bundles for the APK

### Later: SSO / login (planned separately when needed)
Steps, so the no-login design doesn't paint us into a corner:
1. Enable a Supabase Auth provider (Google SSO, or email magic link).
2. Migration: `alter table <each table> add column user_id uuid references auth.users default auth.uid();` then backfill with your user ID and set it `not null`. For `settings`, swap the `id = 1` key for `user_id`; for `day_notes`, make the key `(user_id, date)`.
3. Replace every `open_access` policy with `using (user_id = auth.uid()) with check (user_id = auth.uid())`.
4. Add a login screen plus session persistence (`@capacitor/preferences` on Android).
5. MCP: switch the secret URL to OAuth (§10.2), or keep the secret URL and scope queries to your user ID.

### Later: other deferred features
Calendar sync, in-app AI, and widgets (see §1 "Deferred").

---

## 15. Testing Strategy
| Layer | How |
|---|---|
| `src/core` | **Vitest unit tests are mandatory**: recurrence (DST, month ends, weekday rules, until, overrides, cancelled), gaps and overlaps, free slots, energy, quick-add parsing, goal pace |
| Data layer | Manual testing against the Supabase project |
| MCP | MCP Inspector for every tool (valid, invalid, and edge inputs), then real Claude conversations with the prompts |
| UI | Manual checklist per phase on Chrome desktop and the Android phone; optional Playwright smoke test (open → create → complete) |
| APK | Install from the CI artifact on the real device every phase |

---

## 16. Risks and Mitigations
| Risk | Mitigation |
|---|---|
| **No login**: the public key ships inside the web app, so anyone who finds the site URL could read or edit your data | Accepted for now (your call). Use a non-obvious Vercel project name, don't share the URL, and rely on the nightly backups. SSO later closes this (§14). |
| Supabase pauses the free project after 7 inactive days | Daily use, plus the nightly backup action queries the DB. If paused, restore it from the dashboard (data is kept). |
| Timezone bugs (Vercel runs in UTC) | All "today/now" logic lives in `core/dates.ts` with an explicit timezone, and it is tested |
| Recurrence edge cases | Centralized in `core/recurrence.ts` with heavy tests; one implementation shared by the UI and MCP |
| Claude creates a messy plan | `dry_run` + warnings + a confirmation step in the prompts + `undo_batch` |
| MCP spec churn (2025 → 2026-07-28) | `mcp-handler` 2.x handles both eras; keep dependencies updated |
| MCP URL secret leak | Rotate `MCP_SECRET` (a single environment variable change); switch to OAuth together with SSO |
| Android exact-alarm restrictions (late notifications) | Request `SCHEDULE_EXACT_ALARM`; fall back to inexact alarms with a note in settings |
| Drag and drop on touch feels bad | Long-press activation, haptic ticks every 5 min of movement, and a larger hit area |
| Scope creep | Follow the phase order strictly; Phase 6 is optional |

---

## 17. Decisions Log (defaults chosen; change anytime)
| # | Decision | Default |
|---|---|---|
| D1 | App name / Android package | "Structured" / `com.karthi.structured` (rename = 2 config lines) |
| D2 | Timezone | Auto-detected from the browser on first app open |
| D3 | Week start | Monday |
| D4 | Day hours | 07:00–22:00 |
| D5 | Energy limit | 30 points |
| D6 | Focus / break | 25 / 5 min |
| D7 | Supabase region | Closest to you (e.g. Mumbai) |
| D8 | MCP access | Authless connector with a secret URL; OAuth together with SSO later |
| D9 | In-app AI | **Deferred**; Claude via MCP is the planner |
| D10 | Login | **None for now**: single user, open-access policies; SSO planned later (§14) |
| D11 | Calendar sync, widgets | **Deferred** |

### Open questions (not blocking; answer whenever)
1. Which Claude clients will you use most (Claude app on the phone, desktop, Claude Code)? This affects how prompts are tuned.
2. Any fixed daily blocks (office hours, commute) to seed as recurring tasks?

---

## 18. Sources (research)
- Structured official site: https://structured.app/
- App Store listing (features, Pro, AI additions): https://apps.apple.com/us/app/structured-daily-planner-todo/id1499198946
- Google Play listing: https://play.google.com/store/apps/details?id=io.unorderly.structured
- Getting started (tasks, inbox, recurring, subtasks, alerts): https://help.structured.app/en/articles/380546
- Energy Monitor (levels, points, limits): https://help.structured.app/en/articles/998530
- Structured 4.0 (week/month views, AI edits): https://structured.app/blog/4-0
- Replan: https://structured.app/blog/replan · https://help.structured.app/en/articles/1990594
- Focus timer: https://help.structured.app/en/articles/331010
- Structured AI: https://help.structured.app/en/articles/1782402
- Alternatives and weaknesses: https://temporal.day/blog/best-structured-alternatives-2026
- Claude custom connectors (remote MCP): https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp
- mcp-handler 2.0 / MCP 2026-07-28 spec support: https://vercel.com/changelog/latest-mcp-spec-now-supported-in-mcp-handler · https://github.com/vercel-labs/mcp-handler
- Deploying Claude connectors (Vercel/Cloudflare gotchas): https://sunpeak.ai/blogs/deploying-claude-connectors/
- Supabase free tier limits 2026: https://uibakery.io/blog/supabase-pricing
