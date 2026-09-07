#!/bin/bash
set -euo pipefail

echo
echo "======================================"
echo "BINGO TO THE BEATS — CHECKPOINT"
echo "======================================"

npm run verify

if ! git diff --cached --quiet; then
  echo
  echo "ERROR: There are already staged changes."
  echo "Checkpoint stopped so nothing is committed accidentally."
  git status -sb
  exit 1
fi

UNTRACKED="$(git ls-files --others --exclude-standard)"

if [ -n "$UNTRACKED" ]; then
  echo
  echo "ERROR: Untracked files were found:"
  echo "$UNTRACKED"
  echo
  echo "Checkpoint stopped so they can be reviewed first."
  exit 1
fi

CHANGED="$(git diff --name-only)"

if [ -z "$CHANGED" ]; then
  echo
  echo "No changes to checkpoint."
  git status -sb
  exit 0
fi

echo
echo "Files that changed:"
echo "$CHANGED"
echo

while IFS= read -r file; do
  [ -n "$file" ] && git add -- "$file"
done <<< "$CHANGED"

git diff --cached --check

echo
git diff --cached --stat
echo

read -r -p "Commit message: " MESSAGE

if [ -z "$MESSAGE" ]; then
  echo "Checkpoint cancelled: commit message cannot be empty."
  git restore --staged .
  exit 1
fi

read -r -p "Commit and push these changes? [y/N] " CONFIRM

case "$CONFIRM" in
  y|Y|yes|YES)
    ;;
  *)
    echo "Checkpoint cancelled."
    git restore --staged .
    exit 0
    ;;
esac

BRANCH="$(git branch --show-current)"

git commit -m "$MESSAGE"
git push origin "$BRANCH"

echo
echo "Final status:"
git status -sb

echo
echo "======================================"
echo "CHECKPOINT COMPLETE"
echo "======================================"
