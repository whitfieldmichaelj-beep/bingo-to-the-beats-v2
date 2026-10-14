import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createCompanionToken, hashCompanionToken } from "@/lib/companion/session";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });

  const body = await request.json().catch(() => null) as { deviceId?: string; deviceName?: string } | null;
  const deviceId = body?.deviceId?.trim();
  if (!deviceId || deviceId.length > 200) {
    return NextResponse.json({ ok: false, error: "A valid device ID is required." }, { status: 400 });
  }

  const token = createCompanionToken();
  const tokenHash = hashCompanionToken(token);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.companionSession.updateMany({
      where: { deviceId, isActive: true },
      data: { isActive: false, revokedAt: now },
    });
    await tx.companionSession.upsert({
      where: { clerkId_deviceId: { clerkId: userId, deviceId } },
      create: { clerkId: userId, deviceId, deviceName: body?.deviceName?.trim() || null, tokenHash, lastHeartbeatAt: now },
      update: { deviceName: body?.deviceName?.trim() || null, tokenHash, isActive: true, revokedAt: null, lastHeartbeatAt: now },
    });
  });

  return NextResponse.json({ ok: true, token, expiresWithoutHeartbeatMs: 90_000 });
}