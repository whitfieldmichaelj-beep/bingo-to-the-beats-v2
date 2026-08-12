import {
  randomInt,
  randomUUID,
} from "node:crypto";

import type {
  SeratoPlaylist,
  SeratoTrack,
} from "../serato/types";

import type {
  ActiveGame,
  BingoCard,
  BingoCardSquare,
  BingoPattern,
  CardCapacity,
  GameTrack,
} from "./types";

const JOIN_CODE_LENGTH = 6;

const JOIN_CODE_CHARACTERS =
  "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const CARD_ROWS = 5;
const CARD_COLUMNS = 5;
const SONGS_PER_CARD = CARD_ROWS * CARD_COLUMNS;

const DEFAULT_CARD_COUNT = 25;
const MAX_CARD_COUNT = 5000;

function createJoinCode(): string {
  let joinCode = "";

  for (
    let index = 0;
    index < JOIN_CODE_LENGTH;
    index += 1
  ) {
    const characterIndex = randomInt(
      0,
      JOIN_CODE_CHARACTERS.length
    );

    joinCode +=
      JOIN_CODE_CHARACTERS[characterIndex];
  }

  return joinCode;
}

function normalizeTrackPath(
  value: string
): string {
  return value
    .replace(/\u0000/g, "")
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .trim()
    .toLowerCase();
}

function createTrackUniqueKey(
  track: SeratoTrack
): string {
  const trackId = track.id.trim();

  if (trackId) {
    return `id:${trackId}`;
  }

  const normalizedPath = normalizeTrackPath(
    track.filePath
  );

  if (normalizedPath) {
    return `path:${normalizedPath}`;
  }

  const artist = track.artist
    .trim()
    .toLowerCase();

  const title = track.title
    .trim()
    .toLowerCase();

  if (artist || title) {
    return `metadata:${artist}:${title}`;
  }

  return "";
}

function removeDuplicateTracks(
  tracks: SeratoTrack[]
): SeratoTrack[] {
  const uniqueTracks =
    new Map<string, SeratoTrack>();

  for (const track of tracks) {
    const uniqueKey =
      createTrackUniqueKey(track);

    if (
      !uniqueKey ||
      uniqueTracks.has(uniqueKey)
    ) {
      continue;
    }

    uniqueTracks.set(uniqueKey, track);
  }

  return Array.from(uniqueTracks.values());
}

function createGameTracks(
  tracks: SeratoTrack[]
): GameTrack[] {
  return tracks.map((track, index) => ({
    ...track,
    gameTrackId: randomUUID(),
    position: index,
    called: false,
    calledAt: null,
  }));
}

function calculateCombination(
  totalItems: number,
  selectedItems: number
): bigint {
  if (
    selectedItems < 0 ||
    totalItems < 0 ||
    selectedItems > totalItems
  ) {
    return BigInt(0);
  }

  const smallerSelection = Math.min(
    selectedItems,
    totalItems - selectedItems
  );

  let result = BigInt(1);

  for (
    let index = 1;
    index <= smallerSelection;
    index += 1
  ) {
    result =
      (result *
        BigInt(
          totalItems -
            smallerSelection +
            index
        )) /
      BigInt(index);
  }

  return result;
}

function calculatePermutation(
  totalItems: number,
  selectedItems: number
): bigint {
  if (
    selectedItems < 0 ||
    totalItems < 0 ||
    selectedItems > totalItems
  ) {
    return BigInt(0);
  }

  let result = BigInt(1);

  for (
    let index = 0;
    index < selectedItems;
    index += 1
  ) {
    result *= BigInt(totalItems - index);
  }

  return result;
}

function formatLargeNumber(
  value: bigint
): string {
  const oneThousand = BigInt(1_000);
  const oneMillion = BigInt(1_000_000);
  const oneBillion = BigInt(1_000_000_000);
  const oneTrillion =
    BigInt(1_000_000_000_000);

  if (value >= oneTrillion) {
    return "More than 1 trillion unique layouts";
  }

  if (value >= oneBillion) {
    return "More than 1 billion unique layouts";
  }

  if (value >= oneMillion) {
    return "More than 1 million unique layouts";
  }

  if (value >= oneThousand) {
    return `${value.toLocaleString(
      "en-US"
    )} unique layouts`;
  }

  return `${value.toString()} unique layouts`;
}

function createCardCapacity(
  playlistTrackCount: number
): CardCapacity {
  const canGenerateCards =
    playlistTrackCount >= SONGS_PER_CARD;

  const uniqueSongSelections =
    canGenerateCards
      ? calculateCombination(
          playlistTrackCount,
          SONGS_PER_CARD
        )
      : BigInt(0);

  const uniqueCardLayouts =
    canGenerateCards
      ? calculatePermutation(
          playlistTrackCount,
          SONGS_PER_CARD
        )
      : BigInt(0);

  return {
    playlistTrackCount,
    songsPerCard: SONGS_PER_CARD,
    canGenerateCards,
    uniqueSongSelections:
      uniqueSongSelections.toString(),
    uniqueCardLayouts:
      uniqueCardLayouts.toString(),
    readableCapacity: canGenerateCards
      ? formatLargeNumber(
          uniqueCardLayouts
        )
      : `At least ${SONGS_PER_CARD} unique songs are required.`,
  };
}

