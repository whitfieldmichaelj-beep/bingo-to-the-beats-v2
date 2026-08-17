import { NextRequest, NextResponse } from "next/server";
import {
  clearSpotifyTokenCookies,
  getValidSpotifyAccessToken,
  setSpotifyTokenCookies,
} from "@/app/lib/spotify";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ playlistId: string }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { playlistId } = await context.params;

  try {
    const { accessToken, refreshedTokens } =
      await getValidSpotifyAccessToken(request);

    if (!accessToken) {
      return NextResponse.json(
        { error: "Spotify is not connected.", reconnectRequired: true },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const spotifyResponse = await fetch(
      `https://api.spotify.com/v1/playlists/${encodeURIComponent(
        playlistId
      )}/items?limit=50`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    const responseText = await spotifyResponse.text();
    let data: unknown = {};

    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      return NextResponse.json(
        { error: "Spotify returned an invalid playlist response." },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (!spotifyResponse.ok) {
      const spotifyError = data as { error?: { message?: string } };
      const response = NextResponse.json(
        {
          error:
            spotifyError.error?.message || "Unable to load playlist songs.",
          reconnectRequired: spotifyResponse.status === 401,
        },
        {
          status: spotifyResponse.status,
          headers: { "Cache-Control": "no-store" },
        }
      );

      if (spotifyResponse.status === 401) {
        clearSpotifyTokenCookies(response);
      } else if (refreshedTokens) {
        setSpotifyTokenCookies(response, refreshedTokens);
      }

      return response;
    }

    const response = NextResponse.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
    if (refreshedTokens) setSpotifyTokenCookies(response, refreshedTokens);
    return response;
  } catch (error) {
    console.error("Spotify tracks error:", error);
    const response = NextResponse.json(
      {
        error: "Unable to refresh or contact Spotify.",
        reconnectRequired: true,
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
    clearSpotifyTokenCookies(response);
    return response;
  }
}
