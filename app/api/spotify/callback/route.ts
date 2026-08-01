import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  exchangeSpotifyCode,
  getSpotifyRedirectUri,
  setSpotifyTokenCookies,
  SPOTIFY_STATE_COOKIE,
} from "@/app/lib/spotify";

export const dynamic = "force-dynamic";

function spotifyPageUrl(
  request: NextRequest,
  parameters: Record<string, string>
): URL {
  const redirectUri = getSpotifyRedirectUri();
  const appOrigin = new URL(redirectUri).origin;

  const url = new URL("/spotify", appOrigin);

  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }

  return url;
}

export async function GET(
  request: NextRequest
) {
  const code =
    request.nextUrl.searchParams.get("code");

  const returnedState =
    request.nextUrl.searchParams.get("state");

  const spotifyError =
    request.nextUrl.searchParams.get("error");

  const storedState = request.cookies.get(
    SPOTIFY_STATE_COOKIE
  )?.value;

  if (spotifyError) {
    return NextResponse.redirect(
      spotifyPageUrl(request, {
        error: spotifyError,
      })
    );
  }

  if (
    !returnedState ||
    !storedState ||
    returnedState !== storedState
  ) {
    return NextResponse.redirect(
      spotifyPageUrl(request, {
        error: "spotify_state_mismatch",
      })
    );
  }

  if (!code) {
    return NextResponse.redirect(
      spotifyPageUrl(request, {
        error: "missing_spotify_code",
      })
    );
  }

  try {
    const tokens =
      await exchangeSpotifyCode(code);

    const response = NextResponse.redirect(
      spotifyPageUrl(request, {
        connected: "true",
      })
    );

    setSpotifyTokenCookies(
      response,
      tokens
    );

    response.cookies.set(
      SPOTIFY_STATE_COOKIE,
      "",
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      }
    );

    return response;
  } catch (error) {
    console.error(
      "Spotify callback error:",
      error
    );

    return NextResponse.redirect(
      spotifyPageUrl(request, {
        error:
          error instanceof Error
            ? error.message
            : "spotify_callback_failed",
      })
    );
  }
}