import {
  auth,
} from "@clerk/nextjs/server";

import {
  NextRequest,
  NextResponse,
} from "next/server";

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
  SeratoTrack,
} from "@/lib/serato/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// BTTB_STREAMING_GAME_PERSISTENCE_V1

type StreamingSource =
  | "apple"
  | "spotify";

type StreamingTrackInput = {
  id?: unknown;
  name?: unknown;
  artist?: unknown;
  album?: unknown;
};

type StreamingGameBody = {
  source?: unknown;
  playlistId?: unknown;
  playlistName?: unknown;
  cardCount?: unknown;
  bingoPattern?: unknown;
  winningPattern?: unknown;
  tracks?: unknown;
};

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

function normalizeString(
  value: unknown
) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeSource(
  value: unknown
): StreamingSource | null {
  return value === "apple" ||
    value === "spotify"
    ? value
    : null;
}

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
) {
  const parsed =
    typeof value === "number"
      ? value
      : Number(value);

  if (
    !Number.isFinite(parsed)
  ) {
    return 100;
  }

  return Math.min(
    500,
    Math.max(
      1,
      Math.floor(parsed)
    )
  );
}

function normalizeTracks(
  value: unknown
): SeratoTrack[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const tracks:
    SeratoTrack[] = [];

  const seen =
    new Set<string>();

  for (
    const item of value
  ) {
    if (
      !item ||
      typeof item !== "object"
    ) {
      continue;
    }

    const input =
      item as StreamingTrackInput;

    const id =
      normalizeString(input.id);

    const title =
      normalizeString(
        input.name
      );

    const artist =
      normalizeString(
        input.artist
      );

    const album =
      normalizeString(
        input.album
      );

    if (
      !id ||
      !title ||
      seen.has(id)
    ) {
      continue;
    }

    seen.add(id);

    tracks.push({
      id,
      title,
      artist:
        artist ||
        "Unknown Artist",
      album,
      bpm: null,
      filePath: "",
      fileName: "",
    });
  }

  return tracks;
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
      (await request.json()) as
        StreamingGameBody;

    const source =
      normalizeSource(
        body.source
      );

    const playlistId =
      normalizeString(
        body.playlistId
      );

    const playlistName =
      normalizeString(
        body.playlistName
      );

    const cardCount =
      normalizeCardCount(
        body.cardCount
      );

    const bingoPattern =
      normalizePattern(
        body.bingoPattern ??
          body.winningPattern
      );

    const tracks =
      normalizeTracks(
        body.tracks
      );

    if (!source) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "Music source must be Apple Music or Spotify.",
        },
        {
          status: 400,
        }
      );
    }

    if (!playlistId) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "playlistId is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (
      tracks.length < 25
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            `This playlist has ${tracks.length} usable song${
              tracks.length === 1
                ? ""
                : "s"
            }. At least 25 unique songs are required to create bingo cards.`,
        },
        {
          status: 400,
        }
      );
    }

    const playlist:
      SeratoPlaylist = {
        id: playlistId,
        name:
          playlistName ||
          `${
            source === "apple"
              ? "Apple Music"
              : "Spotify"
          } Playlist`,
        filePath:
          `${source}://${playlistId}`,
        trackCount:
          tracks.length,
        tracks,
      };

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
      source,
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
      "Unable to create streaming music game:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Unable to create the game.",
        error:
          error instanceof Error
            ? error.message
            : "Unknown streaming game creation error",
      },
      {
        status: 500,
      }
    );
  }
}
