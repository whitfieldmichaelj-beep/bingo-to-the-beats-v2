import { NextResponse } from "next/server";

const COOKIE_NAMES = [
  "spotify_access_token",
  "spotify_refresh_token",
  "spotify_token_expires_at",
  "spotify_oauth_state",
  "spotify_state",

  "tidal_access_token",
  "tidal_refresh_token",
  "tidal_token_expires_at",
  "tidal_oauth_state",

  "bttb_game_session",
  "bttb_host_session",
  "bttb_player_session",
];

export async function POST() {
  try {
    const response = NextResponse.json(
      {
        success: true,
        message: "Provider sessions cleared.",
      },
      { status: 200 }
    );

    for (const cookieName of COOKIE_NAMES) {
      response.cookies.set({
        name: cookieName,
        value: "",
        path: "/",
        expires: new Date(0),
        maxAge: 0,
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
      });
    }

    return response;
  } catch (error) {
    console.error("Logout API error:", error);

    return NextResponse.json(
      {
        success: false,
        error: "Unable to clear provider sessions.",
      },
      { status: 500 }
    );
  }
}