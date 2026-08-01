import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { createGame as persistGame } from "@/lib/game/repository";
import { createGameFromPlaylist } from "@/lib/game/service";
import type { BingoPattern } from "@/lib/game/types";

import { loadPlaylist } from "@/lib/serato/playlist-reader";
import { getSeratoPlaylists } from "@/lib/serato/playlists";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_CARD_COUNT = 25;
const MAX_CARD_COUNT = 5000;

const VALID_PATTERNS = new Set<BingoPattern>([
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

function normalizeCardCount(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value)
  ) {
    return DEFAULT_CARD_COUNT;
  }

  return Math.max(
    1,
    Math.min(
      MAX_CARD_COUNT,
      Math.floor(value)
    )
  );
}

function normalizeBingoPattern(
  value: unknown
): BingoPattern {
  if (
    typeof value === "string" &&
    VALID_PATTERNS.has(value as BingoPattern)
  ) {
    return value as BingoPattern;
  }

  return "single-line";
}

export async function POST(
  request: NextRequest
) {
  try {
    const {
      isAuthenticated,
      userId,
    } = await auth();

    if (!isAuthenticated || !userId) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "You must be logged in to create a game.",
        },
        { status: 401 }
      );
    }

    const body = await request.json();

    const playlistId =
      typeof body.playlistId === "string"
        ? body.playlistId.trim()
        : "";

    const cardCount = normalizeCardCount(
      body.cardCount
    );

    const bingoPattern =
      normalizeBingoPattern(
        body.bingoPattern ??
          body.winningPattern
      );

    if (!playlistId) {
      return NextResponse.json(
        {
          ok: false,
          message: "playlistId is required.",
        },
        { status: 400 }
      );
    }

    const playlists =
      await getSeratoPlaylists();

    const playlist = playlists.find(
      (candidate) =>
        candidate.id === playlistId
    );

    if (!playlist) {
      return NextResponse.json(
        {
          ok: false,
          message: "Playlist not found.",
        },
        { status: 404 }
      );
    }

    const loadedPlaylist =
      await loadPlaylist(playlist);

    const game = createGameFromPlaylist(
      loadedPlaylist,
      bingoPattern,
      cardCount
    );

    await persistGame(game);

    return NextResponse.json({
      ok: true,
      game,
      hostClerkId: userId,
      cardCount:
        game.cards?.length ?? 0,
      cardCapacity:
        game.cardCapacity ?? null,
    });
  } catch (error) {
    console.error(
      "Unable to create Serato game:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message: "Unable to create game.",
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 }
    );
  }
}

