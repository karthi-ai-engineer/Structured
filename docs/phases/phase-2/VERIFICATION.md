# Phase 2: verification

- **Date:** 2026-10-01
- **Branch:** `phase-2-mcp`
- **Verdict: PASS**, ready to ship as `v0.2.0`

## Delivered
| WP | PR | Issue |
|---|---|---|
| WP1: schedule logic, undo table, connector secret | #17 | #15 |
| WP2: MCP server, 13 tools and 2 prompts (12 code review fixes, round 2 approved) | #18 | #16 |
| WP3: docs, release prep, production check | release prep and release PRs | #19 |

## Evidence
| Check | Result |
|---|---|
| `npm run verify`: typecheck, lint, format, 888 unit tests with `src/core` coverage 99.2 / 96.5 / 100 / 99.7 %, build, repo checks | ✅ |
| `ci-verify` on every PR head before merge | ✅ |
| Unit tests through the official MCP client against an in-memory store (26): every tool, dry run, validation, warnings, undo, secret check, prompts, and one test per review finding | ✅ |
| Live database, `tests/integration/mcp.test.ts`: plan → dry run → create → schedule → move → complete → subtasks → search → undo a move → conflict-aware undo of the creation (keeps the changed tasks, then forced) | ✅ |
| The Vercel-built function run locally against the live database: wrong secret 404, 13 tools and 2 prompts, real `get_context`, dry run writes nothing | ✅ |
| The production endpoint through the MCP client after the deploy | see the release PR |
| No secrets, app URLs or AI attribution in files, commits, PR text or CI logs (`check:leaks`, `check:commits`) | ✅ |

## Notes
- **The live suite** (`npm run test:integration`) failed once during this verification with `network` errors (a request timing out after about 10 s, and a missed realtime event). Two reruns passed fully. It was a connectivity hiccup between this machine and the database, not a code fault. The suite is opt-in and never runs in CI.
- **The "Settings page shows the connector URL" item was dropped on purpose:** it would ship the connector secret in the browser bundle. The URL is built from `.env.local`.
- **Done when (master plan):** "plan my tomorrow" in a Claude client creates tasks live, and `undo_batch` removes them. The server side is verified end to end through the MCP client; the in-app check is the owner's, once the connector is added.
