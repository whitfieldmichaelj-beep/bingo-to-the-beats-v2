import { NextRequest, NextResponse } from "next/server";
import { readPlayerSession } from "@/lib/auth/player-session";
import { prisma } from "@/lib/prisma";
import { expireGameInTransaction, expireGames } from "@/lib/game/expiration";
import { playerTask, readRehearsal } from "@/lib/game/rehearsal";
import { hasUnavailableDispute } from "@/lib/payments/disputes";
export const dynamic = "force-dynamic";
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function handle(request: NextRequest, saving: boolean) {
  const session = await readPlayerSession(request);
  if (!session) return reply({ message: "Reopen your player invitation to continue." }, 401);
  const body = saving ? await request.json().catch(() => null) : null;
  const gameId = saving ? body?.gameId : request.nextUrl.searchParams.get("gameId");
  if (typeof gameId !== "string" || !gameId) return reply({ message: "Game required." }, 400);
  if (saving && (!body || typeof body.taskId !== "string" || !["done", "problem"].includes(body.response) || typeof body.note !== "string" || body.note.length > 500)) return reply({ message: "Choose Done or Report a problem, with a note up to 500 characters." }, 400);
  await expireGames({ id: gameId });
  return prisma.$transaction(async tx => {
    if (saving) await expireGameInTransaction(tx, gameId);
    const purchase = await tx.purchase.findUnique({ where: { gameId_playerKey: { gameId, playerKey: session.playerId } }, include: { disputes: true } });
    if (!purchase || purchase.status !== "PAID" || hasUnavailableDispute(purchase.disputes)) return reply({ message: "An active player card is required." }, 403);
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
    const closed = ["COMPLETED", "CANCELLED"].includes(game.status);
    const tasks = readRehearsal(game.playbackConfig);
    if (saving) {
      if (closed) return reply({ message: "The game has ended. Responses are now read-only." }, 409);
      const task = tasks.find(item => item.playerKey === session.playerId && item.id === body.taskId);
      if (!task) return reply({ message: "Your host changed the instruction. Please check the latest task." }, 409);
      task.response = body.response; task.note = body.note.trim(); task.respondedAt = new Date().toISOString();
      const config = game.playbackConfig && typeof game.playbackConfig === "object" && !Array.isArray(game.playbackConfig) ? game.playbackConfig : {};
      // Player replies must not extend the host's 24-hour activity deadline.
      await tx.game.update({ where: { id: gameId }, data: { playbackConfig: { ...config, rehearsal: tasks }, updatedAt: game.updatedAt } });
    }
    return reply({ task: playerTask(tasks, session.playerId), closed });
  }, { maxWait: 10000, timeout: 10000 });
}
export async function GET(request: NextRequest) { try { return await handle(request, false); } catch { return reply({ message: "Instructions could not be refreshed. Reconnecting…" }, 500); } }
export async function POST(request: NextRequest) { try { return await handle(request, true); } catch { return reply({ message: "Your response was not confirmed. Please retry." }, 500); } }
