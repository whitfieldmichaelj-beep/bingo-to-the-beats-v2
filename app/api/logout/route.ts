import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { revokeCompanionSessions } from "@/lib/companion/session";

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: true, disconnected: true, revoked: 0 });

  const revoked = await revokeCompanionSessions(userId);
  return NextResponse.json({
    ok: true,
    disconnected: true,
    revoked,
    message: "Your local music library is disconnected and is not being shared with anyone through Bingo to the Beats.",
  }, { headers: { "Cache-Control": "no-store" } });
}