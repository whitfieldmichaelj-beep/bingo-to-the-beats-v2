import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { localLibraryAccessResponse } from "@/lib/auth/local-library";
import {
  companionLibraryLabels,
  companionPlaylists,
} from "@/lib/companion/library";
import { getDjAdapter } from "@/lib/dj/bridge";
import { isDjProvider } from "@/lib/dj/providers";
import { getUniquePlaylistTrackCount } from "@/lib/game/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ provider: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json(
      { ok: false, message: "Sign in to access local music." },
      { status: 401 }
    );
  }

  const { provider } = await context.params;
  if (!isDjProvider(provider)) {
    return NextResponse.json(
      { ok: false, message: "Unknown DJ software." },
      { status: 400 }
    );
  }

  if (provider === "serato") {
    const synced = await companionPlaylists(userId);
    if (synced) {
      const libraryLabels = await companionLibraryLabels(userId);
      const playlists = synced.map((playlist) => ({
        ...playlist,
        tracks: [],
        trackCount: getUniquePlaylistTrackCount(playlist.tracks),
      }));

      return NextResponse.json(
        {
          ok: true,
          source: "companion",
          playlists,
          libraryLocations: libraryLabels,
          totalTracks: playlists.reduce(
            (total, playlist) => total + playlist.trackCount,
            0
          ),
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        }
      );
    }
  }

  const denied = await localLibraryAccessResponse();
  if (denied) return denied;

  try {
    const adapter = await getDjAdapter(provider);
    const libraryLocations =
      (await adapter.libraryLocations?.()) ?? [];
    const playlists = (await adapter.listPlaylists()).map(
      (playlist) => ({
        ...playlist,
        tracks: [],
        trackCount: getUniquePlaylistTrackCount(
          playlist.tracks
        ),
      })
    );

    return NextResponse.json(
      {
        ok: true,
        source: "local",
        playlists,
        libraryLocations,
        totalTracks: playlists.reduce(
          (total, playlist) =>
            total + playlist.trackCount,
          0
        ),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        message:
          "Unable to read the selected local DJ library. Open the DJ software on this computer and check library access.",
      },
      { status: 503 }
    );
  }
}
