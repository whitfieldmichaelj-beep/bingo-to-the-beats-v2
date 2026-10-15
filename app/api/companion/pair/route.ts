import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, error: "Sign in first." },
      { status: 401 }
    );
  }

  const body = await request.json().catch(() => null) as
    | { code?: string }
    | null;
  const code = body?.code
    ?.trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

  if (!code || code.length !== 6) {
    return NextResponse.json(
      { ok: false, error: "Enter the six-character Companion code." },
      { status: 400 }
    );
  }

  const pair = await prisma.companionPairRequest.findUnique({
    where: { code },
  });

  if (!pair || pair.expiresAt.getTime() < Date.now()) {
    return NextResponse.json(
      { ok: false, error: "That Companion code is invalid or expired." },
      { status: 404 }
    );
  }

  if (pair.approvedAt) {
    return NextResponse.json(
      { ok: false, error: "That Companion code has already been used." },
      { status: 409 }
    );
  }

  const now = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.companionLibrarySnapshot.deleteMany({
      where: { deviceId: pair.deviceId },
    });

    await tx.companionSession.updateMany({
      where: { deviceId: pair.deviceId, isActive: true },
      data: { isActive: false, revokedAt: now },
    });

    await tx.companionSession.upsert({
      where: {
        clerkId_deviceId: {
          clerkId: userId,
          deviceId: pair.deviceId,
        },
      },
      create: {
        clerkId: userId,
        deviceId: pair.deviceId,
        deviceName: pair.deviceName,
        tokenHash: pair.tokenHash,
        lastHeartbeatAt: now,
      },
      update: {
        deviceName: pair.deviceName,
        tokenHash: pair.tokenHash,
        isActive: true,
        revokedAt: null,
        lastHeartbeatAt: now,
      },
    });

    await tx.companionPairRequest.update({
      where: { id: pair.id },
      data: {
        clerkId: userId,
        approvedAt: now,
      },
    });
  });

  return NextResponse.json(
    {
      ok: true,
      paired: true,
      deviceId: pair.deviceId,
      deviceName: pair.deviceName,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
