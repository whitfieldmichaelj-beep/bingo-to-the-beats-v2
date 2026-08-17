import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  loadLocalMusicCache,
} from "@/lib/music/local/cache";
import {
  getLocalMusicLibrary,
  setLocalMusicLibrary,
} from "@/lib/music/local/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getErrorMessage(
  error: unknown
): string {
  return error instanceof Error
    ? error.message
    : "The local music playlists could not be loaded.";
}

export async function GET(
  request: NextRequest
) {
  try {
    let library =
      getLocalMusicLibrary();

    const cacheKey =
      request.nextUrl.searchParams
        .get("libraryId")
        ?.trim() ||
      request.nextUrl.searchParams
        .get("rootFolderPath")
        ?.trim() ||
      "";

    if (!library && cacheKey) {
      library =
        await loadLocalMusicCache(
          cacheKey
        );

      if (library) {
        setLocalMusicLibrary(
          library
        );
      }
    }

    if (!library) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No local music library is loaded. Scan a music folder first.",
          playlists: [],
        },
        {
          status: 404,
        }
      );
    }

    const playlists =
      [...library.playlists].sort(
        (left, right) => {
          if (
            left.relativePath === ""
          ) {
            return -1;
          }

          if (
            right.relativePath === ""
          ) {
            return 1;
          }

          return left.name.localeCompare(
            right.name,
            undefined,
            {
              numeric: true,
              sensitivity: "base",
            }
          );
        }
      );

    return NextResponse.json({
      ok: true,
      libraryId:
        library.libraryId,
      rootFolderPath:
        library.rootFolderPath,
      rootFolderName:
        library.rootFolderName,
      scannedAt:
        library.scannedAt,
      playlistCount:
        playlists.length,
      playlists,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          getErrorMessage(error),
        playlists: [],
      },
      {
        status: 500,
      }
    );
  }
}
