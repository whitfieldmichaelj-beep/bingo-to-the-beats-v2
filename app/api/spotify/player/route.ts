import { cookies } from "next/headers";
import { NextResponse } from "next/server";

type SpotifyArtist = {
  name: string;
};

type SpotifyImage = {
  url: string;
};

type SpotifyTrack = {
  id: string;
  name: string;
  duration_ms: number;
  artists: SpotifyArtist[];
  album?: {
    name?: string;
    images?: SpotifyImage[];
  };
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

export async function GET() {
  const cookieStore = await cookies();
  const accessToken =
    cookieStore.get("spotify_access_token")?.value;

  if (!accessToken) {
    return NextResponse.json(
      {
        connected: false,
        error: "Spotify is not connected.",
      },
      { status: 401 }
    );
  }

  try {
    const spotifyResponse = await fetch(
      "https://api.spotify.com/v1/me/player",
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        cache: "no-store",
      }
    );

    if (spotifyResponse.status === 204) {
      return NextResponse.json({
        connected: true,
        active: false,
        isPlaying: false,
        track: null,
        device: null,
        message:
          "No active Spotify device was found. Open Spotify and start playing a song.",
      });
    }

    if (spotifyResponse.status === 401) {
      return NextResponse.json(
        {
          connected: false,
          error:
            "Your Spotify session expired. Please reconnect Spotify.",
        },
        { status: 401 }
      );
    }

    if (spotifyResponse.status === 403) {
      return NextResponse.json(
        {
          connected: true,
          error:
            "Spotify did not grant playback access. Reconnect Spotify and approve the playback permissions.",
        },
        { status: 403 }
      );
    }

    if (!spotifyResponse.ok) {
      const details = await spotifyResponse.text();

      console.error(
        "Spotify playback request failed:",
        spotifyResponse.status,
        details
      );

      return NextResponse.json(
        {
          connected: true,
          error: "Unable to read Spotify playback.",
          status: spotifyResponse.status,
        },
        { status: spotifyResponse.status }
      );
    }

    const playback =
      (await spotifyResponse.json()) as SpotifyPlaybackResponse;

    const track = playback.item ?? null;
    const device = playback.device ?? null;

    return NextResponse.json({
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
            artist: track.artists
              .map((artist) => artist.name)
              .join(", "),
            album: track.album?.name ?? "",
            image: track.album?.images?.[0]?.url ?? null,
            durationMs: track.duration_ms,
          }
        : null,
    });
  } catch (error) {
    console.error("Spotify playback error:", error);

    return NextResponse.json(
      {
        connected: false,
        error: "Unable to contact Spotify.",
      },
      { status: 500 }
    );
  }
}