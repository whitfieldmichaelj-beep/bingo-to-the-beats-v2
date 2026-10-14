#!/bin/bash
set -u
cd "$(dirname "$0")" || exit 1
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
printf "\033]0;BTTB Remote Rehearsal — keep open\007"
node scripts/start-remote-rehearsal.mjs --share
status=$?
if [ "$status" -ne 0 ]; then read -r -p "Press Return to close. " _; fi
exit "$status"
