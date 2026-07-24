import { SignJWT, importPKCS8 } from "jose";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n").trim();
}

async function loadPrivateKey() {
  const inlinePrivateKey = process.env.APPLE_PRIVATE_KEY;

  if (inlinePrivateKey) {
    return normalizePrivateKey(inlinePrivateKey);
  }

  const privateKeyFile = process.env.APPLE_PRIVATE_KEY_FILE;

  if (!privateKeyFile) {
    throw new Error(
      "Missing APPLE_PRIVATE_KEY or APPLE_PRIVATE_KEY_FILE."
    );
  }

  const safeFileName = path.basename(privateKeyFile);
  const fullKeyPath = path.join(
    process.cwd(),
    "private-keys",
    safeFileName
  );

  return normalizePrivateKey(await readFile(fullKeyPath, "utf8"));
}

export async function GET() {
  try {
    const teamId = process.env.APPLE_TEAM_ID;
    const keyId = process.env.APPLE_KEY_ID;

    if (!teamId || !keyId) {
      return NextResponse.json(
        {
          error: "Missing APPLE_TEAM_ID or APPLE_KEY_ID.",
        },
        { status: 500 }
      );
    }

    const privateKeyText = await loadPrivateKey();
    const privateKey = await importPKCS8(privateKeyText, "ES256");

    const now = Math.floor(Date.now() / 1000);
    const expiration = now + 60 * 60 * 24 * 30;

    const developerToken = await new SignJWT({})
      .setProtectedHeader({
        alg: "ES256",
        kid: keyId,
      })
      .setIssuer(teamId)
      .setIssuedAt(now)
      .setExpirationTime(expiration)
      .sign(privateKey);

    return NextResponse.json(
      {
        developerToken,
        expiresAt: expiration,
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch (error) {
    console.error("Apple Music token error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to generate the Apple Music developer token.",
      },
      { status: 500 }
    );
  }
}
