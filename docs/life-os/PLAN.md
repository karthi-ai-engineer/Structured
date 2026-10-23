# Life OS: plan

Structured plans the day. The Life OS records what actually happened, on every device the owner uses, and turns it into a daily timeline, a weekly overview and insights.

- Branch: `idea-life-os` (from `main` at `v0.3.0`). Phase 4 (Android APK) is on hold.
- Decisions (2026-10-23, owner):
  - **Our own agent** on each device, not a third-party recorder.
  - **Inside Structured:** same repo, database, web app and Claude connector, so "planned versus actual" works from day one.
  - **Record everything that can be captured accurately.**

## 1. What gets recorded

| Signal | How (Windows agent) | Why |
|---|---|---|
| Foreground app and window title | `SetWinEventHook(EVENT_SYSTEM_FOREGROUND)` plus a title-change hook: every switch is caught as it happens, not polled | the core timeline |
| Browser URL and domain (Chrome, Edge, Brave, Firefox) | UI Automation reads the address bar of the foreground browser window | tell YouTube from a work doc |
| Active versus idle | `GetLastInputInfo`: idle after 2 minutes without input (configurable) | breaks and away time |
| Media playing | Windows media sessions (`GlobalSystemMediaTransportControlsSessionManager`) | watching a video with no input is not "away" |
| Calls and meetings | microphone and camera in use, per app (Windows privacy "consent store") plus known meeting apps (Teams, Zoom, Meet, Webex) | meeting time |
| Lock, unlock, sleep, resume, shutdown | session and power notifications | exact start and end of the day |
| Device | name, kind (laptop, phone), platform, owner-given label (home laptop, office laptop) | merge devices |

Phones (Android agent, later): app usage from `UsageStatsManager` (event level: app moved to front or back), screen on and off, calls, notifications count. Needs the "Usage access" permission granted by hand.

## 2. Architecture

```
Windows agent (C#, tray app) ─┐
Android agent (later)        ─┼─▶ Supabase: devices, activity_events ─▶ Web app: Activity screens
Office laptop, phones (later)─┘                                       ─▶ MCP tools: Claude insights
```

- **Agent:** `agents/windows/`, .NET 10, a single-file `.exe` with a tray icon (pause, resume, open the web app, quit) that starts with Windows.
  - It keeps the current span in memory and closes it on every change (app, title, URL, idle, call state).
  - Spans go to a local queue file first, then to Supabase in batches every 30 seconds. Offline, the queue grows and is sent later. Upserts by the agent-made span id, so a retry never duplicates.
  - The open span is re-sent as it grows, so the web app is near live.
  - Config in `%APPDATA%\StructuredAgent\config.json` (database URL and publishable key, device label). Never in the repo.
  - CI builds the `.exe` on `windows-latest` and attaches it to a GitHub Release.
- **Database:** two new tables (section 3), with the usual new-table checklist (`CLAUDE.md`).
- **Web app:** a new "Activity" area: the day timeline, the week overview, and planned versus actual against the Structured tasks.
- **Claude:** new MCP tools (`get_activity`, `get_activity_summary`) so Claude can read the days and give insights. No in-app AI.

## 3. Data model

- `devices`: `id` (uuid, made by the agent), `label`, `kind` (`laptop` | `desktop` | `phone`), `platform`, `agent_version`, `last_seen_at`, `created_at`, `updated_at`.
- `activity_events` (one row per span):
  - `id` (uuid, made by the agent), `device_id`, `started_at`, `ended_at` (timestamptz)
  - `state`: `active` | `idle` | `locked` | `asleep`
  - `app` (process name), `app_name` (friendly name), `title`, `url`, `domain`
  - `in_call` (bool), `media_playing` (bool)
  - `category` (null for now; rules come in L3)
  - `updated_at`; indexes on (`device_id`, `started_at`) and (`started_at`)
- **Size:** about 1,000 to 2,000 spans per device per day. Consecutive spans with the same values are merged by the agent. Free-tier limit (500 MB): raw spans are kept 90 days, older days roll up into `activity_daily` (L3).

## 4. Phases

### Branches: two tracks in parallel
The owner builds the laptop agent at the office and the phone agent at home (the phone is hard to use at the office). Each track has its own branch, and each merges into `idea-life-os` through PRs:

| Branch | Where | Holds |
|---|---|---|
| `idea-life-os` | both | the integration branch: plan, database, web screens |
| `life-os-windows` | office laptop | `agents/windows/` (C#) and its CI build |
| `life-os-android` | home, with the phone | `agents/android/` (Kotlin) and its CI build |

- The agents live in separate folders, so the tracks never conflict.
- **The database comes first** (WP1, on `idea-life-os`): both agents write to the same tables. After it merges, run `git merge idea-life-os` on each track branch to pick it up.
- Switching machines: commit and push the track branch, then on the other machine `git fetch && git switch <branch> && git pull --ff-only`.

### L1: Agents and data
- [ ] WP1 (`idea-life-os`): migration `0009_activity` (`devices`, `activity_events`), types, repo functions
- [ ] WP2 (`life-os-windows`): the Windows agent: foreground and title hooks, idle, lock and sleep, browser URL, media, mic and camera, the local queue and upload, tray icon, autostart; CI builds the `.exe`
- [ ] WP3 (`life-os-android`): the Android agent (native Kotlin): app usage events (`UsageStatsManager`), screen on and off, calls, a background upload worker (WorkManager), the usage-access permission screen; CI builds the APK
- **Done when:** both agents run for a day and every app switch, break and call from the laptop and the phone is in the database.

### L2: Activity screens
- [ ] Day timeline: spans by device, active, idle and calls, top apps and sites
- [ ] Week overview: hours per day, focus, meetings, breaks, distractions
- [ ] Planned versus actual: Structured tasks next to what really happened
- **Done when:** the owner can open a day and see exactly what was done.

### L3: Insights
- [ ] Categories (work, communication, meeting, distraction, break) with editable rules
- [ ] Focus blocks (long work stretches) and distraction counts
- [ ] MCP tools `get_activity` and `get_activity_summary`, and a `weekly_review` prompt for Claude
- [ ] Daily rollups and the 90-day retention

### L4: More devices
- [ ] The agent on the other laptop and the office phone (check IT policy first)
- [ ] One merged timeline across devices

## 5. Open points
- **Privacy:** activity data is far more sensitive than tasks (titles show mail subjects, documents and sites), and the app has no login: its URL is the only protection. Revisit login (`PLAN.md`, "Later: SSO / login") before L2 goes live.
- **Office devices:** company IT policy may forbid installing a tracking agent on the office laptop and phone. Check before L4.
- **Local toolchain:** building the agent locally needs the .NET 10 SDK (installed per user, no admin). CI builds it anyway.
