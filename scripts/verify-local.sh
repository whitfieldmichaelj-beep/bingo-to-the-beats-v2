#!/bin/bash
set -euo pipefail

JOIN_CODE="${JOIN_CODE:-NU3C9E}"
BASE_URL="${BASE_URL:-http://localhost:3000}"

run_with_pg_retry() {
  local output
  local status

  output="$(mktemp)"

  set +e
  "$@" 2>&1 | tee "$output"
  status=${PIPESTATUS[0]}
  set -e

  if [ "$status" -eq 0 ]; then
    rm -f "$output"
    return 0
  fi

  if grep -q 'bind message supplies .* parameters, but prepared statement "" requires 0' "$output"; then
    echo
    echo "Transient PostgreSQL connection error detected."
    echo "Retrying this test once automatically..."
    echo
    rm -f "$output"
    sleep 2
    "$@"
    return $?
  fi

  rm -f "$output"
  return "$status"
}

echo
echo "======================================"
echo "BINGO TO THE BEATS — VERIFY"
echo "======================================"
echo "Game code: $JOIN_CODE"
echo

echo "Checking Prisma database..."
if npx prisma dev ls 2>/dev/null | grep -q "default.*not_running"; then
  echo "Starting local Prisma database..."
  npx prisma dev start default
fi

echo "Checking local app..."
if ! curl -fsS "$BASE_URL/join" >/dev/null 2>&1; then
  echo
  echo "ERROR: Bingo to the Beats is not running at $BASE_URL"
  echo
  echo "Start the test server in another Terminal with:"
  echo "npm run dev:test"
  exit 1
fi

echo "PASS  local app reachable"

echo
echo "Running TypeScript check..."
npx tsc --noEmit

echo
echo "Running player enrollment tests..."
run_with_pg_retry env JOIN_CODE="$JOIN_CODE" npm run test:player-enrollment

echo
echo "Running refund tests..."
run_with_pg_retry env JOIN_CODE="$JOIN_CODE" npm run test:purchase-refunds

echo
echo "Running dispute tests..."
run_with_pg_retry env JOIN_CODE="$JOIN_CODE" npm run test:purchase-disputes

echo
echo "Running checkout lifecycle tests..."
run_with_pg_retry env JOIN_CODE="$JOIN_CODE" npm run test:checkout-lifecycle

echo
echo "Checking Git whitespace..."
git diff --check

echo
echo "======================================"
echo "ALL VERIFICATION CHECKS PASSED"
echo "======================================"
