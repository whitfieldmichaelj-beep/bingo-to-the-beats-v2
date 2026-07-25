// lib/game/GameSession.ts

import { DEFAULT_GAME_SETTINGS } from "@/lib/config/defaults";

export type TransitionStyle = "fade" | "cut" | "manual";

export interface QueueHealth {
  totalSongs: number;
  playableSongs: number;
  skippedSongs: number;
}

export interface QueueSong {
  id: string;

  title: string;

  artist: string;

  artwork?: string;

  /**
   * Apple Music catalog ID
   */
  catalogId?: string;

  /**
   * Apple Music library ID (i.xxxxx)
   */
  libraryId?: string;

  duration?: number;
}

export interface GameSession {
  gameId: string;

  playlistId: string;

  playlistName: string;

  clipLength: number;

  fadeDuration: number;

  transitionStyle: TransitionStyle;

  autoAdvance: boolean;

  cardCount: number;

  currentSongIndex: number;

  queue: QueueSong[];

  queueHealth: QueueHealth;

  createdAt: number;
}

export function createGameSession(
  playlistId: string,
  playlistName: string,
  queue: QueueSong[],
  overrides?: Partial<GameSession>
): GameSession {
  const playableSongs = queue.filter(
    (song) => song.catalogId || song.libraryId
  );

  return {
    gameId: crypto.randomUUID(),

    playlistId,

    playlistName,

    clipLength: DEFAULT_GAME_SETTINGS.clipLength,

    fadeDuration: DEFAULT_GAME_SETTINGS.fadeDuration,

    transitionStyle:
      DEFAULT_GAME_SETTINGS.transitionStyle,

    autoAdvance:
      DEFAULT_GAME_SETTINGS.autoAdvance,

    cardCount:
      DEFAULT_GAME_SETTINGS.cardCount,

    currentSongIndex: 0,

    queue: playableSongs,

    queueHealth: {
      totalSongs: queue.length,
      playableSongs: playableSongs.length,
      skippedSongs:
        queue.length - playableSongs.length,
    },

    createdAt: Date.now(),

    ...overrides,
  };
}

export const GameStorage = {
  KEY: "currentGame",

  save(session: GameSession) {
    sessionStorage.setItem(
      this.KEY,
      JSON.stringify(session)
    );
  },

  load(): GameSession | null {
    const value = sessionStorage.getItem(this.KEY);

    if (!value) return null;

    return JSON.parse(value);
  },

  clear() {
    sessionStorage.removeItem(this.KEY);
  },
};