function shuffleTracks<T>(
  values: T[]
): T[] {
  const shuffled = [...values];

  for (
    let index = shuffled.length - 1;
    index > 0;
    index -= 1
  ) {
    const randomIndex = randomInt(
      0,
      index + 1
    );

    [
      shuffled[index],
      shuffled[randomIndex],
    ] = [
      shuffled[randomIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

function createCardSignature(
  tracks: GameTrack[]
): string {
  return tracks
    .map((track) => track.gameTrackId)
    .join("|");
}

function createCardSquares(
  tracks: GameTrack[]
): BingoCardSquare[] {
  return tracks.map((track, index) => ({
    squareIndex: index,
    row: Math.floor(
      index / CARD_COLUMNS
    ),
    column: index % CARD_COLUMNS,

    trackId: track.id,
    gameTrackId: track.gameTrackId,

    title:
      track.title || "Unknown Title",

    artist:
      track.artist || "Unknown Artist",

    marked: false,
    markedAt: null,
  }));
}

function generateBingoCards(
  gameId: string,
  tracks: GameTrack[],
  requestedCardCount: number,
  createdAt: string
): BingoCard[] {
  if (tracks.length < SONGS_PER_CARD) {
    throw new Error(
      `At least ${SONGS_PER_CARD} unique songs are required to generate a 5 × 5 bingo card. This playlist contains ${tracks.length}.`
    );
  }

  if (
    !Number.isInteger(requestedCardCount) ||
    requestedCardCount < 1
  ) {
    throw new Error(
      "The requested card count must be a positive whole number."
    );
  }

  if (requestedCardCount > MAX_CARD_COUNT) {
    throw new Error(
      `A maximum of ${MAX_CARD_COUNT.toLocaleString(
        "en-US"
      )} cards can be generated at one time.`
    );
  }

  const cards: BingoCard[] = [];

  const usedSignatures =
    new Set<string>();

  const maximumAttempts =
    Math.max(
      requestedCardCount * 50,
      1000
    );

  let attempts = 0;

  while (
    cards.length < requestedCardCount &&
    attempts < maximumAttempts
  ) {
    attempts += 1;

    const selectedTracks = shuffleTracks(
      tracks
    ).slice(0, SONGS_PER_CARD);

    const signature =
      createCardSignature(selectedTracks);

    if (usedSignatures.has(signature)) {
      continue;
    }

    usedSignatures.add(signature);

    cards.push({
      id: randomUUID(),
      cardNumber: cards.length + 1,
      gameId,

      rows: CARD_ROWS,
      columns: CARD_COLUMNS,
      squareCount: SONGS_PER_CARD,

      signature,

      squares:
        createCardSquares(
          selectedTracks
        ),

      createdAt,
    });
  }

  if (
    cards.length < requestedCardCount
  ) {
    throw new Error(
      `Only ${cards.length.toLocaleString(
        "en-US"
      )} unique cards could be generated after ${attempts.toLocaleString(
        "en-US"
      )} attempts.`
    );
  }

  return cards;
}

export function createGameFromPlaylist(
  playlist: SeratoPlaylist,
  bingoPattern: BingoPattern =
    "single-line",
  requestedCardCount: number =
    DEFAULT_CARD_COUNT
): ActiveGame {
  const uniquePlaylistTracks =
    removeDuplicateTracks(
      playlist.tracks
    );

  if (
    uniquePlaylistTracks.length === 0
  ) {
    throw new Error(
      `Playlist "${playlist.name}" does not contain any usable tracks.`
    );
  }

  if (
    uniquePlaylistTracks.length <
    SONGS_PER_CARD
  ) {
    throw new Error(
      `Playlist "${playlist.name}" contains only ${uniquePlaylistTracks.length} unique songs. At least ${SONGS_PER_CARD} unique songs are required.`
    );
  }

  const gameId = randomUUID();
  const createdAt =
    new Date().toISOString();

  const gameTracks =
    createGameTracks(
      uniquePlaylistTracks
    );

  const cardCapacity =
    createCardCapacity(
      gameTracks.length
    );

  const cards =
    generateBingoCards(
      gameId,
      gameTracks,
      requestedCardCount,
      createdAt
    );

  return {
    id: gameId,
    joinCode: createJoinCode(),

    playlistId: playlist.id,
    playlistName: playlist.name,
    playlistTrackCount:
      gameTracks.length,

    tracks: gameTracks,

    locked: true,
    status: "waiting",
    bingoPattern,

    currentTrackId: null,
    calledTrackIds: [],

    createdAt,
    startedAt: null,
    completedAt: null,

    requestedCardCount,
    songsPerCard: SONGS_PER_CARD,
    cards,
    cardCapacity,
  };
}