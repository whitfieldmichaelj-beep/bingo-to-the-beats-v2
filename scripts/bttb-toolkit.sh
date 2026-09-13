#!/usr/bin/env bash
set -euo pipefail

case "${1:-}" in

  status)
    echo
    echo "======================================"
    echo "BINGO TO THE BEATS — STATUS"
    echo "======================================"
    git status -sb
    echo
    git log -1 --oneline
    ;;

  serato-check)
    echo
    echo "======================================"
    echo "BINGO TO THE BEATS — SERATO CHECK"
    echo "======================================"
    grep -nEi 'fetch\(|seratoUrl|SeratoResponse|applySeratoTrack|setInterval|poll|trackMatches' \
      app/dj-console/DjConsole.tsx | head -160 || true
    echo
    echo "Relevant Serato logic:"
    sed -n '1080,1225p' app/dj-console/DjConsole.tsx
    ;;

  db-check)
    echo
    echo "======================================"
    echo "BINGO TO THE BEATS — DATABASE CHECK"
    echo "======================================"
    npx prisma validate
    echo
    echo "PASS database schema valid"
    ;;

  stripe-check)
    echo
    echo "======================================"
    echo "BINGO TO THE BEATS — STRIPE CHECK"
    echo "======================================"

    if [ ! -f .env.local ]; then
      echo "FAIL .env.local not found"
      exit 1
    fi

    grep -q '^STRIPE_SECRET_KEY=' .env.local \
      && echo "PASS Stripe secret configured" \
      || echo "FAIL Stripe secret missing"

    grep -q '^STRIPE_WEBHOOK_SECRET=' .env.local \
      && echo "PASS Stripe webhook secret configured" \
      || echo "FAIL Stripe webhook secret missing"

    grep -q '^BTTB_DEV_PAYMENT_BYPASS=false' .env.local \
      && echo "PASS payment bypass disabled" \
      || echo "WARN payment bypass setting is not false"

    echo
    echo "Secrets were not displayed."
    ;;

  deploy-check)
    echo
    echo "======================================"
    echo "BINGO TO THE BEATS — DEPLOY CHECK"
    echo "======================================"
    git status -sb
    echo
    git log -1 --oneline
    echo
    echo "Local repository check complete."
    echo "Vercel deployment status must still be checked from Vercel unless its CLI is installed."
    ;;

  *)
    echo "Usage:"
    echo "  bttb-toolkit.sh status"
    echo "  bttb-toolkit.sh serato-check"
    echo "  bttb-toolkit.sh db-check"
    echo "  bttb-toolkit.sh stripe-check"
    echo "  bttb-toolkit.sh deploy-check"
    exit 1
    ;;
esac
