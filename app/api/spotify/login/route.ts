import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import {
  getSpotifyClientId,
  getSpotifyRedirectUri,
  SPOTIFY_STATE_COOKIE,
} from "@/app/lib/spotify";

export const dynamic = "force-dynamic";

const SPOTIFY_SCOPES = [
  "user-read-private",
  "user-read-email",
  "playlist-read-private",
  "playlist-read-collaborative",
  "user-read-playback-state",
  "user-read-currently-playing",
  "user-modify-playback-state",
];

export async function GET() {
  try {
    const state = randomBytes(32).toString("hex");

    const authorizeUrl = new URL(
      "https://accounts.spotify.com/authorize"
    );

    authorizeUrl.searchParams.set(
      "response_type",
      "code"
    );

    authorizeUrl.searchParams.set(
      "client_id",
      getSpotifyClientId()
    );

    authorizeUrl.searchParams.set(
      "redirect_uri",
      getSpotifyRedirectUri()
    );

    authorizeUrl.searchParams.set(
      "scope",
      SPOTIFY_SCOPES.join(" ")
    );

    authorizeUrl.searchParams.set(
      "state",
      state
    );

    authorizeUrl.searchParams.set(
      "show_dialog",
      "true"
    );

    const response =
      NextResponse.redirect(authorizeUrl);

    response.cookies.set(
      SPOTIFY_STATE_COOKIE,
      state,
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60,
      }
    );

    return response;
  } catch (error) {
    console.error(
      "Spotify login error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start Spotify login.",
      },
      {
        status: 500,
      }
    );
  }
}