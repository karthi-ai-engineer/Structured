# Phase 3: verification

- **Date:** 2026-10-01
- **Branch:** `phase-3-parity`
- **Verdict: PASS**, ready to ship as `v0.3.0`

## Delivered
| WP | PR | Issue | Review |
|---|---|---|---|
| WP1: repeating tasks and the default day anchors | #24 | #23 | 5 rounds; 14 findings, all fixed |
| WP2: timeline interactions | #26 | #25 | 2 rounds; 6 findings, all fixed |
| WP3: week and month views, and Replan | #28 | #27 | approved; 4 minors, fixed before merge |
| WP4: energy monitor, focus mode and alerts | #30 | #29 | 2 rounds; 8 findings fixed, plus 2 of the 3 later minors |
| WP5: quick add, suggestions, search, undo, duplicate, priority and due date | #32 | #31 | 2 rounds; 9 findings fixed, plus 3 of the 4 later minors |
| WP6: command palette, installable app, offline cache, nightly backup | #34 | #33 | 2 rounds; 8 findings fixed, plus its 3 later minors |

## Evidence
| Check | Result |
|---|---|
| `npm run verify`: typecheck, lint, format, about 1000 unit tests with `src/core` coverage of 99 % lines and 100 % functions, build, repo checks | ✅ |
| `ci-verify` on every PR head before merge | ✅ |
| Live database (`npm run test:integration`, 15 tests): recurring expansion, overrides, "all" edits, splits, weekly rule changes, a moved and renamed occurrence, search and restore, the MCP workflow | ✅ |
| Browser (`npm run test:e2e`, 17 tests in the installed Edge): recurring, timeline drag and drop (touch included), views and Replan, energy, alerts and focus (fake clock), quick add, undo, duplicate, search, the palette, plus the earlier suites | ✅ |
| Installable app (`npm run test:e2e:pwa`): a production build; the manifest and icons are valid, and offline the same tasks show | ✅ |
| Production after the deploy: the smoke check (including the manifest and the service worker) and the connector reading repeating tasks | see the release PR |
| The nightly backup workflow | waits for the owner to set the GitHub secret `SUPABASE_DB_URL` (HANDOFF) |
| No secrets, app URLs or AI attribution in files, commits, PR text or CI logs | ✅ |

## Notes
- **Flaky checks fixed along the way:**
  - the subprocess-heavy CLI and MCP tests got realistic timeouts
  - one e2e locator broke when the "Due date" field arrived
  - the Phase 2 MCP live test needed to ignore the seeded daily defaults; it was broken since WP1, and the suite is opt-in, not in CI
- **Accepted minors** are listed in `DEVLOG.md`:
  - "at 8" means 08:00
  - logged focus times shift by pauses
  - moving a whole series from its first occurrence keeps completed occurrences on their old dates
- **Done when** "it can replace Structured for a full week of daily use": every feature is shipped and tested; the week of use is the owner's check.
