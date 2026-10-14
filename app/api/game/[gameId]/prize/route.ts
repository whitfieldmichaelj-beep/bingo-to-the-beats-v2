import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { HostAccessError, requireGameHostAccess } from "@/lib/billing/access";
import { expireGameInTransaction } from "@/lib/game/expiration";
import { parseGamePrize } from "@/lib/game/prize";

export const dynamic = "force-dynamic";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ gameId: string }> }) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ message: "Host authentication is required." }, { status: 401 });
  const { gameId } = await params;
  const body = await request.json().catch(() => null);
  const prize = parseGamePrize(body?.prize);
  if (!prize) return NextResponse.json({ message: "Choose a prize type and describe the prize in 200 characters or less." }, { status: 400 });
  try {
    const owned = await prisma.game.findFirst({ where: { id: gameId, host: { clerkId: userId } }, select: { id: true } });
    if (!owned) return NextResponse.json({ message: "Game not found for this host." }, { status: 404 });
    await requireGameHostAccess(gameId, userId);
    const result = await prisma.$transaction(async tx => {
      await expireGameInTransaction(tx, gameId);
      const game = await tx.game.findFirst({ where: { id: gameId, host: { clerkId: userId } }, select: { status: true, startedAt: true, playbackConfig: true } });
      if (!game || game.startedAt || !["DRAFT", "READY"].includes(game.status)) {
        return { status: 409, body: { message: "The prize is locked once a game starts or closes." } };
      }
      const config = game.playbackConfig && typeof game.playbackConfig === "object" && !Array.isArray(game.playbackConfig) ? game.playbackConfig : {};
      await tx.game.update({ where: { id: gameId }, data: { playbackConfig: { ...config, prize } } });
      return { status: 200, body: { ok: true, prize } };
    });
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof HostAccessError) return NextResponse.json({ message: error.message }, { status: error.status });
    return NextResponse.json({ message: "Unable to save the prize. Please try again." }, { status: 500 });
  }
}
