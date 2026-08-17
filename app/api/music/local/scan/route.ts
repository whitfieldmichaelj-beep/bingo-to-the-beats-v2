import {
  NextRequest,
  NextResponse,
} from "next/server";

import type {
  LocalMusicScanRequest,
} from "@/types/local-music";

import {
  saveLocalMusicCache,
} from "@/lib/music/local/cache";
import {
  setLocalMusicLibrary,
} from "@/lib/music/local/library";
import {
  scanLocalMusicLibrary,
} from "@/lib/music/local/scanner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getErrorMessage(
  error: unknown
): string {
  return error instanceof Error
    ? error.message
    : "The local music folder could not be scanned.";
}

function isScanRequest(
  value: unknown
): value is LocalMusicScanRequest {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const request =
    value as Partial<
      LocalMusicScanRequest
    >;

  return (
    typeof request.folderPath ===
      "string" &&
    request.folderPath.trim().length >
      0
  );
}

export async function POST(
  request: NextRequest
) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error:
          "The request body must be valid JSON.",
      },
      {
        status: 400,
      }
    );
  }

  if (!isScanRequest(body)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "A local music folder path is required.",
      },
      {
        status: 400,
      }
    );
  }

  try {
    const library =
      await scanLocalMusicLibrary({
        folderPath:
          body.folderPath.trim(),
        recursive:
          body.recursive !== false,
        buildFolderPlaylists:
          body.buildFolderPlaylists !==
          false,
        includeHiddenFiles:
          body.includeHiddenFiles ===
          true,
      });

    setLocalMusicLibrary(library);

    let cacheFilePath:
      | string
      | null = null;

    try {
      cacheFilePath =
        await saveLocalMusicCache(
          library
        );
    } catch (cacheError) {
      library.warnings.push(
        `The library was scanned but could not be cached: ${getErrorMessage(
          cacheError
        )}`
      );
    }

    return NextResponse.json({
      ...library,
      cacheFilePath,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error:
          getErrorMessage(error),
      },
      {
        status: 500,
      }
    );
  }
}
