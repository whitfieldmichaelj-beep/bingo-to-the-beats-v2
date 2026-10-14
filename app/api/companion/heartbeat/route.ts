import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCompanionToken } from "@/lib/companion/session";

function bearer(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : "";
}

export async function POST(request: NextRequest) {
  const token = bearer(request);
  if (!token) return NextResponse.json({ ok: false, error: "Pairing token required." }, { status: 401 });

  const session = await verifyCompanionToken(token);
  if (!session) {
    return NextResponse.json({ ok: false, disconnected: true, error: "Companion pairing expired or was revoked." }, { status: 401 });
  }

  await prisma.companionSession.update({
    where: { id: session.id },
    data: { lastHeartbeatAt: new Date() },
  });
  return NextResponse.json({ ok: true, connected: true });
}