import { NextResponse } from "next/server";

import {
  getUniquePlaylistTrackCount,
} from "@/lib/game/service";

import {
  loadPlaylist,
} from "@/lib/serato/playlist-reader";

import {
  getSeratoPlaylists,
} from "@/lib/serato/playlists";

import {
  getSeratoSmartCrates,
  isSeratoSmartCrate,
  loadSeratoSmartCrate,
} from "@/lib/serato/smart-crates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const playlistList = [
      ...(await getSeratoPlaylists()),
      ...(await getSeratoSmartCrates()),
    ];

    const playlists = await Promise.all(
      playlistList.map(
        async (playlist) => {
          try {
            const loadedPlaylist =
              isSeratoSmartCrate(
                playlist
              )
                ? await loadSeratoSmartCrate(
                    playlist
                  )
                : await loadPlaylist(
                    playlist
                  );

            const uniqueTrackCount =
              getUniquePlaylistTrackCount(
                loadedPlaylist.tracks
              );

            return {
              ...playlist,
              trackCount:
                uniqueTrackCount,
              tracks: [],
              countLoaded: true,
            };
          } catch (playlistError) {
            console.error(
              "Unable to count Serato playlist tracks:",
              {
                playlistId:
                  playlist.id,
                playlistName:
                  playlist.name,
                error:
                  playlistError,
              }
            );

            return {
              ...playlist,
              trackCount: 0,
              tracks: [],
              countLoaded: false,
            };
          }
        }
      )
    );

    const totalPlaylistTracks =
      playlists.reduce(
        (total, playlist) =>
          total +
          playlist.trackCount,
        0
      );

    return NextResponse.json({
      ok: true,
      playlistCount:
        playlists.length,
      totalPlaylistTracks,
      totalTracks:
        totalPlaylistTracks,
      playlists,
      lazyLoading: true,
      message:
        playlists.length > 0
          ? `${playlists.length} Serato crates and Smart Crates found with song counts loaded.`
          : "No Serato crates or Smart Crates were found.",
    });
  } catch (error) {
    console.error(
      "Unable to list Serato playlists:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        playlistCount: 0,
        totalPlaylistTracks: 0,
        totalTracks: 0,
        playlists: [],
        lazyLoading: true,
        message:
          "Unable to list the Serato crates.",
        error:
          error instanceof Error
            ? error.message
            : "Unknown Serato playlist error",
      },
      {
        status: 500,
      }
    );
  }
}
