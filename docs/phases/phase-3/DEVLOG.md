# Phase 3: dev log

## WP1: Recurring tasks and the default day anchors (2026-10-01)

### What was done
- **Rules** (`src/core/recurrence.ts`):
  - An RRULE subset: daily, weekly on chosen weekdays, monthly, yearly; every N; an optional end date.
  - Weekly intervals count Monday-based weeks from the start.
  - Monthly and yearly fall back to the last day of shorter months (31st → 30th or 28th/29th; Feb 29 → Feb 28).
- **Expansion** (`src/core/series.ts`):
  - Series and override rows become occurrences per date range, with the id `<seriesId>:<date>`.
  - An override replaces its occurrence and shows on its own date, unless it is cancelled.
  - Overrides without a live series are dropped.
- **Edit and delete scopes** (`src/core/seriesEdits.ts`, pure):
  - *This task only* writes an override.
  - *This and future* splits the series; from the first occurrence it is the same as *all*.
  - *All* updates the series; shared fields reach existing overrides; a date change shifts the series.
  - A rule change cannot apply to one occurrence. Turning the repeat off applies from this occurrence on.
- **Database** (`0003_recurrence`):
  - `settings.seeded_at`
  - `split_series(series, from, new)`: atomic. It caps the old series, inserts the replacement, moves completed overrides to a new series, and discards the rest.
  - `seed_default_tasks(today, rise, wind)`: runs once, guarded by the marker.
- **App:**
  - The day list expands series.
  - Optimistic cache writes for each kind of recurring write.
  - The editor's Repeat field: presets, custom interval and weekdays, an end date, and a plain-language summary.
  - A scope choice when saving or deleting an occurrence; the repeat icon on timeline rows.
  - The defaults are seeded on the first load.
- **MCP:**
  - Schedule, free slots and overlap warnings include occurrences (shown with `repeats` and `read_only`).
  - Write tools refuse occurrence ids with a clear reason.

### Commands run
- `npm run db:push`, `npm run db:types`, `npm run db:migrations` (0001 to 0003 applied locally and remotely)
- `npm run verify`: 929 unit tests; `src/core` coverage 99.5 / 97.8 / 100 / 99.8 %
- `npm run test:integration`: the new `recurrence.test.ts` covers expansion, complete / move / cancel one occurrence, an "all" rename, a "this and future" split that keeps completed occurrences, delete "future" and "all", and an invalid split refused atomically
- `npm run test:e2e`: the new `recurring.spec.ts` (create daily, complete one day, edit one day only, delete all) plus the whole suite, 10 of 10
- `npx --yes vercel@61.1.0 build --yes`, then the built MCP function called against the live database: the seeded defaults show in `get_schedule` as "Every day"

### Deviations
- **MCP writes on occurrences are refused for now.** Reads include them, so Claude plans around them. Changing them through the connector can come with the Replan work (WP3).
- **"Overdue" and search cover one-off tasks only.** A missed repeat comes back the next day anyway.

### Notes for testers
- Open any occurrence and save a change: the scope choice appears. A rule change offers only "This and future" / "All"; turning the repeat off offers only "This and future".
- "This and future" from the series' first day behaves like "All".
- The defaults appear once per database. Deleting them does not bring them back (the marker stays).
- **E2E:** one full run had 2 failures on time-text assertions that did not reproduce in two full reruns (10 of 10 each). Watch for it in QA.

### Code review, round 1 (PR #24): changes requested; 9 findings, all fixed
- **New scope rules:** "All" changes only the fields the user edited, plus the end date. Date and rule changes are offered as "This and future" only. This fixes:
  - the weekly move: weekdays now shift with the move
  - an edit of a moved occurrence shifting the series: the series is now anchored at the occurrence's own slot
  - duplicates after an "All" date shift: that edit no longer exists
  - a rule anchored to the series start: the new series now starts at the edited occurrence
  - an end-date change wiping the per-day changes: there is no reset for an end date
  - "All" overwriting the per-day values: only the changed fields are sent
