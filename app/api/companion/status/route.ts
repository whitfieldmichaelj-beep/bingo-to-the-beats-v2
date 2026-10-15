import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function hash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as
    | { secret?: string }
    | null;
  const secret = body?.secret?.trim();

  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Pairing secret required." },
      { status: 400 }
    );
  }

  const pair = await prisma.companionPairRequest.findUnique({
    where: { secretHash: hash(secret) },
  });

  if (!pair) {
    return NextResponse.json(
      { ok: false, error: "Pairing request not found." },
      { status: 404 }
    );
  }

  const expired = pair.expiresAt.getTime() < Date.now();
  if (expired) {
    return NextResponse.json(
      { ok: false, expired: true },
      { status: 410 }
    );
  }

  const approved =
    Boolean(pair.approvedAt) &&
    Boolean(pair.clerkId);

  return NextResponse.json({
    ok: true,
    approved,
    deviceId: pair.deviceId,
    expiresAt: pair.expiresAt.toISOString(),
  });
}
