# Phase 1: verification

- **Date:** 2026-09-30
- **Branch:** `phase-1-web-mvp`
- **Verdict: PASS**, ready to ship as `v0.1.0`

## What was delivered
| WP | PR | Issue |
|---|---|---|
| WP1: domain model and data layer | #7 | #6 |
| WP2: planner UI (plus 11 fixes from code review, round 2 approved) | #9 | #8 |
| WP3: live-database and realtime tests, docs | #11 | #10 |

## Evidence
| Check | Result |
|---|---|
| `npm run verify` (typecheck, lint with 0 warnings, format, 847 unit tests with `src/core` coverage 99.6 / 96.7 / 100 / 99.6 %, build, repo checks) | ✅ |
| CI `ci-verify` on every PR head before merge | ✅ |
| `npm run test:integration`, live database: 9/9, including the task repository lifecycle and **realtime insert and update delivered to a second client in under 3 s** | ✅ |
| `npm run test:e2e`, real Microsoft Edge against the dev server and live database: 9/9 | ✅ |
| e2e: create, edit, complete, undo and delete a timed task (checked after a reload) | ✅ |
| e2e: inbox quick add, then schedule for today | ✅ |
| e2e: all-day row | ✅ |
| e2e: week-strip, arrow and keyboard navigation | ✅ |
| e2e: **an edit in one window appears in another without reloading** | ✅ |
| e2e: the 12-hour clock and dark theme apply instantly; arrow keys in option groups | ✅ |
| e2e: day hours save once, on blur | ✅ |
| e2e: editor edge cases from review (cleared date or time, blank duration, unscheduling a completed task) | ✅ |
| e2e: phone layout (bottom tabs, add button, bottom-sheet editor) | ✅ |
| No `__test__` tasks left live after the suites (e2e cleanup runs before and after) | ✅ |
| No secrets, app URLs or AI attribution in files, commits or PR text (`check:leaks`, `check:commits`) | ✅ |

## Done-when check (master `PLAN.md` §14)
- **Plan today, check tasks off and use the inbox on desktop and in a phone browser:** yes (e2e, desktop and Pixel 7 projects).
- **An edit on one device appears on the other within about 1 s:** yes (e2e across two windows; the integration test bounds delivery at under 3 s).

## Deferred
- The "Rise and Shine" and "Wind Down" anchors move to Phase 3 (recurring tasks, T18).
- The bundle is 680 KB (203 KB gzipped). Code splitting comes with the PWA work in Phase 3.
