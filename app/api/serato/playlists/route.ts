import { NextResponse } from "next/server";

import { getSeratoPlaylists } from "@/lib/serato/playlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const playlistList = await getSeratoPlaylists();

    const playlists = playlistList.map((playlist) => {
      const existingTrackCount =
        "trackCount" in playlist &&
        typeof playlist.trackCount === "number"
          ? playlist.trackCount
          : 0;

      return {
        ...playlist,
        trackCount: existingTrackCount,
        tracks: [],
      };
    });

    return NextResponse.json({
      ok: true,
      playlistCount: playlists.length,
      totalPlaylistTracks: 0,
      playlists,
      lazyLoading: true,
      message:
        playlists.length > 0
          ? `${playlists.length} Serato crates found. Select a crate to load its songs.`
          : "No Serato crates were found.",
    });
  } catch (error) {
    console.error("Unable to list Serato playlists:", error);

    return NextResponse.json(
      {
        ok: false,
        playlistCount: 0,
        totalPlaylistTracks: 0,
        playlists: [],
        lazyLoading: true,
        message: "Unable to list the Serato crates.",
        error:
          error instanceof Error
            ? error.message
            : "Unknown Serato playlist error",
      },
      { status: 500 }
    );
  }
}