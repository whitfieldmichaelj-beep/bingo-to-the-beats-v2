import { getDjAdapter } from "@/lib/dj/bridge";
import { isDjProvider } from "@/lib/dj/providers";
import { excludedDjSong } from "@/lib/serato/song-filter";
import { localLibraryAccessResponse } from "@/lib/auth/local-library";
import { HostAccessError } from "@/lib/billing/access";
import { makePlaybackConfig } from "@/lib/game/playback-config";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import {
  createGame as persistGame,
} from "@/lib/game/repository";

import {
  createGameFromPlaylist,
  getUniquePlaylistTrackCount,
} from "@/lib/game/service";

import {
  evaluateGameBalance,
} from "@/lib/game/balance-validator";

import type {
  BingoPattern,
} from "@/lib/game/types";




import type {
  SeratoPlaylist,
  SeratoTrack,
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

  return "single-line";
}


/*
 * BTTB_NONREPEATING_SHUFFLE_V1
 *
 * The playable song pool is cleaned before the game and bingo
 * cards are generated. This guarantees that excluded tracks do
 * not appear on cards and that the host queue contains one copy
 * of each song.
 */
function shouldExcludeTrack(track: SeratoTrack): boolean {
  return excludedDjSong(track.title ?? "", track.fileName ?? "");
}

function normalizeDuplicateKeyPart(
  value: string
): string {
  return value
    .toLowerCase()
    .replace(
      /\([^)]*\b(clean|dirty|explicit|radio|extended|version|edit|intro|outro)\b[^)]*\)/gi,
      " "
    )
    .replace(
      /\[[^\]]*\b(clean|dirty|explicit|radio|extended|version|edit|intro|outro)\b[^\]]*\]/gi,
      " "
    )
    .replace(
      /\b(clean|dirty|explicit|radio edit|extended edit)\b/gi,
      " "
    )
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSongDuplicateKey(
  track: SeratoTrack
): string {
  const titleKey =
    normalizeDuplicateKeyPart(
      track.title || track.fileName || ""
    );

  const artistKey =
    normalizeDuplicateKeyPart(
      track.artist || ""
    );

  return `${artistKey}::${titleKey}`;
}

function buildPlayablePlaylist(
  playlist: SeratoPlaylist
): {
  playlist: SeratoPlaylist;
  excludedCount: number;
  duplicateCount: number;
} {
  const seenSongs =
    new Set<string>();

  const playableTracks:
    SeratoTrack[] = [];

  let excludedCount = 0;
  let duplicateCount = 0;

  for (const track of playlist.tracks) {
    if (shouldExcludeTrack(track)) {
      excludedCount += 1;
      continue;
    }

    const duplicateKey =
      getSongDuplicateKey(track);

    if (
      duplicateKey &&
      seenSongs.has(duplicateKey)
    ) {
      duplicateCount += 1;
      continue;
    }

    if (duplicateKey) {
      seenSongs.add(duplicateKey);
    }

    playableTracks.push(track);
  }

  return {
    playlist: {
      ...playlist,
      trackCount: playableTracks.length,
      tracks: playableTracks,
    },
    excludedCount,
    duplicateCount,
  };
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

    const playlistId =
      typeof body.playlistId ===
      "string"
        ? body.playlistId.trim()
        : "";

    const cardCount =
      normalizeCardCount(
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
          message:
            "playlistId is required.",
        },
        {
          status: 400,
        }
      );
    }

    const provider = body.provider ?? "serato";
    if (!isDjProvider(provider)) return NextResponse.json({ok:false,message:"Unknown DJ software."},{status:400});
    const loadedPlaylist = await (await getDjAdapter(provider)).loadPlaylist(playlistId);
    if (!loadedPlaylist) return NextResponse.json({ok:false,message:"Playlist not found."},{status:404});

    const {
      playlist: playablePlaylist,
      excludedCount,
      duplicateCount,
    } = buildPlayablePlaylist(
      loadedPlaylist
    );

    if (
      playablePlaylist.tracks.length < 25
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            "After removing excluded and duplicate songs, this playlist does not have the 25 unique playable songs required for bingo.",
          playableTrackCount:
            playablePlaylist.tracks.length,
          excludedCount,
          duplicateCount,
        },
        {
          status: 422,
        }
      );
    }

    const uniqueSongCount =
      getUniquePlaylistTrackCount(
        playablePlaylist.tracks
      );

    const advisor =
      evaluateGameBalance({
        uniqueSongCount,
        requestedCardCount:
          cardCount,
        bingoPattern,
      });

    if (advisor.status === "blocked") {
      return NextResponse.json(
        {
          ok: false,
          message:
            "This game configuration is too unbalanced to create safely.",
          advisor,
        },
        {
          status: 422,
        }
      );
    }

    const game =
      createGameFromPlaylist(
        playablePlaylist,
        bingoPattern,
        cardCount
      );

    game.playbackConfig = makePlaybackConfig(provider, body.clipLength, game.tracks);

    const savedGame =
      await persistGame(
        game,
        userId,
        { practice: cardCount === 5 }
      );

    return NextResponse.json({
      ok: true,
      game: savedGame,
      hostClerkId: userId,
      cardCount:
        savedGame.cards?.length ??
        0,
      cardCapacity:
        savedGame.cardCapacity ??
        game.cardCapacity ??
        null,
      advisor,
      songPool: {
        playableTrackCount:
          playablePlaylist.tracks.length,
        excludedCount,
        duplicateCount,
      },
    });
  } catch (error) {
    if (error instanceof HostAccessError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
    console.error(
      "Unable to create Serato game:",
      error
    );

    return NextResponse.json(
      {
        ok: false,
        message:
          "Unable to create game.",
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
      }
    );
  }
}
