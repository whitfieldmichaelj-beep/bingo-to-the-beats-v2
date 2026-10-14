import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashCompanionToken } from "@/lib/companion/session";

export async function POST(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  const token = value.startsWith("Bearer ") ? value.slice(7).trim() : "";
  if (!token) return NextResponse.json({ ok: false, error: "Pairing token required." }, { status: 401 });

  const result = await prisma.companionSession.updateMany({
    where: { tokenHash: hashCompanionToken(token), isActive: true },
    data: { isActive: false, revokedAt: new Date() },
  });

  return NextResponse.json({
    ok: true,
    disconnected: true,
    revoked: result.count,
    message: "This computer's music library is disconnected and is not being shared with Bingo to the Beats.",
  });
}