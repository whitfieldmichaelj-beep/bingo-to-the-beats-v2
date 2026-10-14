import { expireGameInTransaction } from "@/lib/game/expiration";
import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { HostAccessError, requireGameHostAccess } from "@/lib/billing/access";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ gameId: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const { gameId } = await context.params;
    const { isAuthenticated, userId } = await auth();
    if (!isAuthenticated || !userId) {
      return NextResponse.json({ ok: false, message: "Host authentication is required." }, { status: 401 });
    }
    const body = await request.json().catch(() => null);
    const status = body?.status;
    if (status !== "active" && status !== "paused" && status !== "completed") {
      return NextResponse.json({ ok: false, message: "Unsupported game status." }, { status: 400 });
    }
    const owned = await prisma.game.findFirst({ where: { id: gameId, host: { clerkId: userId } }, select: { id: true } });
    if (!owned) return NextResponse.json({ ok: false, message: "Game not found for this host." }, { status: 404 });
    if (status !== "completed") await requireGameHostAccess(gameId);

    const result = await prisma.$transaction(async (tx) => {
      // Share the song/mark/winner lock; never rewrite tracks from a stale game snapshot.
      await tx.$queryRaw`SELECT "id" FROM "Game" WHERE "id" = ${gameId} FOR UPDATE`;
      await expireGameInTransaction(tx, gameId);
      const game = await tx.game.findFirst({
        where: { id: gameId, host: { clerkId: userId } },
        select: { id: true, status: true, startedAt: true, completedAt: true },
      });
      if (!game) return { status: 404, body: { ok: false, message: "Game not found for this host." } };
      const response = (saved: typeof game) => ({ status: 200, body: { ok: true, game: {
        id: saved.id,
        status: saved.status === "COMPLETED" ? "completed" : saved.status === "LIVE" ? "active" : "paused",
        startedAt: saved.startedAt?.toISOString() ?? null,
        completedAt: saved.completedAt?.toISOString() ?? null,
      } } });
      if (game.status === "COMPLETED" && status === "completed") return response(game);
      if (game.status === "COMPLETED" || game.status === "CANCELLED") {
        return { status: 409, body: { ok: false, message: "This game has ended and cannot be changed." } };
      }
      const saved = await tx.game.update({ where: { id: gameId }, data: {
        status: status === "active" ? "LIVE" : status === "paused" ? "PAUSED" : "COMPLETED",
        ...(status === "active" && !game.startedAt ? { startedAt: new Date() } : {}),
        ...(status === "completed" ? { completedAt: new Date() } : {}),
      }, select: { id: true, status: true, startedAt: true, completedAt: true } });
      if (status === "completed") {
        await tx.purchase.updateMany({ where: { gameId, status: "PENDING" }, data: { status: "CANCELLED" } });
        await tx.bingoCard.updateMany({ where: { gameId, purchase: { is: { status: "CANCELLED" } }, status: { in: ["ASSIGNED", "ACTIVE"] } }, data: { status: "VOID" } });
        await tx.gameSession.updateMany({ where: { gameId, connected: true }, data: { connected: false } });
      }
      return response(saved);
    }, { isolationLevel: "ReadCommitted", maxWait: 5000, timeout: 10000 });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof HostAccessError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status });
    console.error("Unable to update game status:", error);
    return NextResponse.json({ ok: false, message: "Unable to update game status." }, { status: 500 });
  }
}
