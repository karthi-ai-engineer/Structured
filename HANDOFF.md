# HANDOFF

> Read this first when resuming on any device. It is updated at the end of every work package, every phase, and before every machine switch.

## Current status
- **Phase:** 0 (Foundation), planning in progress
- **Branch:** `phase-0-foundation`
- **Last updated:** 2026-09-29
- **Pipeline stage reached:** stages 1 and 2 are done and committed:
  - `docs/phases/phase-0/plan-v1.md` (expert plan)
  - `edge-cases-functional.md` (37 items) and `edge-cases-platform.md` (44 items)
  - Stage 3 (replan → `docs/phases/phase-0/PLAN.md`) was running on the first machine.
- **Resume with:** `resumeFrom: "replan"` (if `docs/phases/phase-0/PLAN.md` is committed, use `"review"` instead)
- **Pipeline for Phase 0:** `.claude/workflows/phase-pipeline.js`, with args in `docs/phases/phase-0/pipeline-args.json`
- **Cloud resources created so far:** none. The Supabase and Vercel projects are created during implementation.
- **Already set up:** GitHub repo, `VERCEL_TOKEN` repo secret (Vercel scope "Karthi Labs"), Supabase org "Karthi labs".
- **Next:** finish Phase 0 with the Phase 0 pipeline. Then Phase 1 runs the **team workflow**: `docs/process/TEAM_WORKFLOW.md`, `.claude/workflows/team-pipeline.js`, and `docs/phases/phase-1/pipeline-args.json`.
- **Optional before Phase 1:** run `gh auth refresh -s project` so the pipeline can maintain a GitHub Project board.

## How to continue on another machine
1. Install Node (the version in `.nvmrc` once Phase 0 lands; until then the current LTS or newer), Git, GitHub CLI, and Claude Code.
2. `gh auth login` (account `karthi-ai-engineer`), then `git clone https://github.com/karthi-ai-engineer/Structured.git`, then `cd Structured`.
3. Inside the repo, set the identity and credentials:
   - `git config user.email karthi.ai.engineer@gmail.com`
   - `git config credential.https://github.com.helper ""`
   - `git config --add credential.https://github.com.helper "!gh auth git-credential"`
4. `git switch phase-0-foundation`
5. Log in to the clouds (same accounts as before): `npx supabase login` and `npx vercel login`.
6. Once Phase 0 is done (secrets exist), restore them: `npm ci`, then `npx vercel link` (pick the existing `structured-*` project in "Karthi Labs"), then `npx vercel env pull .env.local`, then `npx supabase link --project-ref <SUPABASE_PROJECT_REF from .env.local>`.
7. Open Claude Code in the repo and say, for example: *"Read HANDOFF.md and CLAUDE.md, then resume the Phase 0 pipeline."* Claude should:
   - take `docs/phases/phase-0/pipeline-args.json`
   - fill in `root` (this clone's absolute path), `today`, `envNotes` (this machine's tools), and `resumeFrom` (from **Current status** above)
   - run `Workflow({ scriptPath: ".claude/workflows/phase-pipeline.js", args: <that JSON> })`

## How we work
See `CLAUDE.md` ("Running a phase") and `PLAN.md` §14. Every phase: branch → tracking issue → pipeline → PR → CI → merge → deploy → release. No AI attribution anywhere.
