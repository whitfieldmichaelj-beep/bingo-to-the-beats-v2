import type { ActiveGame } from "./types";

import {
  deleteGame as deleteStoredGame,
  getAllGames,
  getGameById,
  getGameByJoinCode,
  saveGame,
  updateGame as updateStoredGame,
} from "./store";

export async function createGame(
  game: ActiveGame
): Promise<ActiveGame> {
  return saveGame(game);
}

export async function findGameById(
  gameId: string
): Promise<ActiveGame | null> {
  return getGameById(gameId);
}

export async function findGameByJoinCode(
  joinCode: string
): Promise<ActiveGame | null> {
  return getGameByJoinCode(joinCode);
}

export async function listGames(): Promise<ActiveGame[]> {
  return getAllGames();
}

export async function updateGame(
  gameId: string,
  updater: (game: ActiveGame) => ActiveGame
): Promise<ActiveGame | null> {
  return updateStoredGame(gameId, updater);
}

export async function deleteGame(
  gameId: string
): Promise<boolean> {
  return deleteStoredGame(gameId);
}