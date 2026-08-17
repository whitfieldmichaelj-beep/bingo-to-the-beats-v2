import { SignJWT, importPKCS8 } from "jose";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n").trim();
}

function resolveKeyPath(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error("Apple Music private key path is empty.");
  }

  return path.isAbsolute(trimmed)
    ? trimmed
    : path.resolve(process.cwd(), trimmed);
}

async function loadPrivateKey() {
  const inlinePrivateKey = process.env.APPLE_PRIVATE_KEY;

  if (inlinePrivateKey) {
    return normalizePrivateKey(inlinePrivateKey);
  }

  // BTTB_APPLE_PRIVATE_KEY_PATH_V1
  const configuredPath =
    process.env.APPLE_PRIVATE_KEY_PATH ||
    process.env.APPLE_PRIVATE_KEY_FILE;

  if (!configuredPath) {
    throw new Error(
      "Apple Music is not configured. Set APPLE_PRIVATE_KEY_PATH, APPLE_PRIVATE_KEY_FILE, or APPLE_PRIVATE_KEY."
    );
  }

  return normalizePrivateKey(
    await readFile(resolveKeyPath(configuredPath), "utf8")
  );
}

export async function GET() {
  try {
    const teamId = process.env.APPLE_TEAM_ID;
    const keyId = process.env.APPLE_KEY_ID;

    if (!teamId || !keyId) {
      return NextResponse.json(
        {
          configured: false,
          error:
            "Apple Music setup is incomplete. APPLE_TEAM_ID and APPLE_KEY_ID are required.",
        },
        { status: 500, headers: { "Cache-Control": "no-store" } }
      );
    }

    const privateKey = await importPKCS8(
      await loadPrivateKey(),
      "ES256"
    );

    const now = Math.floor(Date.now() / 1000);
    const expiration = now + 60 * 60 * 24 * 30;

    const developerToken = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256", kid: keyId })
      .setIssuer(teamId)
      .setIssuedAt(now)
      .setExpirationTime(expiration)
      .sign(privateKey);

    return NextResponse.json(
      { configured: true, developerToken, expiresAt: expiration },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("Apple Music token error:", error);

    return NextResponse.json(
      {
        configured: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate the Apple Music developer token.",
      },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
