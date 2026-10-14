import { parseCardSize } from "@/lib/game/card-layout";
import { localLibraryAccessResponse } from "@/lib/auth/local-library";
import { HostAccessError } from "@/lib/billing/access";
import { makePlaybackConfig } from "@/lib/game/playback-config";
import { BETA_GAME_CARD_LIMIT, betaCardLimitMessage } from "@/lib/game/beta-limits";
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
      BETA_GAME_CARD_LIMIT,
      Math.floor(value)
    )
  );
}

export async function POST(
  request: NextRequest
) {
  const denied = await localLibraryAccessResponse();
  if (denied) return denied;
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

    let cardSize;
    try { cardSize = parseCardSize(body.cardSize); }
    catch { return NextResponse.json({ ok: false, error: "Choose a 3×3 or 5×5 card size.", message: "Choose a 3×3 or 5×5 card size." }, { status: 400 }); }

    const folderPath =
      typeof body.folderPath ===
      "string"
        ? body.folderPath.trim()
        : "";

    if (typeof body.cardCount === "number" && Number.isFinite(body.cardCount) && body.cardCount > BETA_GAME_CARD_LIMIT) {
      return NextResponse.json({ ok: false, message: betaCardLimitMessage() }, { status: 400 });
    }

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
        rows: cardSize, columns: cardSize,
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
        cardCount,
        cardSize
      );

    game.playbackConfig = makePlaybackConfig("local", body.clipLength, game.tracks);

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
    if (error instanceof HostAccessError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
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
