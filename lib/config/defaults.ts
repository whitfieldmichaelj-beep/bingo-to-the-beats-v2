// lib/config/defaults.ts

export const DEFAULT_GAME_SETTINGS = {
  clipLength: 20,

  fadeDuration: 4,

  transitionStyle: "fade" as const,

  autoAdvance: true,

  cardCount: 100,

  queueValidation: true,

  skipUnplayableSongs: true,

  endOfPlaylist: "stop" as const,
};

export type TransitionStyle =
  typeof DEFAULT_GAME_SETTINGS.transitionStyle;

export type EndOfPlaylist =
  typeof DEFAULT_GAME_SETTINGS.endOfPlaylist;