import { NextRequest, NextResponse } from "next/server";
import {
  clearSpotifyTokenCookies,
  getValidSpotifyAccessToken,
  setSpotifyTokenCookies,
} from "@/app/lib/spotify";

export const dynamic = "force-dynamic";

type SpotifyProfile = {
  id?: string;
  display_name?: string | null;
  email?: string | null;
  product?: string | null;
};

export async function GET(request: NextRequest) {
  try {
    const { accessToken, refreshedTokens } =
      await getValidSpotifyAccessToken(request);

    if (!accessToken) {
      return NextResponse.json(
        {
          connected: false,
          reconnectRequired: true,
          message: "Spotify is not connected.",
        },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const spotifyResponse = await fetch(
      "https://api.spotify.com/v1/me",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    if (spotifyResponse.status === 401) {
      const response = NextResponse.json(
        {
          connected: false,
          reconnectRequired: true,
          message: "Spotify authorization expired. Reconnect Spotify.",
        },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );

      clearSpotifyTokenCookies(response);
      return response;
    }

    if (!spotifyResponse.ok) {
      const details = await spotifyResponse.text();
      console.error(
        "Spotify account status failed:",
        spotifyResponse.status,
        details
      );

      return NextResponse.json(
        {
          connected: false,
          reconnectRequired: false,
          message: "Spotify could not confirm the connected account.",
          spotifyStatus: spotifyResponse.status,
        },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const profile = (await spotifyResponse.json()) as SpotifyProfile;
    const response = NextResponse.json(
      {
        connected: true,
        reconnectRequired: false,
        profile: {
          id: profile.id ?? null,
          displayName: profile.display_name ?? null,
          email: profile.email ?? null,
          product: profile.product ?? null,
        },
      },
      { headers: { "Cache-Control": "no-store" } }
    );

    if (refreshedTokens) {
      setSpotifyTokenCookies(response, refreshedTokens);
    }

    return response;
  } catch (error) {
    console.error("Spotify status error:", error);

    const response = NextResponse.json(
      {
        connected: false,
        reconnectRequired: true,
        message: "Spotify needs to be reconnected.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );

    clearSpotifyTokenCookies(response);
    return response;
  }
}
