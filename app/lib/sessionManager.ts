"use client";

const ACTIVE_GAME_KEYS = [
  "bttbActiveGame",
  "activeGame",
  "activeGameId",
  "currentGame",
  "currentGameId",
  "gameSession",
];

export function hasActiveGame(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return ACTIVE_GAME_KEYS.some((key) => {
    const value =
      window.localStorage.getItem(key) ??
      window.sessionStorage.getItem(key);

    return Boolean(value);
  });
}

export async function prepareUniversalLogout(): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  for (const key of ACTIVE_GAME_KEYS) {
    window.localStorage.removeItem(key);
    window.sessionStorage.removeItem(key);
  }

  window.localStorage.removeItem("spotifyConnected");
  window.localStorage.removeItem("appleMusicConnected");
  window.localStorage.removeItem("tidalConnected");
}
