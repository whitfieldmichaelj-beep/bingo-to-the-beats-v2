import type {
  ActiveGame,
  BingoCard,
  BingoCardSquare,
  BingoPattern,
  GameStatus,
  GameTrack,
} from "./types";

type DbTrack = {
  providerTrackId: string;
  title: string;
  artist: string;
  album: string | null;
  filePath: string | null;
  fileName: string | null;
  bpm: number | null;
};

type DbGameTrack = {
  id: string;
  position: number;
  called: boolean;
  calledAt: Date | null;
  track: DbTrack;
};

type DbSquare = {
  position: number;
  row: number;
  column: number;
  marked: boolean;
  markedAt: Date | null;
  track: DbTrack;
};

type DbCard = {
  id: string;
  cardNumber: number;
  rows: number;
  columns: number;
  squareCount: number;
  signature: string;
  createdAt: Date;
  squares: DbSquare[];
};

export type DatabaseGameWithRelations = {
  id: string;
  joinCode: string;
  sourcePlaylistId: string | null;
  playlistName: string;
  playlistTrackCount: number;
  status: string;
  winningRule: string;
  currentTrackId: string | null;
  requestedCardCount: number;
  songsPerCard: number;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
  tracks: DbGameTrack[];
  cards: DbCard[];
};

function mapStatus(value: string): GameStatus {
  if (value === "LIVE") return "active";
  if (value === "PAUSED") return "paused";
  if (value === "COMPLETED" || value === "CANCELLED") {
    return "completed";
  }
  return "waiting";
}

function mapPattern(value: string): BingoPattern {
  const patterns: BingoPattern[] = [
    "single-line",
    "four-corners",
    "x-pattern",
    "full-card",
    "any-line",
    "across",
    "down",
    "diagonal",
    "blackout",
  ];

  return patterns.includes(value as BingoPattern)
    ? (value as BingoPattern)
    : "single-line";
}

function mapGameTrack(value: DbGameTrack): GameTrack {
  return {
    id: value.track.providerTrackId,
    gameTrackId: value.id,
    title: value.track.title,
    artist: value.track.artist,
    album: value.track.album ?? undefined,
    bpm: value.track.bpm,
    filePath: value.track.filePath ?? "",
    fileName: value.track.fileName ?? "",
    position: value.position,
    called: value.called,
    calledAt: value.calledAt?.toISOString() ?? null,
  };
}

function mapSquare(
  value: DbSquare,
  gameTrackIdByTrackId: Map<string, string>
): BingoCardSquare {
  const trackId = value.track.providerTrackId;

  return {
    squareIndex: value.position,
    row: value.row,
    column: value.column,
    trackId,
    gameTrackId: gameTrackIdByTrackId.get(trackId) ?? "",
    title: value.track.title,
    artist: value.track.artist,
    marked: value.marked,
    markedAt: value.markedAt?.toISOString() ?? null,
  };
}

function mapCard(
  value: DbCard,
  gameId: string,
  gameTrackIdByTrackId: Map<string, string>
): BingoCard {
  return {
    id: value.id,
    cardNumber: value.cardNumber,
    gameId,
    rows: value.rows,
    columns: value.columns,
    squareCount: value.squareCount,
    signature: value.signature,
    squares: [...value.squares]
      .sort((a, b) => a.position - b.position)
      .map((square) =>
        mapSquare(square, gameTrackIdByTrackId)
      ),
    createdAt: value.createdAt.toISOString(),
  };
}

export function mapDatabaseGameToActiveGame(
  game: DatabaseGameWithRelations
): ActiveGame {
  const tracks = [...game.tracks]
    .sort((a, b) => a.position - b.position)
    .map(mapGameTrack);

  const gameTrackIdByTrackId = new Map(
    tracks.map((track) => [track.id, track.gameTrackId])
  );

  const cards = [...game.cards]
    .sort((a, b) => a.cardNumber - b.cardNumber)
    .map((card) =>
      mapCard(card, game.id, gameTrackIdByTrackId)
    );

  return {
    id: game.id,
    joinCode: game.joinCode,
    playlistId: game.sourcePlaylistId ?? "",
    playlistName: game.playlistName,
    playlistTrackCount: game.playlistTrackCount,
    tracks,
    locked: true,
    status: mapStatus(game.status),
    bingoPattern: mapPattern(game.winningRule),
    currentTrackId: game.currentTrackId,
    calledTrackIds: tracks
      .filter((track) => track.called)
      .map((track) => track.id),
    createdAt: game.createdAt.toISOString(),
    startedAt: game.startedAt?.toISOString() ?? null,
    completedAt: game.completedAt?.toISOString() ?? null,
    requestedCardCount: game.requestedCardCount,
    songsPerCard: game.songsPerCard,
    cards,
  };
}
