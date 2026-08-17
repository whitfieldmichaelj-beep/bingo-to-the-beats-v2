import {
  auth,
} from "@clerk/nextjs/server";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  evaluateGameBalance,
} from "@/lib/game/balance-validator";

import {
  createGame as persistGame,
} from "@/lib/game/repository";

import {
  createGameFromPlaylist,
} from "@/lib/game/service";

import type {
  BingoPattern,
} from "@/lib/game/types";

import {
  scanLocalMusicFolder,
} from "@/lib/music/local-scanner";

import type {
  SeratoPlaylist,
  SeratoTrack,
} from "@/lib/serato/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PATTERNS =
  new Set<BingoPattern>([
    "single-line",
    "four-corners",
    "x-pattern",
    "full-card",
    "any-line",
    "across",
    "down",
    "diagonal",
    "blackout",
  ]);

function normalizePattern(
  value: unknown
): BingoPattern {
  if (
    typeof value === "string" &&
    VALID_PATTERNS.has(
      value as BingoPattern
    )
  ) {
    return value as BingoPattern;
  }

  return "any-line";
}

function normalizeCardCount(
  value: unknown
): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return 25;
  }

  return Math.max(
    1,
    Math.min(
      5000,
      Math.floor(value)
    )
  );
}

export async function POST(
  request: NextRequest
) {
  try {
    const {
      isAuthenticated,
      userId,
    } = await auth();

    if (
      !isAuthenticated ||
      !userId
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "You must be logged in to create a game.",
        },
        {
          status: 401,
        }
      );
    }

    const body =
      await request.json();

    const folderPath =
      typeof body.folderPath ===
      "string"
        ? body.folderPath.trim()
        : "";

    const cardCount =
      normalizeCardCount(
        body.cardCount
      );

    const bingoPattern =
      normalizePattern(
        body.bingoPattern ??
          body.winningPattern
      );

    const scan =
      await scanLocalMusicFolder(
        folderPath
      );

    const advisor =
      evaluateGameBalance({
        uniqueSongCount:
          scan.tracks.length,
        requestedCardCount:
          cardCount,
        bingoPattern,
        clipLength:
          typeof body.clipLength ===
          "number"
            ? body.clipLength
            : 30,
      });

    if (
      advisor.status ===
      "blocked"
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "This local music game is too unbalanced to create safely.",
          advisor,
          summary:
            scan.summary,
        },
        {
          status: 422,
        }
      );
    }

    const compatibleTracks:
      SeratoTrack[] =
      scan.tracks.map(
        (track) => ({
          id: track.id,
          title: track.title,
          artist:
            track.artist,
          album: track.album,
          bpm:
            track.bpm ?? null,
          filePath:
            track.filePath ?? "",
          fileName:
            track.fileName ?? "",
        })
      );

    const compatiblePlaylist:
      SeratoPlaylist = {
      id:
        scan.playlist.id,
      name:
        scan.playlist.name,
      filePath:
        scan.summary.folderPath,
      trackCount:
        compatibleTracks.length,
      tracks:
        compatibleTracks,
    };

    const game =
      createGameFromPlaylist(
        compatiblePlaylist,
        bingoPattern,
        cardCount
      );

    const savedGame =
      await persistGame(
        game,
        userId
      );

    return NextResponse.json({
      ok: true,
      game: savedGame,
      advisor,
      summary:
        scan.summary,
    });
  } catch (error) {
    console.error(
      "Unable to create local music game:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Unable to create the local music game.",
        error:
          error instanceof Error
            ? error.message
            : "Unknown local game error",
      },
      {
        status: 500,
      }
    );
  }
}
