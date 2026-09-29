# HANDOFF

> Read this first when resuming on any device. It is updated at the end of every work package, every phase, and before every machine switch.

## Current status
- **Phase:** 0 (Foundation), planning in progress
- **Branch:** `phase-0-foundation`
- **Last updated:** 2026-09-29
- **Pipeline stage reached:** stage 1 (expert plan) is done: `docs/phases/phase-0/plan-v1.md`. Stage 2 (edge-case research) is running.
- **Resume with:** `resumeFrom: "edge"` (updated again before this machine shuts down)
- **Cloud resources created so far:** none. The Supabase and Vercel projects are created during implementation.
- **Already set up:** GitHub repo, `VERCEL_TOKEN` repo secret (Vercel scope "Karthi Labs"), Supabase org "Karthi labs".
- **Next:** continue the Phase 0 pipeline from the stage above.

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
