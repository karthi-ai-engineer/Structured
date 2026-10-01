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

