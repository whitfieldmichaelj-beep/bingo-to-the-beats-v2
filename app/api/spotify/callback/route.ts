import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({
      message: "Spotify callback is ready.",
    });
  }

  return NextResponse.json({
    message: "Spotify authorization code received.",
    codeReceived: true,
  });
}
