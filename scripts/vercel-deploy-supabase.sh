#!/usr/bin/env bash
set -euo pipefail

# Vercel deploys preview branches too. Only production/main is allowed to mutate
# the shared Supabase project.
if [[ "${VERCEL_ENV:-}" != "production" ]]; then
  echo "Skipping Supabase migrations: VERCEL_ENV=${VERCEL_ENV:-unset}."
  exit 0
fi

if [[ -n "${VERCEL_GIT_COMMIT_REF:-}" && "${VERCEL_GIT_COMMIT_REF}" != "main" ]]; then
  echo "Skipping Supabase migrations: production deploy is not from main (${VERCEL_GIT_COMMIT_REF})."
  exit 0
fi

PROJECT_REF="${SUPABASE_PROJECT_ID:-${SUPABASE_PROJECT_REF:-}}"

missing=0
for name in SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required Vercel environment variable: ${name}" >&2
    missing=1
  fi
done
if [[ -z "$PROJECT_REF" ]]; then
  echo "Missing required Vercel environment variable: SUPABASE_PROJECT_ID (or SUPABASE_PROJECT_REF)." >&2
  missing=1
fi
if [[ "$missing" -ne 0 ]]; then
  exit 1
fi

CLI="npx --yes supabase@2.116.0"

echo "Linking Supabase project ${PROJECT_REF}..."
$CLI link --project-ref "$PROJECT_REF"

echo "Current migration status:"
$CLI migration list

echo "Dry-running pending migrations..."
$CLI db push --dry-run

echo "Applying pending migrations..."
$CLI db push

echo "Migration status after deploy:"
$CLI migration list
