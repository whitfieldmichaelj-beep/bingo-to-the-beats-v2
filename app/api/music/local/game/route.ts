import { auth } from "@clerk/nextjs/server";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  loadLocalMusicCache,
} from "@/lib/music/local/cache";
import {
  buildLocalMusicGame,
  type BuildLocalMusicGameOptions,
} from "@/lib/music/local/game-builder";
import {
  getLocalMusicLibrary,
  setLocalMusicLibrary,
} from "@/lib/music/local/library";

import {
  createGame as persistGame,
} from "@/lib/game/repository";
import {
  createGameFromPlaylist,
} from "@/lib/game/service";
import type {
  BingoPattern,
} from "@/lib/game/types";
import type {
  SeratoPlaylist,
} from "@/lib/serato/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_CARD_COUNT = 25;
const MAX_CARD_COUNT = 5000;

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

type CreateLocalGameRequest =
  BuildLocalMusicGameOptions & {
    libraryId?: string;
    rootFolderPath?: string;
    cardCount?: number;
    bingoPattern?: BingoPattern;
    winningPattern?: BingoPattern;
  };

function getErrorMessage(
  error: unknown
): string {
  return error instanceof Error
    ? error.message
    : "The local music game could not be created.";
}

function isRequestObject(
  value: unknown
): value is CreateLocalGameRequest {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value)
  );
}

function normalizeCardCount(
  value: unknown
): number {
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
    VALID_PATTERNS.has(
      value as BingoPattern
    )
  ) {
    return value as BingoPattern;
  }

  return "any-line";
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

  if (!isRequestObject(body)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "The local game request is invalid.",
      },
      {
        status: 400,
      }
    );
  }

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
          error:
            "You must be logged in to create a game.",
        },
        {
          status: 401,
        }
      );
    }

    let library =
      getLocalMusicLibrary();

    const cacheKey =
      body.libraryId?.trim() ||
      body.rootFolderPath?.trim() ||
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
        },
        {
          status: 404,
        }
      );
    }

    const localGame =
      buildLocalMusicGame({
        gameName:
          body.gameName,
        playlistId:
          body.playlistId,
        trackIds:
          body.trackIds,
        requestedTrackCount:
          body.requestedTrackCount,
        minimumTrackCount:
          body.minimumTrackCount,
        idealTrackCount:
          body.idealTrackCount,
        maximumTrackCount:
          body.maximumTrackCount,
        includeDuplicates:
          body.includeDuplicates,
        includeUnreadable:
          body.includeUnreadable,
        seed:
          body.seed,
      });

    const playlist: SeratoPlaylist = {
      id:
        localGame.playlistId ||
        `local-${library.libraryId}`,
      name:
        localGame.name,
      filePath:
        library.rootFolderPath,
      trackCount:
        localGame.tracks.length,
      tracks:
        localGame.tracks.map(
          (track) => ({
            id: track.id,
            title: track.title,
            artist: track.artist,
            album: track.album,
            bpm: track.bpm,
            filePath:
              track.filePath,
            fileName:
              track.fileName,
          })
        ),
    };

    const bingoPattern =
      normalizeBingoPattern(
        body.bingoPattern ??
          body.winningPattern
      );

    const cardCount =
      normalizeCardCount(
        body.cardCount
      );

    const game =
      createGameFromPlaylist(
        playlist,
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
      libraryId:
        library.libraryId,
      game: savedGame,
      cardCount:
        savedGame.cards?.length ??
        0,
      cardCapacity:
        savedGame.cardCapacity ??
        game.cardCapacity ??
        null,
    });
  } catch (error) {
    console.error(
      "Unable to create local music game:",
      error
    );

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
