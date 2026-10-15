import { parseCardSize } from "@/lib/game/card-layout";
import { getDjAdapter } from "@/lib/dj/bridge";
import { isDjProvider } from "@/lib/dj/providers";
import { excludedDjSong } from "@/lib/serato/song-filter";
import { localLibraryAccessResponse } from "@/lib/auth/local-library";
import { companionPlaylists } from "@/lib/companion/library";
import { HostAccessError } from "@/lib/billing/access";
import { makePlaybackConfig } from "@/lib/game/playback-config";
import { BETA_GAME_CARD_LIMIT, betaCardLimitMessage } from "@/lib/game/beta-limits";
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
const MAX_CARD_COUNT = BETA_GAME_CARD_LIMIT;

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
    const songsPerCard = cardSize * cardSize;

    const playlistId =
      typeof body.playlistId ===
      "string"
        ? body.playlistId.trim()
        : "";

    if (typeof body.cardCount === "number" && Number.isFinite(body.cardCount) && body.cardCount > BETA_GAME_CARD_LIMIT) {
      return NextResponse.json({ ok: false, message: betaCardLimitMessage() }, { status: 400 });
    }

    const cardCount =
      normalizeCardCount(
        body.cardCount
      );

    const practice = cardCount === 5;
    const generatedCardCount = practice ? 50 : cardCount;

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
    if (!isDjProvider(provider)) {
      return NextResponse.json(
        { ok: false, message: "Unknown DJ software." },
        { status: 400 }
      );
    }

    let loadedPlaylist = null;
    if (provider === "serato") {
      const synced = await companionPlaylists(userId);
      loadedPlaylist =
        synced?.find((playlist) => playlist.id === playlistId) ??
        null;
    }

    if (!loadedPlaylist) {
      const denied = await localLibraryAccessResponse();
      if (denied) return denied;
      loadedPlaylist =
        await (await getDjAdapter(provider)).loadPlaylist(playlistId);
    }

    if (!loadedPlaylist) {
      return NextResponse.json(
        { ok: false, message: "Playlist not found." },
        { status: 404 }
      );
    }

    const {
      playlist: playablePlaylist,
      excludedCount,
      duplicateCount,
    } = buildPlayablePlaylist(
      loadedPlaylist
    );

    if (
      playablePlaylist.tracks.length < songsPerCard
    ) {
      return NextResponse.json(
        {
          ok: false,
          message:
            `This playlist has ${playablePlaylist.tracks.length} usable songs after removing ${excludedCount} excluded edits and ${duplicateCount} duplicate versions. Bingo requires ${songsPerCard} different songs. Add at least ${songsPerCard - playablePlaylist.tracks.length} more different songs, then refresh the playlist.`,
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
        rows: cardSize, columns: cardSize,
        uniqueSongCount,
        requestedCardCount:
          generatedCardCount,
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
        generatedCardCount,
        cardSize
      );

    game.playbackConfig = makePlaybackConfig(provider, body.clipLength, game.tracks);

    const savedGame =
      await persistGame(
        game,
        userId,
        { practice }
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
