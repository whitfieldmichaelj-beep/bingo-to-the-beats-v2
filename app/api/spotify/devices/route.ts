import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { getValidSpotifyAccessToken, setSpotifyTokenCookies } from "@/app/lib/spotify";
export async function GET(request: NextRequest) {
  if (!(await auth()).userId) return NextResponse.json({ error: "Sign in to BTTB." }, { status: 401 });
  try {
    const { accessToken, refreshedTokens } = await getValidSpotifyAccessToken(request);
    if (!accessToken) return NextResponse.json({ error: "Reconnect Spotify to choose this computer." }, { status: 401 });
    const upstream = await fetch("https://api.spotify.com/v1/me/player/devices", { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store", signal: AbortSignal.timeout(10000) });
    const data = upstream.ok ? await upstream.json() : null;
    const devices = (data?.devices ?? []).filter((device: { id?: string; is_restricted?: boolean }) => device.id && !device.is_restricted).map((device: { id: string; name: string; type: string }) => ({ id: device.id, name: device.name, type: device.type }));
    const response = NextResponse.json(upstream.ok ? { devices } : { error: "Could not load Spotify devices. Check Spotify is connected and try again." }, { status: upstream.ok ? 200 : upstream.status, headers: { "Cache-Control": "no-store" } });
    if (refreshedTokens) setSpotifyTokenCookies(response, refreshedTokens);
    return response;
  } catch { return NextResponse.json({ error: "Spotify did not respond. Try refreshing the devices." }, { status: 503 }); }
}
