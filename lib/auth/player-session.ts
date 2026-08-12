// BTTB_PLAYER_SESSION_SECURITY_V1
import { SignJWT, jwtVerify } from "jose";
import type { NextRequest, NextResponse } from "next/server";

const PLAYER_SESSION_COOKIE = "bttb-player-session";
const PLAYER_SESSION_ISSUER = "bingo-to-the-beats";
const PLAYER_SESSION_AUDIENCE = "bttb-player";
const PLAYER_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type TrustedPlayerSession = {
  playerId: string;
};

function getPlayerSessionSecret(): Uint8Array {
  const value = process.env.BTTB_PLAYER_SESSION_SECRET?.trim();

  if (!value || value.length < 32) {
    throw new Error(
      "BTTB_PLAYER_SESSION_SECRET must be configured with at least 32 characters."
    );
  }

  return new TextEncoder().encode(value);
}

export async function createPlayerSessionToken(
  playerId: string
): Promise<string> {
  const normalizedPlayerId = playerId.trim();

  if (!normalizedPlayerId) {
    throw new Error("A player ID is required to create a player session.");
  }

  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(normalizedPlayerId)
    .setIssuer(PLAYER_SESSION_ISSUER)
    .setAudience(PLAYER_SESSION_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${PLAYER_SESSION_MAX_AGE_SECONDS}s`)
    .sign(getPlayerSessionSecret());
}

export async function readPlayerSession(
  request: NextRequest
): Promise<TrustedPlayerSession | null> {
  const token = request.cookies.get(PLAYER_SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(
      token,
      getPlayerSessionSecret(),
      {
        issuer: PLAYER_SESSION_ISSUER,
        audience: PLAYER_SESSION_AUDIENCE,
        algorithms: ["HS256"],
      }
    );

    const playerId =
      typeof payload.sub === "string"
        ? payload.sub.trim()
        : "";

    return playerId ? { playerId } : null;
  } catch {
    return null;
  }
}

export function setPlayerSessionCookie(
  response: NextResponse,
  token: string
): void {
  response.cookies.set({
    name: PLAYER_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: PLAYER_SESSION_MAX_AGE_SECONDS,
  });
}
