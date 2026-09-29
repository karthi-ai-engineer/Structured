# HANDOFF

> Read this first when resuming on any device. It is updated at the end of every work package and every phase.

## Current status
- **Phase:** 0 (Foundation), in progress
- **Branch:** `phase-0-foundation`
- **Last updated:** 2026-09-29
- **Done:** master plan (`PLAN.md`), repo rules (`CLAUDE.md`), GitHub repo linked
- **Next:** run the Phase 0 pipeline: scaffold, Supabase project, Vercel project, CI/CD workflows

## How we work
Each phase runs these steps in order:
1. Expert plan
2. Edge-case research
3. Replan
4. Systems-design review loop
5. Implementation, one work package at a time
6. Test round 1 (QA)
7. Test round 2 (adversarial)
8. Final verification
9. PR to `main`, merge, release

Details are in `CLAUDE.md`, `PLAN.md` §14, and `docs/phases/`.

## Resume on a new machine
1. Install Node (version in `.nvmrc` once Phase 0 lands), Git, and GitHub CLI.
2. `gh auth login` (account `karthi-ai-engineer`), then `git clone https://github.com/karthi-ai-engineer/Structured.git`
3. Inside the repo, set the identity and credentials:
   - `git config user.email karthi.ai.engineer@gmail.com`
   - `git config credential.https://github.com.helper ""`
   - `git config --add credential.https://github.com.helper "!gh auth git-credential"`
4. `npm ci`
5. Secrets: `npx vercel login`, then `npx vercel link` (pick the existing project), then `npx vercel env pull .env.local`
6. `npx supabase login`, then `npx supabase link --project-ref <SUPABASE_PROJECT_REF from .env.local>`
7. `git checkout <branch above>` and continue from **Next**.

Steps 4–6 work once Phase 0 is complete.
