#!/usr/bin/env bash
# Prints a redacted tail of a CLI log (used only on failure). Masks from deploy-prod.sh apply too.
sed -E \
  -e 's#https?://[^[:space:]"<>]+#[redacted-url]#g' \
  -e 's#[A-Za-z0-9.-]+\.vercel\.app#[redacted-host]#g' \
  -e 's#[a-z]{20}\.supabase\.(co|in)#[redacted-host]#g' \
  -e 's#(prj|team)_[A-Za-z0-9]{10,}#[redacted-id]#g' \
  -e 's#[A-Za-z0-9._-]+/structured-[a-z0-9]{6,}#[redacted-scope/project]#g' \
  -e 's#structured-[a-z0-9]{6,}#[redacted-project]#g' \
  "$1" | tail -n 150
