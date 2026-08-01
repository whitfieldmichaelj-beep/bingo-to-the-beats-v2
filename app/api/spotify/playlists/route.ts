import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  clearSpotifyTokenCookies,
  getValidSpotifyAccessToken,
  setSpotifyTokenCookies,
} from "@/app/lib/spotify";

export const dynamic = "force-dynamic";

type SpotifyErrorResponse = {
  error?: {
    status?: number;
    message?: string;
  };
};

export async function GET(
  request: NextRequest
) {
  try {
    const {
      accessToken,
      refreshedTokens,
    } =
      await getValidSpotifyAccessToken(
        request
      );

    if (!accessToken) {
      return NextResponse.json(
        {
          error:
            "Spotify is not connected.",
          reconnectRequired: true,
        },
        {
          status: 401,
        }
      );
    }

    const spotifyResponse = await fetch(
      "https://api.spotify.com/v1/me/playlists?limit=50",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        cache: "no-store",
      }
    );

    const responseText =
      await spotifyResponse.text();

    let data:
      | (SpotifyErrorResponse & {
          items?: unknown[];
          total?: number;
        })
      | undefined;

    try {
      data = responseText
        ? JSON.parse(responseText)
        : {};
    } catch {
      return NextResponse.json(
        {
          error:
            "Spotify returned an invalid response.",
        },
        {
          status: 502,
        }
      );
    }

    if (!spotifyResponse.ok) {
      const response =
        NextResponse.json(
          {
            error:
              data?.error?.message ||
              "Unable to load Spotify playlists.",
            spotifyStatus:
              spotifyResponse.status,
            reconnectRequired:
              spotifyResponse.status === 401,
          },
          {
            status:
              spotifyResponse.status,
          }
        );

      if (
        spotifyResponse.status === 401
      ) {
        clearSpotifyTokenCookies(
          response
        );
      }

      return response;
    }

    const response = NextResponse.json({
      items: Array.isArray(data?.items)
        ? data.items
        : [],
      total:
        typeof data?.total === "number"
          ? data.total
          : 0,
    });

    if (refreshedTokens) {
      setSpotifyTokenCookies(
        response,
        refreshedTokens
      );
    }

    return response;
  } catch (error) {
    console.error(
      "Spotify playlists error:",
      error
    );

    const response = NextResponse.json(
      {
        error:
          "Unable to refresh or contact Spotify.",
        reconnectRequired: true,
      },
      {
        status: 401,
      }
    );

    clearSpotifyTokenCookies(response);

    return response;
  }
}