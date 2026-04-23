#!/bin/bash
set -e
pnpm install --frozen-lockfile
pnpm --filter db push

# Sync to GitHub automatically after each merge
if [ -n "$GITHUB_TOKEN" ]; then
  CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
  if [ "$CURRENT_BRANCH" != "main" ]; then
    echo "GitHub sync skipped: current branch is '$CURRENT_BRANCH', not 'main'."
  else
    echo "Syncing to GitHub..."
    git config user.email "replit-agent@users.noreply.github.com" 2>/dev/null || true
    git config user.name "Replit Agent" 2>/dev/null || true
    # Use an inline credential helper so the token is never written to disk.
    # Fetching first updates the remote-tracking ref so --force-with-lease works correctly.
    GIT_CRED="!f() { echo username=x-access-token; echo password=${GITHUB_TOKEN}; }; f"
    if git -c "credential.helper=${GIT_CRED}" fetch origin main 2>/dev/null && \
       git -c "credential.helper=${GIT_CRED}" push origin HEAD:main --force-with-lease; then
      echo "GitHub sync complete."
    else
      echo "ERROR: GitHub sync failed — push was rejected. Check token permissions or remote conflicts." >&2
      exit 1
    fi
  fi
else
  echo "GITHUB_TOKEN not set — skipping GitHub sync."
fi
