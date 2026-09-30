#!/usr/bin/env bash
# Production deploy shared by .github/workflows/deploy.yml (Linux) and local runs (Git Bash).
# Never prints URLs, IDs, keys or the Vercel project name: CLI output goes to files and only a
# redacted tail is shown on failure.
set -euo pipefail

VERCEL_CLI_PIN="vercel@61.1.0"   # keep identical in deploy.yml and scripts/lib/vercel.mjs (check:hygiene)
VERCEL="${VERCEL_BIN:-npx --yes $VERCEL_CLI_PIN}"
VERCEL_BUILD="${VERCEL_BUILD_BIN:-$VERCEL}"          # rehearsal only: build with an empty global config
LOG_DIR="${DEPLOY_LOG_DIR:-${RUNNER_TEMP:-$(mktemp -d)}}"
mkdir -p "$LOG_DIR"
export VERCEL_TELEMETRY_DISABLED=1

in_ci() { [ "${GITHUB_ACTIONS:-}" = "true" ]; }
mask() { if in_ci && [ -n "${1:-}" ]; then echo "::add-mask::$1"; fi; }
fail() {
  if in_ci; then echo "::error::$1"; else echo "error: $1" >&2; fi
  if [ -n "${2:-}" ] && [ -f "$2" ]; then bash scripts/ci/redact-log.sh "$2"; fi
  exit 1
}

token="${VERCEL_TOKEN:-}"; unset VERCEL_TOKEN          # the build step never sees the token (P24)
auth=(); if [ -n "$token" ]; then auth=(--token="$token"); fi
expected_sha="${EXPECTED_SHA:-$(git rev-parse HEAD)}"

if in_ci; then
  [ -n "$token" ] || fail "VERCEL_TOKEN is not set"
  [ -n "${VERCEL_ORG_ID:-}" ] && [ -n "${VERCEL_PROJECT_ID:-}" ] || fail "VERCEL_ORG_ID or VERCEL_PROJECT_ID is not set"
  [ -n "${PROD_URL:-}" ] || fail "PROD_URL is not set"
else
  # Never let the CLI take its "new project" path (it would create a project and connect Git).
  [ -f .vercel/project.json ] || [ -n "${VERCEL_PROJECT_ID:-}" ] || fail "not linked: follow the Vercel link step in HANDOFF.md"
  [ -z "$(git status --porcelain)" ] || echo "warning: uncommitted changes; build-sha will still say $expected_sha"
fi

# 1. Authentication
$VERCEL whoami "${auth[@]}" > "$LOG_DIR/vercel-whoami.log" 2>&1 \
  || fail "Vercel authentication failed: the token is invalid or expired; create a new token and update the VERCEL_TOKEN secret"

# 2. Production settings and environment
$VERCEL pull --yes --environment=production "${auth[@]}" > "$LOG_DIR/vercel-pull.log" 2>&1 \
  || fail "vercel pull failed" "$LOG_DIR/vercel-pull.log"
mask "$(node -e "try{process.stdout.write(require('./.vercel/project.json').projectName||'')}catch{}")"
env_file=.vercel/.env.production.local
sb_url="$(node scripts/lib/env-file.mjs get "$env_file" VITE_SUPABASE_URL || true)"
sb_key="$(node scripts/lib/env-file.mjs get "$env_file" VITE_SUPABASE_PUBLISHABLE_KEY || true)"
mask "$sb_url"; mask "${sb_url#https://}"; mask "$sb_key"
[ -n "$sb_url" ] && [ -n "$sb_key" ] \
  || fail "the production env from vercel pull lacks VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY (store them as Config)"

# 3. Build (dependencies are already installed; production env is validated by vite.config.ts)
VERCEL_INSTALL_COMPLETED=1 REQUIRE_SUPABASE_ENV=1 VITE_BUILD_SHA="$expected_sha" \
  $VERCEL_BUILD build --prod --yes > "$LOG_DIR/vercel-build.log" 2>&1 \
  || fail "vercel build failed" "$LOG_DIR/vercel-build.log"

# 4. The bundle must contain the exact configured values (supabase-js itself contains the bare
#    literals 'sb_publishable_' and 'supabase.co', so a pattern grep would prove nothing).
assets=.vercel/output/static/assets
grep -rqF -- "$sb_key" "$assets" || fail "bundle does not contain the configured publishable key"
grep -rqF -- "${sb_url#https://}" "$assets" || fail "bundle does not contain the configured Supabase host"
echo "Bundle check passed."

# 5. Deploy the prebuilt output to production
$VERCEL deploy --prebuilt --prod "${auth[@]}" > "$LOG_DIR/vercel-deploy.out" 2> "$LOG_DIR/vercel-deploy.err" \
  || fail "vercel deploy failed" "$LOG_DIR/vercel-deploy.err"
echo "Deployed to production (URL intentionally not printed)."

# 6. Smoke check (build SHA, routes, headers, live database probe)
if [ -z "${PROD_URL:-}" ]; then
  echo "PROD_URL is not set: smoke check skipped (allowed only for the very first local deploy)."
  exit 0
fi
EXPECTED_SHA="$expected_sha" SUPABASE_ENV_FILE="$env_file" node scripts/ci/smoke.mjs
