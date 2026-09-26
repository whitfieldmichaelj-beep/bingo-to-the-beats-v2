import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// An identity/safety check only: no database, filesystem, credentials or user data.
export function GET() {
  if (process.env.BTTB_PRIVATE_BETA !== "1") return new NextResponse(null, { status: 404 });
  const safe = process.env.NODE_ENV === "development" && process.env.BTTB_PHONE_TEST === "1" &&
    process.env.BTTB_HOST_SUBSCRIPTIONS_ENABLED === "false" && process.env.BTTB_DEV_PAYMENT_BYPASS === "false" &&
    process.env.STRIPE_SECRET_KEY === "sk_test_bttb_private_beta_no_charges" &&
    /^[a-f0-9]{32}$/.test(process.env.BTTB_BETA_RUN_ID || "");
  if (!safe) return new NextResponse(null, { status: 503 });
  return NextResponse.json({ kind: "bttb-local-private-beta-v1", runId: process.env.BTTB_BETA_RUN_ID, noLiveCharges: true },
    { headers: { "Cache-Control": "no-store" } });
}
