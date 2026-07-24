// app/api/tidal/playlists/route.ts

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    {
      success: false,
      provider: "tidal",
      playlists: [],
      message: "TIDAL playlist support has not been implemented yet.",
    },
    { status: 501 }
  );
}