- **`0004_series_updates`:**
  - `split_series` takes `p_shift`; completed occurrences move with the new series and take its values
  - the new `update_series` makes "All" one transaction
- **Optimistic split:** the one-off task, or the new series' first occurrence, shows at once.
- **Tests:**
  - every reviewer scenario as a unit test
  - two live-database tests: the "all" rename keeps a moved occurrence's own time; an end-date change keeps a cancelled day; a weekly series moved a day later carries its completed occurrence
  - `npm run verify`: 937 tests

### Code review, round 2: 7 of 9 fixed; 3 and 9 partly; 2 new major issues (moved occurrences under "this and future"); all fixed
- **Root cause:** inferring a series shift from moving one occurrence. It is gone:
  - **Moving an occurrence** to another day is "this task only". The editor explains that moving every future task means changing Repeat (for example to another weekday).
  - **A rule change** ("this and future") starts the new series on the date the user picked.
  - **Without a date change,** the series continues on the occurrence's own slot, and the edited occurrence's own override carries over (`split_series`'s `p_keep`, migration `0005_split_keep`). A moved occurrence stays where it was put.
- **Optimistic split:** it keeps the completed (and kept) occurrences with the new values, and adds the new series' occurrences to every cached day.
- **Live database:** a weekly series moved to Tuesday from a later Monday keeps its Monday history and completion. A moved, renamed monthly occurrence stays on its day, and the pattern continues on the 5th.

### Code review, round 3: findings 3 and 9 to 12 fixed; 1 new major issue; fixed
- **The issue:** a new day plus a new end date with the same rule made the occurrence vanish.
- **The fix:**
  - Daily, monthly and yearly series (whose days follow the start) can move "this and future" on the picked day. This also closes the review's note that a monthly series could not move to another day of the month.
  - Weekly moves stay "this" only.
  - A new day plus a new end date asks for two saves.
  - `planEdit` now throws for any scope `scopesFor` does not offer.
- **The MCP protocol tests** get a 20 s timeout: one timed out once under the full coverage run, and passes alone.

### Code review, round 4: both round-3 items fixed; 1 new major issue; fixed
- **The issue:** "this and future" from a clamped occurrence moved a monthly series on the 31st to the 28th.
- **The fix:** rules may carry `BYMONTHDAY`. A split from a clamped day keeps the series' original day (also Feb 29 for yearly series).
- **Stale scope buttons:** the editor now recomputes the offered scopes live, and ignores a choice that is no longer valid.
- **Known and accepted:** moving a whole series from its first occurrence keeps completed occurrences on their old dates, as history.

## WP2: Timeline interactions (2026-10-01)

### What was done
- **Free time (T8):** rows between tasks inside the day hours, from 15 minutes up.
  - Past free time is hidden today and on past days.
  - A tap opens the editor at that time, with the default duration capped to the gap.
- **Overlaps (T9):** a warning icon on overlapping tasks. The editor shows non-blocking warnings (overlaps, outside the day hours, past midnight) while you plan.
- **Drag (T10):** drag a task's pill to move it, and its bottom edge to resize it, in 5-minute steps. The time labels update live.
  - Mouse: after 4 px.
  - Touch: after a 350 ms long press; a quick swipe still scrolls.
  - A drag on a recurring occurrence changes only that occurrence.
- **Inbox to timeline (T11, desktop):** drag an inbox item onto free time (it starts there) or onto an empty day.

### Commands run
- `npm run verify`
- `npm run test:e2e`:
  - the new `timeline.spec.ts`: free time → add, overlap warnings and icons, drag to move, drag to resize, inbox drag
  - a touch long-press drag in `mobile.spec.ts`
  - the whole suite

### Notes for testers
- **Resize handle:** the small bar at the bottom of each pill.
- **Phone:** press and hold a pill, then drag.
- **Fixed during development:** the resize handle is small, so a fast mouse drag could leave it before the drag started. Mouse and pen pointers are now captured on press.

### Code review, round 1 (PR #26): changes requested; 1 major and 5 minor findings, all fixed
- **Major: a touch drag ended without a click, so the stale "swallow the next click" flag ate the next tap on that task.** Every press now clears the flag. A phone e2e taps after a drag; without the fix it fails, as confirmed.
- **Minor fixes:**
  - a drag that ends where it started changes nothing (a 0-minute task stays 0)
  - a click on the resize strip opens the task
  - a lost pointer capture (rows reordered mid-drag) ends the drag without saving
  - finger movement in any direction cancels a long press
  - inbox drags carry their own data type, so a stale drag never moves a task

## WP3: Week and month views, and Replan (2026-10-01)

### What was done
- **Week view** (`/week/:date`): seven days side by side on desktop, stacked on phones. Each task can be ticked or opened; each day has an add button and links to its day view.
- **Month view** (`/month/:month`): a grid of six full weeks.
  - Desktop shows up to three titles per day, then "+N more"; phones show colored dots.
  - Tap a day to open it.
- **Both views:** arrow keys step back and forward, `t` goes to today, and a Day / Week / Month switch keeps the date.
- **Replan** (`/replan`): unfinished one-off tasks from the last 14 days (`OVERDUE_DAYS`, shared with the MCP tools), grouped by day.
  - Per task: Today (the first free slot that fits), Tomorrow, Inbox, Done, Delete.
  - "Fit all into today" fills today's free time, oldest first, and reports what does not fit.
  - Today's timeline shows a banner when anything is unfinished.
- **Data:**
  - range and overdue lists in the cache, with membership rules in `belongsTo`
  - `listOverdue` in the repository
  - a split's new series shows at once in cached weeks and months too

### Commands run
- `npm run verify`
- `npm run test:e2e`: the new `views.spec.ts` (day → week via the switch, complete from the week, month cell → day; Replan moves yesterday's task to today) and the whole suite

### Notes for testers
- **"Fit all into today"** moves every listed task. The e2e tests use only the per-task Today button, so real overdue tasks are never touched.
- **Repeating tasks** are not listed in Replan: they come back on their own.

### Code review (PR #28): approved, with 4 minor findings, all fixed before merge
- **"Fit all into today":** all-day and 0-minute tasks no longer take a minute of busy time, so later tasks stay on the 5-minute grid.
- **Replan's Today and "Fit all":** they wait until today's plan has loaded, so they never schedule over tasks that are still loading.
- **"Today" on an all-day task:** it moves only the date, with no stray start time.
- **The month grid:** a plain section of links instead of grid roles that promised arrow-key cell navigation.

## WP4: Energy monitor, focus mode and alerts (2026-10-01)

### What was done
- **Energy (E1):**
  - Each task has a level: 🪷 relaxing (−1), ⭕ neutral, 🔥 to 🔥🔥🔥 (1 to 3).
  - Points are level × started half hours (`src/core/energy.ts`).
  - A green, orange or red chip shows used / limit in the day header and on each day of the week view.
  - Settings: on or off, and the daily limit.
  - MCP: `energy` on create and update (undoable), `energy {used, limit}` per day in `get_schedule`, and a warning when a plan goes over the limit.
- **Focus (F1, F2):** `/focus/:id` is a full-screen timer with a progress ring.
  - The intervals (default 25/5) fit the time the task has left.
  - Pause and resume, skip, and mark done; Space pauses and Esc leaves.
  - Each finished segment is logged to `focus_sessions`.
  - Start it from the editor (timed tasks) or from the running task's timer button on the timeline.
- **Alerts (N1, N2):**
  - Per task: at the start, N minutes before, and at the end. The settings hold the defaults.
  - While the app is open, a desktop notification (after "Turn on" in Settings) or an in-app notice.
- **Database:** `0006` makes the series functions carry `energy` and `alerts`. `0007` keeps an empty alert list empty in `update_series`; 0006 turned it into null by mistake, and an applied migration is never edited.

### Commands run
- `npm run db:push`, then `npm run db:types` (no type change) and `npm run db:migrations`
- `npm run verify`: 974 tests; `src/core` coverage 99.4 / 96.6 / 100 / 99.8 %
- `npm run test:e2e`: 15 of 15, including the new `focus.spec.ts`. On Playwright's fake clock it covers:
  - the energy chip
  - the alert at the start, fired as an in-app notice
  - focus: the interval count, pause holding the timer, the break, skip break, and mark done

### Notes for testers
- **Alerts only fire while the app is open.** Background push needs a service worker and is planned with the PWA work in WP6.
- **The e2e cleanup** also deletes focus sessions logged against `__test__` tasks.

### Code review, round 1 (PR #30): changes requested; 1 major and 7 minor findings, all fixed
- **Major: a moved task never alerted again,** because the alert key ignored the time. The key now includes the alert's minute.
- **Minor fixes:**
  - after sleep or a hidden tab, alerts catch up 5 minutes at most (no burst)
  - a new day checks from midnight, so alerts at 00:00 to 00:01 that load late still fire
  - a reload on `/focus/:id` waits for the task instead of showing a finished timer (pinned by e2e)
  - every focus segment logs its real start and end, including the partial segment on Skip, Leave or Mark done
  - an emptied number field in Settings goes back to its value instead of saving 0
  - a 0-minute task alerts once per minute
  - Space pauses only when no button has focus, and focus moves into the focus screen

### Code review, round 2: approved; 2 of its 3 minors fixed before merge
- **A long focus on another day's task:** the timer now watches that day's list, so the list stays cached and the task cannot vanish.
- **A 0-minute task with alerts at both its start and end:** it now says "starts now" (the start wins the shared minute).
- **Accepted:** after a pause, logged segment start times shift by the pause; the lengths stay right.

## WP5: Quick add, suggestions, search, undo, duplicate, priority and due date (2026-10-01)

### What was done
- **Quick add (T15):** `src/core/quickadd.ts` is a small deterministic parser (no new dependency).
  - Dates: today, tomorrow, weekdays, "next friday", "in 3 days", "oct 5", ISO dates.
  - Times: 7am, 19:00, "at 7", noon. Durations: 45m, 1h30, 1.5h.
  - Priority `!high`/`!1` and energy `~2`.
  - The editor shows what it recognised as chips and applies it on blur and on save. The inbox quick add uses it too, and says where the task went.
- **Suggestions (T16):** `src/core/suggest.ts`, a keyword map of about 40 groups onto the app's icons and colors; the latest task with the same title wins.
- **Search (T17):** `/search`, also in the sidebar and tabs, over titles and notes. Repeating series show their next occurrence. The pattern escaping (`src/core/search.ts`) is shared with the MCP server.
- **Undo snackbar (T19):** for delete (`restore` brings back a soft delete, and a cancelled occurrence gets its override back), completion, and moves (drag, resize, Replan, scheduling from the inbox).
- **Duplicate (T22):** the copy opens in the editor right away, so it can go to another day.
- **Priority and due date (T20):**
  - Editor chips and a due date; a flag and a "Due …" badge (red when overdue) on the timeline, week and inbox.
  - MCP `priority`/`due_date` on create and update (undoable).
  - `0008` makes series carry priority.

### Commands run
- `npm run db:push` (0008), `npm run verify` (991 tests), `npm run test:integration` (15), `npm run test:e2e` (16)

### Deviations and fixes found on the way
- **The Phase 2 MCP live test** expected a day's schedule to hold only its own tasks. Since WP1, the seeded daily defaults show on every day, so it now looks at `__test__` tasks only. It was broken from WP1 until now: the suite is opt-in and was not rerun after WP1.
- **e2e:** `getByLabel('Date')` also matched the new "Due date" field; the e2e tests now match it exactly.

