import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("spotify_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Spotify is not connected" },
      { status: 401 }
    );
  }

  try {
    const spotifyResponse = await fetch(
      "https://api.spotify.com/v1/me/playlists?limit=50",
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      }
    );

    const data = await spotifyResponse.json();

    if (!spotifyResponse.ok) {
      return NextResponse.json(
        {
          error: data.error?.message || "Unable to load Spotify playlists",
        },
        { status: spotifyResponse.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Spotify playlists error:", error);

    return NextResponse.json(
      { error: "Unable to contact Spotify" },
      { status: 500 }
    );
  }
}
