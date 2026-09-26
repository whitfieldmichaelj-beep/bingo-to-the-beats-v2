#!/bin/bash
# Local project launcher, not a downloaded installer. No sudo or dependency install.
set -u
SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  case "$SOURCE" in /*) ;; *) SOURCE="$DIR/$SOURCE" ;; esac
done
cd -P "$(dirname "$SOURCE")" || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js was not found. Ask the BTTB operator to complete this Mac's setup."
  read -r -p "Press Return to close. " _
  exit 1
fi
node scripts/start-private-beta.mjs "$@"
status=$?
if [ "$status" -ne 0 ]; then read -r -p "Press Return to close. " _; fi
exit "$status"
