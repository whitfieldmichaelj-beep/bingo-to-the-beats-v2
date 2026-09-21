import { auth } from "@clerk/nextjs/server";
import { requestOrigin } from "@/lib/http/request-origin";
import { NextRequest, NextResponse } from "next/server";
import {
  clearSpotifyTokenCookies,
  getValidSpotifyAccessToken,
  setSpotifyTokenCookies,
} from "@/app/lib/spotify";

export const dynamic = "force-dynamic";

type SpotifyArtist = { name: string };
type SpotifyImage = { url: string };
type SpotifyTrack = {
  id: string;
  name: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album?: { name?: string; images?: SpotifyImage[] };
};
type SpotifyPlaybackResponse = {
  is_playing?: boolean;
  progress_ms?: number;
  device?: {
    id?: string | null;
    name?: string;
    type?: string;
    volume_percent?: number;
    is_active?: boolean;
  };
  item?: SpotifyTrack | null;
};

export async function GET(request: NextRequest) {
  try {
    const { accessToken, refreshedTokens } =
      await getValidSpotifyAccessToken(request);

    if (!accessToken) {
      return NextResponse.json(
        {
          connected: false,
          reconnectRequired: true,
          error: "Spotify is not connected.",
        },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
    }

    const spotifyResponse = await fetch(
      "https://api.spotify.com/v1/me/player",
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      }
    );

    if (spotifyResponse.status === 204) {
      const response = NextResponse.json(
        {
          connected: true,
          active: false,
          isPlaying: false,
          track: null,
          device: null,
          message:
            "No active Spotify device was found. Open Spotify and start playing a song.",
        },
        { headers: { "Cache-Control": "no-store" } }
      );
      if (refreshedTokens) setSpotifyTokenCookies(response, refreshedTokens);
      return response;
    }

    if (spotifyResponse.status === 401) {
      const response = NextResponse.json(
        {
          connected: false,
          reconnectRequired: true,
          error: "Your Spotify authorization expired. Reconnect Spotify.",
        },
        { status: 401, headers: { "Cache-Control": "no-store" } }
      );
      clearSpotifyTokenCookies(response);
      return response;
    }

    if (spotifyResponse.status === 403) {
      const response = NextResponse.json(
        {
          connected: true,
          reconnectRequired: false,
          error:
            "Spotify playback access is unavailable for this account or authorization.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
      if (refreshedTokens) setSpotifyTokenCookies(response, refreshedTokens);
      return response;
    }

    if (!spotifyResponse.ok) {
      console.error(
        "Spotify playback request failed:",
        spotifyResponse.status,
        await spotifyResponse.text()
      );
      return NextResponse.json(
        {
          connected: true,
          reconnectRequired: false,
          error: "Unable to read Spotify playback.",
          status: spotifyResponse.status,
        },
        { status: 502, headers: { "Cache-Control": "no-store" } }
      );
    }

    const playback = (await spotifyResponse.json()) as SpotifyPlaybackResponse;
    const track = playback.item ?? null;
    const device = playback.device ?? null;

    const response = NextResponse.json(
      {
        connected: true,
        active: Boolean(device?.is_active),
        isPlaying: Boolean(playback.is_playing),
        progressMs: playback.progress_ms ?? 0,
        device: device
          ? {
              id: device.id ?? null,
              name: device.name ?? "Unknown device",
              type: device.type ?? "Unknown device",
              volumePercent: device.volume_percent ?? null,
            }
          : null,
        track: track
          ? {
              id: track.id,
              title: track.name,
              artist: track.artists.map((artist) => artist.name).join(", "),
              album: track.album?.name ?? "",
              image: track.album?.images?.[0]?.url ?? null,
              durationMs: track.duration_ms,
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );

    if (refreshedTokens) setSpotifyTokenCookies(response, refreshedTokens);
    return response;
  } catch (error) {
    console.error("Spotify playback error:", error);
    return NextResponse.json(
      {
        connected: false,
        reconnectRequired: true,
        error: "Spotify needs to be reconnected.",
      },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to BTTB." }, { status: 401 });
  if (request.headers.get("origin") !== requestOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  try {
    const body = await request.json();
    if (!["play", "resume", "pause"].includes(body.action)) return NextResponse.json({ error: "Invalid playback action." }, { status: 400 });
    if (typeof body.deviceId !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(body.deviceId)) return NextResponse.json({ error: "Choose this computer as the Spotify playback device before starting." }, { status: 400 });
    const trackId = typeof body.trackId === "string" ? body.trackId.replace(/^spotify:(?:track:)?|^spotify-/, "") : "";
    if (body.action === "play" && !/^[A-Za-z0-9]{22}$/.test(trackId)) return NextResponse.json({ error: "This song has no valid Spotify track ID." }, { status: 400 });
    const { accessToken, refreshedTokens } = await getValidSpotifyAccessToken(request);
    if (!accessToken) return NextResponse.json({ error: "Reconnect Spotify before starting music." }, { status: 401 });
    const upstream = await fetch(`https://api.spotify.com/v1/me/player/${body.action === "pause" ? "pause" : "play"}?device_id=${encodeURIComponent(body.deviceId)}`, {
      method: "PUT", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      ...(body.action === "play" ? { body: JSON.stringify({ uris: [`spotify:track:${trackId}`], position_ms: Number.isInteger(body.positionMs) && body.positionMs >= 0 && body.positionMs <= 600000 ? body.positionMs : 0 }) } : {}),
      cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    const error = upstream.status === 404 ? "The selected Spotify device is unavailable. Open Spotify on this computer, refresh the device list, and select this computer again."
      : upstream.status === 403 ? "Spotify refused playback. A Spotify Premium account and playback permission are required."
      : upstream.status === 401 ? "Spotify authorization expired. Reconnect Spotify."
      : upstream.status === 429 ? "Spotify is receiving too many requests. Wait a moment and try again."
      : "Spotify could not start or pause playback. Please try again.";
    const response = NextResponse.json(upstream.ok ? { ok: true } : { error }, { status: upstream.ok ? 200 : upstream.status, headers: { "Cache-Control": "no-store" } });
    if (refreshedTokens) setSpotifyTokenCookies(response, refreshedTokens);
    return response;
  } catch {
    return NextResponse.json({ error: "Spotify did not respond. Check your connection and try again." }, { status: 503 });
  }
}
