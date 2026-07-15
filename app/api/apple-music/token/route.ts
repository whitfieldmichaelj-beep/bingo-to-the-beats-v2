import { NextResponse } from "next/server";
import { importPKCS8, SignJWT } from "jose";

export async function GET() {
  const teamId = process.env.APPLE_MUSIC_TEAM_ID;
  const keyId = process.env.APPLE_MUSIC_KEY_ID;
  const privateKey = process.env.APPLE_MUSIC_PRIVATE_KEY;

  if (!teamId || !keyId || !privateKey) {
    return NextResponse.json(
      {
        error: "Apple Music is not configured yet.",
        configured: false,
      },
      { status: 503 }
    );
  }

  try {
    const formattedPrivateKey = privateKey.replace(/\\n/g, "\n");

    const signingKey = await importPKCS8(
      formattedPrivateKey,
      "ES256"
    );

    const now = Math.floor(Date.now() / 1000);

    const developerToken = await new SignJWT({})
      .setProtectedHeader({
        alg: "ES256",
        kid: keyId,
      })
      .setIssuer(teamId)
      .setIssuedAt(now)
      .setExpirationTime(now + 60 * 60)
      .sign(signingKey);

    return NextResponse.json({
      developerToken,
      configured: true,
    });
  } catch (error) {
    console.error("Apple Music token error:", error);

    return NextResponse.json(
      {
        error: "Unable to create Apple Music developer token.",
        configured: false,
      },
      { status: 500 }
    );
  }
}