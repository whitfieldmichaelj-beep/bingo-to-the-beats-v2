import type { ActiveGame } from "./types";

type GameStore = Map<string, ActiveGame>;

declare global {
  var bingoToTheBeatsGameStore: GameStore | undefined;
}

const gameStore: GameStore =
  globalThis.bingoToTheBeatsGameStore ?? new Map<string, ActiveGame>();

if (process.env.NODE_ENV !== "production") {
  globalThis.bingoToTheBeatsGameStore = gameStore;
}

export function saveGame(game: ActiveGame): ActiveGame {
  gameStore.set(game.id, game);
  return game;
}

export function getGameById(
  gameId: string
): ActiveGame | null {
  return gameStore.get(gameId) ?? null;
}

export function getGameByJoinCode(
  joinCode: string
): ActiveGame | null {
  const normalizedJoinCode = joinCode
    .trim()
    .toUpperCase();

  for (const game of gameStore.values()) {
    if (game.joinCode === normalizedJoinCode) {
      return game;
    }
  }

  return null;
}

export function getAllGames(): ActiveGame[] {
  return Array.from(gameStore.values()).sort((gameA, gameB) => {
    return gameB.createdAt.localeCompare(gameA.createdAt);
  });
}

export function updateGame(
  gameId: string,
  updater: (game: ActiveGame) => ActiveGame
): ActiveGame | null {
  const existingGame = gameStore.get(gameId);

  if (!existingGame) {
    return null;
  }

  const updatedGame = updater(existingGame);

  gameStore.set(gameId, updatedGame);

  return updatedGame;
}

export function deleteGame(gameId: string): boolean {
  return gameStore.delete(gameId);
}
