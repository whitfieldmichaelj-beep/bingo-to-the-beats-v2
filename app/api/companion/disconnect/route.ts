import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashCompanionToken } from "@/lib/companion/session";

export async function POST(request: NextRequest) {
  const value = request.headers.get("authorization") || "";
  const token = value.startsWith("Bearer ") ? value.slice(7).trim() : "";
  if (!token) return NextResponse.json({ ok: false, error: "Pairing token required." }, { status: 401 });

  const session = await prisma.companionSession.findUnique({
    where: { tokenHash: hashCompanionToken(token) },
  });

  let revoked = 0;

  if (session?.isActive) {
    const [, result] = await prisma.$transaction([
      prisma.companionLibrarySnapshot.deleteMany({
        where: {
          clerkId: session.clerkId,
          deviceId: session.deviceId,
        },
      }),
      prisma.companionSession.updateMany({
        where: { id: session.id, isActive: true },
        data: { isActive: false, revokedAt: new Date() },
      }),
    ]);

    revoked = result.count;
  }

  return NextResponse.json({
    ok: true,
    disconnected: true,
    revoked,
    message: "This computer's music library is disconnected and is not being shared with Bingo to the Beats.",
  });
}