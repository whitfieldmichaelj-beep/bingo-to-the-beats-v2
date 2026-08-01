import type { SeratoTrack } from "../serato/types";

export type GameStatus =
  | "waiting"
  | "active"
  | "paused"
  | "completed";

export type BingoPattern =
  | "single-line"
  | "four-corners"
  | "x-pattern"
  | "full-card"
  | "any-line"
  | "across"
  | "down"
  | "diagonal"
  | "blackout";

export interface GameTrack extends SeratoTrack {
  gameTrackId: string;
  position: number;
  called: boolean;
  calledAt: string | null;
}

export interface BingoCardSquare {
  squareIndex: number;
  row: number;
  column: number;

  trackId: string;
  gameTrackId: string;

  title: string;
  artist: string;

  marked: boolean;
  markedAt: string | null;
}

export interface BingoCard {
  id: string;
  cardNumber: number;
  gameId: string;

  rows: number;
  columns: number;
  squareCount: number;

  signature: string;
  squares: BingoCardSquare[];

  createdAt: string;
}

export interface CardCapacity {
  playlistTrackCount: number;
  songsPerCard: number;

  canGenerateCards: boolean;

  /**
   * Number of unique 25-song selections, without considering
   * the positions of songs on the card.
   *
   * Stored as a string because the value may be larger than
   * JavaScript's safe integer limit.
   */
  uniqueSongSelections: string;

  /**
   * Number of unique ordered card layouts.
   *
   * For a 25-square card, changing the position of one song
   * creates a different layout.
   *
   * Stored as a string because the value can be extremely large.
   */
  uniqueCardLayouts: string;

  readableCapacity: string;
}

export interface ActiveGame {
  id: string;
  joinCode: string;

  playlistId: string;
  playlistName: string;
  playlistTrackCount: number;

  tracks: GameTrack[];

  locked: true;
  status: GameStatus;
  bingoPattern: BingoPattern;

  currentTrackId: string | null;
  calledTrackIds: string[];

  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;

  /**
   * These are optional temporarily so the existing game service
   * continues compiling until it is replaced in the next step.
   */
  requestedCardCount?: number;
  songsPerCard?: number;
  cards?: BingoCard[];
  cardCapacity?: CardCapacity;
}
