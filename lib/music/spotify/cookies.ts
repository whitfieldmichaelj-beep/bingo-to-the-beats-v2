import type { NextRequest, NextResponse } from "next/server";

const ACCESS_TOKEN_COOKIE = "spotify_access_token";
const REFRESH_TOKEN_COOKIE = "spotify_refresh_token";
const TOKEN_EXPIRY_COOKIE = "spotify_token_expires_at";

const secure = process.env.NODE_ENV === "production";

const baseCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure,
  path: "/",
};

export function readSpotifyCookies(request: NextRequest) {
  return {
    accessToken:
      request.cookies.get(ACCESS_TOKEN_COOKIE)?.value ?? null,
    refreshToken:
      request.cookies.get(REFRESH_TOKEN_COOKIE)?.value ?? null,
    expiresAt: Number(
      request.cookies.get(TOKEN_EXPIRY_COOKIE)?.value ?? "0"
    ),
  };
}

export function writeSpotifyCookies(
  response: NextResponse,
  values: {
    accessToken: string;
    expiresIn: number;
    refreshToken?: string;
  }
) {
  const expiresAt = Date.now() + values.expiresIn * 1000;

  response.cookies.set(
    ACCESS_TOKEN_COOKIE,
    values.accessToken,
    {
      ...baseCookieOptions,
      maxAge: values.expiresIn,
    }
  );

  response.cookies.set(
    TOKEN_EXPIRY_COOKIE,
    String(expiresAt),
    {
      ...baseCookieOptions,
      maxAge: values.expiresIn,
    }
  );

  if (values.refreshToken) {
    response.cookies.set(
      REFRESH_TOKEN_COOKIE,
      values.refreshToken,
      {
        ...baseCookieOptions,
        maxAge: 60 * 60 * 24 * 180,
      }
    );
  }
}

export function clearSpotifyCookies(
  response: NextResponse
) {
  response.cookies.delete(ACCESS_TOKEN_COOKIE);
  response.cookies.delete(REFRESH_TOKEN_COOKIE);
  response.cookies.delete(TOKEN_EXPIRY_COOKIE);
}
