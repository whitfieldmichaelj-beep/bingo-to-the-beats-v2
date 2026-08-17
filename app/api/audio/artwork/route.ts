import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import { NextRequest } from "next/server";
import {
  parseBuffer,
  selectCover,
} from "music-metadata";

import { findGameById } from "@/lib/game/repository";
import type { GameTrack } from "@/lib/game/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/*
 * BTTB_SERATO_EMBEDDED_ARTWORK_V1
 *
 * Returns embedded cover artwork from the local Serato audio file.
 * If a file has no embedded artwork, a branded SVG placeholder is returned
 * so the Caller screen never shows a broken image.
 */

const SERATO_MUSIC_ROOT =
  process.env.SERATO_MUSIC_ROOT?.trim() ?? "";

function findRequestedTrack(
  tracks: GameTrack[],
  requestedTrackId: string
): GameTrack | null {
  const normalizedRequestedId =
    requestedTrackId.startsWith("serato-")
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

function buildTrackPathCandidates(
  storedPath: string
): string[] {
  const normalized = storedPath
    .replace(/\u0000/g, "")
    .replace(/\\/g, "/")
    .trim();

  if (!normalized) {
    return [];
  }

  const candidates = new Set<string>();

  if (path.isAbsolute(normalized)) {
    candidates.add(
      path.normalize(normalized)
    );
  }

  if (SERATO_MUSIC_ROOT) {
    candidates.add(
      path.resolve(
        SERATO_MUSIC_ROOT,
        normalized.replace(/^\/+/, "")
      )
    );

    const anchors = [
      "/My Crates/",
      "/Dropbox/",
      "/Music/",
    ];

    const lower =
      normalized.toLowerCase();

    for (const anchor of anchors) {
      const index =
        lower.indexOf(
          anchor.toLowerCase()
        );

      if (index >= 0) {
        candidates.add(
          path.resolve(
            SERATO_MUSIC_ROOT,
            normalized.slice(index + 1)
          )
        );
      }
    }
  }

  if (!path.isAbsolute(normalized)) {
    candidates.add(
      path.resolve(normalized)
    );
  }

  return Array.from(candidates);
}

async function resolveExistingTrackPath(
  storedPath: string
): Promise<string | null> {
  for (
    const candidate of
      buildTrackPathCandidates(storedPath)
  ) {
    try {
      const fileStats =
        await stat(candidate);

      if (fileStats.isFile()) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}

function fallbackArtwork(
  label = "Bingo to the Beats"
) {
  const safeLabel = label
    .replace(/[<>&'"]/g, "")
    .slice(0, 60);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
  <defs>
    <radialGradient id="bg" cx="50%" cy="25%" r="80%">
      <stop offset="0%" stop-color="#6d28d9"/>
      <stop offset="55%" stop-color="#312e81"/>
      <stop offset="100%" stop-color="#020617"/>
    </radialGradient>
  </defs>
  <rect width="800" height="800" rx="72" fill="url(#bg)"/>
  <circle cx="400" cy="330" r="170" fill="#ffffff" fill-opacity=".08"/>
  <text x="400" y="405" text-anchor="middle" font-size="220" fill="#ffffff">♫</text>
  <text x="400" y="600" text-anchor="middle" font-family="Arial, sans-serif" font-size="40" font-weight="800" fill="#c4b5fd">${safeLabel}</text>
</svg>`;
}

function svgResponse(
  label?: string
) {
  return new Response(
    fallbackArtwork(label),
    {
      status: 200,
      headers: {
        "Content-Type":
          "image/svg+xml; charset=utf-8",
        "Cache-Control":
          "private, max-age=3600",
      },
    }
  );
}

export async function GET(
  request: NextRequest
) {
  const gameId =
    request.nextUrl.searchParams
      .get("gameId")
      ?.trim() ?? "";

  const trackId =
    request.nextUrl.searchParams
      .get("trackId")
      ?.trim() ?? "";

  if (!gameId || !trackId) {
    return svgResponse();
  }

  try {
    const game =
      await findGameById(gameId);

    if (!game) {
      return svgResponse();
    }

    const track =
      findRequestedTrack(
        game.tracks,
        trackId
      );

    if (!track) {
      return svgResponse();
    }

    const storedFilePath =
      track.filePath?.trim() ?? "";

    if (!storedFilePath) {
      return svgResponse(
        track.title ||
          track.fileName ||
          "Bingo to the Beats"
      );
    }

    const filePath =
      await resolveExistingTrackPath(
        storedFilePath
      );

    if (!filePath) {
      return svgResponse(
        track.title ||
          track.fileName ||
          "Bingo to the Beats"
      );
    }

    const audioBuffer =
      await readFile(filePath);

    const metadata =
      await parseBuffer(
        audioBuffer,
        {
          path: filePath,
          size: audioBuffer.byteLength,
        },
        {
          duration: false,
          skipCovers: false,
        }
      );

    const cover =
      selectCover(
        metadata.common.picture
      );

    if (!cover) {
      return svgResponse(
        track.title ||
          track.fileName ||
          "Bingo to the Beats"
      );
    }

    const contentType =
      cover.format.startsWith("image/")
        ? cover.format
        : "image/jpeg";

    return new Response(
      new Uint8Array(cover.data),
      {
        status: 200,
        headers: {
          "Content-Type":
            contentType,
          "Content-Length":
            String(
              cover.data.byteLength
            ),
          "Cache-Control":
            "private, max-age=86400",
          "X-Content-Type-Options":
            "nosniff",
        },
      }
    );
  } catch (error) {
    console.error(
      "Unable to load Serato artwork:",
      error
    );

    return svgResponse();
  }
}
