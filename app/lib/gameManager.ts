export type Track = {
  title: string;
  artist: string;
  album?: string;
  bpm?: string;
  key?: string;
};

export type Player = {
  id: string;
  name: string;
  cards: number[];
};

export type GameStatus =
  | "waiting"
  | "playing"
  | "paused"
  | "finished";

export type WinningPattern =
  | "any-line"
  | "across"
  | "down"
  | "diagonal"
  | "x-pattern"
  | "blackout";

export type Game = {
  id: string;
  host: string;
  playlist: Track[];
  currentSongIndex: number;
  players: Player[];
  winningPattern: WinningPattern;
  status: GameStatus;
};

export function createGame(
  host: string,
  playlist: Track[],
  winningPattern: WinningPattern
): Game {
  return {
    id: generateGameCode(),
    host,
    playlist,
    currentSongIndex: 0,
    players: [],
    winningPattern,
    status: "waiting",
  };
}

export function generateGameCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

  let code = "";

  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }

  return code;
}