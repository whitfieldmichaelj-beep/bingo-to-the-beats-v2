#!/usr/bin/env bash
set -euo pipefail

echo
echo "======================================"
echo "BINGO TO THE BEATS — SAVE CHECKPOINT"
echo "======================================"
echo

if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
  echo "Nothing to save."
  exit 0
fi

echo "Checking for files that should never be committed..."

BLOCKED="$(git status --porcelain | awk '{print $2}' | grep -E '(^|/)\.env($|\.)|(^|/)node_modules/|\.pem$|\.key$|credentials|secret' || true)"

if [ -n "$BLOCKED" ]; then
  echo
  echo "STOPPED: A potentially sensitive file was found:"
  echo "$BLOCKED"
  echo
  echo "No files were staged or committed."
  exit 1
fi

echo "Running full verification..."
npm run verify

echo
echo "Staging tracked changes..."
git add -u

echo "Staging safe new files..."
while IFS= read -r file; do
  [ -z "$file" ] && continue

  case "$file" in
    .env|.env.*|*/.env|*/.env.*|node_modules/*|*/node_modules/*|*.pem|*.key)
      echo "Skipping protected file: $file"
      ;;
    *)
      git add -- "$file"
      ;;
  esac
done < <(git ls-files --others --exclude-standard)

echo
echo "Checking staged changes..."
git diff --cached --check

if git diff --cached --quiet; then
  echo "Nothing staged to save."
  exit 0
fi

echo
echo "Files being saved:"
git diff --cached --stat

echo
echo "Creating checkpoint..."
STAMP="$(date '+%Y-%m-%d %H:%M')"
git commit -m "checkpoint: $STAMP"

echo
echo "Pushing current branch..."
git push

echo
echo "Final status:"
git status -sb

echo
echo "======================================"
echo "SAVE COMPLETE"
echo "======================================"
