import { NextRequest, NextResponse } from "next/server";

type RouteContext = {
  params: Promise<{
    playlistId: string;
  }>;
};

export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  const { playlistId } = await context.params;
  const accessToken = request.cookies.get("spotify_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json(
      { error: "Spotify is not connected" },
      { status: 401 }
    );
  }

  try {
const spotifyResponse = await fetch(
  `https://api.spotify.com/v1/playlists/${encodeURIComponent(
    playlistId
  )}/items?limit=50`,
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
          error:
            data.error?.message ||
            "Unable to load playlist songs",
        },
        { status: spotifyResponse.status }
      );
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Spotify tracks error:", error);

    return NextResponse.json(
      { error: "Unable to contact Spotify" },
      { status: 500 }
    );
  }
}
