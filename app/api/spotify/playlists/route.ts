import { NextRequest, NextResponse } from "next/server";

type SpotifyErrorResponse = {
  error?: {
    status?: number;
    message?: string;
  };
};

export async function GET(request: NextRequest) {
  const accessToken =
    request.cookies.get("spotify_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json(
      {
        error: "Spotify is not connected.",
      },
      {
        status: 401,
      }
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => {
    controller.abort();
  }, 10000);

  try {
    const spotifyResponse = await fetch(
      "https://api.spotify.com/v1/me/playlists?limit=50",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: controller.signal,
      }
    );

    const responseText = await spotifyResponse.text();

    let data: SpotifyErrorResponse & {
      items?: unknown[];
      total?: number;
    };

    try {
      data = responseText
        ? JSON.parse(responseText)
        : {};
    } catch {
      return NextResponse.json(
        {
          error: "Spotify returned an invalid response.",
          status: spotifyResponse.status,
        },
        {
          status: 502,
        }
      );
    }

    if (!spotifyResponse.ok) {
      const message =
        data.error?.message ||
        "Unable to load Spotify playlists.";

      return NextResponse.json(
        {
          error: message,
          spotifyStatus: spotifyResponse.status,
        },
        {
          status: spotifyResponse.status,
        }
      );
    }

    return NextResponse.json({
      items: Array.isArray(data.items)
        ? data.items
        : [],
      total:
        typeof data.total === "number"
          ? data.total
          : 0,
    });
  } catch (error) {
    if (
      error instanceof Error &&
      error.name === "AbortError"
    ) {
      return NextResponse.json(
        {
          error:
            "Spotify took too long to respond. Please try again.",
        },
        {
          status: 504,
        }
      );
    }

    console.error("Spotify playlists error:", error);

    return NextResponse.json(
      {
        error: "Unable to contact Spotify.",
      },
      {
        status: 500,
      }
    );
  } finally {
    clearTimeout(timeout);
  }
}