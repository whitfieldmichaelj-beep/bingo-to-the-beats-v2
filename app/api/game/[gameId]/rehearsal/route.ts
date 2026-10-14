import { randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { expireGameInTransaction, expireGames } from "@/lib/game/expiration";
import { readRehearsal, rehearsalScenarios } from "@/lib/game/rehearsal";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ gameId: string }> };
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
async function handle(request: NextRequest, context: Context, sending: boolean) {
  const { userId } = await auth();
  if (!userId) return reply({ message: "Host sign-in required." }, 401);
  const { gameId } = await context.params;
  const owned = await prisma.game.findFirst({ where: { id: gameId, host: { clerkId: userId } }, select: { id: true } });
  if (!owned) return reply({ message: "Game not found." }, 404);
  const body = sending ? await request.json().catch(() => null) : null;
  if (sending && (!body || typeof body.target !== "string" || !["send", "clear", "assign"].includes(body.action))) return reply({ message: "Choose the players and an instruction." }, 400);
  if (sending && body.action === "send" && (typeof body.text !== "string" || !body.text.trim() || body.text.length > 600)) return reply({ message: "Instructions must be 1–600 characters." }, 400);
  await expireGames({ id: gameId });
  return prisma.$transaction(async tx => {
    if (sending) await expireGameInTransaction(tx, gameId);
    const game = await tx.game.findUniqueOrThrow({ where: { id: gameId } });
    const closed = ["COMPLETED", "CANCELLED"].includes(game.status);
    const players = await tx.purchase.findMany({ where: { gameId, status: "PAID", playerKey: { not: null } }, select: { playerKey: true, playerName: true }, orderBy: { createdAt: "asc" } });
    let tasks = readRehearsal(game.playbackConfig);
    if (sending) {
      if (closed) return reply({ message: "This game has ended. Test instructions are read-only." }, 409);
      const targets = players.filter(player => body.target === "all" || body.target === player.playerKey);
      if (!targets.length) return reply({ message: "No eligible players selected. Have players join first." }, 400);
      tasks = tasks.filter(task => !targets.some(player => player.playerKey === task.playerKey));
      if (body.action !== "clear") targets.forEach((player, index) => {
        const scenario = rehearsalScenarios[index % rehearsalScenarios.length];
        tasks.push({ id: randomUUID(), playerKey: player.playerKey!, title: body.action === "assign" ? scenario.title : "Instruction from your host", text: body.action === "assign" ? scenario.text : body.text.trim(), sentAt: new Date().toISOString(), response: "pending", note: "", respondedAt: null });
      });
      const config = game.playbackConfig && typeof game.playbackConfig === "object" && !Array.isArray(game.playbackConfig) ? game.playbackConfig : {};
      await tx.game.update({ where: { id: gameId }, data: { playbackConfig: { ...config, rehearsal: tasks } } });
    }
    return reply({ players, tasks, closed });
  }, { maxWait: 10000, timeout: 10000 });
}
export async function GET(request: NextRequest, context: Context) { try { return await handle(request, context, false); } catch { return reply({ message: "Could not load rehearsal instructions. Please retry." }, 500); } }
export async function POST(request: NextRequest, context: Context) { try { return await handle(request, context, true); } catch { return reply({ message: "Could not save rehearsal instructions. Please retry." }, 500); } }
