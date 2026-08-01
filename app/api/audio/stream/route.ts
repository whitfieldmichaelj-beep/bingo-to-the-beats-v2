Library
/audio-stream-route.ts

import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { NextRequest, NextResponse } from "next/server";

import { findGameById } from "@/lib/game/repository";
import type { GameTrack } from "@/lib/game/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SERATO_MUSIC_ROOT =
  process.env.SERATO_MUSIC_ROOT?.trim() ?? "";

function getContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
    case ".mp4":
      return "audio/mp4";
    case ".aac":
      return "audio/aac";
    case ".wav":
      return "audio/wav";
    case ".aif":
    case ".aiff":
      return "audio/aiff";
    case ".flac":
      return "audio/flac";
    case ".ogg":
    case ".oga":
      return "audio/ogg";
    case ".opus":
      return "audio/opus";
    default:
      return "application/octet-stream";
  }
}

function sanitizeFileName(fileName: string): string {
  return fileName.replace(/["\r\n]/g, "_");
}

function findRequestedTrack(
  tracks: GameTrack[],
  requestedTrackId: string
): GameTrack | null {
  const normalizedRequestedId = requestedTrackId.startsWith("serato-")
    ? requestedTrackId.slice("serato-".length)
    : requestedTrackId;

  return (
    tracks.find((track) => {
      return (
        track.gameTrackId === requestedTrackId ||
        track.gameTrackId === normalizedRequestedId ||
        track.id === requestedTrackId ||
        track.id === normalizedRequestedId ||
        `serato-${track.gameTrackId}` === requestedTrackId ||
        `serato-${track.id}` === requestedTrackId
      );
    }) ?? null
  );
}

function buildTrackPathCandidates(storedPath: string): string[] {
  const normalized = storedPath
    .replace(/\u0000/g, "")
    .replace(/\\/g, "/")
    .trim();

  if (!normalized) {
    return [];
  }

  const candidates = new Set<string>();

  // Keep genuine absolute macOS paths exactly as Serato recorded them.
  if (path.isAbsolute(normalized)) {
    candidates.add(path.normalize(normalized));
  }

  // Serato may also store drive-relative paths such as /All Music/Song.mp3.
  if (SERATO_MUSIC_ROOT) {
    candidates.add(
      path.resolve(
        SERATO_MUSIC_ROOT,
        normalized.replace(/^\/+/, "")
      )
    );
  }

  // Retain a relative path as a final fallback.
  if (!path.isAbsolute(normalized)) {
    candidates.add(path.resolve(normalized));
  }

  return Array.from(candidates);
}

async function resolveExistingTrackPath(
  storedPath: string
): Promise<{
  filePath: string;
  fileSize: number;
  attemptedPaths: string[];
} | null> {
  const attemptedPaths = buildTrackPathCandidates(storedPath);

  for (const candidate of attemptedPaths) {
    try {
      const fileStats = await stat(candidate);

      if (fileStats.isFile()) {
        return {
          filePath: candidate,
          fileSize: fileStats.size,
          attemptedPaths,
        };
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function parseRange(
  rangeHeader: string,
  fileSize: number
): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());

  if (!match) {
    return null;
  }

  const startText = match[1];
  const endText = match[2];

  let start: number;
  let end: number;

  if (!startText && !endText) {
    return null;
  }

  if (!startText) {
    const suffixLength = Number(endText);

    if (
      !Number.isInteger(suffixLength) ||
      suffixLength <= 0
    ) {
      return null;
    }

    start = Math.max(0, fileSize - suffixLength);
    end = fileSize - 1;
  } else {
    start = Number(startText);

    if (!Number.isInteger(start) || start < 0) {
      return null;
    }

    end = endText ? Number(endText) : fileSize - 1;

    if (!Number.isInteger(end)) {
      return null;
    }
  }

  if (start >= fileSize || end < start || end < 0) {
    return null;
  }

  end = Math.min(end, fileSize - 1);

  return { start, end };
}

function createWebStream(
  filePath: string,
  start?: number,
  end?: number
): ReadableStream {
  const nodeStream =
    typeof start === "number" && typeof end === "number"
      ? createReadStream(filePath, { start, end })
      : createReadStream(filePath);

  return Readable.toWeb(nodeStream) as ReadableStream;
}

async function resolveAudioRequest(request: NextRequest) {
  const gameId =
    request.nextUrl.searchParams.get("gameId")?.trim() ?? "";

  const trackId =
    request.nextUrl.searchParams.get("trackId")?.trim() ?? "";

  if (!gameId || !trackId) {
    return {
      error: NextResponse.json(
        {
          ok: false,
          message: "gameId and trackId are required.",
        },
        { status: 400 }
      ),
    };
  }

  const game = await findGameById(gameId);

  if (!game) {
    return {
      error: NextResponse.json(
        {
          ok: false,
          message:
            "Game not found. Create a new game and try again.",
        },
        { status: 404 }
      ),
    };
  }

  const track = findRequestedTrack(game.tracks, trackId);

  if (!track) {
    return {
      error: NextResponse.json(
        {
          ok: false,
          message: "Track was not found in this game.",
          requestedTrackId: trackId,
        },
        { status: 404 }
      ),
    };
  }

  const storedFilePath = track.filePath?.trim() ?? "";

  if (!storedFilePath) {
    return {
      error: NextResponse.json(
        {
          ok: false,
          message: "The selected track has no audio file path.",
        },
        { status: 404 }
      ),
    };
  }

  const resolved = await resolveExistingTrackPath(storedFilePath);

  if (!resolved) {
    const attemptedPaths = buildTrackPathCandidates(storedFilePath);

    console.error("Unable to access Serato audio file:", {
      gameId,
      trackId,
      storedFilePath,
      attemptedPaths,
      seratoMusicRoot:
        SERATO_MUSIC_ROOT || "(not configured)",
    });

    return {
      error: NextResponse.json(
        {
          ok: false,
          message:
            "The audio file could not be found on this computer.",
          fileName: track.fileName,
          storedFilePath,
          attemptedPaths,
        },
        { status: 404 }
      ),
    };
  }

  return {
    game,
    track,
    filePath: resolved.filePath,
    fileSize: resolved.fileSize,
  };
}

export async function GET(request: NextRequest) {
  try {
    const resolved = await resolveAudioRequest(request);

    if ("error" in resolved) {
      return resolved.error;
    }

    const { track, filePath, fileSize } = resolved;
    const contentType = getContentType(filePath);

    const fileName = sanitizeFileName(
      track.fileName || path.basename(filePath)
    );

    const commonHeaders = {
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store, private",
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${fileName}"`,
      "X-Content-Type-Options": "nosniff",
    };

    const rangeHeader = request.headers.get("range");

    if (rangeHeader) {
      const range = parseRange(rangeHeader, fileSize);

      if (!range) {
        return new Response(null, {
          status: 416,
          headers: {
            ...commonHeaders,
            "Content-Range": `bytes */${fileSize}`,
          },
        });
      }

      const { start, end } = range;
      const chunkSize = end - start + 1;
      const stream = createWebStream(filePath, start, end);

      return new Response(stream, {
        status: 206,
        headers: {
          ...commonHeaders,
          "Content-Length": String(chunkSize),
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
        },
      });
    }

    const stream = createWebStream(filePath);

    return new Response(stream, {
      status: 200,
      headers: {
        ...commonHeaders,
        "Content-Length": String(fileSize),
      },
    });
  } catch (error) {
    console.error("Audio stream error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Unable to stream the selected audio file.",
        error:
          error instanceof Error
            ? error.message
            : "Unknown audio stream error",
      },
      { status: 500 }
    );
  }
}

export async function HEAD(request: NextRequest) {
  try {
    const resolved = await resolveAudioRequest(request);

    if ("error" in resolved) {
      return resolved.error;
    }

    const { track, filePath, fileSize } = resolved;

    const fileName = sanitizeFileName(
      track.fileName || path.basename(filePath)
    );

    return new Response(null, {
      status: 200,
      headers: {
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-store, private",
        "Content-Length": String(fileSize),
        "Content-Type": getContentType(filePath),
        "Content-Disposition": `inline; filename="${fileName}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Audio HEAD request error:", error);

    return NextResponse.json(
      {
        ok: false,
        message: "Unable to inspect the selected audio file.",
      },
      { status: 500 }
    );
  }
}

