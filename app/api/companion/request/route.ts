import { randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const PAIR_TTL_MS = 10 * 60_000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const SHA256_HEX = /^[a-f0-9]{64}$/;

function pairingCode() {
  return Array.from({ length: 6 }, () =>
    ALPHABET[randomInt(0, ALPHABET.length)]
  ).join("");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as
    | {
        deviceId?: string;
        deviceName?: string;
        secretHash?: string;
        tokenHash?: string;
      }
    | null;

  const deviceId = body?.deviceId?.trim();
  const secretHash = body?.secretHash?.trim().toLowerCase();
  const tokenHash = body?.tokenHash?.trim().toLowerCase();

  if (!deviceId || deviceId.length > 200) {
    return NextResponse.json(
      { ok: false, error: "A valid device ID is required." },
      { status: 400 }
    );
  }

  if (
    !secretHash ||
    !tokenHash ||
    !SHA256_HEX.test(secretHash) ||
    !SHA256_HEX.test(tokenHash)
  ) {
    return NextResponse.json(
      { ok: false, error: "Valid pairing hashes are required." },
      { status: 400 }
    );
  }

  const deviceName =
    body?.deviceName?.trim().slice(0, 200) || null;
  const expiresAt =
    new Date(Date.now() + PAIR_TTL_MS);

  await prisma.companionPairRequest.deleteMany({
    where: {
      OR: [
        { expiresAt: { lt: new Date() } },
        { deviceId },
      ],
    },
  });

  let code = "";
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const candidate = pairingCode();

    try {
      await prisma.companionPairRequest.create({
        data: {
          code: candidate,
          secretHash,
          tokenHash,
          deviceId,
          deviceName,
          expiresAt,
        },
      });

      code = candidate;
      break;
    } catch {
      // Retry only the short display code.
    }
  }

  if (!code) {
    return NextResponse.json(
      { ok: false, error: "Could not create a pairing code." },
      { status: 503 }
    );
  }

  const baseUrl =
    process.env.BTTB_PUBLIC_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    request.nextUrl.origin;

  return NextResponse.json(
    {
      ok: true,
      code,
      expiresAt: expiresAt.toISOString(),
      approveUrl:
        `${baseUrl}/companion/pair?code=${encodeURIComponent(code)}`,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
