import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const GAME_IDLE_LIMIT_MS = 24 * 60 * 60 * 1000;
const unfinished = ["DRAFT", "READY", "LIVE", "PAUSED"] as const;

function staleGames(now: Date): Prisma.GameWhereInput {
  const cutoff = new Date(now.getTime() - GAME_IDLE_LIMIT_MS);
  return {
    status: { in: [...unfinished] },
    updatedAt: { lte: cutoff },
    // Older releases recorded song activity on GameTrack only.
    tracks: { none: { calledAt: { gt: cutoff } } },
  };
}

async function closeLockedGame(tx: Prisma.TransactionClient, gameId: string, now: Date, idleOnly: boolean) {
  const changed = await tx.game.updateMany({
    where: { id: gameId, ...(idleOnly ? staleGames(now) : { status: { in: [...unfinished] } }) },
    data: { status: "CANCELLED", completedAt: now },
  });
  if (!changed.count) return false;
  // Keep paid cards, marks, songs, and winners as history. Freeze unpaid reservations.
  await tx.purchase.updateMany({ where: { gameId, status: "PENDING" }, data: { status: "CANCELLED" } });
  await tx.bingoCard.updateMany({ where: { gameId, purchase: { is: { status: "CANCELLED" } }, status: { in: ["ASSIGNED", "ACTIVE"] } }, data: { status: "VOID" } });
  await tx.gameSession.updateMany({ where: { gameId, connected: true }, data: { connected: false } });
  return true;
}

// Call inside each write transaction before reading status. The shared game lock
// prevents expiry from racing a song call, winner, reconnect, or host action.
export async function expireGameInTransaction(tx: Prisma.TransactionClient, gameId: string, now = new Date()) {
  await tx.$queryRaw`SELECT "id" FROM "Game" WHERE "id" = ${gameId} FOR UPDATE`;
  return closeLockedGame(tx, gameId, now, true);
}

// Enforce the deadline on access even when the local server was off at expiry.
export async function expireGames(scope: Prisma.GameWhereInput, now = new Date()) {
  const games = await prisma.game.findMany({ where: { AND: [scope, staleGames(now)] }, select: { id: true }, orderBy: { id: "asc" } });
  for (const game of games) {
    await prisma.$transaction(tx => expireGameInTransaction(tx, game.id, now), { maxWait: 5000, timeout: 15000 });
  }
}

// The caller holds the host row lock and creates the replacement in this SAME
// transaction. If any part of creation fails, the old game remains resumable.
export async function cancelPreviousHostGames(tx: Prisma.TransactionClient, hostId: string, replacementId: string) {
  const games = await tx.game.findMany({ where: { hostId, id: { not: replacementId }, status: { in: [...unfinished] } }, select: { id: true }, orderBy: { id: "asc" } });
  for (const game of games) {
    await tx.$queryRaw`SELECT "id" FROM "Game" WHERE "id" = ${game.id} FOR UPDATE`;
    await closeLockedGame(tx, game.id, new Date(), false);
  }
}
