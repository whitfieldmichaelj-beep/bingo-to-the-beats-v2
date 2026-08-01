import type { NextRequest, NextResponse } from "next/server";

export const SPOTIFY_ACCESS_TOKEN_COOKIE =
  "spotify_access_token";

export const SPOTIFY_REFRESH_TOKEN_COOKIE =
  "spotify_refresh_token";

export const SPOTIFY_TOKEN_EXPIRES_COOKIE =
  "spotify_token_expires_at";

export const SPOTIFY_STATE_COOKIE =
  "spotify_oauth_state";

const SPOTIFY_TOKEN_URL =
  "https://accounts.spotify.com/api/token";

type SpotifyTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  scope?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export type SpotifyTokenRefreshResult = {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
};

function getRequiredEnvironmentVariable(
  name: "SPOTIFY_CLIENT_ID" | "SPOTIFY_CLIENT_SECRET"
): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing ${name}`);
  }

  return value;
}

function createBasicAuthorizationHeader(): string {
  const clientId = getRequiredEnvironmentVariable(
    "SPOTIFY_CLIENT_ID"
  );

  const clientSecret = getRequiredEnvironmentVariable(
    "SPOTIFY_CLIENT_SECRET"
  );

  return `Basic ${Buffer.from(
    `${clientId}:${clientSecret}`
  ).toString("base64")}`;
}

export function getSpotifyRedirectUri(): string {
  const redirectUri =
    process.env.SPOTIFY_REDIRECT_URI;

  if (!redirectUri) {
    throw new Error(
      "Missing SPOTIFY_REDIRECT_URI"
    );
  }

  return redirectUri;
}

export function getSpotifyClientId(): string {
  return getRequiredEnvironmentVariable(
    "SPOTIFY_CLIENT_ID"
  );
}

export function setSpotifyTokenCookies(
  response: NextResponse,
  tokens: SpotifyTokenRefreshResult
): void {
  const isProduction =
    process.env.NODE_ENV === "production";

  const accessTokenMaxAge = Math.max(
    Math.floor((tokens.expiresAt - Date.now()) / 1000),
    1
  );

  response.cookies.set(
    SPOTIFY_ACCESS_TOKEN_COOKIE,
    tokens.accessToken,
    {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: accessTokenMaxAge,
    }
  );

  response.cookies.set(
    SPOTIFY_TOKEN_EXPIRES_COOKIE,
    String(tokens.expiresAt),
    {
      httpOnly: true,
      secure: isProduction,
      sameSite: "lax",
      path: "/",
      maxAge: accessTokenMaxAge,
    }
  );

  if (tokens.refreshToken) {
    response.cookies.set(
      SPOTIFY_REFRESH_TOKEN_COOKIE,
      tokens.refreshToken,
      {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 180,
      }
    );
  }
}

export function clearSpotifyTokenCookies(
  response: NextResponse
): void {
  const cookieNames = [
    SPOTIFY_ACCESS_TOKEN_COOKIE,
    SPOTIFY_REFRESH_TOKEN_COOKIE,
    SPOTIFY_TOKEN_EXPIRES_COOKIE,
    SPOTIFY_STATE_COOKIE,
  ];

  for (const cookieName of cookieNames) {
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  }
}

export async function exchangeSpotifyCode(
  code: string
): Promise<SpotifyTokenRefreshResult> {
  const tokenResponse = await fetch(
    SPOTIFY_TOKEN_URL,
    {
      method: "POST",
      headers: {
        Authorization:
          createBasicAuthorizationHeader(),
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: getSpotifyRedirectUri(),
      }),
      cache: "no-store",
    }
  );

  const tokenData =
    (await tokenResponse.json()) as SpotifyTokenResponse;

  if (
    !tokenResponse.ok ||
    !tokenData.access_token
  ) {
    throw new Error(
      tokenData.error_description ||
        tokenData.error ||
        "Spotify authorization failed."
    );
  }

  const expiresIn =
    typeof tokenData.expires_in === "number"
      ? tokenData.expires_in
      : 3600;

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

export async function refreshSpotifyAccessToken(
  refreshToken: string
): Promise<SpotifyTokenRefreshResult> {
  const tokenResponse = await fetch(
    SPOTIFY_TOKEN_URL,
    {
      method: "POST",
      headers: {
        Authorization:
          createBasicAuthorizationHeader(),
        "Content-Type":
          "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      cache: "no-store",
    }
  );

  const tokenData =
    (await tokenResponse.json()) as SpotifyTokenResponse;

  if (
    !tokenResponse.ok ||
    !tokenData.access_token
  ) {
    throw new Error(
      tokenData.error_description ||
        tokenData.error ||
        "Unable to refresh Spotify access."
    );
  }

  const expiresIn =
    typeof tokenData.expires_in === "number"
      ? tokenData.expires_in
      : 3600;

  return {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };
}

export async function getValidSpotifyAccessToken(
  request: NextRequest
): Promise<{
  accessToken: string | null;
  refreshedTokens?: SpotifyTokenRefreshResult;
}> {
  const accessToken = request.cookies.get(
    SPOTIFY_ACCESS_TOKEN_COOKIE
  )?.value;

  const refreshToken = request.cookies.get(
    SPOTIFY_REFRESH_TOKEN_COOKIE
  )?.value;

  const expiresAtValue = request.cookies.get(
    SPOTIFY_TOKEN_EXPIRES_COOKIE
  )?.value;

  const expiresAt = Number(expiresAtValue);
  const refreshBufferMilliseconds = 60_000;

  const accessTokenIsUsable =
    Boolean(accessToken) &&
    Number.isFinite(expiresAt) &&
    Date.now() <
      expiresAt - refreshBufferMilliseconds;

  if (accessTokenIsUsable && accessToken) {
    return {
      accessToken,
    };
  }

  if (!refreshToken) {
    return {
      accessToken: null,
    };
  }

  const refreshedTokens =
    await refreshSpotifyAccessToken(
      refreshToken
    );

  return {
    accessToken: refreshedTokens.accessToken,
    refreshedTokens: {
      ...refreshedTokens,
      refreshToken:
        refreshedTokens.refreshToken ||
        refreshToken,
    },
  };
}