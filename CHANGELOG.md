# Changelog

All notable changes, per release. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow the roadmap phases (Phase 0 is `v0.0.1`, and Phase n is `v0.n.0`).

## [0.1.0] - 2026-09-30: Phase 1, Web MVP

### Added
- **Day timeline:**
  - colored pills sized by duration, with icons, time ranges and subtask counts
  - an all-day row and a live current-time line
  - an in-progress fill and check circles to complete tasks
- **Week strip:** tap, arrows, swipe, and keyboard navigation (`←`/`→`, `t` today, `n` new task). Plus `/day/YYYY-MM-DD` URLs.
- **Task editor:** a dialog on desktop, a slide-up bottom sheet on phones.
  - title, icon (47 icons or any emoji), 10 colors
  - scheduled or inbox, date, start time, all-day, duration chips or a custom value
  - subtasks, notes and delete
- **Inbox:** quick add with Enter, one-tap "schedule for today", complete.
- **Settings:** time zone, 12/24-hour clock, week start, day hours, default duration, theme (system, light, dark), database status. Changes save instantly and sync to every device.
- **Responsive shell:** bottom tabs and a floating add button on phones; a sidebar and inbox panel on desktop.
- **Live sync:** changes from any device appear on the others within about a second (Supabase Realtime).
- **Optimistic updates:** every change shows instantly and rolls back with a notice if the save fails. Closing the tab while a change is saving asks first.
- **Tests:**
  - an end-to-end suite in Microsoft Edge against the live database (`npm run test:e2e`), including realtime between two windows
  - live-database tests for the task repository and realtime
  - 847 unit tests

### Fixed (code review before merge)
- Clearing the date or time in the editor no longer moves a task to the inbox or saves it without a time.
- Quick consecutive check-offs no longer flicker, and a failed write can no longer undo a newer one.
- A failed background refresh no longer replaces a loaded day with an error screen.
- An invalid stored time zone or start time no longer crashes the app, and a crash inside one screen keeps navigation usable.
- Day hours save once, on blur. Option groups support the arrow keys. The error notices region is announced by screen readers.
- Unscheduling a completed task reopens it in the inbox instead of hiding it.

### Changed
- The default "Rise and Shine" and "Wind Down" anchors move to Phase 3, together with recurring tasks.

## [0.0.1] - 2026-09-30: Phase 0, Foundation

### Added
- Vite, React 19, strict TypeScript, Tailwind CSS v4 and shadcn/ui, with lint-enforced architecture rules.
- A time-zone core (`src/core/dates.ts`) with 320 tests.
- The full Supabase schema (tasks, goals, focus sessions, settings, day notes, templates) with realtime, and a "DB connected" home page.
- CI on every push and PR; production deploys through GitHub Actions with a smoke check; CodeQL; Dependabot; a protected `main`.

[0.1.0]: https://github.com/karthi-ai-engineer/Structured/compare/v0.0.1...v0.1.0
[0.0.1]: https://github.com/karthi-ai-engineer/Structured/releases/tag/v0.0.1
