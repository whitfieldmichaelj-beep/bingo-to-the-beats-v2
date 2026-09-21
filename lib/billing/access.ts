import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { activePlayerLimit, activeHostPlan } from "./plans";
export class HostAccessError extends Error { status = 402; }
export class PlayerCapacityError extends Error { status = 409; code = "PLAYER_LIMIT_REACHED"; }
export const subscriptionsEnabled = () => process.env.BTTB_HOST_SUBSCRIPTIONS_ENABLED === "true";
type BillingState = { planId: string | null; status: string; accessUntil: Date | null } | null;
export function requireMusicAccess(billing: BillingState, source: string, practice: boolean) {
  const plan = activeHostPlan(billing);
  if (practice) return;
  if (!plan) throw new HostAccessError("Your host subscription needs renewal. Open Billing to continue.");
  if (source === "serato" && !plan.serato) throw new HostAccessError("Serato hosting requires a DJ plan. Choose a Serato plan in Billing or use your streaming service.");
}
export async function reserveHostGame(tx: Prisma.TransactionClient, clerkId: string, gameId: string, cardCount: number, source: string, forcePractice = false) {
  await tx.hostBilling.upsert({ where: { clerkId }, create: { clerkId }, update: {} });
  await tx.$queryRaw`SELECT "clerkId" FROM "HostBilling" WHERE "clerkId" = ${clerkId} FOR UPDATE`;
  const billing = await tx.hostBilling.findUniqueOrThrow({ where: { clerkId } });
  const practice = forcePractice || !activeHostPlan(billing);
  const limit = practice ? 5 : activePlayerLimit(billing);
  requireMusicAccess(billing, source, practice);
  // Paid plans limit unique people, not how many cards are generated.
  if (practice && cardCount > 5) throw new HostAccessError("Free practice allows five players with one card each. Choose a host plan or create a five-card practice game.");
  if (billing.activeGameId && billing.activeGameId !== gameId) {
    const active = await tx.game.findUnique({ where: { id: billing.activeGameId }, select: { status: true } });
    if (active && !["COMPLETED", "CANCELLED"].includes(active.status)) throw new HostAccessError("End your current game before creating another. Your plan allows one active game at a time.");
  }
  await tx.hostBilling.update({ where: { clerkId }, data: { activeGameId: gameId } });
  return { maxPlayers: limit, isPractice: practice, hostBillingRequired: true };
}
export async function requireGameHostAccess(gameId: string, expectedHost?: string, expectedSource?: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { hostBillingRequired: true, isPractice: true, playbackConfig: true, host: { select: { clerkId: true } } } });
  if (!game || (expectedHost && game.host.clerkId !== expectedHost)) throw new HostAccessError("Game not found for this host.");
  const source = (game.playbackConfig as { source?: string } | null)?.source ?? "";
  if (expectedSource && source !== expectedSource) throw new HostAccessError("This game is not configured for Serato.");
  if (!game.hostBillingRequired) return;
  const billing = await prisma.hostBilling.findUnique({ where: { clerkId: game.host.clerkId } });
  if (billing?.activeGameId !== gameId) throw new HostAccessError("This is not the host’s active game.");
  requireMusicAccess(billing, source, game.isPractice);
}

export async function getPlayerCapacity(gameId: string) {
  const game = await prisma.game.findUnique({ where: { id: gameId }, select: { hostBillingRequired: true, isPractice: true, host: { select: { clerkId: true } } } });
  if (!game?.hostBillingRequired) return null;
  const billing = await prisma.hostBilling.findUnique({ where: { clerkId: game.host.clerkId } });
  const limit = game.isPractice ? 5 : activePlayerLimit(billing);
  const used = await prisma.gamePlayerSeat.count({ where: { gameId } });
  return { used, limit, remaining: Math.max(0, limit - used) };
}

// Called in the SAME transaction as purchase/card assignment. The game lock and
// serializable retries prevent two players claiming the final spot concurrently.
export async function reservePlayerSeat(tx: Prisma.TransactionClient, gameId: string, playerKey: string) {
  await tx.$queryRaw`SELECT "id" FROM "Game" WHERE "id" = ${gameId} FOR UPDATE`;
  const game = await tx.game.findUniqueOrThrow({ where: { id: gameId }, select: { hostBillingRequired: true, isPractice: true, status: true, playbackConfig: true, host: { select: { clerkId: true } } } });
  if (["COMPLETED", "CANCELLED"].includes(game.status)) throw new PlayerCapacityError("This game has ended.");
  if (!game.hostBillingRequired) return;
  const billing = await tx.hostBilling.findUnique({ where: { clerkId: game.host.clerkId } });
  if (billing?.activeGameId !== gameId) throw new HostAccessError("This is not the host’s active game.");
  requireMusicAccess(billing, (game.playbackConfig as { source?: string } | null)?.source ?? "", game.isPractice);
  if (await tx.gamePlayerSeat.findUnique({ where: { gameId_playerKey: { gameId, playerKey } } })) return;
  const limit = game.isPractice ? 5 : activePlayerLimit(billing);
  const used = await tx.gamePlayerSeat.count({ where: { gameId } });
  if (used >= limit) throw new PlayerCapacityError(`All ${limit} player spots are filled. Ask the host to upgrade before another player joins.`);
  await tx.gamePlayerSeat.create({ data: { gameId, playerKey } });
}
