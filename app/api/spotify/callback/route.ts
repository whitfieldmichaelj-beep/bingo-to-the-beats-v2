import { NextRequest, NextResponse } from "next/server";

type SpotifyTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const spotifyError = request.nextUrl.searchParams.get("error");

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI;

  if (spotifyError) {
    return NextResponse.redirect(
      new URL(`/spotify?error=${encodeURIComponent(spotifyError)}`, request.url)
    );
  }

  if (!code) {
    return NextResponse.json(
      { error: "Missing Spotify authorization code" },
      { status: 400 }
    );
  }

  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json(
      {
        error: "Missing Spotify environment variables",
        hasClientId: Boolean(clientId),
        hasClientSecret: Boolean(clientSecret),
        hasRedirectUri: Boolean(redirectUri),
      },
      { status: 500 }
    );
  }

  try {
    const basicAuth = Buffer.from(
      `${clientId}:${clientSecret}`
    ).toString("base64");

    const tokenResponse = await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectUri,
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
      console.error("Spotify token exchange failed:", tokenData);

      return NextResponse.json(
        {
          error: "Spotify token exchange failed",
          details: {
            error: tokenData.error,
            description: tokenData.error_description,
          },
        },
        { status: tokenResponse.status || 500 }
      );
    }

    const response = NextResponse.redirect(
      new URL("/spotify?connected=true", request.url)
    );

    response.cookies.set(
      "spotify_access_token",
      tokenData.access_token,
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        maxAge: tokenData.expires_in ?? 3600,
        path: "/",
      }
    );

    if (tokenData.refresh_token) {
      response.cookies.set(
        "spotify_refresh_token",
        tokenData.refresh_token,
        {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          maxAge: 60 * 60 * 24 * 30,
          path: "/",
        }
      );
    }

    return response;
  } catch (error) {
    console.error("Spotify callback error:", error);

    return NextResponse.json(
      { error: "Unable to complete Spotify login" },
      { status: 500 }
    );
  }
}
